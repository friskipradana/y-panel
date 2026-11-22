package accountusage

import (
	"bufio"
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// CgroupMode describes the host's active Linux cgroup hierarchy.
type CgroupMode string

const (
	CgroupModeUnknown CgroupMode = "unknown"
	CgroupModeV2      CgroupMode = "v2"
	CgroupModeHybrid  CgroupMode = "hybrid"
	CgroupModeV1      CgroupMode = "v1"
)

// CgroupV2Metrics holds raw and normalized telemetry read from a cgroup v2 directory.
type CgroupV2Metrics struct {
	Path               string            `json:"path"`
	Available          bool              `json:"available"`
	HasCPU             bool              `json:"hasCpu"`
	HasMemory          bool              `json:"hasMemory"`
	HasPIDs            bool              `json:"hasPids"`
	CPUUsageUsec       uint64            `json:"cpuUsageUsec"`
	CPUUserUsec        uint64            `json:"cpuUserUsec"`
	CPUSystemUsec      uint64            `json:"cpuSystemUsec"`
	CPUNrThrottled     uint64            `json:"cpuNrThrottled"`
	CPUThrottledUsec   uint64            `json:"cpuThrottledUsec"`
	CPUQuotaUsec       uint64            `json:"cpuQuotaUsec"`
	CPUPeriodUsec      uint64            `json:"cpuPeriodUsec"`
	CPUUnlimited       bool              `json:"cpuUnlimited"`
	MemoryCurrentBytes uint64            `json:"memoryCurrentBytes"`
	MemoryWorkingBytes uint64            `json:"memoryWorkingBytes"`
	MemoryMaxBytes     uint64            `json:"memoryMaxBytes"`
	MemoryUnlimited    bool              `json:"memoryUnlimited"`
	MemoryAnonBytes    uint64            `json:"memoryAnonBytes"`
	MemoryFileBytes    uint64            `json:"memoryFileBytes"`
	MemoryInactiveFile uint64            `json:"memoryInactiveFileBytes"`
	PIDsCurrent        uint64            `json:"pidsCurrent"`
	PIDsMax            uint64            `json:"pidsMax"`
	PIDsUnlimited      bool              `json:"pidsUnlimited"`
	MissingControllers []string          `json:"missingControllers,omitempty"`
	Errors             map[string]string `json:"errors,omitempty"`
}

// ProcCgroupEntry represents a single line from /proc/[pid]/cgroup.
type ProcCgroupEntry struct {
	HierarchyID string
	Controllers string
	Path        string
}

// DetectCgroupHierarchy inspects mountinfo and cgroupRoot to determine whether
// the host uses unified cgroup v2, hybrid (v1 + unified v2), or legacy v1.
func DetectCgroupHierarchy(mountInfoPath, cgroupRoot string) (mode CgroupMode, v2Root string) {
	if mountInfoPath == "" {
		mountInfoPath = "/proc/self/mountinfo"
	}
	if cgroupRoot == "" {
		cgroupRoot = "/sys/fs/cgroup"
	}

	var hasV1, hasV2Main, hasV2Unified bool
	if data, err := os.ReadFile(mountInfoPath); err == nil {
		scanner := bufio.NewScanner(bytes.NewReader(data))
		for scanner.Scan() {
			fsType, mountPoint, ok := parseMountInfoEntry(scanner.Text())
			if !ok {
				continue
			}
			cleanMount := filepath.Clean(mountPoint)
			cleanRoot := filepath.Clean(cgroupRoot)
			switch fsType {
			case "cgroup2":
				if cleanMount == cleanRoot {
					hasV2Main = true
					v2Root = mountPoint
				} else if cleanMount == filepath.Join(cleanRoot, "unified") {
					hasV2Unified = true
					if v2Root == "" {
						v2Root = mountPoint
					}
				} else if v2Root == "" {
					v2Root = mountPoint
				}
			case "cgroup":
				hasV1 = true
			}
		}
	}

	// Verify actual directory layout alongside mountinfo (supports tests & chroots).
	if hasV2Main && !hasV1 {
		if _, err := os.Stat(filepath.Join(v2Root, "cgroup.controllers")); err == nil {
			return CgroupModeV2, v2Root
		}
	}
	if hasV2Main && hasV1 {
		return CgroupModeHybrid, v2Root
	}
	if hasV2Unified || (hasV1 && dirExists(filepath.Join(cgroupRoot, "unified", "cgroup.controllers"))) {
		if v2Root == "" {
			v2Root = filepath.Join(cgroupRoot, "unified")
		}
		return CgroupModeHybrid, v2Root
	}
	if !hasV1 && dirExists(filepath.Join(cgroupRoot, "cgroup.controllers")) {
		return CgroupModeV2, cgroupRoot
	}
	if hasV1 {
		return CgroupModeV1, ""
	}
	return CgroupModeUnknown, ""
}

func parseMountInfoEntry(line string) (fsType, mountPoint string, ok bool) {
	// Format per proc(5): id parent major:minor root mount_point options [optional...] - fsType source super_options
	idx := strings.Index(line, " - ")
	if idx < 0 {
		return "", "", false
	}
	before := strings.Fields(line[:idx])
	after := strings.Fields(line[idx+3:])
	if len(before) < 5 || len(after) < 1 {
		return "", "", false
	}
	return after[0], unescapeMountPath(before[4]), true
}

func unescapeMountPath(p string) string {
	return strings.ReplaceAll(p, `\040`, " ")
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// ParseProcCgroup parses the contents of /proc/[pid]/cgroup.
func ParseProcCgroup(raw string) []ProcCgroupEntry {
	var out []ProcCgroupEntry
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, ":", 3)
		if len(parts) != 3 {
			continue
		}
		out = append(out, ProcCgroupEntry{
			HierarchyID: parts[0],
			Controllers: parts[1],
			Path:        parts[2],
		})
	}
	return out
}

