package system

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestSnapshotCollector(t *testing.T) {
	c := NewCollector("", 500*time.Millisecond, 2*time.Second)
	defer c.Close()

	snap := c.GetSnapshot()
	if snap.UpdatedAt.IsZero() {
		t.Fatal("expected non-zero UpdatedAt timestamp on snapshot")
	}

	// Verify CPU calculation helper with deterministic counters
	prev := cpuTimes{total: 1000, idle: 800}
	curr := cpuTimes{total: 1200, idle: 900}
	// total delta = 200, idle delta = 100 -> usage = 50%
	val := computeCPUUsage(prev, curr)
	if val < 49.9 || val > 50.1 {
		t.Fatalf("expected 50%% cpu usage, got %f", val)
	}

	// Verify network rate delta helper including independent counter reset handling
	rx, tx := computeNetworkRates(NetworkIO{BytesRecv: 1000, BytesSent: 5000}, NetworkIO{BytesRecv: 5000, BytesSent: 2000}, 2.0)
	if rx != 2000 || tx != 0 {
		t.Fatalf("expected rx=2000 tx=0 on tx counter reset, got rx=%f tx=%f", rx, tx)
	}

	c2 := &Collector{}
	t0 := time.Now()
	if _, _, ready := c2.sampleNetworkRate(NetworkIO{BytesRecv: 1000, BytesSent: 1000}, t0); ready {
		t.Fatal("first network sample should only establish baseline")
	}
	if _, _, ready := c2.sampleNetworkRate(NetworkIO{BytesRecv: 2000, BytesSent: 2000}, t0.Add(50*time.Millisecond)); ready {
		t.Fatal("sub-200ms duplicate sample should not compute rate")
	}
	rx2, tx2, ready := c2.sampleNetworkRate(NetworkIO{BytesRecv: 4000, BytesSent: 2500}, t0.Add(time.Second))
	if !ready || rx2 != 3000 || tx2 != 1500 {
		t.Fatalf("expected ready=true rx=3000 tx=1500, got ready=%v rx=%f tx=%f", ready, rx2, tx2)
	}

	// Ensure refresh is non-blocking with context
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := c.Refresh(ctx); err != nil {
		t.Fatalf("unexpected refresh error: %v", err)
	}

	summary := Inspect("")
	defer ShutdownCollector()
	if summary.Hostname == "" {
		t.Fatal("expected non-empty hostname from Inspect")
	}
}

func TestSnapshotConcurrentAccess(t *testing.T) {
	c := NewCollector("", 100*time.Millisecond, 2*time.Second)
	c.Start()
	defer c.Close()

	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				snap := c.GetSnapshot()
				if snap.UpdatedAt.IsZero() {
					t.Errorf("concurrent read returned zero UpdatedAt")
				}
			}
		}()
	}
	wg.Wait()
}

func BenchmarkInspectSnapshot(b *testing.B) {
	c := NewCollector("", 2*time.Second, 15*time.Second)
	c.Start()
	defer c.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = c.GetSnapshot()
	}
}

func TestCollectorConcurrentRefreshRaceSafe(t *testing.T) {
	c := NewCollector("", 15*time.Millisecond, time.Second)
	c.Start()
	defer c.Close()

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				snap := c.refreshHostFast()
				if snap.UpdatedAt.IsZero() {
					t.Errorf("concurrent refreshHostFast returned zero UpdatedAt")
				}
			}
		}()
	}
	wg.Wait()
}
