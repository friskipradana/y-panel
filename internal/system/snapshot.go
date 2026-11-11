package system

import (
	"context"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// DockerHealthState represents the lifecycle availability of the Docker daemon.
type DockerHealthState string

const (
	DockerHealthUnknown     DockerHealthState = "UNKNOWN"
	DockerHealthAvailable   DockerHealthState = "AVAILABLE"
	DockerHealthUnavailable DockerHealthState = "UNAVAILABLE"
	DockerHealthDegraded    DockerHealthState = "DEGRADED"
)

// SystemSnapshot holds a pre-collected snapshot of host metrics and service reachability.
type SystemSnapshot struct {
	Summary      Summary
	DockerState  DockerHealthState
	UpdatedAt    time.Time
	DockerSeenAt time.Time
}

// SnapshotService provides non-blocking concurrent access to cached host telemetry.
type SnapshotService interface {
	GetSnapshot() SystemSnapshot
	Refresh(ctx context.Context) error
	Close()
}

// Collector manages background telemetry collection so HTTP handlers never perform blocking probes.
type Collector struct {
	stateDir       string
	metricInterval time.Duration
	dockerInterval time.Duration
	dockerTimeout  time.Duration

	mu       sync.RWMutex
	snapshot SystemSnapshot

	// CPU delta state (protected by cpuMu, never held during external I/O)
	cpuMu      sync.Mutex
	prevCPU    cpuTimes
	hasPrevCPU bool
	lastCPUVal float64

	// Cached static OS info
	staticOnce sync.Once
	hostname   string
	osName     string
	kernel     string

	dockerBusyMu sync.Mutex
	dockerBusy   bool

	stopCh   chan struct{}
	stopOnce sync.Once
	wg       sync.WaitGroup
}

// NewCollector creates a telemetry collector with configurable intervals.
func NewCollector(stateDir string, metricInterval, dockerInterval time.Duration) *Collector {
	if metricInterval <= 0 {
		metricInterval = 2 * time.Second
	}
	if dockerInterval <= 0 {
		dockerInterval = 15 * time.Second
	}
	c := &Collector{
		stateDir:       stateDir,
		metricInterval: metricInterval,
		dockerInterval: dockerInterval,
		dockerTimeout:  5 * time.Second,
		stopCh:         make(chan struct{}),
		snapshot: SystemSnapshot{
			DockerState: DockerHealthUnknown,
		},
	}
	// Prime static metadata and initial fast snapshot synchronously without sleeping
	c.initStatic()
	c.refreshHostFast()
	return c
}

func (c *Collector) initStatic() {
	c.staticOnce.Do(func() {
		host, _ := os.Hostname()
		c.hostname = host
		c.osName = readOSName()
		c.kernel = readKernel()
	})
}

// Start launches background workers for host metrics and Docker health monitoring.
func (c *Collector) Start() {
	// Immediate initial Docker check asynchronously so API startup is non-blocking
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), c.dockerTimeout)
		c.refreshDockerHealth(ctx)
		cancel()
		c.refreshHostFast()

		ticker := time.NewTicker(c.dockerInterval)
		defer ticker.Stop()
		for {
			select {
			case <-c.stopCh:
				return
			case <-ticker.C:
				ctx, cancel := context.WithTimeout(context.Background(), c.dockerTimeout)
				c.refreshDockerHealth(ctx)
				cancel()
			}
		}
	}()

	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		ticker := time.NewTicker(c.metricInterval)
		defer ticker.Stop()
		for {
			select {
			case <-c.stopCh:
				return
			case <-ticker.C:
				c.refreshHostFast()
			}
		}
	}()
}

// Close gracefully terminates background sampling goroutines.
func (c *Collector) Close() {
	c.stopOnce.Do(func() {
		close(c.stopCh)
	})
	c.wg.Wait()
}

// GetSnapshot returns the most recent host snapshot immediately without blocking on I/O.
func (c *Collector) GetSnapshot() SystemSnapshot {
	c.mu.RLock()
	snap := c.snapshot
	c.mu.RUnlock()

	// If no snapshot has been built yet or it's very stale, trigger a fast non-blocking host read
	if snap.UpdatedAt.IsZero() {
		return c.refreshHostFast()
	}
	return snap
}

