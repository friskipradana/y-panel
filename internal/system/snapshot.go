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
	NetRxBps     float64
	NetTxBps     float64
	HasNetRate   bool
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

	// Network rate delta state (protected by netMu)
	netMu      sync.Mutex
	prevNet    NetworkIO
	prevNetAt  time.Time
	hasPrevNet bool
	lastNetRx  float64
	lastNetTx  float64
	hasNetRate bool

	// Cached static OS info
	staticOnce sync.Once
	hostname   string
	osName     string
	kernel     string

	dockerBusyMu sync.Mutex
	dockerBusy   bool

	ctx      context.Context
	cancel   context.CancelFunc
	stopCh   chan struct{}
	stopOnce sync.Once
	wg       sync.WaitGroup
}

// NewCollector creates a telemetry collector with configurable intervals.
func NewCollector(stateDir string, metricInterval, dockerInterval time.Duration) *Collector {
	if metricInterval <= 0 {
		metricInterval = time.Second
	}
	if dockerInterval <= 0 {
		dockerInterval = 15 * time.Second
	}
	ctx, cancel := context.WithCancel(context.Background())
	c := &Collector{
		stateDir:       stateDir,
		metricInterval: metricInterval,
		dockerInterval: dockerInterval,
		dockerTimeout:  5 * time.Second,
		ctx:            ctx,
		cancel:         cancel,
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
	baseCtx := c.ctx
	if baseCtx == nil {
		baseCtx = context.Background()
	}

	// Immediate initial Docker check asynchronously so API startup is non-blocking
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		if baseCtx.Err() != nil {
			return
		}
		ctx, cancel := context.WithTimeout(baseCtx, c.dockerTimeout)
		c.refreshDockerHealth(ctx)
		cancel()
		if baseCtx.Err() != nil {
			return
		}
		c.refreshHostFast()

		ticker := time.NewTicker(c.dockerInterval)
		defer ticker.Stop()
		for {
			select {
			case <-c.stopCh:
				return
			case <-ticker.C:
				ctx, cancel := context.WithTimeout(baseCtx, c.dockerTimeout)
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
		if c.cancel != nil {
			c.cancel()
		}
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

func computeNetworkRates(prev, curr NetworkIO, elapsedSec float64) (rxBps, txBps float64) {
	if elapsedSec <= 0 {
		return 0, 0
	}
	if curr.BytesRecv >= prev.BytesRecv {
		rxBps = float64(curr.BytesRecv-prev.BytesRecv) / elapsedSec
	}
	if curr.BytesSent >= prev.BytesSent {
		txBps = float64(curr.BytesSent-prev.BytesSent) / elapsedSec
	}
	return rxBps, txBps
}

func (c *Collector) sampleNetworkRate(curr NetworkIO, sampledAt time.Time) (rxBps, txBps float64, ready bool) {
	c.netMu.Lock()
	defer c.netMu.Unlock()

	if !c.hasPrevNet {
		c.prevNet = curr
		c.prevNetAt = sampledAt
		c.hasPrevNet = true
		return 0, 0, false
	}

	secs := sampledAt.Sub(c.prevNetAt).Seconds()
	if secs >= 0.2 {
		rx, tx := computeNetworkRates(c.prevNet, curr, secs)
		c.prevNet = curr
		c.prevNetAt = sampledAt
		c.lastNetRx = rx
		c.lastNetTx = tx
		c.hasNetRate = true
	}
	return c.lastNetRx, c.lastNetTx, c.hasNetRate
}

func (c *Collector) refreshHostFast() SystemSnapshot {
	c.initStatic()

	cpuPct := c.readCPUNonBlocking()
	temp := readCPUTemp()
	mem := readMemoryUsage()
	disk := readStorageUsage(c.stateDir)
	sampledAt := time.Now()
	netIO := readNetworkIO()
	rxBps, txBps, hasNetRate := c.sampleNetworkRate(netIO, sampledAt)
	if hasNetRate {
		netIO.RxBps = rxBps
		netIO.TxBps = txBps
	}
	uptime := readUptimeSeconds()
	ips := readIPAddresses()

	// Refresh hostname dynamically without mutating Collector fields outside c.mu
	host, hostErr := os.Hostname()

	c.mu.Lock()
	defer c.mu.Unlock()

	if hostErr == nil && strings.TrimSpace(host) != "" {
		c.hostname = host
	}
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
	snap.NetRxBps = rxBps
	snap.NetTxBps = txBps
	snap.HasNetRate = hasNetRate
	snap.UpdatedAt = sampledAt
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
		cmd.WaitDelay = 500 * time.Millisecond
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

