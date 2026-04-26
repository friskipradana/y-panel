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
	ID           string                 `json:"Id"`
	Names        []string               `json:"Names"`
	Image        string                 `json:"Image"`
	State        string                 `json:"State"`
	Status       string                 `json:"Status"`
	Ports        []ContainerPort        `json:"Ports"`
	Networks     []string               `json:"Networks"`
	IPAddresses  []string               `json:"IpAddresses"`
	Created      int64                  `json:"Created"`
	Labels       map[string]string      `json:"Labels,omitempty"`
	ProjectName  string                 `json:"ProjectName,omitempty"`
	OwnerUserID  int64                  `json:"OwnerUserId,omitempty"`
	OwnerName    string                 `json:"OwnerName,omitempty"`
	Source       string                 `json:"Source,omitempty"`
	ComposePath  string                 `json:"ComposePath,omitempty"`
	Resources    map[string]any         `json:"Resources,omitempty"`
	RestartCount int                    `json:"RestartCount,omitempty"`
	ExitCode     int                    `json:"ExitCode,omitempty"`
	Health       string                 `json:"Health,omitempty"`
	StartedAt    string                 `json:"StartedAt,omitempty"`
	FinishedAt   string                 `json:"FinishedAt,omitempty"`
	CreatedAt    string                 `json:"CreatedAt,omitempty"`
	Metadata     map[string]interface{} `json:"Metadata,omitempty"`
}

