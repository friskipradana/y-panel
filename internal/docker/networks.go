package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/performance"
)

type Network struct {
	ID          string            `json:"Id"`
	Name        string            `json:"Name"`
	Driver      string            `json:"Driver"`
	Scope       string            `json:"Scope"`
	CreatedAt   string            `json:"CreatedAt"`
	Subnet      string            `json:"Subnet"`
	Gateway     string            `json:"Gateway"`
	Labels      map[string]string `json:"Labels,omitempty"`
	OwnerUserID int64             `json:"OwnerUserId,omitempty"`
	OwnerName   string            `json:"OwnerName,omitempty"`
}

func ListNetworks() ([]Network, error) {
	started := time.Now()
	res, err := networksCache.Get(func() ([]Network, error) {
		ctx, cancel := context.WithTimeout(context.Background(), defaultReadTimeout)
		defer cancel()

		if nets, engErr := listNetworksEngine(ctx); engErr == nil {
			return nets, nil
		} else if !errors.Is(engErr, errEngineUnavailable) {
			return nil, engErr
		}
		return listNetworksCLI(ctx)
	})
	performance.DefaultRegistry.RecordDockerOp("list_networks", time.Since(started), err)
	return res, err
}

func listNetworksEngine(ctx context.Context) ([]Network, error) {
	var raw []struct {
		ID      string `json:"Id"`
		Name    string `json:"Name"`
		Driver  string `json:"Driver"`
		Scope   string `json:"Scope"`
		Created string `json:"Created"`
		IPAM    struct {
			Config []struct {
				Subnet  string `json:"Subnet"`
				Gateway string `json:"Gateway"`
			} `json:"Config"`
		} `json:"IPAM"`
		Labels map[string]string `json:"Labels"`
	}
	if _, _, err := defaultEngine.doRequest(ctx, http.MethodGet, "/networks", &raw); err != nil {
		return nil, err
	}

	networks := make([]Network, 0, len(raw))
	for _, row := range raw {
		labels := row.Labels
		if labels == nil {
			labels = map[string]string{}
		}
		var subnet, gateway string
		for _, cfg := range row.IPAM.Config {
			if cfg.Subnet != "" && subnet == "" {
				subnet = cfg.Subnet
			}
			if cfg.Gateway != "" && gateway == "" {
				gateway = cfg.Gateway
			}
		}
		ownerID, _ := strconv.ParseInt(labels[labelOwnerID], 10, 64)
		networks = append(networks, Network{
			ID:          shortContainerID(row.ID),
			Name:        row.Name,
			Driver:      row.Driver,
			Scope:       row.Scope,
			CreatedAt:   row.Created,
			Subnet:      subnet,
			Gateway:     gateway,
			Labels:      labels,
			OwnerUserID: ownerID,
			OwnerName:   labels[labelOwnerName],
		})
	}
	sort.Slice(networks, func(i, j int) bool {
		return strings.ToLower(networks[i].Name) < strings.ToLower(networks[j].Name)
	})
	return networks, nil
}

func listNetworksCLI(ctx context.Context) ([]Network, error) {
	// Step 1: get all network IDs
	lsCmd := exec.CommandContext(ctx, "docker", "network", "ls", "-q")
	lsOut, err := lsCmd.Output()
	if err != nil {
		return nil, fmt.Errorf("list network ids: %w", err)
	}
	ids := splitNonEmptyLines(strings.TrimSpace(string(lsOut)))
	if len(ids) == 0 {
		return []Network{}, nil
	}

	// Step 2: inspect all at once
	args := append([]string{"network", "inspect", "--format",
		`{"Id":"{{.ID}}","Name":"{{.Name}}","Driver":"{{.Driver}}","Scope":"{{.Scope}}","CreatedAt":"{{.Created}}","Subnet":"{{range .IPAM.Config}}{{.Subnet}}{{end}}","Gateway":"{{range .IPAM.Config}}{{.Gateway}}{{end}}","Labels":{{json .Labels}}}`},
		ids...)
	inspectCmd := exec.CommandContext(ctx, "docker", args...)
	inspectOut, err := inspectCmd.Output()
	if err != nil {
		return nil, fmt.Errorf("inspect networks: %w", err)
	}

	// docker inspect with --format outputs one JSON object per line (not an array)
	lines := splitNonEmptyLines(strings.TrimSpace(string(inspectOut)))
	networks := make([]Network, 0, len(lines))
	for _, line := range lines {
		var n Network
		if err := json.Unmarshal([]byte(line), &n); err != nil {
			continue // skip malformed lines
		}
		if n.Labels == nil {
			n.Labels = map[string]string{}
		}
		n.OwnerUserID, _ = strconv.ParseInt(n.Labels[labelOwnerID], 10, 64)
		n.OwnerName = n.Labels[labelOwnerName]
		networks = append(networks, n)
	}
	return networks, nil
}

