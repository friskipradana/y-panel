package docker

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Containers of a hosting account share the machine with the panel and with every other account. A
// container that can reach the Docker daemon (Portainer and every tool like it), the host's processes,
// network or devices can see and change all of them, so such deployments are refused for every
// account but the superadmin, and a container that gets there another way is stopped.

const superadminRole = "superadmin"

// PolicyError is a deployment refused for what it asks of the host
type PolicyError struct{ Reason string }

func (e *PolicyError) Error() string { return "deployment refused: " + e.Reason }

// IsPolicyExempt says whether an account may run containers that reach the host
func IsPolicyExempt(role string) bool { return role == superadminRole }

// container managers and the like: they exist to control the Docker daemon
var bannedImageParts = []string{
	"portainer", "yacht", "dockge", "komodo", "lazydocker", "watchtower", "swarmpit", "rancher/rancher",
	"ui-for-docker", "dockerui", "docker-ui", "dockstation", "arcane", "dockhand", "containrrr",
}

// CheckImagePolicy refuses an image whose job is to manage the Docker daemon
func CheckImagePolicy(image string) error {
	name := strings.ToLower(strings.TrimSpace(image))
	for _, part := range bannedImageParts {
		if strings.Contains(name, part) {
			return &PolicyError{Reason: fmt.Sprintf("%q is a container management tool; it needs control of the Docker host, which hosting accounts do not get", image)}
		}
	}
	return nil
}

var (
	socketWords    = []string{"docker.sock", "containerd.sock", "podman.sock", "crio.sock", "/var/lib/docker", "/var/run/docker", "/run/docker", "/var/lib/containerd"}
	dangerousCaps  = map[string]bool{"ALL": true, "SYS_ADMIN": true, "SYS_PTRACE": true, "SYS_MODULE": true, "SYS_RAWIO": true, "DAC_READ_SEARCH": true, "SYS_BOOT": true, "MKNOD": true, "BPF": true, "PERFMON": true}
	privilegedLine = regexp.MustCompile(`(?im)^\s*privileged:\s*["']?(true|yes|on|1)["']?\s*(#.*)?$`)
	hostModeLine   = regexp.MustCompile(`(?im)^\s*(pid|ipc|uts|userns_mode|network_mode|cgroup|cgroupns_mode)\s*:\s*["']?(host|container:[^\s"']+)["']?\s*(#.*)?$`)
	capAddBlock    = regexp.MustCompile(`(?is)cap_add:\s*(\[[^\]]*\]|(?:\n\s*-\s*["']?[A-Za-z_]+["']?)+)`)
	unconfined     = regexp.MustCompile(`(?i)(unconfined|label[=:]\s*disable)`)
	devicesKey     = regexp.MustCompile(`(?im)^\s*(devices|device_cgroup_rules)\s*:`)
	imageLine      = regexp.MustCompile(`(?im)^\s*image:\s*["']?([^\s"'#]+)`)
	longSource     = regexp.MustCompile(`(?im)^\s*(?:-\s*)?source:\s*["']?(/[^\s"'#]+)`)
)

// stripComments drops whole-line comments so a commented-out line is not read as a setting
func stripComments(content string) string {
	var out []string
	for _, line := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}

// CheckComposePolicy reads a compose file for what it asks of the host. It sees the text only; a value
// built from a variable is judged again, from the real container, once it runs (see ContainerViolations).
func CheckComposePolicy(content, homeDir string) error {
	text := stripComments(content)
	lower := strings.ToLower(text)
	for _, word := range socketWords {
		if strings.Contains(lower, word) {
			return &PolicyError{Reason: "it asks for access to the Docker daemon (" + word + "), which hosting accounts do not get"}
		}
	}
	if privilegedLine.MatchString(text) {
		return &PolicyError{Reason: "privileged containers are not allowed"}
	}
	if m := hostModeLine.FindStringSubmatch(text); m != nil {
		return &PolicyError{Reason: fmt.Sprintf("%s: %s would share the host's own namespace", strings.ToLower(m[1]), m[2])}
	}
	for _, m := range capAddBlock.FindAllStringSubmatch(text, -1) {
		for _, capName := range regexp.MustCompile(`[A-Za-z_]+`).FindAllString(m[1], -1) {
			if dangerousCaps[strings.ToUpper(capName)] {
				return &PolicyError{Reason: "the capability " + strings.ToUpper(capName) + " is not allowed"}
			}
		}
	}
	if unconfined.MatchString(text) {
		return &PolicyError{Reason: "disabling the container's security profile is not allowed"}
	}
	if devicesKey.MatchString(text) {
		return &PolicyError{Reason: "host devices cannot be given to a container"}
	}
	for _, m := range imageLine.FindAllStringSubmatch(text, -1) {
		if err := CheckImagePolicy(m[1]); err != nil {
			return err
		}
	}
	// long-form bind mounts name their folder in a source: line
	if homeDir != "" {
		root := filepath.Clean(homeDir)
		for _, m := range longSource.FindAllStringSubmatch(text, -1) {
			clean := filepath.Clean(m[1])
			if clean != root && !strings.HasPrefix(clean, root+string(filepath.Separator)) {
				return &PolicyError{Reason: fmt.Sprintf("the folder %q is outside your own folder", m[1])}
			}
		}
	}
	return nil
}

// CheckNetworkPolicy refuses the host's own network for a container of a hosting account
func CheckNetworkPolicy(network string) error {
	if strings.EqualFold(strings.TrimSpace(network), "host") {
		return &PolicyError{Reason: "the host network would put the container on the machine's own network"}
	}
	return nil
}

