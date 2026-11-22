package docker

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestComputeEngineStatsFormulaMatchesDockerCLI(t *testing.T) {
	now := time.Now()
	// 2 cores: container burned 3e9 ns while system advanced 2e9 ns -> (3e9 / 2e9) * 2 = 3.0?
	// Wait: in Linux/Docker system_cpu_usage accumulates across all CPUs:
	// 2s wall * 2 cores = 4e9 ns system_cpu_usage; 1.0 full core for 2s = 2e9 ns total_usage -> (2e9 / 4e9) * 2 = 1.0 core.
	var raw engineStatsPayload
	raw.CPUStats.CPUUsage.TotalUsage = 5_000_000_000
	raw.PreCPUStats.CPUUsage.TotalUsage = 3_000_000_000
	raw.CPUStats.SystemUsage = 20_000_000_000
	raw.PreCPUStats.SystemUsage = 16_000_000_000
	raw.CPUStats.OnlineCPUs = 2
	raw.MemoryStats.Usage = 100 << 20
	raw.MemoryStats.Limit = 512 << 20
	raw.MemoryStats.Stats = map[string]uint64{
		"inactive_file": 20 << 20, // cgroup v2 page cache subtracted
	}
	raw.PIDsStats.Current = 14

	st := computeEngineStats("c1", raw, now)
	if !st.Running {
		t.Fatal("expected Running=true")
	}
	if st.CPUCores < 0.999 || st.CPUCores > 1.001 {
		t.Fatalf("CPUCores = %v, want 1.0", st.CPUCores)
	}
	if st.MemBytes != 80<<20 {
		t.Fatalf("MemBytes = %d, want %d (usage - inactive_file)", st.MemBytes, 80<<20)
	}
	if st.MemLimit != 512<<20 || st.PIDsCurrent != 14 {
		t.Fatalf("unexpected limit/pids: %+v", st)
	}

	// cgroup v1 fallback: total_inactive_file
	rawV1 := raw
	rawV1.MemoryStats.Stats = map[string]uint64{"total_inactive_file": 10 << 20}
	if got := computeEngineStats("c1-v1", rawV1, now).MemBytes; got != 90<<20 {
		t.Fatalf("cgroup v1 MemBytes = %d, want %d", got, 90<<20)
	}

	// Counter reset must not underflow
	rawReset := raw
	rawReset.CPUStats.CPUUsage.TotalUsage = 100
	rawReset.PreCPUStats.CPUUsage.TotalUsage = 9999
	if got := computeEngineStats("c1-reset", rawReset, now).CPUCores; got != 0 {
		t.Fatalf("counter reset CPUCores = %v, want 0", got)
	}
}

