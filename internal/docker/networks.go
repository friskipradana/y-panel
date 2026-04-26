package docker

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
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
	// Step 1: get all network IDs
	lsCmd := exec.Command("docker", "network", "ls", "-q")
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
	inspectCmd := exec.Command("docker", args...)
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
	cmd := exec.Command("docker", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("create network: %w — %s", err, string(out))
	}
	return nil
}

func RemoveNetwork(id string) error {
	cmd := exec.Command("docker", "network", "rm", id)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("remove network: %w", err)
	}
	return nil
}
