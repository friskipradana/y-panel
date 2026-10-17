package docker

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

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
	if !IsPolicyExempt(owner.Role) {
		if err := CheckNetworkPolicy(req.Network); err != nil {
			return nil, err
		}
		if err := CheckComposePolicy(composeYAML, owner.HomeDir); err != nil {
			return nil, err
		}
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
	if err := enforceDeployedPolicy(owner, projectName, projectDir, composePath); err != nil {
		return nil, err
	}
	return &DeployResult{ProjectName: projectName, ComposePath: composePath, ProjectDir: projectDir}, nil
}

// enforceDeployedPolicy judges the containers that really came up: a compose file can build a value
// from a variable or an .env file, which no reading of its text would show. A container that breaks
// the policy is taken down again with its project.
func enforceDeployedPolicy(owner OwnerContext, projectName, projectDir, composePath string) error {
	if IsPolicyExempt(owner.Role) {
		return nil
	}
	violations, err := ProjectViolations(projectName, owner.HomeDir)
	if err != nil || len(violations) == 0 {
		return nil
	}
	down := exec.Command("docker", "compose", "-f", composePath, "-p", projectName, "down", "--remove-orphans")
	down.Dir = projectDir
	_ = down.Run()
	return &PolicyError{Reason: fmt.Sprintf("container %q asks for %s", violations[0].Name, strings.Join(violations[0].Reasons, ", "))}
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
	if !IsPolicyExempt(owner.Role) {
		if err := CheckComposePolicy(content, owner.HomeDir); err != nil {
			return nil, err
		}
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
	if err := enforceDeployedPolicy(owner, projectName, projectDir, composePath); err != nil {
		return nil, err
	}
	return &DeployResult{ProjectName: projectName, ComposePath: composePath, ProjectDir: projectDir}, nil
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
	// a symlink in the account's folder must not lead the mount somewhere else
	real, err := realPathOf(candidate)
	if err != nil {
		return "", fmt.Errorf("volume path %q tidak dapat diverifikasi", hostPath)
	}
	realRoot, err := realPathOf(root)
	if err != nil {
		return "", fmt.Errorf("volume path %q tidak dapat diverifikasi", hostPath)
	}
	if real != realRoot && !strings.HasPrefix(real, realRoot+string(filepath.Separator)) {
		return "", fmt.Errorf("volume path %q mengarah ke luar root user", hostPath)
	}
	return real, nil
}

// realPathOf resolves the symlinks of the deepest part of a path that exists
func realPathOf(p string) (string, error) {
	p = filepath.Clean(p)
	rest := ""
	for {
		resolved, err := filepath.EvalSymlinks(p)
		if err == nil {
			if rest == "" {
				return resolved, nil
			}
			return filepath.Join(resolved, rest), nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(p)
		if parent == p {
			return "", err
		}
		rest = filepath.Join(filepath.Base(p), rest)
		p = parent
	}
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