// ContainerViolation is a running or stopped container that reaches further than a hosting account may
type ContainerViolation struct {
	ID         string
	Name       string
	Image      string
	OwnerID    int64
	Reasons    []string
	RunningNow bool
}

type inspectDoc struct {
	ID     string `json:"Id"`
	Name   string `json:"Name"`
	Config struct {
		Image  string            `json:"Image"`
		Labels map[string]string `json:"Labels"`
	} `json:"Config"`
	State struct {
		Running bool `json:"Running"`
	} `json:"State"`
	HostConfig struct {
		Privileged   bool     `json:"Privileged"`
		PidMode      string   `json:"PidMode"`
		IpcMode      string   `json:"IpcMode"`
		UTSMode      string   `json:"UTSMode"`
		UsernsMode   string   `json:"UsernsMode"`
		NetworkMode  string   `json:"NetworkMode"`
		CgroupnsMode string   `json:"CgroupnsMode"`
		CapAdd       []string `json:"CapAdd"`
		SecurityOpt  []string `json:"SecurityOpt"`
		Devices      []any    `json:"Devices"`
		Binds        []string `json:"Binds"`
	} `json:"HostConfig"`
	Mounts []struct {
		Type   string `json:"Type"`
		Source string `json:"Source"`
	} `json:"Mounts"`
}

// reasonsOf says what a real container asks of the host; home, when known, is the folder its owner may mount from
func reasonsOf(doc inspectDoc, home string) []string {
	var reasons []string
	add := func(reason string) { reasons = append(reasons, reason) }
	if CheckImagePolicy(doc.Config.Image) != nil {
		add("image " + doc.Config.Image + " manages the Docker daemon")
	}
	h := doc.HostConfig
	if h.Privileged {
		add("privileged")
	}
	for name, mode := range map[string]string{"pid": h.PidMode, "ipc": h.IpcMode, "uts": h.UTSMode, "userns": h.UsernsMode, "network": h.NetworkMode, "cgroupns": h.CgroupnsMode} {
		if strings.EqualFold(mode, "host") {
			add(name + " namespace of the host")
		}
	}
	for _, capName := range h.CapAdd {
		if dangerousCaps[strings.ToUpper(strings.TrimPrefix(capName, "CAP_"))] {
			add("capability " + capName)
		}
	}
	for _, opt := range h.SecurityOpt {
		if unconfined.MatchString(opt) {
			add("security profile off (" + opt + ")")
		}
	}
	if len(h.Devices) > 0 {
		add("host devices")
	}
	sources := append([]string(nil), h.Binds...)
	for _, m := range doc.Mounts {
		if m.Type == "bind" {
			sources = append(sources, m.Source)
		}
	}
	for _, source := range sources {
		path := source
		if i := strings.Index(path, ":"); i > 0 {
			path = path[:i]
		}
		// a named volume is Docker's own, not a folder of the host
		if !strings.HasPrefix(path, "/") {
			continue
		}
		lowerPath := strings.ToLower(path)
		blocked := false
		for _, word := range socketWords {
			if strings.Contains(lowerPath, word) {
				add("mounts " + path)
				blocked = true
				break
			}
		}
		if blocked || home == "" {
			continue
		}
		root := filepath.Clean(home)
		if clean := filepath.Clean(path); clean != root && !strings.HasPrefix(clean, root+string(filepath.Separator)) {
			add("mounts " + path + " outside the owner's folder")
		}
	}
	sort.Strings(reasons)
	return reasons
}

// ContainerViolations inspects every container (stopped ones too) and lists those that break the policy.
// homeOf gives the folder an owner may mount from, or "" when the owner is unknown.
func ContainerViolations(homeOf func(ownerID int64) string) ([]ContainerViolation, error) {
	return inspectViolations(nil, homeOf)
}

// ProjectViolations is the same for the containers of one compose project
func ProjectViolations(project string, home string) ([]ContainerViolation, error) {
	return inspectViolations(&project, func(int64) string { return home })
}

func inspectViolations(project *string, homeOf func(int64) string) ([]ContainerViolation, error) {
	args := []string{"ps", "-aq", "--no-trunc"}
	if project != nil {
		args = append(args, "--filter", "label=com.docker.compose.project="+*project)
	}
	ids, err := exec.Command("docker", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("list containers: %w", err)
	}
	list := splitNonEmptyLines(string(ids))
	if len(list) == 0 {
		return nil, nil
	}
	output, err := exec.Command("docker", append([]string{"inspect"}, list...)...).Output()
	if err != nil {
		return nil, fmt.Errorf("inspect containers: %w", err)
	}
	var docs []inspectDoc
	if err := json.Unmarshal(output, &docs); err != nil {
		return nil, fmt.Errorf("read inspect output: %w", err)
	}
	var out []ContainerViolation
	for _, doc := range docs {
		ownerID, _ := strconv.ParseInt(doc.Config.Labels[labelOwnerID], 10, 64)
		home := ""
		if homeOf != nil {
			home = homeOf(ownerID)
		}
		if reasons := reasonsOf(doc, home); len(reasons) > 0 {
			out = append(out, ContainerViolation{ID: doc.ID, Name: strings.TrimPrefix(doc.Name, "/"), Image: doc.Config.Image, OwnerID: ownerID, Reasons: reasons, RunningNow: doc.State.Running})
		}
	}
	return out, nil
}

// StopViolating halts a container and keeps it from starting again by itself
func StopViolating(id string) error {
	_ = exec.Command("docker", "update", "--restart=no", id).Run()
	if out, err := exec.Command("docker", "stop", id).CombinedOutput(); err != nil {
		return fmt.Errorf("stop %s: %s", id, strings.TrimSpace(string(out)))
	}
	return nil
}