// UnifiedCgroupPath returns the cgroup v2 path (`0::<path>`) from parsed /proc/[pid]/cgroup entries.
func UnifiedCgroupPath(entries []ProcCgroupEntry) (string, bool) {
	for _, e := range entries {
		if e.HierarchyID == "0" && e.Controllers == "" {
			p := strings.TrimSpace(e.Path)
			if p == "" {
				p = "/"
			}
			return p, true
		}
	}
	return "", false
}

// IsContainerCgroupPath reports whether a cgroup path belongs to a container runtime
// (Docker, containerd, Podman/libpod, CRI-O, Kubernetes) so /proc UID scans never double-count containers.
func IsContainerCgroupPath(relPath string) bool {
	if relPath == "" {
		return false
	}
	lower := strings.ToLower(relPath)
	for _, marker := range []string{
		"/docker/",
		"/docker-",
		"docker-",
		"/containerd/",
		"cri-containerd-",
		"/libpod-",
		"/crio-",
		"/kubepods",
	} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

// accountSliceRelPath finds the dedicated Reneo or systemd user slice ancestor inside a unified cgroup path.
func accountSliceRelPath(relPath, osUsername string, uid uint32) (string, bool) {
	if relPath == "" || relPath == "/" || IsContainerCgroupPath(relPath) {
		return "", false
	}
	sliceName := ""
	if osUsername != "" {
		sliceName = "reneo-" + osUsername + ".slice"
	}
	userSlice := "user-" + strconv.FormatUint(uint64(uid), 10) + ".slice"

	clean := filepath.ToSlash(filepath.Clean("/" + relPath))
	segments := strings.Split(strings.Trim(clean, "/"), "/")
	for i := len(segments) - 1; i >= 0; i-- {
		seg := segments[i]
		if (sliceName != "" && seg == sliceName) || seg == userSlice {
			return "/" + strings.Join(segments[:i+1], "/"), true
		}
	}
	return "", false
}

// CandidateAccountSliceRelPaths returns candidate systemd slice relative paths for an OS account.
// Systemd places dashed slices such as `reneo-panel-alice.slice` in nested parent slices:
// `/reneo.slice/reneo-panel.slice/reneo-panel-alice.slice`, though top-level overrides are also checked.
func CandidateAccountSliceRelPaths(osUsername string) []string {
	osUsername = strings.TrimSpace(osUsername)
	if osUsername == "" {
		return nil
	}
	unit := "reneo-" + osUsername + ".slice"
	stem := "reneo-" + osUsername

	var nestedParts []string
	tokens := strings.Split(stem, "-")
	for i := 1; i < len(tokens); i++ {
		nestedParts = append(nestedParts, strings.Join(tokens[:i], "-")+".slice")
	}
	nestedParts = append(nestedParts, unit)
	nested := "/" + strings.Join(nestedParts, "/")
	flat := "/" + unit
	if nested == flat {
		return []string{flat}
	}
	return []string{nested, flat}
}

// ReadCgroupV2Stats reads cgroup v2 CPU, memory, and PID accounting files from cgroupDir.
// Missing controllers or EPERM/ENOENT on individual files do not fail other readable controllers.
func ReadCgroupV2Stats(cgroupDir string) (CgroupV2Metrics, error) {
	m := CgroupV2Metrics{Path: cgroupDir}
	info, err := os.Stat(cgroupDir)
	if err != nil {
		return m, err
	}
	if !info.IsDir() {
		return m, os.ErrInvalid
	}
	m.Available = true

	var errs map[string]string
	recordErr := func(file string, err error) {
		if err == nil {
			return
		}
		if errors.Is(err, os.ErrNotExist) {
			return
		}
		if errs == nil {
			errs = make(map[string]string)
		}
		errs[file] = err.Error()
	}

	if raw, err := os.ReadFile(filepath.Join(cgroupDir, "cpu.stat")); err == nil {
		m.HasCPU = parseCgroupCPUStat(string(raw), &m)
	} else {
		recordErr("cpu.stat", err)
	}

	if raw, err := os.ReadFile(filepath.Join(cgroupDir, "cpu.max")); err == nil {
		parseCgroupCPUMax(string(raw), &m)
	} else {
		recordErr("cpu.max", err)
	}

	if raw, err := os.ReadFile(filepath.Join(cgroupDir, "memory.current")); err == nil {
		if val, pErr := parseSingleUint64(string(raw)); pErr == nil {
			m.HasMemory = true
			m.MemoryCurrentBytes = val
			m.MemoryWorkingBytes = val
		} else {
			recordErr("memory.current", pErr)
		}
	} else {
		recordErr("memory.current", err)
	}

	if raw, err := os.ReadFile(filepath.Join(cgroupDir, "memory.max")); err == nil {
		val, unlimited, pErr := parseUint64OrMax(string(raw))
		if pErr == nil {
			m.MemoryUnlimited = unlimited
			if !unlimited {
				m.MemoryMaxBytes = val
			}
		} else {
			recordErr("memory.max", pErr)
		}
	} else {
		recordErr("memory.max", err)
	}

	if raw, err := os.ReadFile(filepath.Join(cgroupDir, "memory.stat")); err == nil {
		parseCgroupMemoryStat(string(raw), &m)
		if m.HasMemory {
			if m.MemoryCurrentBytes >= m.MemoryInactiveFile {
				m.MemoryWorkingBytes = m.MemoryCurrentBytes - m.MemoryInactiveFile
			} else {
				m.MemoryWorkingBytes = 0
			}
		}
	} else {
		recordErr("memory.stat", err)
	}

	if raw, err := os.ReadFile(filepath.Join(cgroupDir, "pids.current")); err == nil {
		if val, pErr := parseSingleUint64(string(raw)); pErr == nil {
			m.HasPIDs = true
			m.PIDsCurrent = val
		} else {
			recordErr("pids.current", pErr)
		}
	} else {
		recordErr("pids.current", err)
	}

	if raw, err := os.ReadFile(filepath.Join(cgroupDir, "pids.max")); err == nil {
		val, unlimited, pErr := parseUint64OrMax(string(raw))
		if pErr == nil {
			m.PIDsUnlimited = unlimited
			if !unlimited {
				m.PIDsMax = val
			}
		} else {
			recordErr("pids.max", pErr)
		}
	} else {
		recordErr("pids.max", err)
	}

	if !m.HasCPU {
		m.MissingControllers = append(m.MissingControllers, "cpu")
	}
	if !m.HasMemory {
		m.MissingControllers = append(m.MissingControllers, "memory")
	}
	if !m.HasPIDs {
		m.MissingControllers = append(m.MissingControllers, "pids")
	}
	m.Errors = errs
	return m, nil
}

func parseCgroupCPUStat(raw string, m *CgroupV2Metrics) bool {
	seenUsage := false
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) != 2 {
			continue
		}
		v, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			continue
		}
		switch fields[0] {
		case "usage_usec":
			m.CPUUsageUsec = v
			seenUsage = true
		case "user_usec":
			m.CPUUserUsec = v
		case "system_usec":
			m.CPUSystemUsec = v
		case "nr_throttled":
			m.CPUNrThrottled = v
		case "throttled_usec":
			m.CPUThrottledUsec = v
		}
	}
	return seenUsage
}

