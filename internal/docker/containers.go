package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/performance"
)

var (
	portPatternWithHost = regexp.MustCompile(`(?:(\d+\.\d+\.\d+\.\d+|\[::\]|::):)?(\d+)->(\d+)/(tcp|udp)`)
	portPatternInner    = regexp.MustCompile(`(\d+)/(tcp|udp)`)
)

func shortContainerID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

func ListContainers() ([]Container, error) {
	started := time.Now()
	res, err := containersCache.Get(func() ([]Container, error) {
		ctx, cancel := context.WithTimeout(context.Background(), defaultReadTimeout)
		defer cancel()

		if containers, engErr := listContainersEngine(ctx); engErr == nil {
			return containers, nil
		} else if !errors.Is(engErr, errEngineUnavailable) {
			return nil, engErr
		}
		return listContainersCLI(ctx)
	})
	performance.DefaultRegistry.RecordDockerOp("list_containers", time.Since(started), err)
	return res, err
}

func listContainersEngine(ctx context.Context) ([]Container, error) {
	var raw []struct {
		ID      string `json:"Id"`
		Names   []string
		Image   string
		State   string
		Status  string
		Created int64
		Ports   []struct {
			PrivatePort int    `json:"PrivatePort"`
			PublicPort  int    `json:"PublicPort"`
			Type        string `json:"Type"`
		} `json:"Ports"`
		Labels          map[string]string `json:"Labels"`
		NetworkSettings struct {
			Networks map[string]struct {
				IPAddress string `json:"IPAddress"`
			} `json:"Networks"`
		} `json:"NetworkSettings"`
	}

	if _, _, err := defaultEngine.doRequest(ctx, http.MethodGet, "/containers/json?all=true", &raw); err != nil {
		return nil, err
	}

	containers := make([]Container, 0, len(raw))
	for _, row := range raw {
		labels := row.Labels
		if labels == nil {
			labels = map[string]string{}
		}
		ownerID, _ := strconv.ParseInt(labels[labelOwnerID], 10, 64)
		resources := map[string]any{}
		if cpu := strings.TrimSpace(labels["panel.cpu_limit_pct"]); cpu != "" {
			resources["cpuLimitPct"] = cpu
		}
		if memory := strings.TrimSpace(labels["panel.memory_limit_mb"]); memory != "" {
			resources["memoryLimitMb"] = memory
		}
		if disk := strings.TrimSpace(labels["panel.disk_quota_mb"]); disk != "" {
			resources["diskQuotaMb"] = disk
		}

		names := row.Names
		if len(names) == 0 {
			names = []string{"/" + shortContainerID(row.ID)}
		}
		ports := make([]ContainerPort, 0, len(row.Ports))
		for _, p := range row.Ports {
			ports = append(ports, ContainerPort{
				PrivatePort: p.PrivatePort,
				PublicPort:  p.PublicPort,
				Type:        p.Type,
			})
		}
		var nets []string
		var ips []string
		for netName, netCfg := range row.NetworkSettings.Networks {
			nets = append(nets, netName)
			if netCfg.IPAddress != "" {
				ips = append(ips, netCfg.IPAddress)
			}
		}
		sort.Strings(nets)
		sort.Strings(ips)

		containers = append(containers, Container{
			ID:          shortContainerID(row.ID),
			Names:       names,
			Image:       row.Image,
			State:       normalizeState(strings.ToLower(row.State)),
			Status:      row.Status,
			Ports:       ports,
			Networks:    nets,
			IPAddresses: ips,
			Created:     row.Created,
			Labels:      labels,
			ProjectName: labels["com.docker.compose.project"],
			OwnerUserID: ownerID,
			OwnerName:   labels[labelOwnerName],
			Source:      labels[labelSource],
			ComposePath: labels[labelComposeDir],
			Resources:   resources,
		})
	}

	sort.Slice(containers, func(i, j int) bool {
		return strings.ToLower(strings.TrimPrefix(containers[i].Names[0], "/")) < strings.ToLower(strings.TrimPrefix(containers[j].Names[0], "/"))
	})

	enrichContainersEngine(ctx, containers)
	return containers, nil
}

