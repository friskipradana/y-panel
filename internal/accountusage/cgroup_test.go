package accountusage

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDetectCgroupHierarchy(t *testing.T) {
	t.Run("unified v2", func(t *testing.T) {
		tmp := t.TempDir()
		cgRoot := filepath.Join(tmp, "cgroup")
		if err := os.MkdirAll(cgRoot, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(cgRoot, "cgroup.controllers"), []byte("cpu memory pids\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		mountInfo := filepath.Join(tmp, "mountinfo")
		content := "29 22 0:26 / " + filepath.ToSlash(cgRoot) + " rw,nosuid,nodev,noexec,relatime shared:4 - cgroup2 cgroup2 rw\n"
		if err := os.WriteFile(mountInfo, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}

		mode, v2Root := DetectCgroupHierarchy(mountInfo, cgRoot)
		if mode != CgroupModeV2 || filepath.Clean(v2Root) != filepath.Clean(cgRoot) {
			t.Fatalf("got (%s, %s), want (%s, %s)", mode, v2Root, CgroupModeV2, cgRoot)
		}
	})

	t.Run("hybrid v1 plus unified with escaped spaces", func(t *testing.T) {
		tmp := t.TempDir()
		cgRoot := filepath.Join(tmp, "sys cgroup")
		unified := filepath.Join(cgRoot, "unified")
		if err := os.MkdirAll(unified, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(unified, "cgroup.controllers"), []byte("cpu\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		escapedMount := strings.ReplaceAll(filepath.ToSlash(unified), " ", `\040`)
		escapedV1 := strings.ReplaceAll(filepath.ToSlash(filepath.Join(cgRoot, "cpu")), " ", `\040`)
		mountInfo := filepath.Join(tmp, "mountinfo")
		content := "30 22 0:27 / " + escapedV1 + " rw - cgroup cgroup rw,cpu\n" +
			"31 22 0:28 / " + escapedMount + " rw - cgroup2 cgroup2 rw\n"
		if err := os.WriteFile(mountInfo, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}

		mode, v2Root := DetectCgroupHierarchy(mountInfo, cgRoot)
		if mode != CgroupModeHybrid || filepath.Clean(v2Root) != filepath.Clean(unified) {
			t.Fatalf("got (%s, %s), want (%s, %s)", mode, v2Root, CgroupModeHybrid, unified)
		}
	})

	t.Run("legacy v1 only", func(t *testing.T) {
		tmp := t.TempDir()
		cgRoot := filepath.Join(tmp, "cgroup")
		if err := os.MkdirAll(cgRoot, 0o755); err != nil {
			t.Fatal(err)
		}
		mountInfo := filepath.Join(tmp, "mountinfo")
		content := "30 22 0:27 / " + filepath.ToSlash(filepath.Join(cgRoot, "memory")) + " rw - cgroup cgroup rw,memory\n"
		if err := os.WriteFile(mountInfo, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}

		mode, v2Root := DetectCgroupHierarchy(mountInfo, cgRoot)
		if mode != CgroupModeV1 || v2Root != "" {
			t.Fatalf("got (%s, %s), want (%s, empty)", mode, v2Root, CgroupModeV1)
		}
	})

	t.Run("unknown when missing", func(t *testing.T) {
		tmp := t.TempDir()
		mode, v2Root := DetectCgroupHierarchy(filepath.Join(tmp, "missing-mountinfo"), filepath.Join(tmp, "missing-cg"))
		if mode != CgroupModeUnknown || v2Root != "" {
			t.Fatalf("got (%s, %s), want (%s, empty)", mode, v2Root, CgroupModeUnknown)
		}
	})
}

func TestParseProcCgroupAndContainerDetection(t *testing.T) {
	raw := "12:memory:/docker/abcdef123456\n0::/user.slice/user-1001.slice/session-1.scope\n"
	entries := ParseProcCgroup(raw)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	unified, ok := UnifiedCgroupPath(entries)
	if !ok || unified != "/user.slice/user-1001.slice/session-1.scope" {
		t.Fatalf("unexpected unified path (%v, %q)", ok, unified)
	}

	containerPaths := []string{
		"/system.slice/docker-0123456789ab.scope",
		"/docker/0123456789abcdef",
		"/system.slice/containerd.service/kubepods/pod1",
		"/user.slice/user-1000.slice/libpod-deadbeef.scope",
		"/system.slice/cri-containerd-abc.scope",
	}
	for _, p := range containerPaths {
		if !IsContainerCgroupPath(p) {
			t.Fatalf("expected %q to be detected as container cgroup path", p)
		}
	}

	nonContainerPaths := []string{
		"",
		"/",
		"/reneo.slice/reneo-panel.slice/reneo-panel-alice.slice/run-r123.service",
		"/user.slice/user-1001.slice/session-1.scope",
	}
	for _, p := range nonContainerPaths {
		if IsContainerCgroupPath(p) {
			t.Fatalf("did not expect %q to be marked as container path", p)
		}
	}
}

func TestCandidateAccountSliceRelPaths(t *testing.T) {
	cands := CandidateAccountSliceRelPaths("panel-alice")
	if len(cands) != 2 {
		t.Fatalf("expected 2 candidates for dashed slice, got %v", cands)
	}
	if cands[0] != "/reneo.slice/reneo-panel.slice/reneo-panel-alice.slice" {
		t.Fatalf("unexpected nested slice candidate: %q", cands[0])
	}
	if cands[1] != "/reneo-panel-alice.slice" {
		t.Fatalf("unexpected flat slice candidate: %q", cands[1])
	}

	single := CandidateAccountSliceRelPaths("alice")
	if len(single) != 2 || single[0] != "/reneo.slice/reneo-alice.slice" || single[1] != "/reneo-alice.slice" {
		t.Fatalf("unexpected candidates for alice: %v", single)
	}

	if empty := CandidateAccountSliceRelPaths("  "); len(empty) != 0 {
		t.Fatalf("expected nil/empty candidates for blank username, got %v", empty)
	}
}

func TestReadCgroupV2StatsVariants(t *testing.T) {
	t.Run("full controllers and inactive_file working set", func(t *testing.T) {
		dir := t.TempDir()
		write := func(name, val string) {
			if err := os.WriteFile(filepath.Join(dir, name), []byte(val), 0o644); err != nil {
				t.Fatal(err)
			}
		}
		write("cpu.stat", "usage_usec 2500000\nuser_usec 1800000\nsystem_usec 700000\nnr_throttled 3\nthrottled_usec 45000\n")
		write("cpu.max", "50000 100000\n")
		write("memory.current", "104857600\n")
		write("memory.max", "max\n")
		write("memory.stat", "anon 62914560\nfile 41943040\ninactive_file 10485760\n")
		write("pids.current", "14\n")
		write("pids.max", "256\n")

		m, err := ReadCgroupV2Stats(dir)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !m.Available || !m.HasCPU || !m.HasMemory || !m.HasPIDs {
			t.Fatalf("expected all controllers present: %+v", m)
		}
		if len(m.MissingControllers) != 0 {
			t.Fatalf("expected no missing controllers, got %v", m.MissingControllers)
		}
		if m.CPUUsageUsec != 2500000 || m.CPUQuotaUsec != 50000 || m.CPUPeriodUsec != 100000 || m.CPUUnlimited {
			t.Fatalf("unexpected cpu values: %+v", m)
		}
		if !m.MemoryUnlimited || m.MemoryMaxBytes != 0 {
			t.Fatalf("expected unlimited memory, got %+v", m)
		}
		if m.MemoryWorkingBytes != (104857600 - 10485760) {
			t.Fatalf("expected working memory 94371840, got %d", m.MemoryWorkingBytes)
		}
		if m.PIDsCurrent != 14 || m.PIDsMax != 256 || m.PIDsUnlimited {
			t.Fatalf("unexpected pids values: %+v", m)
		}
	})

	t.Run("missing controllers and unlimited cpu/pids", func(t *testing.T) {
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "memory.current"), []byte("4096\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "cpu.max"), []byte("max 100000\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "pids.max"), []byte("max\n"), 0o644); err != nil {
			t.Fatal(err)
		}

		m, err := ReadCgroupV2Stats(dir)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if m.HasCPU || !m.HasMemory || m.HasPIDs {
			t.Fatalf("unexpected controller flags: %+v", m)
		}
		if !m.CPUUnlimited || !m.PIDsUnlimited {
			t.Fatalf("expected cpu and pids unlimited flags true: %+v", m)
		}
		if len(m.MissingControllers) != 2 {
			t.Fatalf("expected missing cpu & pids controllers, got %v", m.MissingControllers)
		}
	})

	t.Run("inaccessible cgroup directory", func(t *testing.T) {
		m, err := ReadCgroupV2Stats(filepath.Join(t.TempDir(), "does-not-exist"))
		if err == nil || m.Available {
			t.Fatalf("expected error for missing cgroup dir, got (%+v, %v)", m, err)
		}
	})
}

func TestDiscoverContainerCgroupPathAndHostMemory(t *testing.T) {
	v2Root := t.TempDir()
	systemdScope := filepath.Join(v2Root, "system.slice", "docker-abc1234567890000.scope")
	cgfsDir := filepath.Join(v2Root, "docker", "def987654321")
	if err := os.MkdirAll(systemdScope, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(cgfsDir, 0o755); err != nil {
		t.Fatal(err)
	}

	gotSystemd, ok := DiscoverContainerCgroupPath(v2Root, "abc123456789")
	if !ok || filepath.Clean(gotSystemd) != filepath.Clean(systemdScope) {
		t.Fatalf("got (%s, %v), want %s", gotSystemd, ok, systemdScope)
	}

	gotCGFS, ok := DiscoverContainerCgroupPath(v2Root, "def987654321")
	if !ok || filepath.Clean(gotCGFS) != filepath.Clean(cgfsDir) {
		t.Fatalf("got (%s, %v), want %s", gotCGFS, ok, cgfsDir)
	}

	meminfo := filepath.Join(v2Root, "meminfo")
	if err := os.WriteFile(meminfo, []byte("MemTotal:       16384000 kB\nMemFree:        1024000 kB\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := readHostMemoryTotalBytes(meminfo); got != 16384000*1024 {
		t.Fatalf("got host memory %d, want %d", got, uint64(16384000)*1024)
	}
}