func parseCgroupCPUMax(raw string, m *CgroupV2Metrics) {
	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return
	}
	if fields[0] == "max" {
		m.CPUUnlimited = true
	} else if v, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
		m.CPUQuotaUsec = v
	}
	if len(fields) > 1 {
		if p, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
			m.CPUPeriodUsec = p
		}
	}
}

func parseCgroupMemoryStat(raw string, m *CgroupV2Metrics) {
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) != 2 {
			continue
		}
		v, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			continue
		}
		switch fields[0] {
		case "anon":
			m.MemoryAnonBytes = v
		case "file":
			m.MemoryFileBytes = v
		case "inactive_file":
			m.MemoryInactiveFile = v
		}
	}
}

func parseSingleUint64(raw string) (uint64, error) {
	return strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
}

func parseUint64OrMax(raw string) (val uint64, unlimited bool, err error) {
	s := strings.TrimSpace(raw)
	if s == "max" {
		return 0, true, nil
	}
	v, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0, false, err
	}
	return v, false, nil
}

// DiscoverContainerCgroupPath resolves a cgroup v2 directory for a container ID (short 12-char or full 64-char)
// across both systemd (`system.slice/docker-<id>*.scope`) and cgroupfs (`docker/<id>*`) layouts.
func DiscoverContainerCgroupPath(v2Root, containerID string) (string, bool) {
	containerID = strings.TrimSpace(containerID)
	if v2Root == "" || containerID == "" {
		return "", false
	}
	exactCandidates := []string{
		filepath.Join(v2Root, "system.slice", "docker-"+containerID+".scope"),
		filepath.Join(v2Root, "docker", containerID),
	}
	for _, p := range exactCandidates {
		if dirExists(p) {
			return p, true
		}
	}
	globPatterns := []string{
		filepath.Join(v2Root, "system.slice", "docker-"+containerID+"*.scope"),
		filepath.Join(v2Root, "docker", containerID+"*"),
	}
	for _, pat := range globPatterns {
		matches, err := filepath.Glob(pat)
		if err != nil || len(matches) == 0 {
			continue
		}
		for _, m := range matches {
			if dirExists(m) {
				return m, true
			}
		}
	}
	return "", false
}

// readHostMemoryTotalBytes parses MemTotal from meminfoPath (defaults to /proc/meminfo)
// so callers can explicitly distinguish host memory capacity from account/container consumption.
func readHostMemoryTotalBytes(meminfoPath string) uint64 {
	if meminfoPath == "" {
		meminfoPath = "/proc/meminfo"
	}
	data, err := os.ReadFile(meminfoPath)
	if err != nil {
		return 0
	}
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) >= 2 && fields[0] == "MemTotal:" {
			if kb, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
				return kb * 1024
			}
			break
		}
	}
	return 0
}