func CreateNetwork(name, subnet, gateway string) error {
	return CreateNetworkForOwner(OwnerContext{}, name, subnet, gateway)
}

func CreateNetworkForOwner(owner OwnerContext, name, subnet, gateway string) error {
	started := time.Now()
	defer func() {
		networksCache.Invalidate()
		notifyInvalidators()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), defaultOpTimeout)
	defer cancel()

	args := []string{"network", "create"}
	if owner.UserID > 0 {
		args = append(args,
			"--label", labelManagedBy+"=panel",
			"--label", fmt.Sprintf("%s=%d", labelOwnerID, owner.UserID),
			"--label", labelOwnerName+"="+owner.Username,
		)
	}
	if subnet != "" {
		args = append(args, "--subnet", subnet)
	}
	if gateway != "" {
		args = append(args, "--gateway", gateway)
	}
	args = append(args, name)
	cmd := exec.CommandContext(ctx, "docker", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		err = fmt.Errorf("create network: %w — %s", err, string(out))
	}
	performance.DefaultRegistry.RecordDockerOp("create_network", time.Since(started), err)
	return err
}

func RemoveNetwork(id string) error {
	started := time.Now()
	defer func() {
		networksCache.Invalidate()
		notifyInvalidators()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), defaultOpTimeout)
	defer cancel()

	var err error
	if _, _, engErr := defaultEngine.doRequest(ctx, http.MethodDelete, "/networks/"+url.PathEscape(id), nil); engErr == nil {
		performance.DefaultRegistry.RecordDockerOp("remove_network", time.Since(started), nil)
		return nil
	} else if !errors.Is(engErr, errEngineUnavailable) {
		err = fmt.Errorf("remove network: %w", engErr)
		performance.DefaultRegistry.RecordDockerOp("remove_network", time.Since(started), err)
		return err
	}

	cmd := exec.CommandContext(ctx, "docker", "network", "rm", id)
	if cliErr := cmd.Run(); cliErr != nil {
		err = fmt.Errorf("remove network: %w", cliErr)
	}
	performance.DefaultRegistry.RecordDockerOp("remove_network", time.Since(started), err)
	return err
}

// EnsureContainerOnNetwork creates the bridge network if missing and connects containerName to it.
func EnsureContainerOnNetwork(networkName, containerName string) error {
	networkName = strings.TrimSpace(networkName)
	containerName = strings.TrimSpace(containerName)
	if networkName == "" || containerName == "" {
		return nil
	}
	nets, err := ListNetworks()
	exists := false
	if err == nil {
		for _, n := range nets {
			if n.Name == networkName {
				exists = true
				break
			}
		}
	}
	if !exists {
		if cErr := CreateNetwork(networkName, "", ""); cErr != nil {
			if !strings.Contains(strings.ToLower(cErr.Error()), "already exists") {
				return cErr
			}
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), defaultOpTimeout)
	defer cancel()
	out, cErr := exec.CommandContext(ctx, "docker", "network", "connect", networkName, containerName).CombinedOutput()
	if cErr != nil {
		msg := strings.ToLower(string(out))
		if strings.Contains(msg, "already exists") {
			return nil
		}
		return fmt.Errorf("network connect %s -> %s: %w — %s", containerName, networkName, cErr, strings.TrimSpace(string(out)))
	}
	return nil
}