func enrichContainersEngine(ctx context.Context, containers []Container) {
	if len(containers) == 0 {
		return
	}
	workers := inspectWorkerMax
	if len(containers) < workers {
		workers = len(containers)
	}
	jobs := make(chan int, len(containers))
	for i := range containers {
		jobs <- i
	}
	close(jobs)

	var wg sync.WaitGroup
	wg.Add(workers)
	for w := 0; w < workers; w++ {
		go func() {
			defer wg.Done()
			for idx := range jobs {
				if ctx.Err() != nil {
					return
				}
				var insp struct {
					RestartCount int    `json:"RestartCount"`
					Created      string `json:"Created"`
					State        struct {
						Status     string `json:"Status"`
						ExitCode   int    `json:"ExitCode"`
						StartedAt  string `json:"StartedAt"`
						FinishedAt string `json:"FinishedAt"`
						Health     *struct {
							Status string `json:"Status"`
						} `json:"Health"`
					} `json:"State"`
					NetworkSettings struct {
						Networks map[string]struct {
							IPAddress string `json:"IPAddress"`
						} `json:"Networks"`
					} `json:"NetworkSettings"`
				}
				path := "/containers/" + url.PathEscape(containers[idx].ID) + "/json"
				if _, _, err := defaultEngine.doRequest(ctx, http.MethodGet, path, &insp); err != nil {
					continue
				}
				var nets, ips []string
				for name, netCfg := range insp.NetworkSettings.Networks {
					nets = append(nets, name)
					if netCfg.IPAddress != "" {
						ips = append(ips, netCfg.IPAddress)
					}
				}
				sort.Strings(nets)
				sort.Strings(ips)
				containers[idx].Networks = nets
				containers[idx].IPAddresses = ips
				containers[idx].RestartCount = insp.RestartCount
				containers[idx].ExitCode = insp.State.ExitCode
				containers[idx].StartedAt = insp.State.StartedAt
				containers[idx].FinishedAt = insp.State.FinishedAt
				containers[idx].CreatedAt = insp.Created
				if insp.State.Health != nil {
					containers[idx].Health = strings.TrimSpace(insp.State.Health.Status)
				}
			}
		}()
	}
	wg.Wait()
}

func listContainersCLI(ctx context.Context) ([]Container, error) {
	cmd := exec.CommandContext(ctx, "docker", "ps", "-a", "--format", "{{json .}}")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("list containers: %w", err)
	}

	lines := splitNonEmptyLines(string(output))
	containers := make([]Container, 0, len(lines))

	for _, line := range lines {
		var row struct {
			ID       string `json:"ID"`
			Names    string `json:"Names"`
			Image    string `json:"Image"`
			State    string `json:"State"`
			Status   string `json:"Status"`
			Ports    string `json:"Ports"`
			Networks string `json:"Networks"`
			Labels   string `json:"Labels"`
			Created  string `json:"CreatedAt"`
		}

		if err := json.Unmarshal([]byte(line), &row); err != nil {
			return nil, fmt.Errorf("decode docker row: %w", err)
		}
		labels := parseLabels(row.Labels)
		ownerID, _ := strconv.ParseInt(labels[labelOwnerID], 10, 64)
		resources := map[string]any{}
		if cpu := strings.TrimSpace(labels["panel.cpu_limit_pct"]); cpu != "" {
			resources["cpuLimitPct"] = cpu
		}
		if memory := strings.TrimSpace(labels["panel.memory_limit_mb"]); memory != "" {
			resources["memoryLimitMb"] = memory
		}
		if disk := strings.TrimSpace(labels["panel.disk_quota_mb"]); disk != "" {
			resources["diskQuotaMb"] = disk
		}
		containers = append(containers, Container{
			ID:          row.ID,
			Names:       []string{"/" + row.Names},
			Image:       row.Image,
			State:       normalizeState(row.State),
			Status:      row.Status,
			Ports:       parsePorts(row.Ports),
			Networks:    parseNetworks(row.Networks),
			Created:     0,
			Labels:      labels,
			ProjectName: labels["com.docker.compose.project"],
			OwnerUserID: ownerID,
			OwnerName:   labels[labelOwnerName],
			Source:      labels[labelSource],
			ComposePath: labels[labelComposeDir],
			Resources:   resources,
		})
	}

	sort.Slice(containers, func(i, j int) bool {
		return strings.ToLower(strings.TrimPrefix(containers[i].Names[0], "/")) < strings.ToLower(strings.TrimPrefix(containers[j].Names[0], "/"))
	})

	_ = InspectContainerNetworks(containers)

	return containers, nil
}

