package accountusage

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	clockTicks            = 100 // USER_HZ on Linux
	defaultSampleInterval = 2 * time.Second
	maxProcWorkers        = 4
)

type procKey struct {
	PID       int
	StartTime uint64
}

type procStatsResult struct {
	key        procKey
	uid        uint32
	ticks      uint64
	rssPages   uint64
	cgroupPath string
	inCont     bool
	ok         bool
	err        error
}

type sliceCPUState struct {
	usageUsec uint64
	at        time.Time
}

type uidProcessData struct {
	CPUCores     float64
	MemBytes     uint64
	ProcessCount int
	// Per-process rows retained briefly per snapshot so cgroup-covered PIDs are excluded cleanly without double counting.
	pids []procDeltaItem
}

type procDeltaItem struct {
	pid        int
	cpuCores   float64
	memBytes   uint64
	cgroupPath string
}

type procSnapshot struct {
	at               time.Time
	cgroupMode       CgroupMode
	cgroupV2Root     string
	hostMemoryTotal  uint64
	processesScanned int
	sampleDuration   time.Duration
	scanErrors       int
	byUID            map[uint32]uidProcessData
	slices           map[string]sliceSnapshot
}

type sliceSnapshot struct {
	Metrics  CgroupV2Metrics
	CPUCores float64
	MemBytes uint64
}

// procCollector periodically scans /proc and cgroup v2 paths asynchronously using bounded workers.
type procCollector struct {
	procRoot      string
	cgroupRoot    string
	mountInfoPath string
	pageSize      uint64
	interval      time.Duration
	now           func() time.Time
	listPIDsFn    func() ([]int, error)
	readUIDFn     func(pid int, info os.FileInfo) (uint32, bool)
	statFileFn    func(pid int) (os.FileInfo, error)

	mu         sync.RWMutex
	snapshot   procSnapshot
	prevProcs  map[procKey]uint64
	prevAt     time.Time
	prevSlices map[string]sliceCPUState

	trackedMu    sync.RWMutex
	trackedSlice map[string]struct{}

	stopCh   chan struct{}
	stopOnce sync.Once
	wg       sync.WaitGroup
	started  atomic.Bool
}

func newProcCollector(interval time.Duration) *procCollector {
	if interval <= 0 {
		interval = defaultSampleInterval
	}
	pageSize := uint64(os.Getpagesize())
	if pageSize == 0 {
		pageSize = 4096
	}
	c := &procCollector{
		procRoot:      "/proc",
		cgroupRoot:    "/sys/fs/cgroup",
		mountInfoPath: "/proc/self/mountinfo",
		pageSize:      pageSize,
		interval:      interval,
		now:           time.Now,
		prevProcs:     make(map[procKey]uint64),
		prevSlices:    make(map[string]sliceCPUState),
		trackedSlice:  make(map[string]struct{}),
		stopCh:        make(chan struct{}),
		snapshot: procSnapshot{
			byUID:  make(map[uint32]uidProcessData),
			slices: make(map[string]sliceSnapshot),
		},
	}
	c.listPIDsFn = c.defaultListPIDs
	c.statFileFn = c.defaultStatPID
	c.readUIDFn = platformReadUID
	return c
}

func (c *procCollector) Start() {
	if !c.started.CompareAndSwap(false, true) {
		return
	}
	// Perform initial baseline sample synchronously without sleeping.
	c.collectOnce()

	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		ticker := time.NewTicker(c.interval)
		defer ticker.Stop()
		for {
			select {
			case <-c.stopCh:
				return
			case <-ticker.C:
				c.collectOnce()
			}
		}
	}()
}

func (c *procCollector) Stop() {
	c.stopOnce.Do(func() { close(c.stopCh) })
	c.wg.Wait()
}

func (c *procCollector) TrackSlicePath(relPath string) {
	if relPath == "" {
		return
	}
	c.trackedMu.Lock()
	c.trackedSlice[relPath] = struct{}{}
	c.trackedMu.Unlock()
}