type ContainerLogs struct {
	ID    string   `json:"id"`
	Tail  int      `json:"tail"`
	Lines []string `json:"lines"`
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

type RegistryAuth struct {
	Enabled         bool   `json:"enabled,omitempty"`
	Registry        string `json:"registry,omitempty"`
	UsernameOrEmail string `json:"usernameOrEmail,omitempty"`
	Password        string `json:"password,omitempty"`
}

type DeployImageRequest struct {
	Name         string          `json:"name"`
	Image        string          `json:"image"`
	Network      string          `json:"network,omitempty"`
	Ports        []PortBinding   `json:"ports"`
	Env          []EnvVar        `json:"env"`
	EnvMode      string          `json:"envMode,omitempty"`
	EnvRaw       string          `json:"envRaw,omitempty"`
	RegistryAuth *RegistryAuth   `json:"registryAuth,omitempty"`
	Volumes      []VolumeBinding `json:"volumes"`
}

type DeployComposeRequest struct {
	Name         string        `json:"name"`
	ComposeYAML  string        `json:"composeYaml"`
	RegistryAuth *RegistryAuth `json:"registryAuth,omitempty"`
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

func ReadContainerLogs(id string, tail int) (ContainerLogs, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return ContainerLogs{}, errors.New("container id is required")
	}
	if tail <= 0 {
		tail = 200
	}
	if tail > 1000 {
		tail = 1000
	}
	cmd := exec.Command("docker", "logs", "--tail", strconv.Itoa(tail), "--timestamps", id)
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return ContainerLogs{}, fmt.Errorf("read container logs: %s", message)
	}
	return ContainerLogs{ID: id, Tail: tail, Lines: splitNonEmptyLines(string(output))}, nil
}

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
			Networks map[string]struct {
				NetworkID string `json:"NetworkID"`
				IPAddress string `json:"IPAddress"`
			} `json:"Networks"`
		} `json:"NetworkSettings"`
	}

	if err := json.Unmarshal(out, &inspects); err != nil || len(inspects) == 0 {
		return nil, fmt.Errorf("parse inspect: %w", err)
	}
	insp := inspects[0]

	// Container name (strip leading slash)
	name := strings.TrimPrefix(insp.Name, "/")

	// Primary network (skip Docker built-in networks when a user network exists).
	network := ""
	var fallbackNetwork string
	for netName := range insp.NetworkSettings.Networks {
		if fallbackNetwork == "" {
			fallbackNetwork = netName
		}
		if netName != "bridge" && netName != "host" && netName != "none" {
			network = netName
			break
		}
	}
	if network == "" {
		network = fallbackNetwork
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
			ports = append(ports, PortBinding{
				HostIP:        b.HostIP,
				HostPort:      b.HostPort,
				ContainerPort: containerPort,
				Protocol:      proto,
			})
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
		if key == "HOSTNAME" {
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
	logout, err := loginRegistryIfNeeded(req.RegistryAuth)
	if err != nil {
		return nil, err
	}
	if logout != nil {
		defer logout()
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
	if err := runComposeUp(projectDir, composePath, projectName); err != nil {
		return nil, err
	}
	return &DeployResult{ProjectName: projectName, ComposePath: composePath, ProjectDir: projectDir}, nil
}

func PullImage(image string, auth *RegistryAuth) error {
	image = strings.TrimSpace(image)
	if image == "" {
		return errors.New("image is required")
	}
	logout, err := loginRegistryIfNeeded(auth)
	if err != nil {
		return err
	}
	if logout != nil {
		defer logout()
	}
	cmd := exec.Command("docker", "pull", image)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("pull image: %s", strings.TrimSpace(string(output)))
	}
	return nil
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
	content = namespaceComposeContainerNames(content, projectName)
	if err := os.MkdirAll(projectDir, 0755); err != nil {
		return nil, fmt.Errorf("prepare project dir: %w", err)
	}
	if err := os.WriteFile(composePath, []byte(content), 0644); err != nil {
		return nil, fmt.Errorf("write compose file: %w", err)
	}

	logout, err := loginRegistryIfNeeded(req.RegistryAuth)
	if err != nil {
		return nil, err
	}
	if logout != nil {
		defer logout()
	}

	if err := runComposeUp(projectDir, composePath, projectName); err != nil {
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

func namespaceComposeContainerNames(content, projectName string) string {
	projectName = slugify(projectName)
	if projectName == "" {
		return content
	}
	re := regexp.MustCompile(`(?m)^(\s*container_name\s*:\s*)(["']?)([^"'\n#]+)(["']?)(\s*(?:#.*)?)$`)
	return re.ReplaceAllStringFunc(content, func(line string) string {
		match := re.FindStringSubmatch(line)
		if len(match) != 6 {
			return line
		}
		name := slugify(strings.TrimSpace(match[3]))
		if name == "" || strings.HasPrefix(name, projectName+"-") {
			return line
		}
		return match[1] + match[2] + projectName + "-" + name + match[4] + match[5]
	})
}

func loginRegistryIfNeeded(auth *RegistryAuth) (func(), error) {
	if auth == nil || !auth.Enabled {
		return nil, nil
	}
	username := strings.TrimSpace(auth.UsernameOrEmail)
	password := auth.Password
	if username == "" || strings.TrimSpace(password) == "" {
		return nil, errors.New("registry username/email and password are required")
	}
	registry := normalizeRegistryAddress(auth.Registry)
	cmd := exec.Command("docker", "login", registry, "-u", username, "--password-stdin")
	cmd.Stdin = strings.NewReader(password)
	if output, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("registry login failed: %s", strings.TrimSpace(string(output)))
	}
	return func() {
		logoutRegistry(registry)
	}, nil
}

func normalizeRegistryAddress(registry string) string {
	trimmed := strings.TrimSpace(registry)
	if trimmed == "" {
		return "docker.io"
	}
	return trimmed
}

func logoutRegistry(registry string) {
	cmd := exec.Command("docker", "logout", normalizeRegistryAddress(registry))
	_, _ = cmd.CombinedOutput()
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

func runComposeUp(projectDir, composePath, projectName string) error {
	args := []string{"compose", "-f", composePath}
	if strings.TrimSpace(projectName) != "" {
		args = append(args, "-p", projectName)
	}
	args = append(args, "up", "-d")
	cmd := exec.Command("docker", args...)
	cmd.Dir = projectDir
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("deploy compose: %s", formatComposeError(string(output)))
	}
	return nil
}

func formatComposeError(output string) string {
	message := normalizeDockerOutput(output)
	if message == "" {
		return "Docker Compose gagal dijalankan. Periksa konfigurasi compose lalu coba lagi."
	}
	lower := strings.ToLower(message)

	if strings.Contains(lower, "port is already allocated") || strings.Contains(lower, "bind for 0.0.0.0:") {
		port := extractFirstRegexGroup(message, `(?i)bind for [^:]+:(\d+) failed`)
		if port == "" {
			port = extractFirstRegexGroup(message, `(?i)port (\d+) is already allocated`)
		}
		if port != "" {
			return fmt.Sprintf("Port host %s sudah dipakai oleh container atau service lain. Ganti mapping port di docker-compose.yml, misalnya \"%s:...\" menjadi port lain, atau hentikan service yang memakai port tersebut.", port, port)
		}
		return "Ada port host yang sudah dipakai oleh container atau service lain. Ganti mapping port di docker-compose.yml atau hentikan service yang memakai port tersebut."
	}

	if strings.Contains(lower, "container name") && strings.Contains(lower, "is already in use") {
		containerName := extractFirstRegexGroup(message, `(?i)container name\s+"?/?([^"\s]+)"?\s+is already in use`)
		if containerName != "" {
			return fmt.Sprintf("Nama container %q sudah dipakai. Ganti/hapus `container_name` pada template compose, atau hapus container lama yang memakai nama tersebut.", containerName)
		}
		return "Ada nama container yang sudah dipakai. Ganti/hapus `container_name` pada template compose, atau hapus container lama terlebih dahulu."
	}

	if strings.Contains(lower, "pull access denied") || strings.Contains(lower, "repository does not exist") {
		return "Image Docker tidak bisa diunduh. Pastikan nama image benar dan registry credential sudah diisi bila image bersifat private."
	}

	if strings.Contains(lower, "authentication required") || strings.Contains(lower, "unauthorized") || strings.Contains(lower, "denied: requested access") {
		return "Autentikasi registry gagal. Periksa registry, username/email, dan password/token lalu coba deploy lagi."
	}

	if strings.Contains(lower, "no such image") {
		return "Image Docker tidak ditemukan di host atau registry. Periksa nama image dan tag pada compose."
	}

	if strings.Contains(lower, "invalid compose") || strings.Contains(lower, "yaml") {
		return "Format docker-compose.yml tidak valid. Periksa indentasi YAML, nama service, image, ports, volumes, dan env."
	}

	if strings.Contains(lower, "berada di luar root user") {
		return message
	}

	return message
}

func normalizeDockerOutput(output string) string {
	lines := strings.Split(strings.ReplaceAll(output, "\r\n", "\n"), "\n")
	cleaned := make([]string, 0, len(lines))
	warningObsoleteVersion := regexp.MustCompile(`(?i)the attribute .version. is obsolete`)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || warningObsoleteVersion.MatchString(line) {
			continue
		}
		line = regexp.MustCompile(`^time="[^"]+"\s+level=\w+\s+msg="(.*)"$`).ReplaceAllString(line, "$1")
		cleaned = append(cleaned, line)
	}
	return strings.TrimSpace(strings.Join(cleaned, " "))
}

func extractFirstRegexGroup(value, pattern string) string {
	matches := regexp.MustCompile(pattern).FindStringSubmatch(value)
	if len(matches) < 2 {
		return ""
	}
	return strings.TrimSpace(matches[1])
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