func parseNetworks(networks string) []string {
	if networks == "" {
		return nil
	}
	parts := strings.Split(networks, ",")
	var result []string
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			result = append(result, t)
		}
	}
	return result
}

func InspectContainerNetworks(containers []Container) error {
	if len(containers) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), defaultReadTimeout)
	defer cancel()

	ids := make([]string, len(containers))
	idToIndex := make(map[string]int)
	for i, c := range containers {
		ids[i] = c.ID
		idToIndex[c.ID] = i
	}

	args := append([]string{"inspect", "--format", `{"Id": "{{.Id}}", "Created": {{json .Created}}, "Networks": {{json .NetworkSettings.Networks}}, "RestartCount": {{.RestartCount}}, "State": {{json .State}}}`}, ids...)
	cmd := exec.CommandContext(ctx, "docker", args...)
	output, err := cmd.Output()
	if err != nil {
		return nil
	}

	lines := splitNonEmptyLines(string(output))
	for _, line := range lines {
		var row struct {
			ID       string `json:"Id"`
			Networks map[string]struct {
				IPAddress string `json:"IPAddress"`
			} `json:"Networks"`
			RestartCount int    `json:"RestartCount"`
			Created      string `json:"Created"`
			State        struct {
				Status     string `json:"Status"`
				ExitCode   int    `json:"ExitCode"`
				StartedAt  string `json:"StartedAt"`
				FinishedAt string `json:"FinishedAt"`
				Health     *struct {
					Status string `json:"Status"`
				} `json:"Health"`
			} `json:"State"`
		}
		if err := json.Unmarshal([]byte(line), &row); err == nil {
			idx, ok := idToIndex[row.ID]
			if !ok && len(row.ID) >= 12 {
				idx, ok = idToIndex[row.ID[:12]]
			}
			if ok {
				var ips []string
				var nets []string
				for name, net := range row.Networks {
					nets = append(nets, name)
					if net.IPAddress != "" {
						ips = append(ips, net.IPAddress)
					}
				}
				sort.Strings(nets)
				sort.Strings(ips)
				containers[idx].Networks = nets
				containers[idx].IPAddresses = ips
				containers[idx].RestartCount = row.RestartCount
				containers[idx].ExitCode = row.State.ExitCode
				containers[idx].StartedAt = row.State.StartedAt
				containers[idx].FinishedAt = row.State.FinishedAt
				containers[idx].CreatedAt = row.Created
				if row.State.Health != nil {
					containers[idx].Health = strings.TrimSpace(row.State.Health.Status)
				}
			}
		}
	}
	return nil
}

func StartContainer(id string) error {
	started := time.Now()
	defer InvalidateContainers()
	ctx, cancel := context.WithTimeout(context.Background(), defaultOpTimeout)
	defer cancel()

	var err error
	if _, _, engErr := defaultEngine.doRequest(ctx, http.MethodPost, "/containers/"+url.PathEscape(id)+"/start", nil); engErr == nil {
		performance.DefaultRegistry.RecordDockerOp("start_container", time.Since(started), nil)
		return nil
	} else if !errors.Is(engErr, errEngineUnavailable) {
		err = fmt.Errorf("start container: %w", engErr)
		performance.DefaultRegistry.RecordDockerOp("start_container", time.Since(started), err)
		return err
	}

	cmd := exec.CommandContext(ctx, "docker", "start", id)
	if output, cliErr := cmd.CombinedOutput(); cliErr != nil {
		err = fmt.Errorf("start container: %s", strings.TrimSpace(string(output)))
	}
	performance.DefaultRegistry.RecordDockerOp("start_container", time.Since(started), err)
	return err
}

func StopContainer(id string) error {
	started := time.Now()
	defer InvalidateContainers()
	ctx, cancel := context.WithTimeout(context.Background(), defaultOpTimeout)
	defer cancel()

	var err error
	if _, _, engErr := defaultEngine.doRequest(ctx, http.MethodPost, "/containers/"+url.PathEscape(id)+"/stop", nil); engErr == nil {
		performance.DefaultRegistry.RecordDockerOp("stop_container", time.Since(started), nil)
		return nil
	} else if !errors.Is(engErr, errEngineUnavailable) {
		err = fmt.Errorf("stop container: %w", engErr)
		performance.DefaultRegistry.RecordDockerOp("stop_container", time.Since(started), err)
		return err
	}

	cmd := exec.CommandContext(ctx, "docker", "stop", id)
	if output, cliErr := cmd.CombinedOutput(); cliErr != nil {
		err = fmt.Errorf("stop container: %s", strings.TrimSpace(string(output)))
	}
	performance.DefaultRegistry.RecordDockerOp("stop_container", time.Since(started), err)
	return err
}

