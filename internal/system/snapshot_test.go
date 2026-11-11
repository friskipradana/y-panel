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
