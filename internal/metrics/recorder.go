// Package metrics keeps a rolling in-memory history of host metrics so graphs
// survive browser reloads and keep filling while no UI is open.
package metrics

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	SampleInterval = 5 * time.Second
	Retention      = time.Hour
	maxPoints      = int(Retention/SampleInterval) + 12
	persistEvery   = time.Minute
	fileName       = "metrics-history.json"
)

type Point struct {
	T int64   `json:"t"`
	V float64 `json:"v"`
}

// SampleFunc returns the current values by series key. Rate series (bytes/s) are
// derived by the recorder from the counters passed through Counters.
type SampleFunc func() (values map[string]float64, counters map[string]uint64)

type Recorder struct {
	mu       sync.RWMutex
	series   map[string][]Point
	lastCnt  map[string]uint64
	lastAt   time.Time
	path     string
	sample   SampleFunc
	stop     chan struct{}
	done     chan struct{}
	stopOnce sync.Once
}

func New(stateDir string, sample SampleFunc) *Recorder {
	r := &Recorder{
		series:  map[string][]Point{},
		lastCnt: map[string]uint64{},
		sample:  sample,
		stop:    make(chan struct{}),
		done:    make(chan struct{}),
	}
	if stateDir != "" {
		r.path = filepath.Join(stateDir, fileName)
		r.load()
	}
	return r
}

func (r *Recorder) load() {
	data, err := os.ReadFile(r.path)
	if err != nil {
		return
	}
	var stored map[string][]Point
	if json.Unmarshal(data, &stored) != nil {
		return
	}
	cutoff := time.Now().Add(-Retention).UnixMilli()
	for key, points := range stored {
		kept := points[:0]
		for _, p := range points {
			if p.T >= cutoff {
				kept = append(kept, p)
			}
		}
		if len(kept) > 0 {
			r.series[key] = kept
		}
	}
}

func (r *Recorder) persist() {
	if r.path == "" {
		return
	}
	r.mu.RLock()
	data, err := json.Marshal(r.series)
	r.mu.RUnlock()
	if err != nil {
		return
	}
	tmp := r.path + ".tmp"
	if os.WriteFile(tmp, data, 0o600) == nil {
		_ = os.Rename(tmp, r.path)
	}
}

// Record stores one observation. Counter keys are converted to per-second rates.
func (r *Recorder) Record(values map[string]float64, counters map[string]uint64, at time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()

	ms := at.UnixMilli()
	add := func(key string, v float64) {
		pts := r.series[key]
		if n := len(pts); n > 0 && pts[n-1].T >= ms {
			return
		}
		pts = append(pts, Point{T: ms, V: v})
		cutoff := at.Add(-Retention).UnixMilli()
		start := 0
		for start < len(pts) && pts[start].T < cutoff {
			start++
		}
		if over := len(pts) - start - maxPoints; over > 0 {
			start += over
		}
		if start > 0 {
			pts = append([]Point(nil), pts[start:]...)
		}
		r.series[key] = pts
	}

	for key, v := range values {
		add(key, v)
	}
	if !r.lastAt.IsZero() {
		elapsed := at.Sub(r.lastAt).Seconds()
		if elapsed > 0.5 {
			for key, cur := range counters {
				prev, ok := r.lastCnt[key]
				if ok && cur >= prev {
					add(key, float64(cur-prev)/elapsed)
				}
			}
		}
	}
	for key, cur := range counters {
		r.lastCnt[key] = cur
	}
	r.lastAt = at
}

// Since returns copies of every series restricted to points newer than sinceMs.
func (r *Recorder) Since(sinceMs int64) map[string][]Point {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make(map[string][]Point, len(r.series))
	for key, pts := range r.series {
		i := 0
		for i < len(pts) && pts[i].T <= sinceMs {
			i++
		}
		out[key] = append([]Point(nil), pts[i:]...)
	}
	return out
}

func (r *Recorder) Run() {
	defer close(r.done)
	tick := time.NewTicker(SampleInterval)
	save := time.NewTicker(persistEvery)
	defer tick.Stop()
	defer save.Stop()

	collect := func() {
		if r.sample == nil {
			return
		}
		values, counters := r.sample()
		r.Record(values, counters, time.Now())
	}
	collect()
	for {
		select {
		case <-r.stop:
			r.persist()
			return
		case <-tick.C:
			collect()
		case <-save.C:
			r.persist()
		}
	}
}

func (r *Recorder) Stop() {
	r.stopOnce.Do(func() { close(r.stop) })
	select {
	case <-r.done:
	case <-time.After(2 * time.Second):
		log.Printf("[metrics] recorder did not stop in time")
	}
}