func RestartContainer(id string) error {
	started := time.Now()
	defer InvalidateContainers()
	ctx, cancel := context.WithTimeout(context.Background(), defaultOpTimeout)
	defer cancel()

	var err error
	if _, _, engErr := defaultEngine.doRequest(ctx, http.MethodPost, "/containers/"+url.PathEscape(id)+"/restart", nil); engErr == nil {
		performance.DefaultRegistry.RecordDockerOp("restart_container", time.Since(started), nil)
		return nil
	} else if !errors.Is(engErr, errEngineUnavailable) {
		err = fmt.Errorf("restart container: %w", engErr)
		performance.DefaultRegistry.RecordDockerOp("restart_container", time.Since(started), err)
		return err
	}

	cmd := exec.CommandContext(ctx, "docker", "restart", id)
	if output, cliErr := cmd.CombinedOutput(); cliErr != nil {
		err = fmt.Errorf("restart container: %s", strings.TrimSpace(string(output)))
	}
	performance.DefaultRegistry.RecordDockerOp("restart_container", time.Since(started), err)
	return err
}

func DeleteContainer(id string, removeVolumes bool, removeImage bool) error {
	started := time.Now()
	defer InvalidateAll()
	ctx, cancel := context.WithTimeout(context.Background(), defaultOpTimeout)
	defer cancel()

	// Capture the image name BEFORE removing the container
	var imageRef string
	if removeImage {
		var insp struct {
			Config struct {
				Image string `json:"Image"`
			} `json:"Config"`
		}
		if _, _, err := defaultEngine.doRequest(ctx, http.MethodGet, "/containers/"+url.PathEscape(id)+"/json", &insp); err == nil && insp.Config.Image != "" {
			imageRef = insp.Config.Image
		} else {
			inspectCmd := exec.CommandContext(ctx, "docker", "inspect", "--format", "{{.Config.Image}}", id)
			if out, err := inspectCmd.Output(); err == nil {
				imageRef = strings.TrimSpace(string(out))
			}
		}
	}

	path := fmt.Sprintf("/containers/%s?force=true&v=%t", url.PathEscape(id), removeVolumes)
	if _, _, engErr := defaultEngine.doRequest(ctx, http.MethodDelete, path, nil); engErr == nil {
		// Force invalidation before checking IsImageInUse so removed container is not returned from cache.
		containersCache.Invalidate()
		if removeImage && imageRef != "" {
			if inUse, _ := IsImageInUse(imageRef, ""); !inUse {
				_, _, _ = defaultEngine.doRequest(ctx, http.MethodDelete, "/images/"+url.PathEscape(imageRef), nil)
			}
		}
		performance.DefaultRegistry.RecordDockerOp("delete_container", time.Since(started), nil)
		return nil
	} else if !errors.Is(engErr, errEngineUnavailable) {
		err := fmt.Errorf("delete container: %w", engErr)
		performance.DefaultRegistry.RecordDockerOp("delete_container", time.Since(started), err)
		return err
	}

	args := []string{"rm", "-f"}
	if removeVolumes {
		args = append(args, "-v")
	}
	args = append(args, id)
	cmd := exec.CommandContext(ctx, "docker", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		err := fmt.Errorf("delete container: %s", strings.TrimSpace(string(output)))
		performance.DefaultRegistry.RecordDockerOp("delete_container", time.Since(started), err)
		return err
	}

	containersCache.Invalidate()
	if removeImage && imageRef != "" {
		if inUse, _ := IsImageInUse(imageRef, ""); !inUse {
			rmiCmd := exec.CommandContext(ctx, "docker", "rmi", imageRef)
			// best-effort — ignore error if image is still used by another container
			_ = rmiCmd.Run()
		}
	}

	performance.DefaultRegistry.RecordDockerOp("delete_container", time.Since(started), nil)
	return nil
}

