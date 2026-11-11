package docker

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"runtime"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/performance"
)

const (
	containerStatsTTL     = 5 * time.Second
	containerStatsTimeout = 4 * time.Second
	statsWorkerMax        = 4
)

// ErrEngineUnavailable reports that the Docker Engine HTTP socket is unreachable.
var ErrEngineUnavailable = errEngineUnavailable

// ContainerStat holds normalized CPU, memory working set, and PID counters for a single container.
type ContainerStat struct {
	ID          string    `json:"id"`
	CPUCores    float64   `json:"cpuCores"`
	MemBytes    uint64    `json:"memBytes"`
	MemLimit    uint64    `json:"memLimit"`
	PIDsCurrent uint64    `json:"pidsCurrent"`
	Running     bool      `json:"running"`
	Removed     bool      `json:"removed,omitempty"`
	FetchedAt   time.Time `json:"fetchedAt"`
}

type engineStatsPayload struct {
	Read     string `json:"read"`
	PreRead  string `json:"preread"`
	CPUStats struct {
		CPUUsage struct {
			TotalUsage  uint64   `json:"total_usage"`
			PercpuUsage []uint64 `json:"percpu_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs  uint32 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
	PIDsStats struct {
		Current uint64 `json:"current"`
	} `json:"pids_stats"`
}

type cachedContainerStatEntry struct {
	stat      ContainerStat
	fetchedAt time.Time
	gen       uint64
}

type containerStatsStore struct {
	mu       sync.Mutex
	gen      uint64
	entries  map[string]cachedContainerStatEntry
	inflight map[string]chan struct{}
}

var statsStore = &containerStatsStore{
	entries:  make(map[string]cachedContainerStatEntry),
	inflight: make(map[string]chan struct{}),
}

func invalidateAllContainerStats() {
	statsStore.mu.Lock()
	statsStore.gen++
	statsStore.entries = make(map[string]cachedContainerStatEntry)
	statsStore.mu.Unlock()
}

// computeEngineStats converts a Docker Engine /stats JSON payload into core-fraction CPU and
// working-set memory using the same formula as `docker stats --no-stream`.
func computeEngineStats(id string, raw engineStatsPayload, now time.Time) ContainerStat {
	stat := ContainerStat{
		ID:          id,
		MemLimit:    raw.MemoryStats.Limit,
		PIDsCurrent: raw.PIDsStats.Current,
		FetchedAt:   now,
	}

	if raw.MemoryStats.Usage == 0 && raw.PIDsStats.Current == 0 && raw.CPUStats.SystemUsage == 0 {
		return stat
	}
	stat.Running = true
	stat.MemBytes = dockerWorkingSetBytes(raw.MemoryStats.Usage, raw.MemoryStats.Stats)

	if raw.CPUStats.CPUUsage.TotalUsage > raw.PreCPUStats.CPUUsage.TotalUsage &&
		raw.CPUStats.SystemUsage > raw.PreCPUStats.SystemUsage {
		cpuDelta := float64(raw.CPUStats.CPUUsage.TotalUsage - raw.PreCPUStats.CPUUsage.TotalUsage)
		sysDelta := float64(raw.CPUStats.SystemUsage - raw.PreCPUStats.SystemUsage)
		onlineCPUs := raw.CPUStats.OnlineCPUs
		if onlineCPUs == 0 {
			onlineCPUs = uint32(len(raw.CPUStats.CPUUsage.PercpuUsage))
		}
		if onlineCPUs == 0 {
			onlineCPUs = uint32(runtime.NumCPU())
		}
		if sysDelta > 0 && onlineCPUs > 0 {
			stat.CPUCores = (cpuDelta / sysDelta) * float64(onlineCPUs)
		}
	}
	return stat
}

func dockerWorkingSetBytes(usage uint64, stats map[string]uint64) uint64 {
	if usage == 0 || len(stats) == 0 {
		return usage
	}
	// Match Docker CLI `calculateMemUsageUnixNoCache` across cgroup v2 and v1.
	for _, key := range []string{"inactive_file", "total_inactive_file", "cache"} {
		if v, ok := stats[key]; ok {
			if v < usage {
				return usage - v
			}
			return 0
		}
	}
	return usage
}

// GetContainerStats queries or serves cached stats via Docker Engine API (`GET /containers/{id}/stats?stream=false`)
// using singleflight deduplication so concurrent readers do not overload the Engine socket.
func GetContainerStats(ctx context.Context, id string) (ContainerStat, error) {
	if id == "" {
		return ContainerStat{}, nil
	}
	for {
		statsStore.mu.Lock()
		if entry, ok := statsStore.entries[id]; ok && time.Since(entry.fetchedAt) < containerStatsTTL {
			statsStore.mu.Unlock()
			return entry.stat, nil
		}
		if ch, busy := statsStore.inflight[id]; busy {
			statsStore.mu.Unlock()
			select {
			case <-ch:
				continue
			case <-ctx.Done():
				return ContainerStat{ID: id}, ctx.Err()
			}
		}
		ch := make(chan struct{})
		statsStore.inflight[id] = ch
		startGen := statsStore.gen
		statsStore.mu.Unlock()

		stat, err := fetchContainerStatsEngine(ctx, id)

		statsStore.mu.Lock()
		delete(statsStore.inflight, id)
		close(ch)
		if err == nil && statsStore.gen == startGen && !stat.Removed {
			statsStore.entries[id] = cachedContainerStatEntry{
				stat:      stat,
				fetchedAt: time.Now(),
				gen:       startGen,
			}
		} else if stat.Removed {
			delete(statsStore.entries, id)
		}
		statsStore.mu.Unlock()

		return stat, err
	}
}

func fetchContainerStatsEngine(parent context.Context, id string) (ContainerStat, error) {
	started := time.Now()
	ctx, cancel := context.WithTimeout(parent, containerStatsTimeout)
	defer cancel()

	var raw engineStatsPayload
	path := "/containers/" + url.PathEscape(id) + "/stats?stream=false"
	code, _, err := defaultEngine.doRequest(ctx, http.MethodGet, path, &raw)
	if code == http.StatusNotFound {
		performance.DefaultRegistry.RecordDockerOp("container_stats", time.Since(started), nil)
		return ContainerStat{ID: id, Removed: true, FetchedAt: time.Now()}, nil
	}
	if code == http.StatusConflict {
		// Container stopped or not running; not an Engine failure.
		performance.DefaultRegistry.RecordDockerOp("container_stats", time.Since(started), nil)
		return ContainerStat{ID: id, Running: false, FetchedAt: time.Now()}, nil
	}
	performance.DefaultRegistry.RecordDockerOp("container_stats", time.Since(started), err)
	if err != nil {
		return ContainerStat{ID: id}, err
	}
	return computeEngineStats(id, raw, time.Now()), nil
}

// CollectContainerStats fetches stats for multiple containers using bounded concurrency.
// Individual missing/stopped containers are recorded without cancelling sibling results unless
// the Docker Engine socket itself is unavailable or ctx is cancelled.
func CollectContainerStats(ctx context.Context, ids []string) ([]ContainerStat, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	unique := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	if len(unique) == 0 {
		return nil, nil
	}

	results := make([]ContainerStat, len(unique))
	errs := make([]error, len(unique))

	workers := statsWorkerMax
	if len(unique) < workers {
		workers = len(unique)
	}
	jobs := make(chan int, len(unique))
	for i := range unique {
		jobs <- i
	}
	close(jobs)

	var wg sync.WaitGroup
	wg.Add(workers)
	for w := 0; w < workers; w++ {
		go func() {
			defer wg.Done()
			for idx := range jobs {
				if ctx.Err() != nil {
					errs[idx] = ctx.Err()
					continue
				}
				results[idx], errs[idx] = GetContainerStats(ctx, unique[idx])
			}
		}()
	}
	wg.Wait()

	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	var firstErr error
	allEngineUnavailable := true
	for _, err := range errs {
		if err == nil {
			allEngineUnavailable = false
			continue
		}
		if firstErr == nil {
			firstErr = err
		}
		if !errors.Is(err, errEngineUnavailable) {
			allEngineUnavailable = false
		}
	}
	if allEngineUnavailable && firstErr != nil {
		return nil, firstErr
	}
	out := make([]ContainerStat, 0, len(results))
	for i, st := range results {
		if errs[i] != nil {
			continue
		}
		out = append(out, st)
	}
	if len(out) == 0 && firstErr != nil {
		return nil, firstErr
	}
	return out, nil
}

