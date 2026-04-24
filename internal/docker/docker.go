package docker

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type Container struct {
	ID          string                 `json:"Id"`
	Names       []string               `json:"Names"`
	Image       string                 `json:"Image"`
	State       string                 `json:"State"`
	Status      string                 `json:"Status"`
	Ports       []ContainerPort        `json:"Ports"`
	Networks    []string               `json:"Networks"`
	IPAddresses []string               `json:"IpAddresses"`
	Created     int64                  `json:"Created"`
	Labels      map[string]string      `json:"Labels,omitempty"`
	ProjectName string                 `json:"ProjectName,omitempty"`
	OwnerUserID int64                  `json:"OwnerUserId,omitempty"`
	OwnerName   string                 `json:"OwnerName,omitempty"`
	Source      string                 `json:"Source,omitempty"`
	ComposePath string                 `json:"ComposePath,omitempty"`
	Resources   map[string]any         `json:"Resources,omitempty"`
	Metadata    map[string]interface{} `json:"Metadata,omitempty"`
}

type ContainerPort struct {
	PrivatePort int    `json:"PrivatePort"`
	PublicPort  int    `json:"PublicPort,omitempty"`
	Type        string `json:"Type"`
}

type OwnerContext struct {
	UserID        int64
	Username      string
	DisplayName   string
	Role          string
	OSUsername    string
	HomeDir       string
	DockerRootDir string
	DiskQuotaMB   int64
	CPULimitPct   int
	MemoryLimitMB int
}

type PortBinding struct {
	HostIP        string `json:"hostIp,omitempty"`
	HostPort      string `json:"hostPort"`
	ContainerPort string `json:"containerPort"`
	Protocol      string `json:"protocol,omitempty"`
}

type EnvVar struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type VolumeBinding struct {
	HostPath      string `json:"hostPath"`
	ContainerPath string `json:"containerPath"`
	ReadOnly      bool   `json:"readOnly,omitempty"`
}

type DeployImageRequest struct {
	Name    string          `json:"name"`
	Image   string          `json:"image"`
	Network string          `json:"network,omitempty"`
	Ports   []PortBinding   `json:"ports"`
	Env     []EnvVar        `json:"env"`
	EnvMode string          `json:"envMode,omitempty"`
	EnvRaw  string          `json:"envRaw,omitempty"`
	Volumes []VolumeBinding `json:"volumes"`
}

type DeployComposeRequest struct {
	Name        string `json:"name"`
	ComposeYAML string `json:"composeYaml"`
}

type DeployResult struct {
	ProjectName string `json:"projectName"`
	ComposePath string `json:"composePath"`
	ProjectDir  string `json:"projectDir"`
}

