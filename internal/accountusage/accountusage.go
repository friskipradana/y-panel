// Package accountusage measures what one panel account consumes: the processes of its OS
// account (via asynchronous /proc and cgroup v2 accounting) plus the containers it owns (via Docker Engine API).
// It replaces host-wide figures for accounts that must not see the machine they share.
package accountusage

import (
	"context"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/docker"
	"github.com/friskipradana/panel-desktop-ui/internal/performance"
)

const (
	defaultSnapshotTTL = 5 * time.Second
	activeAccountTTL   = 2 * time.Minute
	maxRefreshWorkers  = 4
)

// Usage is a point-in-time reading preserving backward-compatible account consumption semantics.
type Usage struct {
	// CPUCores is the CPU in use expressed in cores (1.0 = one full core).
	CPUCores float64 `json:"cpuCores"`
	// MemBytes is non-reclaimable working-set memory of the account's processes and containers.
	MemBytes uint64 `json:"memBytes"`
}

// AccountSnapshot exposes decomposed process, cgroup v2, and container metrics alongside freshness metadata.
type AccountSnapshot struct {
	Key                  string                            `json:"key"`
	OSUsername           string                            `json:"osUsername"`
	UID                  uint32                            `json:"uid,omitempty"`
	HasUID               bool                              `json:"hasUid"`
	Usage                Usage                             `json:"usage"`
	ProcessUsage         Usage                             `json:"processUsage"`
	CgroupSliceUsage     Usage                             `json:"cgroupSliceUsage"`
	ContainerUsage       Usage                             `json:"containerUsage"`
	CgroupMode           CgroupMode                        `json:"cgroupMode"`
	SliceCgroup          *CgroupV2Metrics                  `json:"sliceCgroup,omitempty"`
	ContainerCgroups     map[string]CgroupV2Metrics        `json:"containerCgroups,omitempty"`
	HostMemoryTotalBytes uint64                            `json:"hostMemoryTotalBytes,omitempty"`
	ProcessesScanned     int                               `json:"processesScanned"`
	ContainersPolled     int                               `json:"containersPolled"`
	UpdatedAt            time.Time                         `json:"updatedAt"`
	LastSuccessAt        time.Time                         `json:"lastSuccessAt,omitempty"`
	Stale                bool                              `json:"stale"`
	LastError            string                            `json:"lastError,omitempty"`
}

// Option customizes an accountusage Manager (primarily for intervals, roots, and tests).
type Option func(*Manager)

// WithSampleInterval overrides the background /proc + cgroup sampling cadence.
func WithSampleInterval(d time.Duration) Option {
	return func(m *Manager) {
		if d > 0 {
			m.proc.interval = d
		}
	}
}

// WithSnapshotTTL sets how long container stat snapshots remain fresh before background refresh.
func WithSnapshotTTL(d time.Duration) Option {
	return func(m *Manager) {
		if d > 0 {
			m.snapshotTTL = d
		}
	}
}

// WithProcRoot overrides "/proc" root (used for testing).
func WithProcRoot(root string) Option {
	return func(m *Manager) {
		if root != "" {
			m.proc.procRoot = root
		}
	}
}

// WithCgroupRoot overrides "/sys/fs/cgroup" root (used for testing).
func WithCgroupRoot(root string) Option {
	return func(m *Manager) {
		if root != "" {
			m.proc.cgroupRoot = root
		}
	}
}

// WithMountInfoPath overrides "/proc/self/mountinfo" path (used for testing).
func WithMountInfoPath(path string) Option {
	return func(m *Manager) {
		if path != "" {
			m.proc.mountInfoPath = path
		}
	}
}

// WithStatsFetcher injects a custom container stats backend (defaults to docker.CollectContainerStats).
func WithStatsFetcher(fn func(ctx context.Context, ids []string) ([]docker.ContainerStat, error)) Option {
	return func(m *Manager) {
		if fn != nil {
			m.fetchStatsFn = fn
		}
	}
}

