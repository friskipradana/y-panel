package docker

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
)

// HostPort is a port a deployment asks the host to open.
type HostPort struct {
	Port  int
	Proto string
}

// PublishedPort is a host port a container holds, running or not.
type PublishedPort struct {
	Port      int
	Proto     string
	Container string // name
	ID        string
	Project   string // compose project the container belongs to
}

const maxPortRange = 1000

// ProjectSlug is the compose project name a deployment of this name gets.
func ProjectSlug(name string) string { return slugify(name) }

// parsePortSpec reads "8080" or "8000-8010" into the ports it names.
func parsePortSpec(spec string) ([]int, error) {
	spec = strings.TrimSpace(spec)
	if spec == "" {
		return nil, fmt.Errorf("empty port")
	}
	lo, hi := spec, spec
	if a, b, ok := strings.Cut(spec, "-"); ok {
		lo, hi = a, b
	}
	from, err := strconv.Atoi(strings.TrimSpace(lo))
	if err != nil {
		return nil, fmt.Errorf("invalid port %q", spec)
	}
	to, err := strconv.Atoi(strings.TrimSpace(hi))
	if err != nil || to < from {
		return nil, fmt.Errorf("invalid port %q", spec)
	}
	if from < 1 || to > 65535 {
		return nil, fmt.Errorf("port %q is outside 1-65535", spec)
	}
	if to-from+1 > maxPortRange {
		return nil, fmt.Errorf("port range %q is too wide", spec)
	}
	ports := make([]int, 0, to-from+1)
	for p := from; p <= to; p++ {
		ports = append(ports, p)
	}
	return ports, nil
}

// HostPortsOf lists the host ports of port bindings.
func HostPortsOf(items []PortBinding) ([]HostPort, error) {
	var out []HostPort
	for _, item := range items {
		spec := strings.TrimSpace(item.HostPort)
		if spec == "" {
			continue
		}
		ports, err := parsePortSpec(spec)
		if err != nil {
			return nil, err
		}
		proto := strings.ToLower(strings.TrimSpace(item.Protocol))
		if proto == "" {
			proto = "tcp"
		}
		for _, p := range ports {
			out = append(out, HostPort{Port: p, Proto: proto})
		}
	}
	return out, nil
}

var (
	composePortsKey  = regexp.MustCompile(`^(\s*)ports:\s*(\[(.*)\])?\s*(#.*)?$`)
	composePublished = regexp.MustCompile(`^published:\s*["']?(\d+(?:-\d+)?)["']?\s*(#.*)?$`)
	composeProtocol  = regexp.MustCompile(`^protocol:\s*["']?(tcp|udp)["']?\s*(#.*)?$`)
)

// shortPort reads "8080:80", "127.0.0.1:8080:80/udp" or "80"; a bare container port gets a random host port, so claims none.
func shortPort(item string) (HostPort, []int, bool) {
	item = strings.Trim(strings.TrimSpace(item), `"'`)
	if item == "" {
		return HostPort{}, nil, false
	}
	proto := "tcp"
	if base, p, ok := strings.Cut(item, "/"); ok {
		item = base
		if strings.EqualFold(p, "udp") {
			proto = "udp"
		}
	}
	parts := strings.Split(item, ":")
	if len(parts) < 2 {
		return HostPort{}, nil, false
	}
	// [ip:]host:container; an IPv6 address would add colons, and its host port is always the second to last
	host := parts[len(parts)-2]
	ports, err := parsePortSpec(host)
	if err != nil {
		return HostPort{}, nil, false
	}
	return HostPort{Proto: proto}, ports, true
}

// ComposeHostPorts finds the host ports a compose file publishes. It reads the short
// ("8080:80") and long (published: 8080) forms; anything built from variables is skipped.
func ComposeHostPorts(content string) []HostPort {
	var out []HostPort
	add := func(proto string, ports []int) {
		for _, p := range ports {
			out = append(out, HostPort{Port: p, Proto: proto})
		}
	}

	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	inPorts := false
	keyIndent := 0
	var published []int
	protocol := "tcp"
	flush := func() {
		if len(published) > 0 {
			add(protocol, published)
		}
		published, protocol = nil, "tcp"
	}
	for _, raw := range lines {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		indent := len(raw) - len(strings.TrimLeft(raw, " \t"))
		if m := composePortsKey.FindStringSubmatch(raw); m != nil {
			flush()
			if m[2] != "" {
				for _, item := range strings.Split(m[3], ",") {
					if hp, ports, ok := shortPort(item); ok {
						add(hp.Proto, ports)
					}
				}
				inPorts = false
				continue
			}
			inPorts, keyIndent = true, indent
			continue
		}
		if !inPorts {
			continue
		}
		if indent <= keyIndent && !strings.HasPrefix(trimmed, "-") {
			flush()
			inPorts = false
			continue
		}
		if strings.HasPrefix(trimmed, "-") {
			flush()
			item := strings.TrimSpace(strings.TrimPrefix(trimmed, "-"))
			if i := strings.Index(item, " #"); i >= 0 {
				item = strings.TrimSpace(item[:i])
			}
			if hp, ports, ok := shortPort(item); ok {
				add(hp.Proto, ports)
				continue
			}
			// long form: the first key sits on the dash line
			trimmed = item
		}
		if m := composePublished.FindStringSubmatch(trimmed); m != nil {
			if ports, err := parsePortSpec(m[1]); err == nil {
				published = ports
			}
		} else if m := composeProtocol.FindStringSubmatch(trimmed); m != nil {
			protocol = m[1]
		}
	}
	flush()
	return out
}

// PublishedPorts lists the host ports every container holds, stopped ones included: a stopped
// container keeps its ports and takes them again when it starts.
func PublishedPorts() ([]PublishedPort, error) {
	ids, err := exec.Command("docker", "ps", "-aq", "--no-trunc").Output()
	if err != nil {
		return nil, fmt.Errorf("list containers: %w", err)
	}
	list := splitNonEmptyLines(string(ids))
	if len(list) == 0 {
		return nil, nil
	}
	args := append([]string{"inspect", "--format", `{{.Id}}|{{.Name}}|{{index .Config.Labels "com.docker.compose.project"}}|{{json .HostConfig.PortBindings}}`}, list...)
	output, err := exec.Command("docker", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("inspect containers: %w", err)
	}
	var out []PublishedPort
	for _, line := range splitNonEmptyLines(string(output)) {
		fields := strings.SplitN(line, "|", 4)
		if len(fields) != 4 {
			continue
		}
		var bindings map[string][]struct {
			HostPort string `json:"HostPort"`
		}
		if json.Unmarshal([]byte(fields[3]), &bindings) != nil {
			continue
		}
		for spec, hosts := range bindings {
			proto := "tcp"
			if _, p, ok := strings.Cut(spec, "/"); ok && p == "udp" {
				proto = "udp"
			}
			for _, h := range hosts {
				port, err := strconv.Atoi(h.HostPort)
				if err != nil || port <= 0 {
					continue
				}
				out = append(out, PublishedPort{Port: port, Proto: proto, Container: strings.TrimPrefix(fields[1], "/"), ID: fields[0], Project: fields[2]})
			}
		}
	}
	return out, nil
}
