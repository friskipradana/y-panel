package projects

import (
	"fmt"
	"net"
	"sync"
	"time"
)

const (
	defaultProbeTTL      = 10 * time.Second
	defaultProbeStaleMax = 60 * time.Second
	defaultProbeTimeout  = 200 * time.Millisecond
	defaultProbeWorkers  = 16
	maxProbeWorkersLimit = 32
)

type portCacheEntry struct {
	open      bool
	hasValue  bool
	checkedAt time.Time
	gen       uint64
	inFlight  bool
	done      chan struct{}
}

// portProber probes localhost TCP ports using a bounded worker pool and TTL cache.
type portProber struct {
	mu            sync.Mutex
	entries       map[int]*portCacheEntry
	queue         []int
	activeWorkers int
	maxWorkers    int
	ttl           time.Duration
	staleMax      time.Duration
	timeout       time.Duration
	dialFn        func(port int, timeout time.Duration) bool
}

func newPortProber(maxWorkers int, ttl, timeout time.Duration) *portProber {
	if maxWorkers <= 0 {
		maxWorkers = defaultProbeWorkers
	}
	if maxWorkers > maxProbeWorkersLimit {
		maxWorkers = maxProbeWorkersLimit
	}
	if ttl <= 0 {
		ttl = defaultProbeTTL
	}
	if timeout <= 0 {
		timeout = defaultProbeTimeout
	}
	return &portProber{
		entries:    make(map[int]*portCacheEntry),
		maxWorkers: maxWorkers,
		ttl:        ttl,
		staleMax:   defaultProbeStaleMax,
		timeout:    timeout,
		dialFn:     dialLocalPort,
	}
}

func dialLocalPort(port int, timeout time.Duration) bool {
	if port <= 0 {
		return false
	}
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), timeout)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

// LookupCached returns the cached port status immediately without performing network I/O.
// needsRefresh is true when the cache entry is missing or older than TTL.
func (p *portProber) LookupCached(port int) (status PortStatus, open bool, checkedAt time.Time, needsRefresh bool) {
	if port <= 0 {
		return PortClosed, false, time.Time{}, false
	}
	now := time.Now()
	p.mu.Lock()
	e, ok := p.entries[port]
	if !ok || !e.hasValue {
		p.mu.Unlock()
		return PortUnknown, false, time.Time{}, true
	}
	age := now.Sub(e.checkedAt)
	open = e.open
	checkedAt = e.checkedAt
	p.mu.Unlock()

	if age <= p.ttl {
		return boolToPortStatus(open), open, checkedAt, false
	}
	if age <= p.staleMax {
		// Stale-while-revalidate: keep previous value while requesting async refresh.
		return boolToPortStatus(open), open, checkedAt, true
	}
	return PortUnknown, false, checkedAt, true
}

func boolToPortStatus(open bool) PortStatus {
	if open {
		return PortOpen
	}
	return PortClosed
}

// ScheduleBatch enqueues ports for asynchronous background probing with bounded workers.
func (p *portProber) ScheduleBatch(ports []int) {
	if len(ports) == 0 {
		return
	}
	p.mu.Lock()
	for _, port := range ports {
		if port <= 0 {
			continue
		}
		p.enqueueLocked(port, false)
	}
	p.mu.Unlock()
}

// ProbeBatch probes all ports in the slice concurrently (bounded by maxWorkers) unless freshly cached.
func (p *portProber) ProbeBatch(ports []int) {
	if len(ports) == 0 {
		return
	}
	now := time.Now()
	var waitChs []chan struct{}

	p.mu.Lock()
	for _, port := range ports {
		if port <= 0 {
			continue
		}
		e, ok := p.entries[port]
		if ok && e.hasValue && now.Sub(e.checkedAt) <= p.ttl && !e.inFlight {
			continue
		}
		ch := p.enqueueLocked(port, false)
		if ch != nil {
			waitChs = append(waitChs, ch)
		}
	}
	p.mu.Unlock()

	for _, ch := range waitChs {
		<-ch
	}
}

// ProbeFresh performs or joins an active fresh TCP probe for the given port and caches the result.
func (p *portProber) ProbeFresh(port int) bool {
	if port <= 0 {
		return false
	}
	p.mu.Lock()
	ch := p.enqueueLocked(port, true)
	p.mu.Unlock()
	if ch != nil {
		<-ch
	}
	p.mu.Lock()
	e := p.entries[port]
	open := e != nil && e.hasValue && e.open
	p.mu.Unlock()
	return open
}

func (p *portProber) enqueueLocked(port int, force bool) chan struct{} {
	e, ok := p.entries[port]
	if !ok {
		e = &portCacheEntry{}
		p.entries[port] = e
	}
	if e.inFlight {
		return e.done
	}
	if !force && e.hasValue && time.Since(e.checkedAt) <= p.ttl {
		return nil
	}
	e.inFlight = true
	e.done = make(chan struct{})
	p.queue = append(p.queue, port)
	if p.activeWorkers < p.maxWorkers {
		p.activeWorkers++
		go p.worker()
	}
	return e.done
}

func (p *portProber) worker() {
	for {
		p.mu.Lock()
		if len(p.queue) == 0 {
			p.activeWorkers--
			p.mu.Unlock()
			return
		}
		port := p.queue[0]
		p.queue[0] = 0
		p.queue = p.queue[1:]
		e := p.entries[port]
		gen := uint64(0)
		done := chan struct{}(nil)
		if e != nil {
			gen = e.gen
			done = e.done
		}
		dialFn := p.dialFn
		timeout := p.timeout
		p.mu.Unlock()

		open := dialFn(port, timeout)
		checkedAt := time.Now()

		p.mu.Lock()
		cur := p.entries[port]
		if cur != nil && cur.gen == gen {
			cur.open = open
			cur.hasValue = true
			cur.checkedAt = checkedAt
			cur.inFlight = false
			if cur.done == done && done != nil {
				close(done)
				cur.done = nil
			}
		} else if done != nil {
			// Invalidated while probing; unblock any waiters on this obsolete generation.
			select {
			case <-done:
			default:
				close(done)
			}
		}
		p.mu.Unlock()
	}
}

// Invalidate clears cached probe state for a port and advances its generation counter
// so any older in-flight probe cannot write stale state back.
func (p *portProber) Invalidate(port int) {
	if port <= 0 {
		return
	}
	p.mu.Lock()
	e, ok := p.entries[port]
	if ok {
		e.gen++
		e.hasValue = false
		e.open = false
		e.checkedAt = time.Time{}
		if e.inFlight && e.done != nil {
			close(e.done)
			e.done = nil
		}
		e.inFlight = false
	}
	p.mu.Unlock()
}

// Mark records an explicit authoritative port observation (e.g. right after StartAndWait succeeds).
func (p *portProber) Mark(port int, open bool) {
	if port <= 0 {
		return
	}
	p.mu.Lock()
	e, ok := p.entries[port]
	if !ok {
		e = &portCacheEntry{}
		p.entries[port] = e
	}
	e.gen++
	e.open = open
	e.hasValue = true
	e.checkedAt = time.Now()
	if e.inFlight && e.done != nil {
		close(e.done)
		e.done = nil
	}
	e.inFlight = false
	p.mu.Unlock()
}