// WithUIDLookup overrides OS username -> UID resolution (used on non-Linux tests).
func WithUIDLookup(fn func(string) (uint32, bool)) Option {
	return func(m *Manager) {
		if fn != nil {
			m.lookupUIDFn = fn
		}
	}
}

// WithProcUIDReader overrides per-PID UID resolution from FileInfo (used on non-Linux tests).
func WithProcUIDReader(fn func(int, os.FileInfo) (uint32, bool)) Option {
	return func(m *Manager) {
		if fn != nil {
			m.proc.readUIDFn = fn
		}
	}
}

// WithClock overrides the clock used by both snapshot expiry and proc delta calculations (used in tests).
func WithClock(fn func() time.Time) Option {
	return func(m *Manager) {
		if fn != nil {
			m.now = fn
			m.proc.now = fn
		}
	}
}

type cachedContainerState struct {
	osUsername    string
	containerIDs  []string
	usage         Usage
	polledCount   int
	cgroups       map[string]CgroupV2Metrics
	updatedAt     time.Time
	lastSuccessAt time.Time
	lastAccessed  time.Time
	lastError     string
	stale         bool
}

// Manager coordinates non-blocking /proc + cgroup v2 telemetry with bounded Docker Engine stats refreshes.
type Manager struct {
	proc         *procCollector
	snapshotTTL  time.Duration
	now          func() time.Time
	lookupUIDFn  func(string) (uint32, bool)
	fetchStatsFn func(ctx context.Context, ids []string) ([]docker.ContainerStat, error)

	mu         sync.Mutex
	closed     bool
	cache      map[string]*cachedContainerState
	inflight   map[string]chan struct{}
	refreshSem chan struct{}

	stopCh   chan struct{}
	stopOnce sync.Once
	wg       sync.WaitGroup
}

// NewManager creates and starts a background-sampled account usage Manager.
func NewManager(opts ...Option) *Manager {
	m := &Manager{
		proc:         newProcCollector(defaultSampleInterval),
		snapshotTTL:  defaultSnapshotTTL,
		now:          time.Now,
		lookupUIDFn:  platformLookupUID,
		fetchStatsFn: docker.CollectContainerStats,
		cache:        make(map[string]*cachedContainerState),
		inflight:     make(map[string]chan struct{}),
		refreshSem:   make(chan struct{}, maxRefreshWorkers),
		stopCh:       make(chan struct{}),
	}
	for _, opt := range opts {
		if opt != nil {
			opt(m)
		}
	}
	m.proc.Start()
	m.wg.Add(1)
	go m.refreshLoop()
	return m
}

var (
	defaultMgrMu sync.Mutex
	defaultMgr   *Manager
)

// DefaultManager returns the shared background account usage manager, starting it lazily once.
func DefaultManager() *Manager {
	defaultMgrMu.Lock()
	defer defaultMgrMu.Unlock()
	if defaultMgr == nil {
		defaultMgr = NewManager()
	}
	return defaultMgr
}

// Shutdown stops the shared background manager and releases worker goroutines cleanly.
func Shutdown() {
	defaultMgrMu.Lock()
	m := defaultMgr
	defaultMgr = nil
	defaultMgrMu.Unlock()
	if m != nil {
		m.Shutdown()
	}
}

// Sample reads the account's usage immediately without sleeping or blocking HTTP request paths.
// osUsername may be empty (no OS account yet); containerIDs are the containers owned by the account.
func Sample(osUsername string, containerIDs []string) Usage {
	return DefaultManager().SampleSnapshot(context.Background(), osUsername, containerIDs).Usage
}

// SampleSnapshot returns the decomposed account snapshot immediately from memory.
// If container metrics are cold or expired, an asynchronous singleflight refresh is scheduled
// and any previously successful container reading is retained with Stale=true.
func SampleSnapshot(ctx context.Context, osUsername string, containerIDs []string) AccountSnapshot {
	return DefaultManager().SampleSnapshot(ctx, osUsername, containerIDs)
}

