package docker

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

func ListContainers() ([]Container, error) {
	cmd := exec.Command("docker", "ps", "-a", "--format", "{{json .}}")
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
	ids := make([]string, len(containers))
	idToIndex := make(map[string]int)
	for i, c := range containers {
		ids[i] = c.ID
		idToIndex[c.ID] = i
	}

	args := append([]string{"inspect", "--format", `{"Id": "{{.Id}}", "Created": {{json .Created}}, "Networks": {{json .NetworkSettings.Networks}}, "RestartCount": {{.RestartCount}}, "State": {{json .State}}}`}, ids...)
	cmd := exec.Command("docker", args...)
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
	cmd := exec.Command("docker", "start", id)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("start container: %s", strings.TrimSpace(string(output)))
	}
	return nil
}

func StopContainer(id string) error {
	cmd := exec.Command("docker", "stop", id)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("stop container: %s", strings.TrimSpace(string(output)))
	}
	return nil
}

func RestartContainer(id string) error {
	cmd := exec.Command("docker", "restart", id)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("restart container: %s", strings.TrimSpace(string(output)))
	}
	return nil
}

func DeleteContainer(id string, removeVolumes bool, removeImage bool) error {
	// Capture the image name BEFORE removing the container
	var imageRef string
	if removeImage {
		inspectCmd := exec.Command("docker", "inspect", "--format", "{{.Config.Image}}", id)
		if out, err := inspectCmd.Output(); err == nil {
			imageRef = strings.TrimSpace(string(out))
		}
	}

	args := []string{"rm", "-f"}
	if removeVolumes {
		args = append(args, "-v")
	}
	args = append(args, id)
	cmd := exec.Command("docker", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("delete container: %s", strings.TrimSpace(string(output)))
	}

	if removeImage && imageRef != "" {
		if inUse, _ := IsImageInUse(imageRef, ""); !inUse {
			rmiCmd := exec.Command("docker", "rmi", imageRef)
			// best-effort — ignore error if image is still used by another container
			_ = rmiCmd.Run()
		}
	}

	return nil
}

// IsImageInUse returns true if the image (by name or ID prefix) is used by any container
// other than the one with excludeID.
func IsImageInUse(imageRef, excludeID string) (bool, error) {
	cmd := exec.Command("docker", "ps", "-a", "--format", "{{.ID}} {{.Image}}")
	out, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("check image usage: %w", err)
	}
	for _, line := range splitNonEmptyLines(strings.TrimSpace(string(out))) {
		parts := strings.SplitN(line, " ", 2)
		if len(parts) != 2 {
			continue
		}
		cid, cimg := parts[0], parts[1]
		if excludeID != "" && strings.HasPrefix(cid, excludeID) {
			continue
		}
		if cimg == imageRef || strings.HasPrefix(cimg, imageRef) {
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
	pattern := regexp.MustCompile(`(?:(\d+\.\d+\.\d+\.\d+|\[::\]|::):)?(\d+)->(\d+)/(tcp|udp)`)
	containerOnly := regexp.MustCompile(`(\d+)/(tcp|udp)`)
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item == "" {
			continue
		}
		if matches := pattern.FindStringSubmatch(item); len(matches) == 5 {
			publicPort, _ := strconv.Atoi(matches[2])
			privatePort, _ := strconv.Atoi(matches[3])
			ports = append(ports, ContainerPort{PrivatePort: privatePort, PublicPort: publicPort, Type: matches[4]})
			continue
		}
		if matches := containerOnly.FindStringSubmatch(item); len(matches) == 3 {
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