func (c *procCollector) Snapshot() procSnapshot {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.snapshot
}

func (c *procCollector) defaultListPIDs() ([]int, error) {
	entries, err := os.ReadDir(c.procRoot)
	if err != nil {
		return nil, err
	}
	pids := make([]int, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if len(name) == 0 || name[0] < '0' || name[0] > '9' {
			continue
		}
		pid, convErr := strconv.Atoi(name)
		if convErr != nil || pid <= 0 {
			continue
		}
		pids = append(pids, pid)
	}
	return pids, nil
}

func (c *procCollector) defaultStatPID(pid int) (os.FileInfo, error) {
	return os.Stat(filepath.Join(c.procRoot, strconv.Itoa(pid)))
}

// parseProcStat extracts (utime+stime, starttime, rssPages) from /proc/[pid]/stat.
func parseProcStat(raw []byte) (ticks uint64, startTime uint64, rssPages uint64, ok bool) {
	text := string(raw)
	end := strings.LastIndexByte(text, ')')
	if end < 0 || end+1 >= len(text) {
		return 0, 0, 0, false
	}
	fields := strings.Fields(text[end+1:])
	// fields[0] is field 3 (state); utime=14 ([11]), stime=15 ([12]), starttime=22 ([19]), rss=24 ([21]).
	if len(fields) < 22 {
		return 0, 0, 0, false
	}
	utime, err1 := strconv.ParseUint(fields[11], 10, 64)
	stime, err2 := strconv.ParseUint(fields[12], 10, 64)
	start, err3 := strconv.ParseUint(fields[19], 10, 64)
	rss, err4 := strconv.ParseInt(fields[21], 10, 64)
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		return 0, 0, 0, false
	}
	var rssPositive uint64
	if rss > 0 {
		rssPositive = uint64(rss)
	}
	return utime + stime, start, rssPositive, true
}

func (c *procCollector) scanOnePID(pid int, checkCgroup bool) procStatsResult {
	info, err := c.statFileFn(pid)
	if err != nil {
		return procStatsResult{err: err}
	}
	uid, hasUID := c.readUIDFn(pid, info)
	if !hasUID {
		return procStatsResult{}
	}

	rawStat, err := os.ReadFile(filepath.Join(c.procRoot, strconv.Itoa(pid), "stat"))
	if err != nil {
		return procStatsResult{err: err}
	}
	ticks, startTime, rssPages, ok := parseProcStat(rawStat)
	if !ok {
		return procStatsResult{err: fmt.Errorf("invalid /proc/%d/stat", pid)}
	}

	var cgroupPath string
	var inContainer bool
	if checkCgroup {
		if rawCG, cgErr := os.ReadFile(filepath.Join(c.procRoot, strconv.Itoa(pid), "cgroup")); cgErr == nil {
			entries := ParseProcCgroup(string(rawCG))
			if p, found := UnifiedCgroupPath(entries); found {
				cgroupPath = p
				inContainer = IsContainerCgroupPath(p)
			} else {
				for _, e := range entries {
					if e.Path != "" && e.Path != "/" {
						if IsContainerCgroupPath(e.Path) {
							inContainer = true
							cgroupPath = e.Path
							break
						}
						if cgroupPath == "" {
							cgroupPath = e.Path
						}
					}
				}
			}
		}
	}

	return procStatsResult{
		key:        procKey{PID: pid, StartTime: startTime},
		uid:        uid,
		ticks:      ticks,
		rssPages:   rssPages,
		cgroupPath: cgroupPath,
		inCont:     inContainer,
		ok:         true,
	}
}