// Shutdown terminates the manager's background samplers and waits for active refresh workers.
func (m *Manager) Shutdown() {
	if m == nil {
		return
	}
	m.mu.Lock()
	m.closed = true
	m.mu.Unlock()

	m.stopOnce.Do(func() { close(m.stopCh) })
	m.proc.Stop()
	m.wg.Wait()
}

func (m *Manager) refreshLoop() {
	defer m.wg.Done()
	interval := m.snapshotTTL
	if interval <= 0 {
		interval = defaultSnapshotTTL
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.refreshActiveAccounts()
		}
	}
}

func (m *Manager) refreshActiveAccounts() {
	type refreshTarget struct {
		key        string
		osUsername string
		ids        []string
	}
	now := m.now()
	m.mu.Lock()
	var targets []refreshTarget
	for key, entry := range m.cache {
		if now.Sub(entry.lastAccessed) > activeAccountTTL {
			delete(m.cache, key)
			continue
		}
		if len(entry.containerIDs) == 0 {
			continue
		}
		if now.Sub(entry.updatedAt) >= m.snapshotTTL {
			targets = append(targets, refreshTarget{
				key:        key,
				osUsername: entry.osUsername,
				ids:        append([]string(nil), entry.containerIDs...),
			})
		}
	}
	m.mu.Unlock()

	for _, t := range targets {
		select {
		case <-m.stopCh:
			return
		default:
			m.scheduleContainerRefresh(t.key, t.osUsername, t.ids)
		}
	}
}

func normalizeIDs(containerIDs []string) []string {
	if len(containerIDs) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(containerIDs))
	out := make([]string, 0, len(containerIDs))
	for _, id := range containerIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

func accountKey(osUsername string, cleanIDs []string) string {
	u := strings.TrimSpace(osUsername)
	if u != "" {
		return u
	}
	return "nocreds:" + strings.Join(cleanIDs, ",")
}

func slicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// SampleSnapshot reads cached process, cgroup v2, and container usage without synchronous blocking.
func (m *Manager) SampleSnapshot(ctx context.Context, osUsername string, containerIDs []string) AccountSnapshot {
	osUsername = strings.TrimSpace(osUsername)
	for _, cand := range CandidateAccountSliceRelPaths(osUsername) {
		m.proc.TrackSlicePath(cand)
	}

	cleanIDs := normalizeIDs(containerIDs)
	key := accountKey(osUsername, cleanIDs)

	uid, hasUID := m.lookupUIDFn(osUsername)
	procSnap := m.proc.Snapshot()
	procUsage, sliceUsage, primaryCG := resolveAccountCompute(procSnap, osUsername, uid, hasUID)

	out := AccountSnapshot{
		Key:                  key,
		OSUsername:           osUsername,
		UID:                  uid,
		HasUID:               hasUID,
		ProcessUsage:         procUsage,
		CgroupSliceUsage:     sliceUsage,
		CgroupMode:           procSnap.cgroupMode,
		SliceCgroup:          primaryCG,
		HostMemoryTotalBytes: procSnap.hostMemoryTotal,
		ProcessesScanned:     procSnap.processesScanned,
		UpdatedAt:            procSnap.at,
	}

	if len(cleanIDs) == 0 {
		out.Usage = Usage{
			CPUCores: procUsage.CPUCores + sliceUsage.CPUCores,
			MemBytes: procUsage.MemBytes + sliceUsage.MemBytes,
		}
		out.LastSuccessAt = procSnap.at
		return out
	}

	now := m.now()
	m.mu.Lock()
	entry := m.cache[key]
	if entry == nil {
		entry = &cachedContainerState{
			osUsername:   osUsername,
			containerIDs: cleanIDs,
			lastAccessed: now,
		}
		m.cache[key] = entry
	} else {
		entry.lastAccessed = now
	}

	idsChanged := !slicesEqual(entry.containerIDs, cleanIDs)
	expired := entry.updatedAt.IsZero() || now.Sub(entry.updatedAt) >= m.snapshotTTL || idsChanged
	if idsChanged {
		entry.containerIDs = cleanIDs
	}

	contUsage := entry.usage
	polled := entry.polledCount
	cgroups := entry.cgroups
	lastSuccess := entry.lastSuccessAt
	lastErr := entry.lastError
	stale := entry.stale || (expired && !entry.updatedAt.IsZero())
	m.mu.Unlock()

	if expired && (ctx == nil || ctx.Err() == nil) {
		m.scheduleContainerRefresh(key, osUsername, cleanIDs)
	}

	out.ContainerUsage = contUsage
	out.ContainersPolled = polled
	out.ContainerCgroups = cgroups
	out.LastSuccessAt = lastSuccess
	if out.LastSuccessAt.IsZero() {
		out.LastSuccessAt = procSnap.at
	}
	out.LastError = lastErr
	out.Stale = stale
	out.Usage = Usage{
		CPUCores: procUsage.CPUCores + sliceUsage.CPUCores + contUsage.CPUCores,
		MemBytes: procUsage.MemBytes + sliceUsage.MemBytes + contUsage.MemBytes,
	}
	return out
}

