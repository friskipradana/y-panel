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

// builtinNetwork says whether a network is one of the three docker has from the start
func builtinNetwork(name string) bool {
	switch strings.TrimSpace(name) {
	case "bridge", "host", "none":
		return true
	}
	return false
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
	// the networks docker makes itself (bridge, host, none) cannot be joined as a network of the project: compose would give the
	// service a name alias there, which only networks made by the user support. They are the network mode instead.
	if builtinNetwork(network) {
		b.WriteString(fmt.Sprintf("    network_mode: %s\n", network))
	} else if network != "" {
		b.WriteString("    networks:\n")
		b.WriteString(fmt.Sprintf("      - %s\n", yamlScalar(network)))
	}
	b.WriteString("    deploy:\n")
	b.WriteString("      resources:\n")
	b.WriteString("        limits:\n")
	b.WriteString(fmt.Sprintf("          cpus: \"%.2f\"\n", cpuQuota(owner.CPULimitPct)))
	b.WriteString(fmt.Sprintf("          memory: %s\n", yamlScalar(fmt.Sprintf("%dM", owner.MemoryLimitMB))))
	if network != "" && !builtinNetwork(network) {
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

var (
	networksKeyLine    = regexp.MustCompile(`^(\s*)networks\s*:\s*(.*?)\s*$`)
	networkModeKeyLine = regexp.MustCompile(`^\s*network_mode\s*:`)
)

func lineIndent(line string) int {
	return len(line) - len(strings.TrimLeft(line, " \t"))
}

func yamlKeyName(raw string) string {
	name := strings.TrimSpace(raw)
	name = strings.TrimSuffix(name, ":")
	return strings.Trim(strings.TrimSpace(name), `"'`)
}

// normalizeBuiltinNetworks rewrites a compose file that joins the networks docker made itself (bridge, host, none) as if they were
// networks of the project: compose then gives the service a name alias there and docker refuses it ("network-scoped aliases are
// only supported for user-defined networks"). A service that lists such a network gets it as its network_mode, and the top-level
// declaration of it goes away. Everything else in the file is left as written.
func normalizeBuiltinNetworks(content string) string {
	lines := strings.Split(content, "\n")
	out := make([]string, 0, len(lines))
	for i := 0; i < len(lines); i++ {
		m := networksKeyLine.FindStringSubmatch(strings.TrimRight(lines[i], "\r"))
		if m == nil || strings.HasPrefix(strings.TrimSpace(lines[i]), "#") {
			out = append(out, lines[i])
			continue
		}
		indent := len(m[1])
		inline := m[2]
		// the lines that belong to the key: deeper than it, or blank
		end := i + 1
		for end < len(lines) && (strings.TrimSpace(lines[end]) == "" || lineIndent(lines[end]) > indent) {
			end++
		}
		children := lines[i+1 : end]
		var kept []string
		var removed []string
		stillJoins := false
		if inline != "" && !strings.HasPrefix(inline, "#") {
			// networks: [bridge, my-net]
			if !strings.HasPrefix(inline, "[") || !strings.Contains(inline, "]") {
				out = append(out, lines[i])
				continue
			}
			items := strings.Split(strings.Trim(inline[:strings.Index(inline, "]")+1], "[]"), ",")
			var keep []string
			for _, item := range items {
				name := strings.Trim(strings.TrimSpace(item), `"'`)
				if name == "" {
					continue
				}
				if builtinNetwork(name) {
					removed = append(removed, name)
				} else {
					keep = append(keep, strings.TrimSpace(item))
				}
			}
			if len(removed) == 0 {
				out = append(out, lines[i])
				continue
			}
			if len(keep) > 0 {
				stillJoins = true
				out = append(out, m[1]+"networks: ["+strings.Join(keep, ", ")+"]")
			}
		} else {
			// block form: "- name" items or "name:" entries with their own deeper lines
			childIndent := -1
			skipping := false
			for _, child := range children {
				trimmed := strings.TrimSpace(child)
				if trimmed == "" || strings.HasPrefix(trimmed, "#") {
					if !skipping {
						kept = append(kept, child)
					}
					continue
				}
				ci := lineIndent(child)
				if childIndent < 0 {
					childIndent = ci
				}
				if ci > childIndent {
					if !skipping {
						kept = append(kept, child)
					}
					continue
				}
				name := ""
				if strings.HasPrefix(trimmed, "- ") {
					name = strings.Trim(strings.TrimSpace(trimmed[2:]), `"'`)
				} else {
					name = yamlKeyName(strings.SplitN(trimmed, ":", 2)[0] + ":")
				}
				if builtinNetwork(name) {
					skipping = true
					removed = append(removed, name)
					continue
				}
				skipping = false
				kept = append(kept, child)
			}
			if len(removed) == 0 {
				out = append(out, lines[i])
				out = append(out, children...)
				i = end - 1
				continue
			}
			for _, child := range kept {
				if strings.TrimSpace(child) != "" && !strings.HasPrefix(strings.TrimSpace(child), "#") {
					stillJoins = true
					break
				}
			}
			if stillJoins {
				out = append(out, lines[i])
				out = append(out, kept...)
			}
		}
		// a service (not the top level) that lost its only network gets it as network mode
		if indent > 0 && !stillJoins && !serviceHasNetworkMode(lines, i, indent) {
			out = append(out, m[1]+"network_mode: "+removed[0])
		}
		i = end - 1
	}
	return strings.Join(out, "\n")
}

// serviceHasNetworkMode says whether the service that holds the line at index already sets a network_mode
func serviceHasNetworkMode(lines []string, at, indent int) bool {
	for i := at - 1; i >= 0; i-- {
		if strings.TrimSpace(lines[i]) == "" {
			continue
		}
		if lineIndent(lines[i]) < indent {
			break
		}
		if lineIndent(lines[i]) == indent && networkModeKeyLine.MatchString(lines[i]) {
			return true
		}
	}
	for i := at + 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "" {
			continue
		}
		if lineIndent(lines[i]) < indent {
			break
		}
		if lineIndent(lines[i]) == indent && networkModeKeyLine.MatchString(lines[i]) {
			return true
		}
	}
	return false
}
