package accountusage

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

func writeFakeProcPID(t testing.TB, procRoot string, pid int, comm string, utime, stime, startTime, rssPages uint64, cgroupText string) {
	t.Helper()
	dir := filepath.Join(procRoot, fmt.Sprintf("%d", pid))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Fields after "(comm) ": [0]=state, [11]=utime, [12]=stime, [19]=starttime, [21]=rssPages.
	statLine := fmt.Sprintf(
		"%d (%s) R 1 1 1 0 -1 4194304 0 0 0 0 %d %d 0 0 20 0 1 0 %d 0 %d\n",
		pid, comm, utime, stime, startTime, rssPages,
	)
	if err := os.WriteFile(filepath.Join(dir, "stat"), []byte(statLine), 0o644); err != nil {
		t.Fatal(err)
	}
	if cgroupText != "" {
		if err := os.WriteFile(filepath.Join(dir, "cgroup"), []byte(cgroupText), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestProcCollectorDeltaReuseFailuresAndAntiDoubleCount(t *testing.T) {
	tmp := t.TempDir()
	procRoot := filepath.Join(tmp, "proc")
	cgRoot := filepath.Join(tmp, "sys/fs/cgroup")
	mountInfo := filepath.Join(tmp, "mountinfo")
	if err := os.MkdirAll(procRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(procRoot, "meminfo"), []byte("MemTotal:        8388608 kB\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	sliceDir := filepath.Join(cgRoot, "reneo.slice", "reneo-panel.slice", "reneo-panel-alice.slice")
	if err := os.MkdirAll(sliceDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cgRoot, "cgroup.controllers"), []byte("cpu memory pids\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	mountContent := "29 22 0:26 / " + filepath.ToSlash(cgRoot) + " rw - cgroup2 cgroup2 rw\n"
	if err := os.WriteFile(mountInfo, []byte(mountContent), 0o644); err != nil {
		t.Fatal(err)
	}

	// Slice cgroup initially has 1,000,000 usec and 64 MiB working set (74MiB - 10MiB inactive_file).
	if err := os.WriteFile(filepath.Join(sliceDir, "cpu.stat"), []byte("usage_usec 1000000\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sliceDir, "memory.current"), []byte("77594624\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sliceDir, "memory.stat"), []byte("inactive_file 10485760\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// UID 1001 ("panel-alice"):
	// - PID 101: inside reneo-panel-alice.slice (covered by cgroup v2 slice -> must NOT double-count).
	// - PID 102: outside slice in /user.slice/session-1.scope (counted from /proc fallback).
	// - PID 103: containerized PID under /system.slice/docker-abc.scope (excluded; Docker Engine API owns it).
	// - PID 104: reused later with new starttime (must reset baseline, zero spike).
	// - PID 105: malformed stat entry (ignored cleanly).
	// UID 1002 ("panel-bob"):
	// - PID 201: isolated other user process.
	writeFakeProcPID(t, procRoot, 101, "node", 100, 50, 5000, 100, "0::/reneo.slice/reneo-panel.slice/reneo-panel-alice.slice/app.service\n")
	writeFakeProcPID(t, procRoot, 102, "sshd (v2)", 400, 100, 5100, 250, "0::/user.slice/user-999.slice/session-2.scope\n")
	writeFakeProcPID(t, procRoot, 103, "caddy", 9000, 1000, 5200, 5000, "0::/system.slice/docker-0123456789abcdef.scope\n")
	writeFakeProcPID(t, procRoot, 104, "worker", 1000, 500, 5300, 50, "0::/user.slice/session-x.scope\n")
	if err := os.MkdirAll(filepath.Join(procRoot, "105"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(procRoot, "105", "stat"), []byte("broken stat\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	writeFakeProcPID(t, procRoot, 201, "python3", 50, 50, 6000, 128, "0::/user.slice/user-1002.slice/session-1.scope\n")

	pidToUID := map[int]uint32{
		101: 1001, 102: 1001, 103: 1001, 104: 1001, 105: 1001, 106: 1001, 201: 1002,
	}
	var currentTime atomic.Int64
	baseTime := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	currentTime.Store(baseTime.UnixNano())

	c := newProcCollector(2 * time.Second)
	c.procRoot = procRoot
	c.cgroupRoot = cgRoot
	c.mountInfoPath = mountInfo
	c.pageSize = 4096
	c.now = func() time.Time { return time.Unix(0, currentTime.Load()).UTC() }
	c.readUIDFn = func(pid int, _ os.FileInfo) (uint32, bool) {
		u, ok := pidToUID[pid]
		return u, ok
	}

	// Pass 1: initial baseline (no previous counters -> 0 CPU cores).
	c.collectOnce()
	snap1 := c.Snapshot()
	if snap1.cgroupMode != CgroupModeV2 {
		t.Fatalf("expected CgroupModeV2, got %s", snap1.cgroupMode)
	}
	if snap1.hostMemoryTotal != 8388608*1024 {
		t.Fatalf("unexpected host memory total: %d", snap1.hostMemoryTotal)
	}

	// Advance clock by 2 seconds:
	// - Slice CPU rises by 1,000,000 usec -> 1,000,000 / 1,000,000 / 2s = 0.5 cores.
	// - PID 101 rises by 500 ticks inside slice -> must be excluded when slice covers CPU.
	// - PID 102 rises by 100 ticks over 2s (clockTicks=100) -> 100/100/2 = 0.5 cores; RSS 250*4096 = 1024000 bytes.
	// - PID 103 containerized rises hugely -> must still be excluded.
	// - PID 104 PID reuse: same PID 104, DIFFERENT starttime 9999 and lower ticks 20 -> baseline reset, 0 CPU.
	// - PID 201 counter reset: same starttime 6000, ticks dropped from 100 to 10 -> clamped to 0 CPU.
	// - PID 105 disappears (directory removed before pass 2).
	currentTime.Store(baseTime.Add(2 * time.Second).UnixNano())
	if err := os.WriteFile(filepath.Join(sliceDir, "cpu.stat"), []byte("usage_usec 2000000\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	writeFakeProcPID(t, procRoot, 101, "node", 500, 150, 5000, 100, "0::/reneo.slice/reneo-panel.slice/reneo-panel-alice.slice/app.service\n")
	writeFakeProcPID(t, procRoot, 102, "sshd (v2)", 450, 150, 5100, 250, "0::/user.slice/user-999.slice/session-2.scope\n")
	writeFakeProcPID(t, procRoot, 103, "caddy", 99000, 1000, 5200, 5000, "0::/system.slice/docker-0123456789abcdef.scope\n")
	writeFakeProcPID(t, procRoot, 104, "worker", 15, 5, 9999, 10, "0::/user.slice/session-x.scope\n")
	writeFakeProcPID(t, procRoot, 201, "python3", 5, 5, 6000, 128, "0::/user.slice/user-1002.slice/session-1.scope\n")
	_ = os.RemoveAll(filepath.Join(procRoot, "105"))

	c.collectOnce()
	snap2 := c.Snapshot()

	procAlice, sliceAlice, cgAlice := resolveAccountCompute(snap2, "panel-alice", 1001, true)
	if cgAlice == nil || !cgAlice.HasCPU || !cgAlice.HasMemory {
		t.Fatalf("expected cgroup v2 slice metadata for panel-alice, got %+v", cgAlice)
	}
	if !almostEqual(sliceAlice.CPUCores, 0.5, 1e-6) {
		t.Fatalf("expected slice CPU 0.5 cores, got %v", sliceAlice.CPUCores)
	}
	expectedSliceMem := uint64(77594624 - 10485760)
	if sliceAlice.MemBytes != expectedSliceMem {
		t.Fatalf("expected slice working memory %d, got %d", expectedSliceMem, sliceAlice.MemBytes)
	}
	// /proc fallback for alice: PID 102 only (PID 101 excluded by slice, PID 103 excluded as container, PID 104 reset).
	if !almostEqual(procAlice.CPUCores, 0.5, 1e-6) {
		t.Fatalf("expected non-slice /proc CPU 0.5 cores (no double count with PID 101 or container PID 103), got %v", procAlice.CPUCores)
	}
	expectedProcMem := uint64(250+10) * 4096
	if procAlice.MemBytes != expectedProcMem {
		t.Fatalf("expected non-slice /proc memory %d, got %d", expectedProcMem, procAlice.MemBytes)
	}

	// Partial cgroup controllers: remove cpu.stat from sliceDir and re-run -> PID 101's CPU comes from /proc while memory stays on slice.
	_ = os.Remove(filepath.Join(sliceDir, "cpu.stat"))
	currentTime.Store(baseTime.Add(4 * time.Second).UnixNano())
	writeFakeProcPID(t, procRoot, 101, "node", 600, 250, 5000, 100, "0::/reneo.slice/reneo-panel.slice/reneo-panel-alice.slice/app.service\n")
	c.collectOnce()
	snap3 := c.Snapshot()
	procAlice3, sliceAlice3, _ := resolveAccountCompute(snap3, "panel-alice", 1001, true)
	if sliceAlice3.CPUCores != 0 || sliceAlice3.MemBytes != expectedSliceMem {
		t.Fatalf("expected slice CPU=0 when cpu controller missing and mem=%d, got %+v", expectedSliceMem, sliceAlice3)
	}
	// PID 101 grew 200 ticks in 2s -> 1.0 core via /proc fallback while memory stayed excluded from /proc.
	if !almostEqual(procAlice3.CPUCores, 1.0, 1e-6) {
		t.Fatalf("expected /proc CPU fallback 1.0 core when slice cpu controller missing, got %v", procAlice3.CPUCores)
	}

	// Bob's counter reset in snap2 produced 0 CPU cores (never negative/underflow) and isolated RSS memory.
	procBob, _, _ := resolveAccountCompute(snap2, "panel-bob", 1002, true)
	if procBob.CPUCores != 0 || procBob.MemBytes != 128*4096 {
		t.Fatalf("unexpected bob usage after counter reset: %+v", procBob)
	}
}

func TestManagerNonBlockingSnapshotSingleflightRetentionAndBoundedWorkers(t *testing.T) {
	tmp := t.TempDir()
	procRoot := filepath.Join(tmp, "proc")
	if err := os.MkdirAll(procRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(procRoot, "meminfo"), []byte("MemTotal:        4194304 kB\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	var nowNano atomic.Int64
	baseTime := time.Date(2026, 2, 1, 8, 0, 0, 0, time.UTC)
	nowNano.Store(baseTime.UnixNano())

	var failMode atomic.Bool
	var blockFetcher atomic.Bool
	var concurrent atomic.Int32
	var maxConcurrent atomic.Int32
	var fetchCalls atomic.Int32
	var gatePtr atomic.Pointer[chan struct{}]
	coldGate := make(chan struct{})
	gatePtr.Store(&coldGate)

	m := NewManager(
		WithProcRoot(procRoot),
		WithCgroupRoot(filepath.Join(tmp, "cgroup")),
		WithMountInfoPath(filepath.Join(tmp, "mountinfo")),
		WithSampleInterval(time.Hour),
		WithSnapshotTTL(2*time.Second),
		WithClock(func() time.Time { return time.Unix(0, nowNano.Load()).UTC() }),
		WithUIDLookup(func(string) (uint32, bool) { return 0, false }),
		WithProcUIDReader(func(int, os.FileInfo) (uint32, bool) { return 0, false }),
		WithStatsFetcher(func(ctx context.Context, ids []string) ([]docker.ContainerStat, error) {
			fetchCalls.Add(1)
			c := concurrent.Add(1)
			for {
				prev := maxConcurrent.Load()
				if c <= prev || maxConcurrent.CompareAndSwap(prev, c) {
					break
				}
			}
			defer concurrent.Add(-1)

			if blockFetcher.Load() {
				curGate := *gatePtr.Load()
				select {
				case <-curGate:
				case <-time.After(300 * time.Millisecond):
				case <-ctx.Done():
					return nil, ctx.Err()
				}
			}
			if failMode.Load() {
				return nil, docker.ErrEngineUnavailable
			}
			out := make([]docker.ContainerStat, 0, len(ids))
			for _, id := range ids {
				out = append(out, docker.ContainerStat{
					ID:       id,
					Running:  true,
					CPUCores: 0.25,
					MemBytes: 32 * 1024 * 1024,
				})
			}
			return out, nil
		}),
	)
	defer m.Shutdown()

	// 1. Cold SampleSnapshot returns immediately (<30ms) even when stats fetcher sleeps 150ms.
	blockFetcher.Store(true)
	start := time.Now()
	cold := m.SampleSnapshot(context.Background(), "panel-alice", []string{"c1", "c2"})
	if elapsed := time.Since(start); elapsed > 40*time.Millisecond {
		t.Fatalf("SampleSnapshot blocked caller for %v; must be non-blocking", elapsed)
	}
	if cold.ContainerUsage.CPUCores != 0 {
		t.Fatalf("expected 0 container usage before first async completion, got %+v", cold.ContainerUsage)
	}
	close(coldGate)

	// Wait briefly for the background async refresh to commit into snapshot cache.
	deadline := time.Now().Add(2 * time.Second)
	var warm AccountSnapshot
	for time.Now().Before(deadline) {
		warm = m.SampleSnapshot(context.Background(), "panel-alice", []string{"c1", "c2"})
		if warm.ContainersPolled == 2 && !warm.Stale {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if warm.ContainersPolled != 2 || !almostEqual(warm.ContainerUsage.CPUCores, 0.5, 1e-6) || warm.ContainerUsage.MemBytes != 64*1024*1024 {
		t.Fatalf("expected async warm snapshot with 2 containers / 0.5 cores / 64MiB, got %+v", warm)
	}

	// 2. Singleflight protection across concurrent Refresh calls while an in-flight fetch is running.
	sfGate := make(chan struct{})
	gatePtr.Store(&sfGate)
	blockFetcher.Store(true)
	beforeCalls := fetchCalls.Load()
	var sfWG sync.WaitGroup
	for i := 0; i < 8; i++ {
		sfWG.Add(1)
		go func() {
			defer sfWG.Done()
			m.Refresh(context.Background(), "panel-sf", []string{"sf1"})
		}()
	}
	// Allow goroutines to enqueue against inflight[key] before releasing the single upstream call.
	time.Sleep(30 * time.Millisecond)
	close(sfGate)
	sfWG.Wait()
	blockFetcher.Store(false)
	deltaCalls := fetchCalls.Load() - beforeCalls
	if deltaCalls != 1 {
		t.Fatalf("expected singleflight to collapse concurrent in-flight refreshes to 1 call, saw %d calls", deltaCalls)
	}

	// 3. Stale-data retention when backend becomes unavailable after TTL expiry.
	failMode.Store(true)
	blockFetcher.Store(false)
	nowNano.Store(baseTime.Add(5 * time.Second).UnixNano())
	failedSnap := m.Refresh(context.Background(), "panel-alice", []string{"c1", "c2"})
	if !failedSnap.Stale || failedSnap.LastError == "" {
		t.Fatalf("expected stale=true and LastError set on failure, got %+v", failedSnap)
	}
	if !almostEqual(failedSnap.ContainerUsage.CPUCores, 0.5, 1e-6) || failedSnap.ContainerUsage.MemBytes != 64*1024*1024 {
		t.Fatalf("expected retained last-good container metrics during failure, got %+v", failedSnap)
	}

	// 4. Context cancellation on cold Refresh returns cleanly with LastError set.
	cancelCtx, cancel := context.WithCancel(context.Background())
	cancel()
	cancelled := m.Refresh(cancelCtx, "panel-cancel", []string{"cc1"})
	if cancelled.ContainerUsage.CPUCores != 0 {
		t.Fatalf("unexpected container usage after cancelled refresh: %+v", cancelled)
	}

	// 5. Bounded concurrency across 12 distinct accounts <= maxRefreshWorkers (4).
	failMode.Store(false)
	boundGate := make(chan struct{})
	gatePtr.Store(&boundGate)
	blockFetcher.Store(true)
	var acctWG sync.WaitGroup
	for i := 0; i < 12; i++ {
		acctWG.Add(1)
		idx := i
		go func() {
			defer acctWG.Done()
			m.Refresh(context.Background(), fmt.Sprintf("panel-acct-%d", idx), []string{fmt.Sprintf("cid-%d", idx)})
		}()
	}
	time.Sleep(40 * time.Millisecond)
	close(boundGate)
	acctWG.Wait()
	if maxConcurrent.Load() > maxRefreshWorkers {
		t.Fatalf("concurrent refresh workers exceeded bound %d: peak=%d", maxRefreshWorkers, maxConcurrent.Load())
	}
}

func almostEqual(a, b, eps float64) bool {
	if a > b {
		return a-b <= eps
	}
	return b-a <= eps
}

func benchmarkProcScan(b *testing.B, count int) {
	tmp := b.TempDir()
	procRoot := filepath.Join(tmp, "proc")
	if err := os.MkdirAll(procRoot, 0o755); err != nil {
		b.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(procRoot, "meminfo"), []byte("MemTotal:       16384000 kB\n"), 0o644); err != nil {
		b.Fatal(err)
	}
	for i := 1; i <= count; i++ {
		writeFakeProcPID(b, procRoot, 1000+i, "worker", uint64(i*10), uint64(i*5), uint64(5000+i), 128, "0::/user.slice/user-1001.slice/session-1.scope\n")
	}

	var nowNano atomic.Int64
	t0 := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	nowNano.Store(t0.UnixNano())

	c := newProcCollector(2 * time.Second)
	c.procRoot = procRoot
	c.cgroupRoot = filepath.Join(tmp, "missing-cg")
	c.mountInfoPath = filepath.Join(tmp, "missing-mount")
	c.now = func() time.Time { return time.Unix(0, nowNano.Load()).UTC() }
	c.readUIDFn = func(pid int, _ os.FileInfo) (uint32, bool) {
		return uint32(1000 + (pid % 5)), true
	}
	c.collectOnce()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		nowNano.Add(int64(time.Second))
		c.collectOnce()
	}
}

func BenchmarkProcCollectorScan_10(b *testing.B)   { benchmarkProcScan(b, 10) }
func BenchmarkProcCollectorScan_100(b *testing.B)  { benchmarkProcScan(b, 100) }
func BenchmarkProcCollectorScan_500(b *testing.B)  { benchmarkProcScan(b, 500) }
func BenchmarkProcCollectorScan_1000(b *testing.B) { benchmarkProcScan(b, 1000) }

func BenchmarkAccountUsageSnapshotCached(b *testing.B) {
	tmp := b.TempDir()
	procRoot := filepath.Join(tmp, "proc")
	_ = os.MkdirAll(procRoot, 0o755)
	_ = os.WriteFile(filepath.Join(procRoot, "meminfo"), []byte("MemTotal:        8388608 kB\n"), 0o644)
	for i := 1; i <= 50; i++ {
		writeFakeProcPID(b, procRoot, i, "proc", 100, 50, uint64(1000+i), 64, "")
	}

	m := NewManager(
		WithProcRoot(procRoot),
		WithCgroupRoot(filepath.Join(tmp, "cg")),
		WithMountInfoPath(filepath.Join(tmp, "mi")),
		WithSampleInterval(time.Hour),
		WithSnapshotTTL(time.Minute),
		WithUIDLookup(func(string) (uint32, bool) { return 1001, true }),
		WithProcUIDReader(func(int, os.FileInfo) (uint32, bool) { return 1001, true }),
		WithStatsFetcher(func(_ context.Context, ids []string) ([]docker.ContainerStat, error) {
			out := make([]docker.ContainerStat, 0, len(ids))
			for _, id := range ids {
				out = append(out, docker.ContainerStat{ID: id, Running: true, CPUCores: 0.1, MemBytes: 16 << 20})
			}
			return out, nil
		}),
	)
	ids := []string{"c1", "c2", "c3", "c4", "c5"}
	m.Refresh(context.Background(), "panel-alice", ids)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = m.SampleSnapshot(context.Background(), "panel-alice", ids)
	}
	b.StopTimer()
	m.Shutdown()
}