const (
	labelManagedBy  = "panel.managed_by"
	labelOwnerID    = "panel.owner_id"
	labelOwnerName  = "panel.owner_username"
	labelSource     = "panel.source"
	labelComposeDir = "panel.compose_path"
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
			ID      string `json:"ID"`
			Names   string `json:"Names"`
			Image   string `json:"Image"`
			State   string `json:"State"`
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

	args := append([]string{"inspect", "--format", `{"Id": "{{.Id}}", "Networks": {{json .NetworkSettings.Networks}}}`}, ids...)
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

// ContainerConfig holds the editable configuration of a deployed container.
type ContainerConfig struct {
	Name    string          `json:"name"`
	Image   string          `json:"image"`
	Network string          `json:"network"`
	Ports   []PortBinding   `json:"ports"`
	Env     []EnvVar        `json:"env"`
	EnvMode string          `json:"envMode,omitempty"`
	EnvRaw  string          `json:"envRaw,omitempty"`
	Volumes []VolumeBinding `json:"volumes"`
}

// InspectContainerConfig reads a container's runtime config and returns editable fields.
func InspectContainerConfig(id string) (*ContainerConfig, error) {
	// Use docker inspect to get JSON output
	cmd := exec.Command("docker", "inspect", id)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("inspect container: %w", err)
	}

	var inspects []struct {
		Name   string `json:"Name"`
		Config struct {
			Image  string            `json:"Image"`
			Env    []string          `json:"Env"`
			Labels map[string]string `json:"Labels"`
		} `json:"Config"`
		HostConfig struct {
			PortBindings map[string][]struct {
				HostIP   string `json:"HostIp"`
				HostPort string `json:"HostPort"`
			} `json:"PortBindings"`
			Binds []string `json:"Binds"`
		} `json:"HostConfig"`
		NetworkSettings struct {
			Networks map[string]struct{} `json:"Networks"`
		} `json:"NetworkSettings"`
	}

	if err := json.Unmarshal(out, &inspects); err != nil || len(inspects) == 0 {
		return nil, fmt.Errorf("parse inspect: %w", err)
	}
	insp := inspects[0]

	// Container name (strip leading slash)
	name := strings.TrimPrefix(insp.Name, "/")

	// Primary network (skip loopback)
	network := ""
	for netName := range insp.NetworkSettings.Networks {
		if netName != "bridge" && netName != "host" && netName != "none" {
			network = netName
			break
		}
	}

	// Parse ports: "containerPort/proto" -> []{HostIP, HostPort}
	var ports []PortBinding
	for spec, bindings := range insp.HostConfig.PortBindings {
		parts := strings.SplitN(spec, "/", 2)
		containerPort := parts[0]
		proto := "tcp"
		if len(parts) == 2 {
			proto = parts[1]
		}
		for _, b := range bindings {
			if b.HostPort != "" {
				ports = append(ports, PortBinding{
					HostIP:        b.HostIP,
					HostPort:      b.HostPort,
					ContainerPort: containerPort,
					Protocol:      proto,
				})
			}
		}
	}

	// Parse env vars (skip internal docker vars)
	var env []EnvVar
	for _, e := range insp.Config.Env {
		kv := strings.SplitN(e, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key := kv[0]
		// Skip PATH and other system-injected vars
		if key == "PATH" || key == "HOME" || key == "HOSTNAME" {
			continue
		}
		env = append(env, EnvVar{Key: key, Value: kv[1]})
	}

	// Parse volume binds: "hostPath:containerPath[:mode]"
	var volumes []VolumeBinding
	for _, bind := range insp.HostConfig.Binds {
		parts := strings.SplitN(bind, ":", 3)
		if len(parts) < 2 {
			continue
		}
		ro := len(parts) == 3 && parts[2] == "ro"
		volumes = append(volumes, VolumeBinding{
			HostPath:      parts[0],
			ContainerPath: parts[1],
			ReadOnly:      ro,
		})
	}

	return &ContainerConfig{
		Name:    name,
		Image:   insp.Config.Image,
		Network: network,
		Ports:   ports,
		Env:     env,
		EnvMode: "form",
		EnvRaw:  envVarsToRaw(env),
		Volumes: volumes,
	}, nil
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


func DeployFromImage(owner OwnerContext, req DeployImageRequest) (*DeployResult, error) {
	projectName, projectDir, composePath, err := prepareProject(owner, req.Name)
	if err != nil {
		return nil, err
	}
	ports, err := normalizePortBindings(req.Ports)
	if err != nil {
		return nil, err
	}
	volumes, err := normalizeVolumes(owner, req.Volumes)
	if err != nil {
		return nil, err
	}
	env, err := normalizeEnvVars(req.EnvMode, req.EnvRaw, req.Env)
	if err != nil {
		return nil, err
	}
	composeYAML, err := buildComposeForImage(owner, projectName, req.Image, req.Network, ports, env, volumes)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		return nil, fmt.Errorf("prepare project dir: %w", err)
	}
	if err := os.WriteFile(composePath, []byte(composeYAML), 0644); err != nil {
		return nil, fmt.Errorf("write compose file: %w", err)
	}
	if err := runComposeUp(projectDir, composePath); err != nil {
		return nil, err
	}
	return &DeployResult{ProjectName: projectName, ComposePath: composePath, ProjectDir: projectDir}, nil
}

func DeployFromCompose(owner OwnerContext, req DeployComposeRequest) (*DeployResult, error) {
	projectName, projectDir, composePath, err := prepareProject(owner, req.Name)
	if err != nil {
		return nil, err
	}
	content := strings.TrimSpace(req.ComposeYAML)
	if content == "" {
		return nil, errors.New("compose yaml is required")
	}
	if err := ensureComposeWithinOwnerRoot(content, owner.HomeDir); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		return nil, fmt.Errorf("prepare project dir: %w", err)
	}
	if err := os.WriteFile(composePath, []byte(content), 0644); err != nil {
		return nil, fmt.Errorf("write compose file: %w", err)
	}
	if err := runComposeUp(projectDir, composePath); err != nil {
		return nil, err
	}
	return &DeployResult{ProjectName: projectName, ComposePath: composePath, ProjectDir: projectDir}, nil
}

func splitNonEmptyLines(input string) []string {
	lines := make([]string, 0)
	current := ""
	for _, r := range input {
		if r == '\n' {
			if current != "" {
				lines = append(lines, current)
				current = ""
			}
			continue
		}
		if r != '\r' {
			current += string(r)
		}
	}
	if current != "" {
		lines = append(lines, current)
	}
	return lines
}