// collectOnce executes one bounded non-sleeping pass over /proc and active cgroup v2 slices.
func (c *procCollector) collectOnce() {
	started := time.Now()
	now := c.now()
	mode, v2Root := DetectCgroupHierarchy(c.mountInfoPath, c.cgroupRoot)
	hostMemTotal := readHostMemoryTotalBytes(filepath.Join(c.procRoot, "meminfo"))

	pids, listErr := c.listPIDsFn()
	nextProcs := make(map[procKey]uint64, len(pids))
	byUID := make(map[uint32]uidProcessData)
	sliceCandidateSet := make(map[string]struct{})

	c.trackedMu.RLock()
	for sPath := range c.trackedSlice {
		sliceCandidateSet[sPath] = struct{}{}
	}
	c.trackedMu.RUnlock()

	var scanErrs int
	if listErr != nil {
		scanErrs++
	}

	c.mu.RLock()
	prevProcs := c.prevProcs
	prevAt := c.prevAt
	prevSlices := c.prevSlices
	c.mu.RUnlock()

	elapsed := 0.0
	if !prevAt.IsZero() {
		elapsed = now.Sub(prevAt).Seconds()
	}

	if len(pids) > 0 {
		results := make([]procStatsResult, len(pids))
		workers := maxProcWorkers
		if cpu := runtime.NumCPU(); cpu > 0 && cpu < workers {
			workers = cpu
		}
		if len(pids) < workers {
			workers = len(pids)
		}
		if workers < 1 {
			workers = 1
		}
		jobs := make(chan int, len(pids))
		for i := range pids {
			jobs <- i
		}
		close(jobs)

		checkCgroup := mode != CgroupModeUnknown || dirExists(c.cgroupRoot)
		var wg sync.WaitGroup
		wg.Add(workers)
		for w := 0; w < workers; w++ {
			go func() {
				defer wg.Done()
				for idx := range jobs {
					results[idx] = c.scanOnePID(pids[idx], checkCgroup)
				}
			}()
		}
		wg.Wait()

		for _, res := range results {
			if res.err != nil {
				if !os.IsNotExist(res.err) && !os.IsPermission(res.err) && res.err != fs.ErrNotExist && res.err != fs.ErrPermission {
					scanErrs++
				}
				continue
			}
			if !res.ok {
				continue
			}
			if res.inCont {
				// Exclude containerized PIDs so Docker container stats never double count them.
				continue
			}

			nextProcs[res.key] = res.ticks
			var pidCPU float64
			if elapsed > 0 {
				if prevTicks, found := prevProcs[res.key]; found && res.ticks >= prevTicks {
					pidCPU = float64(res.ticks-prevTicks) / float64(clockTicks) / elapsed
				}
			}
			pidMem := res.rssPages * c.pageSize

			if res.cgroupPath != "" {
				if sliceRel, ok := accountSliceRelPath(res.cgroupPath, "", res.uid); ok {
					sliceCandidateSet[sliceRel] = struct{}{}
				} else if strings.Contains(res.cgroupPath, ".slice") {
					// Walk deepest-to-shallowest so `reneo-panel-<user>.slice` wins over parent `reneo-panel.slice`.
					parts := strings.Split(strings.Trim(res.cgroupPath, "/"), "/")
					for i := len(parts) - 1; i >= 0; i-- {
						seg := parts[i]
						if strings.HasPrefix(seg, "reneo-panel-") && strings.HasSuffix(seg, ".slice") {
							sliceCandidateSet["/"+strings.Join(parts[:i+1], "/")] = struct{}{}
							break
						}
					}
				}
			}

			entry := byUID[res.uid]
			entry.CPUCores += pidCPU
			entry.MemBytes += pidMem
			entry.ProcessCount++
			entry.pids = append(entry.pids, procDeltaItem{
				pid:        res.key.PID,
				cpuCores:   pidCPU,
				memBytes:   pidMem,
				cgroupPath: res.cgroupPath,
			})
			byUID[res.uid] = entry
		}
	}

	nextSliceCPU := make(map[string]sliceCPUState, len(sliceCandidateSet))
	slices := make(map[string]sliceSnapshot, len(sliceCandidateSet))
	if v2Root != "" && (mode == CgroupModeV2 || mode == CgroupModeHybrid) {
		for relPath := range sliceCandidateSet {
			fullDir := filepath.Join(v2Root, filepath.FromSlash(strings.TrimPrefix(relPath, "/")))
			metrics, err := ReadCgroupV2Stats(fullDir)
			if err != nil || !metrics.Available {
				continue
			}
			var sliceCPU float64
			if metrics.HasCPU {
				nextSliceCPU[relPath] = sliceCPUState{usageUsec: metrics.CPUUsageUsec, at: now}
				if prev, ok := prevSlices[relPath]; ok && metrics.CPUUsageUsec >= prev.usageUsec {
					if sliceElapsed := now.Sub(prev.at).Seconds(); sliceElapsed > 0 {
						sliceCPU = float64(metrics.CPUUsageUsec-prev.usageUsec) / 1_000_000.0 / sliceElapsed
					}
				}
			}
			slices[relPath] = sliceSnapshot{
				Metrics:  metrics,
				CPUCores: sliceCPU,
				MemBytes: metrics.MemoryWorkingBytes,
			}
		}
	}

	snap := procSnapshot{
		at:               now,
		cgroupMode:       mode,
		cgroupV2Root:     v2Root,
		hostMemoryTotal:  hostMemTotal,
		processesScanned: len(pids),
		sampleDuration:   time.Since(started),
		scanErrors:       scanErrs,
		byUID:            byUID,
		slices:           slices,
	}

	c.mu.Lock()
	c.snapshot = snap
	c.prevProcs = nextProcs
	c.prevAt = now
	c.prevSlices = nextSliceCPU
	c.mu.Unlock()
}