// Refresh forces a singleflight refresh of container stats for an account and returns the updated snapshot.
func (m *Manager) Refresh(ctx context.Context, osUsername string, containerIDs []string) AccountSnapshot {
	if ctx == nil {
		ctx = context.Background()
	}
	osUsername = strings.TrimSpace(osUsername)
	for _, cand := range CandidateAccountSliceRelPaths(osUsername) {
		m.proc.TrackSlicePath(cand)
	}

	cleanIDs := normalizeIDs(containerIDs)
	key := accountKey(osUsername, cleanIDs)
	if len(cleanIDs) > 0 && ctx.Err() == nil {
		m.refreshContainersSync(ctx, key, osUsername, cleanIDs)
	}
	return m.SampleSnapshot(ctx, osUsername, cleanIDs)
}

func (m *Manager) scheduleContainerRefresh(key, osUsername string, cleanIDs []string) {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return
	}
	if _, busy := m.inflight[key]; busy {
		m.mu.Unlock()
		return
	}
	ch := make(chan struct{})
	m.inflight[key] = ch
	m.wg.Add(1)
	m.mu.Unlock()

	go func() {
		defer m.wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer cancel()

		// Propagate manager shutdown to in-flight refresh.
		doneWatch := make(chan struct{})
		go func() {
			select {
			case <-m.stopCh:
				cancel()
			case <-doneWatch:
			}
		}()
		defer close(doneWatch)

		m.runContainerRefresh(ctx, key, osUsername, cleanIDs, ch)
	}()
}

func (m *Manager) refreshContainersSync(ctx context.Context, key, osUsername string, cleanIDs []string) {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return
	}
	if existing, busy := m.inflight[key]; busy {
		m.mu.Unlock()
		select {
		case <-existing:
			return
		case <-ctx.Done():
			return
		}
	}
	ch := make(chan struct{})
	m.inflight[key] = ch
	m.mu.Unlock()

	m.runContainerRefresh(ctx, key, osUsername, cleanIDs, ch)
}