func normalizeState(state string) string {
	switch state {
	case "running", "exited", "paused", "restarting", "dead":
		return state
	default:
		return "dead"
	}
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

func prepareProject(owner OwnerContext, rawName string) (string, string, string, error) {
	projectName := slugify(rawName)
	if projectName == "" {
		return "", "", "", errors.New("name is required")
	}
	projectDir := filepath.Join(owner.DockerRootDir, projectName)
	composePath := filepath.Join(projectDir, "compose.yml")
	return projectName, projectDir, composePath, nil
}

func normalizePortBindings(items []PortBinding) ([]PortBinding, error) {
	ports := make([]PortBinding, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		hostPort := strings.TrimSpace(item.HostPort)
		containerPort := strings.TrimSpace(item.ContainerPort)
		if hostPort == "" && containerPort == "" {
			continue
		}
		if hostPort == "" || containerPort == "" {
			return nil, errors.New("host port and container port are required")
		}
		protocol := strings.ToLower(strings.TrimSpace(item.Protocol))
		if protocol == "" {
			protocol = "tcp"
		}
		if protocol != "tcp" && protocol != "udp" {
			return nil, fmt.Errorf("invalid protocol %q", protocol)
		}
		key := hostPort + ":" + containerPort + "/" + protocol
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		ports = append(ports, PortBinding{HostIP: strings.TrimSpace(item.HostIP), HostPort: hostPort, ContainerPort: containerPort, Protocol: protocol})
	}
	return ports, nil
}

func normalizeVolumes(owner OwnerContext, items []VolumeBinding) ([]VolumeBinding, error) {
	volumes := make([]VolumeBinding, 0, len(items))
	for _, item := range items {
		hostPath := strings.TrimSpace(item.HostPath)
		containerPath := strings.TrimSpace(item.ContainerPath)
		if hostPath == "" && containerPath == "" {
			continue
		}
		if hostPath == "" || containerPath == "" {
			return nil, errors.New("host path and container path are required")
		}
		resolved, err := resolveVolumeHostPath(owner, hostPath)
		if err != nil {
			return nil, err
		}
		if err := os.MkdirAll(resolved, 0755); err != nil {
			return nil, fmt.Errorf("prepare volume path: %w", err)
		}
		volumes = append(volumes, VolumeBinding{HostPath: resolved, ContainerPath: containerPath, ReadOnly: item.ReadOnly})
	}
	return volumes, nil
}

func resolveVolumeHostPath(owner OwnerContext, hostPath string) (string, error) {
	candidate := hostPath
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(owner.HomeDir, candidate)
	}
	candidate = filepath.Clean(candidate)
	root := filepath.Clean(owner.HomeDir)
	if candidate != root && !strings.HasPrefix(candidate, root+string(filepath.Separator)) {
		return "", fmt.Errorf("volume path %q berada di luar root user", hostPath)
	}
	return candidate, nil
}

func ensureComposeWithinOwnerRoot(content, homeDir string) error {
	root := filepath.Clean(homeDir)
	re := regexp.MustCompile(`(?m)^\s*-\s*([^\s:#]+):([^\s]+)(?::(ro|rw))?\s*$`)
	matches := re.FindAllStringSubmatch(content, -1)
	for _, match := range matches {
		hostPath := strings.TrimSpace(match[1])
		if hostPath == "" || strings.HasPrefix(hostPath, "${") || !filepath.IsAbs(hostPath) {
			continue
		}
		clean := filepath.Clean(hostPath)
		if clean != root && !strings.HasPrefix(clean, root+string(filepath.Separator)) {
			return fmt.Errorf("compose volume path %q berada di luar root user", hostPath)
		}
	}
	return nil
}

func normalizeEnvVars(mode, raw string, items []EnvVar) ([]EnvVar, error) {
	if strings.EqualFold(strings.TrimSpace(mode), "raw") {
		return parseRawEnv(raw)
	}
	return normalizeEnvList(items), nil
}

func normalizeEnvList(items []EnvVar) []EnvVar {
	env := make([]EnvVar, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		key := strings.TrimSpace(item.Key)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		env = append(env, EnvVar{Key: key, Value: item.Value})
	}
	return env
}