// resolveAccountCompute combines non-container cgroup v2 slice accounting with /proc UID fallback
// without double-counting processes that sit inside a covered cgroup slice.
func resolveAccountCompute(
	snap procSnapshot,
	osUsername string,
	uid uint32,
	hasUID bool,
) (procUsage Usage, sliceUsage Usage, primaryCgroup *CgroupV2Metrics) {
	if !hasUID && osUsername == "" {
		return Usage{}, Usage{}, nil
	}

	// Track which non-container slice relPaths exist & cover this account cleanly (avoiding parent+child overlap).
	coveredSlices := make(map[string]sliceSnapshot)
	if osUsername != "" {
		for _, cand := range CandidateAccountSliceRelPaths(osUsername) {
			if sl, ok := snap.slices[cand]; ok {
				coveredSlices[cand] = sl
				cp := sl.Metrics
				primaryCgroup = &cp
				break // nested and flat refer to the same logical user slice; pick first found
			}
		}
	}
	if len(coveredSlices) == 0 && hasUID {
		userSlice := "/user.slice/user-" + strconv.FormatUint(uint64(uid), 10) + ".slice"
		if sl, ok := snap.slices[userSlice]; ok {
			coveredSlices[userSlice] = sl
			cp := sl.Metrics
			primaryCgroup = &cp
		}
	}

	for _, sl := range coveredSlices {
		if sl.Metrics.HasCPU {
			sliceUsage.CPUCores += sl.CPUCores
		}
		if sl.Metrics.HasMemory {
			sliceUsage.MemBytes += sl.MemBytes
		}
	}

	if !hasUID {
		return Usage{}, sliceUsage, primaryCgroup
	}
	uidData, ok := snap.byUID[uid]
	if !ok {
		return Usage{}, sliceUsage, primaryCgroup
	}

	for _, p := range uidData.pids {
		coveredCPU := false
		coveredMem := false
		for sliceRel, sl := range coveredSlices {
			if p.cgroupPath == sliceRel || strings.HasPrefix(p.cgroupPath, strings.TrimSuffix(sliceRel, "/")+"/") {
				if sl.Metrics.HasCPU {
					coveredCPU = true
				}
				if sl.Metrics.HasMemory {
					coveredMem = true
				}
			}
		}
		if !coveredCPU {
			procUsage.CPUCores += p.cpuCores
		}
		if !coveredMem {
			procUsage.MemBytes += p.memBytes
		}
	}
	return procUsage, sliceUsage, primaryCgroup
}