// Refresh forces an immediate host metrics refresh without sleeping.
func (c *Collector) Refresh(ctx context.Context) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	c.refreshHostFast()
	c.refreshDockerHealth(ctx)
	return nil
}

// readCPUNonBlocking computes CPU utilization using the delta from the last counter sample.
func (c *Collector) readCPUNonBlocking() float64 {
	curr, err := readCPUStat()
	if err != nil {
		return 0
	}

	c.cpuMu.Lock()
	defer c.cpuMu.Unlock()

	if !c.hasPrevCPU {
		c.prevCPU = curr
		c.hasPrevCPU = true
		return 0
	}

	val := computeCPUUsage(c.prevCPU, curr)
	// Only advance baseline if at least total ticks increased cleanly
	if curr.total > c.prevCPU.total {
		c.prevCPU = curr
		c.lastCPUVal = val
	}
	return c.lastCPUVal
}

func computeCPUUsage(prev, curr cpuTimes) float64 {
	if curr.total <= prev.total {
		return 0
	}
	totalDelta := curr.total - prev.total
	var idleDelta uint64
	if curr.idle >= prev.idle {
		idleDelta = curr.idle - prev.idle
	}
	if totalDelta == 0 {
		return 0
	}
	pct := float64(totalDelta-idleDelta) / float64(totalDelta) * 100.0
	if pct < 0 {
		return 0
	}
	if pct > 100 {
		return 100
	}
	return pct
}

func (c *Collector) refreshHostFast() SystemSnapshot {
	c.initStatic()

	cpuPct := c.readCPUNonBlocking()
	temp := readCPUTemp()
	mem := readMemoryUsage()
	disk := readStorageUsage(c.stateDir)
	netIO := readNetworkIO()
	uptime := readUptimeSeconds()
	ips := readIPAddresses()

	// Refresh hostname dynamically in case it changed
	if h, err := os.Hostname(); err == nil && strings.TrimSpace(h) != "" {
		c.hostname = h
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	snap := c.snapshot
	snap.Summary = Summary{
		Hostname:        c.hostname,
		OSName:          c.osName,
		Kernel:          c.kernel,
		UptimeSeconds:   uptime,
		CPUUsagePercent: cpuPct,
		CPUTemp:         temp,
		Memory:          mem,
		Storage:         disk,
		NetworkIO:       netIO,
		DockerInstalled: snap.Summary.DockerInstalled,
		DockerReachable: snap.Summary.DockerReachable,
		DockerStatus:    snap.Summary.DockerStatus,
		IPAddresses:     ips,
	}
	snap.UpdatedAt = time.Now()
	c.snapshot = snap
	return snap
}

func (c *Collector) refreshDockerHealth(ctx context.Context) {
	c.dockerBusyMu.Lock()
	if c.dockerBusy {
		c.dockerBusyMu.Unlock()
		return
	}
	c.dockerBusy = true
	c.dockerBusyMu.Unlock()

	defer func() {
		c.dockerBusyMu.Lock()
		c.dockerBusy = false
		c.dockerBusyMu.Unlock()
	}()

	installed := hasCommand("docker")
	reachable := false
	state := DockerHealthUnavailable

	if installed {
		cmd := exec.CommandContext(ctx, "docker", "info")
		if err := cmd.Run(); err == nil {
			reachable = true
			state = DockerHealthAvailable
		} else if ctx.Err() != nil {
			state = DockerHealthDegraded
		} else {
			state = DockerHealthUnavailable
		}
	}

	statusText := resolveDockerStatus(installed, reachable)
	now := time.Now()

	c.mu.Lock()
	defer c.mu.Unlock()

	c.snapshot.Summary.DockerInstalled = installed
	c.snapshot.Summary.DockerReachable = reachable
	c.snapshot.Summary.DockerStatus = statusText
	c.snapshot.DockerState = state
	c.snapshot.DockerSeenAt = now
}