func TestCollectContainerStatsEngineAPIAndFailures(t *testing.T) {
	InvalidateAll()
	defer InvalidateAll()

	var current atomic.Int32
	var peak atomic.Int32
	var totalHits atomic.Int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/containers/removed-id/stats" {
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprint(w, `{"message":"no such container"}`)
			return
		}
		if r.URL.Path == "/containers/stopped-id/stats" {
			w.WriteHeader(http.StatusConflict)
			fmt.Fprint(w, `{"message":"container is not running"}`)
			return
		}
		n := current.Add(1)
		for {
			p := peak.Load()
			if n <= p || peak.CompareAndSwap(p, n) {
				break
			}
		}
		totalHits.Add(1)
		time.Sleep(15 * time.Millisecond)
		current.Add(-1)

		fmt.Fprint(w, `{
			"cpu_stats":{"cpu_usage":{"total_usage":2000000000},"system_cpu_usage":8000000000,"online_cpus":2},
			"precpu_stats":{"cpu_usage":{"total_usage":1000000000},"system_cpu_usage":4000000000},
			"memory_stats":{"usage":52428800,"limit":268435456,"stats":{"inactive_file":10485760}},
			"pids_stats":{"current":5}
		}`)
	}))
	defer srv.Close()
	t.Setenv("DOCKER_HOST", srv.URL)

	ids := []string{"c1", "c2", "c3", "c4", "c5", "c6", "removed-id", "stopped-id"}
	// Run concurrent batch calls for overlapping container IDs.
	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			stats, err := CollectContainerStats(context.Background(), ids)
			if err != nil {
				t.Errorf("CollectContainerStats error: %v", err)
				return
			}
			var running, removed, stopped int
			var sumMem uint64
			var sumCPU float64
			for _, st := range stats {
				if st.Removed {
					removed++
				} else if !st.Running {
					stopped++
				} else {
					running++
					sumMem += st.MemBytes
					sumCPU += st.CPUCores
				}
			}
			if running != 6 || removed != 1 || stopped != 1 {
				t.Errorf("unexpected counts running=%d removed=%d stopped=%d", running, removed, stopped)
			}
			// Each running container: (1e9 / 4e9) * 2 = 0.5 cores -> 6 * 0.5 = 3.0 cores
			if sumCPU < 2.99 || sumCPU > 3.01 {
				t.Errorf("sumCPU = %v, want 3.0", sumCPU)
			}
			// Each running container: 50MiB - 10MiB = 40MiB -> 6 * 40MiB = 240MiB
			if sumMem != 6*(40<<20) {
				t.Errorf("sumMem = %d, want %d", sumMem, 6*(40<<20))
			}
		}()
	}
	wg.Wait()

	if peak.Load() > statsWorkerMax {
		t.Fatalf("concurrency exceeded statsWorkerMax=%d: peak=%d", statsWorkerMax, peak.Load())
	}
	// Singleflight + cache must collapse 4x6 running calls into exactly 6 hits.
	if totalHits.Load() != 6 {
		t.Fatalf("expected 6 engine /stats calls with singleflight + cache, got %d", totalHits.Load())
	}

	// Invalidation triggers fresh fetch on next read.
	InvalidateContainers()
	if _, err := CollectContainerStats(context.Background(), []string{"c1"}); err != nil {
		t.Fatal(err)
	}
	if totalHits.Load() != 7 {
		t.Fatalf("expected fresh fetch after InvalidateContainers, totalHits=%d", totalHits.Load())
	}
}

func TestCollectContainerStatsUnavailableDaemon(t *testing.T) {
	InvalidateAll()
	defer InvalidateAll()
	t.Setenv("DOCKER_HOST", "unix:///nonexistent-reneo-test-docker.sock")

	_, err := CollectContainerStats(context.Background(), []string{"c1"})
	if !errors.Is(err, ErrEngineUnavailable) {
		t.Fatalf("expected ErrEngineUnavailable, got %v", err)
	}
}

func benchmarkCollectContainerStatsMock(b *testing.B, count int) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{
			"cpu_stats":{"cpu_usage":{"total_usage":2000000000},"system_cpu_usage":8000000000,"online_cpus":2},
			"precpu_stats":{"cpu_usage":{"total_usage":1000000000},"system_cpu_usage":4000000000},
			"memory_stats":{"usage":52428800,"limit":268435456,"stats":{"inactive_file":10485760}},
			"pids_stats":{"current":5}
		}`)
	}))
	defer srv.Close()
	b.Setenv("DOCKER_HOST", srv.URL)

	ids := make([]string, count)
	for i := 0; i < count; i++ {
		ids[i] = fmt.Sprintf("bench-container-%03d", i)
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		InvalidateContainers()
		if _, err := CollectContainerStats(context.Background(), ids); err != nil {
			b.Fatal(err)
		}
	}
	b.StopTimer()
	InvalidateAll()
}

func BenchmarkCollectContainerStats_MockEngine_10(b *testing.B)  { benchmarkCollectContainerStatsMock(b, 10) }
func BenchmarkCollectContainerStats_MockEngine_50(b *testing.B)  { benchmarkCollectContainerStatsMock(b, 50) }
func BenchmarkCollectContainerStats_MockEngine_100(b *testing.B) { benchmarkCollectContainerStatsMock(b, 100) }