func parseRawEnv(raw string) ([]EnvVar, error) {
	lines := strings.Split(raw, "\n")
	env := make([]EnvVar, 0, len(lines))
	seen := map[string]struct{}{}
	for idx, line := range lines {
		trimmed := strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		parts := strings.SplitN(trimmed, "=", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid env entry on line %d: expected KEY=value", idx+1)
		}
		key := strings.TrimSpace(parts[0])
		if key == "" {
			return nil, fmt.Errorf("invalid env entry on line %d: key is required", idx+1)
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		env = append(env, EnvVar{Key: key, Value: parts[1]})
	}
	return env, nil
}

func envVarsToRaw(items []EnvVar) string {
	var lines []string
	for _, item := range normalizeEnvList(items) {
		lines = append(lines, item.Key+"="+item.Value)
	}
	return strings.Join(lines, "\n")
}

func buildComposeForImage(owner OwnerContext, projectName, image, network string, ports []PortBinding, env []EnvVar, volumes []VolumeBinding) (string, error) {
	image = strings.TrimSpace(image)
	if image == "" {
		return "", errors.New("image is required")
	}
	serviceName := slugify(projectName)
	if serviceName == "" {
		serviceName = "app"
	}
	network = strings.TrimSpace(network)
	var b strings.Builder
	b.WriteString("services:\n")
	b.WriteString(fmt.Sprintf("  %s:\n", serviceName))
	b.WriteString(fmt.Sprintf("    image: %s\n", yamlScalar(image)))
	b.WriteString(fmt.Sprintf("    container_name: %s\n", yamlScalar(projectName)))
	b.WriteString("    restart: unless-stopped\n")
	b.WriteString("    labels:\n")
	b.WriteString(fmt.Sprintf("      %s: \"panel\"\n", labelManagedBy))
	b.WriteString(fmt.Sprintf("      %s: \"%d\"\n", labelOwnerID, owner.UserID))
	b.WriteString(fmt.Sprintf("      %s: %s\n", labelOwnerName, yamlScalar(owner.Username)))
	b.WriteString(fmt.Sprintf("      %s: \"image\"\n", labelSource))
	b.WriteString(fmt.Sprintf("      %s: %s\n", labelComposeDir, yamlScalar(filepath.Join(owner.DockerRootDir, projectName, "compose.yml"))))
	b.WriteString(fmt.Sprintf("      panel.cpu_limit_pct: \"%d\"\n", owner.CPULimitPct))
	b.WriteString(fmt.Sprintf("      panel.memory_limit_mb: \"%d\"\n", owner.MemoryLimitMB))
	b.WriteString(fmt.Sprintf("      panel.disk_quota_mb: \"%d\"\n", owner.DiskQuotaMB))
	if len(env) > 0 {
		b.WriteString("    environment:\n")
		for _, item := range env {
			key := strings.TrimSpace(item.Key)
			if key == "" {
				continue
			}
			b.WriteString(fmt.Sprintf("      %s: %s\n", key, yamlScalar(item.Value)))
		}
	}
	if len(ports) > 0 {
		b.WriteString("    ports:\n")
		for _, port := range ports {
			mapping := port.HostPort + ":" + port.ContainerPort
			if port.Protocol != "" && port.Protocol != "tcp" {
				mapping += "/" + port.Protocol
			}
			b.WriteString(fmt.Sprintf("      - %s\n", yamlScalar(mapping)))
		}
	}
	if len(volumes) > 0 {
		b.WriteString("    volumes:\n")
		for _, volume := range volumes {
			mapping := volume.HostPath + ":" + volume.ContainerPath
			if volume.ReadOnly {
				mapping += ":ro"
			}
			b.WriteString(fmt.Sprintf("      - %s\n", yamlScalar(mapping)))
		}
	}
	if network != "" {
		b.WriteString("    networks:\n")
		b.WriteString(fmt.Sprintf("      - %s\n", yamlScalar(network)))
	}
	b.WriteString("    deploy:\n")
	b.WriteString("      resources:\n")
	b.WriteString("        limits:\n")
	b.WriteString(fmt.Sprintf("          cpus: \"%.2f\"\n", cpuQuota(owner.CPULimitPct)))
	b.WriteString(fmt.Sprintf("          memory: %s\n", yamlScalar(fmt.Sprintf("%dM", owner.MemoryLimitMB))))
	if network != "" {
		b.WriteString("networks:\n")
		b.WriteString(fmt.Sprintf("  %s:\n", yamlScalar(network)))
		b.WriteString("    external: true\n")
	}
	return b.String(), nil
}

func runComposeUp(projectDir, composePath string) error {
	cmd := exec.Command("docker", "compose", "-f", composePath, "up", "-d")
	cmd.Dir = projectDir
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("deploy compose: %s", strings.TrimSpace(string(output)))
	}
	return nil
}

func yamlScalar(value string) string {
	escaped := strings.ReplaceAll(value, "\"", "\\\"")
	return fmt.Sprintf("\"%s\"", escaped)
}

func cpuQuota(limitPct int) float64 {
	if limitPct <= 0 {
		return 1
	}
	cpu := float64(limitPct) / 100
	if cpu < 0.1 {
		return 0.1
	}
	return cpu
}

func slugify(input string) string {
	input = strings.ToLower(strings.TrimSpace(input))
	var b strings.Builder
	lastDash := false
	for _, r := range input {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == '-' || r == '_' || r == ' ':
			if !lastDash && b.Len() > 0 {
				b.WriteRune('-')
				lastDash = true
			}
		}
	}
	result := strings.Trim(b.String(), "-")
	if len(result) > 48 {
		result = result[:48]
	}
	return result
}