func (m *Manager) runContainerRefresh(ctx context.Context, key, osUsername string, cleanIDs []string, inflightCh chan struct{}) {
	defer func() {
		m.mu.Lock()
		if m.inflight[key] == inflightCh {
			delete(m.inflight, key)
		}
		close(inflightCh)
		m.mu.Unlock()
	}()

	select {
	case m.refreshSem <- struct{}{}:
		defer func() { <-m.refreshSem }()
	case <-ctx.Done():
		m.recordRefreshError(key, osUsername, cleanIDs, ctx.Err())
		return
	case <-m.stopCh:
		return
	}

	started := m.now()
	stats, err := m.fetchStatsFn(ctx, cleanIDs)
	performance.DefaultRegistry.RecordBackgroundWorker(m.now().Sub(started), err)

	if err != nil {
		m.recordRefreshError(key, osUsername, cleanIDs, err)
		return
	}

	var cores float64
	var mem uint64
	var polled int
	for _, st := range stats {
		if st.Removed || !st.Running {
			continue
		}
		cores += st.CPUCores
		mem += st.MemBytes
		polled++
	}

	// Optional cgroup v2 inspection for container scopes (metadata only; never added to ContainerUsage).
	var contCG map[string]CgroupV2Metrics
	procSnap := m.proc.Snapshot()
	if procSnap.cgroupV2Root != "" && (procSnap.cgroupMode == CgroupModeV2 || procSnap.cgroupMode == CgroupModeHybrid) {
		for _, id := range cleanIDs {
			if cgPath, ok := DiscoverContainerCgroupPath(procSnap.cgroupV2Root, id); ok {
				if cgm, cgErr := ReadCgroupV2Stats(cgPath); cgErr == nil && cgm.Available {
					if contCG == nil {
						contCG = make(map[string]CgroupV2Metrics, len(cleanIDs))
					}
					contCG[id] = cgm
				}
			}
		}
	}

	now := m.now()
	m.mu.Lock()
	entry := m.cache[key]
	if entry == nil {
		entry = &cachedContainerState{
			osUsername:   osUsername,
			containerIDs: cleanIDs,
			lastAccessed: now,
		}
		m.cache[key] = entry
	}
	entry.usage = Usage{CPUCores: cores, MemBytes: mem}
	entry.polledCount = polled
	entry.cgroups = contCG
	entry.updatedAt = now
	entry.lastSuccessAt = now
	entry.lastError = ""
	entry.stale = false
	m.mu.Unlock()
}

func (m *Manager) recordRefreshError(key, osUsername string, cleanIDs []string, err error) {
	if err == nil {
		return
	}
	now := m.now()
	m.mu.Lock()
	entry := m.cache[key]
	if entry == nil {
		entry = &cachedContainerState{
			osUsername:   osUsername,
			containerIDs: cleanIDs,
			lastAccessed: now,
		}
		m.cache[key] = entry
	}
	// Retain last successful usage metrics while marking data stale.
	entry.updatedAt = now
	entry.lastError = err.Error()
	entry.stale = true
	m.mu.Unlock()
}

// CollectorStats summarizes the /proc + cgroup collector health for diagnostics and benchmarks.
type CollectorStats struct {
	CgroupMode       CgroupMode
	ProcessesScanned int
	SampleDuration   time.Duration
	ScanErrors       int
	UpdatedAt        time.Time
}

// CollectorMetrics returns metrics from the underlying /proc and cgroup collector.
func (m *Manager) CollectorMetrics() CollectorStats {
	s := m.proc.Snapshot()
	return CollectorStats{
		CgroupMode:       s.cgroupMode,
		ProcessesScanned: s.processesScanned,
		SampleDuration:   s.sampleDuration,
		ScanErrors:       s.scanErrors,
		UpdatedAt:        s.at,
	}
}

// parseSize parses human container sizes such as "12.5MiB" or "1.2GiB" (retained for compatibility).
func parseSize(s string) uint64 {
	s = strings.TrimSpace(s)
	units := []struct {
		suffix string
		mult   float64
	}{{"KiB", 1 << 10}, {"MiB", 1 << 20}, {"GiB", 1 << 30}, {"TiB", 1 << 40}, {"kB", 1e3}, {"MB", 1e6}, {"GB", 1e9}, {"B", 1}}
	for _, u := range units {
		if strings.HasSuffix(s, u.suffix) {
			trimmed := strings.TrimSpace(strings.TrimSuffix(s, u.suffix))
			if val, err := strconv.ParseFloat(trimmed, 64); err == nil && val >= 0 {
				return uint64(val * u.mult)
			}
			return 0
		}
	}
	return 0
}
