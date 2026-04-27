package docker

import (
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

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

func yamlScalar(value string) string {
	escaped := strings.ReplaceAll(value, "\"", "\\\"")
	return fmt.Sprintf("\"%s\"", escaped)
}