// IsImageInUse returns true if the image (by name or ID prefix) is used by any container
// other than the one with excludeID.
func IsImageInUse(imageRef, excludeID string) (bool, error) {
	containers, err := ListContainers()
	if err != nil {
		return false, fmt.Errorf("check image usage: %w", err)
	}
	for _, c := range containers {
		if excludeID != "" && (strings.HasPrefix(c.ID, excludeID) || strings.HasPrefix(excludeID, c.ID)) {
			continue
		}
		if c.Image == imageRef || strings.HasPrefix(c.Image, imageRef) {
			return true, nil
		}
	}
	return false, nil
}

func parsePorts(raw string) []ContainerPort {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []ContainerPort{}
	}
	parts := strings.Split(raw, ",")
	ports := make([]ContainerPort, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item == "" {
			continue
		}
		if matches := portPatternWithHost.FindStringSubmatch(item); len(matches) == 5 {
			publicPort, _ := strconv.Atoi(matches[2])
			privatePort, _ := strconv.Atoi(matches[3])
			ports = append(ports, ContainerPort{PrivatePort: privatePort, PublicPort: publicPort, Type: matches[4]})
			continue
		}
		if matches := portPatternInner.FindStringSubmatch(item); len(matches) == 3 {
			privatePort, _ := strconv.Atoi(matches[1])
			ports = append(ports, ContainerPort{PrivatePort: privatePort, Type: matches[2]})
		}
	}
	return ports
}

func parseLabels(raw string) map[string]string {
	labels := map[string]string{}
	for _, pair := range strings.Split(raw, ",") {
		item := strings.TrimSpace(pair)
		if item == "" {
			continue
		}
		parts := strings.SplitN(item, "=", 2)
		if len(parts) != 2 {
			continue
		}
		labels[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
	}
	return labels
}

func GetDockerVersions() DockerVersionInfo {
	v, err := versionsCache.Get(func() (DockerVersionInfo, error) {
		ctx, cancel := context.WithTimeout(context.Background(), defaultReadTimeout)
		defer cancel()

		info := DockerVersionInfo{
			Docker:  "v20.10.24",
			Buildx:  "v0.17.1",
			Compose: "v2.29.2",
		}
		var ver struct {
			Version string `json:"Version"`
		}
		if _, _, engErr := defaultEngine.doRequest(ctx, http.MethodGet, "/version", &ver); engErr == nil && ver.Version != "" {
			vStr := strings.TrimSpace(ver.Version)
			if !strings.HasPrefix(vStr, "v") {
				vStr = "v" + vStr
			}
			info.Docker = vStr
		} else if out, err := exec.CommandContext(ctx, "docker", "version", "--format", "{{.Server.Version}}").Output(); err == nil {
			vStr := strings.TrimSpace(string(out))
			if vStr != "" {
				if !strings.HasPrefix(vStr, "v") {
					vStr = "v" + vStr
				}
				info.Docker = vStr
			}
		}
		if out, err := exec.CommandContext(ctx, "docker", "buildx", "version").Output(); err == nil {
			for _, f := range strings.Fields(string(out)) {
				if strings.HasPrefix(f, "v") {
					info.Buildx = f
					break
				}
			}
		}
		if out, err := exec.CommandContext(ctx, "docker", "compose", "version", "--short").Output(); err == nil {
			vStr := strings.TrimSpace(string(out))
			if vStr != "" {
				if !strings.HasPrefix(vStr, "v") {
					vStr = "v" + vStr
				}
				info.Compose = vStr
			}
		}
		return info, nil
	})
	if err != nil {
		return DockerVersionInfo{Docker: "v20.10.24", Buildx: "v0.17.1", Compose: "v2.29.2"}
	}
	return v
}

// CountVolumes is how many named volumes Docker holds (0 when it cannot be asked).
func CountVolumes() int {
	n, err := volumesCache.Get(func() (int, error) {
		ctx, cancel := context.WithTimeout(context.Background(), defaultReadTimeout)
		defer cancel()
		var resp struct {
			Volumes []json.RawMessage `json:"Volumes"`
		}
		if _, _, engErr := defaultEngine.doRequest(ctx, http.MethodGet, "/volumes", &resp); engErr == nil {
			return len(resp.Volumes), nil
		}
		output, err := exec.CommandContext(ctx, "docker", "volume", "ls", "-q").Output()
		if err != nil {
			return 0, err
		}
		return len(splitNonEmptyLines(string(output))), nil
	})
	if err != nil {
		return 0
	}
	return n
}
