package projects

import (
	"fmt"
	"net"
	"sync/atomic"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestPortProberBoundedConcurrencyAndCaching(t *testing.T) {
	var current atomic.Int32
	var peak atomic.Int32
	var dialCount atomic.Int32

	prober := newPortProber(8, 10*time.Second, 50*time.Millisecond)
	prober.dialFn = func(port int, timeout time.Duration) bool {
		dialCount.Add(1)
		n := current.Add(1)
		for {
			prev := peak.Load()
			if n <= prev || peak.CompareAndSwap(prev, n) {
				break
			}
		}
		time.Sleep(15 * time.Millisecond)
		current.Add(-1)
		return port%2 == 0
	}

	ports := make([]int, 32)
	for i := range ports {
		ports[i] = 10000 + i
	}

	start := time.Now()
	prober.ProbeBatch(ports)
	elapsed := time.Since(start)

	if p := peak.Load(); p > 8 || p < 2 {
		t.Fatalf("expected bounded concurrency between 2 and 8, got peak=%d", p)
	}
	if dialCount.Load() != 32 {
		t.Fatalf("expected 32 dials on cold batch, got %d", dialCount.Load())
	}
	if elapsed > 300*time.Millisecond {
		t.Fatalf("expected concurrent batch <= 300ms, took %v", elapsed)
	}

	// Second LookupCached / ProbeBatch within TTL must hit pure memory (0 extra dials).
	prober.ProbeBatch(ports)
	if dialCount.Load() != 32 {
		t.Fatalf("expected 0 new dials within TTL, total=%d", dialCount.Load())
	}

	status, open, _, needsRefresh := prober.LookupCached(10002)
	if status != PortOpen || !open || needsRefresh {
		t.Fatalf("unexpected cached status=%s open=%v refresh=%v", status, open, needsRefresh)
	}
}

func TestPortProberInvalidatePreventsStaleOverwrite(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})

	prober := newPortProber(4, 10*time.Second, 100*time.Millisecond)
	prober.dialFn = func(port int, timeout time.Duration) bool {
		close(started)
		<-release
		return true
	}

	prober.ScheduleBatch([]int{10500})
	<-started
	prober.Invalidate(10500)
	close(release)

	time.Sleep(25 * time.Millisecond)
	status, open, _, _ := prober.LookupCached(10500)
	if status != PortUnknown || open {
		t.Fatalf("stale in-flight probe overwrote invalidated cache: status=%s open=%v", status, open)
	}
}

func TestSnapshotAllCachedNeverBlocksOnDial(t *testing.T) {
	m := NewManager(t.TempDir())
	m.prober = newPortProber(4, 10*time.Second, 200*time.Millisecond)
	m.prober.dialFn = func(port int, timeout time.Duration) bool {
		time.Sleep(120 * time.Millisecond)
		return false
	}

	projects := make([]database.Project, 25)
	for i := range projects {
		projects[i] = database.Project{ID: int64(i + 1), AssignedPort: 11000 + i, Status: "stopped"}
	}

	start := time.Now()
	snaps := m.SnapshotAllCached(projects)
	elapsed := time.Since(start)

	if len(snaps) != 25 {
		t.Fatalf("expected 25 snapshots, got %d", len(snaps))
	}
	if elapsed > 40*time.Millisecond {
		t.Fatalf("SnapshotAllCached blocked on TCP dial: took %v", elapsed)
	}
	for _, snap := range snaps {
		if snap.PortStatus != PortUnknown || snap.HealthStatus != HealthStopped {
			t.Fatalf("unexpected cold non-blocking snapshot: %+v", snap)
		}
	}
}

func TestSnapshotLiveListenerSeparatesPortAndProcessStatus(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port

	m := NewManager(t.TempDir())
	snap := m.SnapshotProject(database.Project{ID: 77, AssignedPort: port, Status: "stopped"})
	if !snap.Listening || snap.PortStatus != PortOpen {
		t.Fatalf("expected PortOpen, got %+v", snap)
	}
	if snap.ProcessStatus != ProcessStopped {
		t.Fatalf("expected ProcessStopped when not launched by manager, got %+v", snap)
	}
	if !snap.Drift || snap.HealthStatus != HealthDrift || snap.DriftReason != "expected_stopped_but_port_accepting" {
		t.Fatalf("expected drift diagnostics for orphan listener, got %+v", snap)
	}
}

func TestPerProjectOpLockDoesNotGloballyBlockOtherProjects(t *testing.T) {
	m := NewManager(t.TempDir())
	holdingFirst := make(chan struct{})
	releaseFirst := make(chan struct{})

	op1 := m.projectOpLock(1)
	go func() {
		op1.Lock()
		close(holdingFirst)
		<-releaseFirst
		op1.Unlock()
	}()
	<-holdingFirst

	// Concurrent snapshot & start on project 2 must not block behind project 1.
	done2 := make(chan struct{})
	go func() {
		defer close(done2)
		_ = m.Start(nil, &database.Project{ID: 2, ProjectType: "unknown-test-type"})
		_ = m.SnapshotProject(database.Project{ID: 1, Status: "stopped"})
	}()

	select {
	case <-done2:
	case <-time.After(300 * time.Millisecond):
		close(releaseFirst)
		t.Fatal("project 2 operation or snapshot blocked while project 1 lock was held")
	}
	close(releaseFirst)
}

func BenchmarkSnapshotAllCached_50Projects(b *testing.B) {
	m := NewManager(b.TempDir())
	m.prober = newPortProber(16, 10*time.Second, 50*time.Millisecond)
	projects := make([]database.Project, 50)
	for i := range projects {
		port := 12000 + i
		m.prober.Mark(port, i%3 == 0)
		projects[i] = database.Project{
			ID:           int64(i + 1),
			Name:         fmt.Sprintf("proj-%d", i),
			AssignedPort: port,
			Status:       "stopped",
		}
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = m.SnapshotAllCached(projects)
	}
}
