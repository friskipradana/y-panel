package notify

import (
	"sort"
	"sync"
	"time"
)

// A detector counts the same kind of event in a window of time and says when to speak: never for one failure, once
// when a threshold is crossed, again only when the level rises or the cooldown passes with the trouble still going,
// and once more when it has been quiet. It counts in memory, because a request that is refused and then writes to the
// database would make an attack worse; only the alerts that are sent reach the database.

// DetectorConfig is what a detector counts and when it speaks
type DetectorConfig struct {
	Event string `json:"event"`
	// Levels are the counts that make a warning, a high and a critical alert, in rising order
	Levels      []int `json:"levels"`
	WindowSec   int   `json:"windowSec"`
	CooldownSec int   `json:"cooldownSec"`
	// QuietSec of no events ends an alert
	QuietSec int `json:"quietSec"`
	// CountDistinct counts different subjects (usernames tried from one address) instead of events
	CountDistinct bool `json:"countDistinct"`
	// MinDistinct is how many different subjects an alert needs (many failures from one address are not a distributed attack)
	MinDistinct int `json:"minDistinct"`
	// Recovery sends a message when the trouble is over
	Recovery bool `json:"recovery"`
}

// Alert is the decision to send a message about a scope (an account, an address, the whole panel)
type Alert struct {
	Event string
	Scope string
	Level int
	// Variant is first, escalated, ongoing or ended
	Variant  string
	Total    int
	Distinct int
	// Since is the events counted since the last message
	Since    int
	Samples  []string
	Window   time.Duration
	Duration time.Duration
}

const (
	maxSubjects = 200
	maxSamples  = 5
)

type entry struct {
	buckets    map[int64]int
	subjects   map[string]int64
	recent     []string
	lastEvent  time.Time
	started    time.Time
	sinceStart int
	active     bool
	level      int
	lastSent   time.Time
	countSince int
}

// Detector holds the counts of one kind of event, per scope. It is safe for many goroutines at once: the decision to
// speak is taken under the lock, so a burst of events crosses a threshold exactly once.
type Detector struct {
	mu      sync.Mutex
	cfg     DetectorConfig
	entries map[string]*entry
	maxKeys int
	now     func() time.Time
}

func NewDetector(cfg DetectorConfig) *Detector {
	return &Detector{cfg: cfg, entries: map[string]*entry{}, maxKeys: 10000, now: time.Now}
}

func (d *Detector) SetConfig(cfg DetectorConfig) {
	d.mu.Lock()
	d.cfg = cfg
	d.mu.Unlock()
}

func (d *Detector) Config() DetectorConfig {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.cfg
}

// Len is how many scopes are being counted
func (d *Detector) Len() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	return len(d.entries)
}

func windowMinutes(sec int) int64 {
	m := int64((sec + 59) / 60)
	if m < 1 {
		m = 1
	}
	return m
}

// Record counts one event for a scope (and a subject, such as the address it came from). It returns an alert when the
// event makes it time to speak, and nil otherwise, which is almost always.
func (d *Detector) Record(scope, subject string) *Alert {
	now := d.now()
	minute := now.Unix() / 60

	d.mu.Lock()
	defer d.mu.Unlock()
	cfg := d.cfg
	win := windowMinutes(cfg.WindowSec)

	e := d.entries[scope]
	if e == nil {
		if len(d.entries) >= d.maxKeys {
			d.evictLocked()
			if len(d.entries) >= d.maxKeys {
				// every scope is in the middle of an alert: not counting a new one is better than growing without end
				return nil
			}
		}
		e = &entry{buckets: map[int64]int{}, subjects: map[string]int64{}, started: now}
		d.entries[scope] = e
	}
	e.lastEvent = now
	e.sinceStart++
	e.buckets[minute]++
	for m := range e.buckets {
		if m <= minute-win {
			delete(e.buckets, m)
		}
	}
	if subject != "" {
		if _, known := e.subjects[subject]; known || len(e.subjects) < maxSubjects {
			if !known {
				e.recent = append(e.recent, subject)
				if len(e.recent) > maxSamples {
					e.recent = e.recent[len(e.recent)-maxSamples:]
				}
			}
			e.subjects[subject] = minute
		}
	}

	total, distinct := 0, 0
	for _, n := range e.buckets {
		total += n
	}
	for s, m := range e.subjects {
		if m <= minute-win {
			delete(e.subjects, s)
			continue
		}
		distinct++
	}
	value := total
	if cfg.CountDistinct {
		value = distinct
	}
	level := 0
	if cfg.MinDistinct == 0 || distinct >= cfg.MinDistinct {
		for i, threshold := range cfg.Levels {
			if value >= threshold {
				level = i + 1
			}
		}
	}

	alert := func(variant string) *Alert {
		since := e.countSince
		e.countSince = 0
		e.lastSent = now
		return &Alert{
			Event: cfg.Event, Scope: scope, Level: level, Variant: variant, Total: value, Distinct: distinct, Since: since,
			Samples: append([]string(nil), e.recent...), Window: time.Duration(win) * time.Minute,
		}
	}

	if level == 0 {
		if e.active {
			e.countSince++
		}
		return nil
	}
	if !e.active {
		e.active, e.level, e.started = true, level, now
		e.countSince = 0
		return alert("first")
	}
	e.countSince++
	if level > e.level {
		e.level = level
		return alert("escalated")
	}
	if now.Sub(e.lastSent) >= time.Duration(cfg.CooldownSec)*time.Second && e.countSince > 0 {
		return alert("ongoing")
	}
	return nil
}

// Sweep ends the alerts that have been quiet for long enough (returning a message for the ones that want one) and
// forgets scopes that went idle
func (d *Detector) Sweep() []*Alert {
	now := d.now()
	d.mu.Lock()
	defer d.mu.Unlock()
	cfg := d.cfg
	quiet := time.Duration(cfg.QuietSec) * time.Second
	idle := time.Duration(windowMinutes(cfg.WindowSec)) * time.Minute * 2
	var ended []*Alert
	for scope, e := range d.entries {
		switch {
		case e.active && now.Sub(e.lastEvent) >= quiet:
			if cfg.Recovery {
				ended = append(ended, &Alert{
					Event: cfg.Event, Scope: scope, Level: e.level, Variant: "ended", Total: e.sinceStart,
					Samples: append([]string(nil), e.recent...), Duration: e.lastEvent.Sub(e.started),
				})
			}
			delete(d.entries, scope)
		case !e.active && now.Sub(e.lastEvent) > idle:
			delete(d.entries, scope)
		}
	}
	return ended
}

// evictLocked drops the oldest tenth of the scopes that are not in an alert
func (d *Detector) evictLocked() {
	type aged struct {
		scope string
		at    time.Time
	}
	var idle []aged
	for scope, e := range d.entries {
		if !e.active {
			idle = append(idle, aged{scope, e.lastEvent})
		}
	}
	if len(idle) == 0 {
		return
	}
	sort.Slice(idle, func(i, j int) bool { return idle[i].at.Before(idle[j].at) })
	n := len(d.entries) / 10
	if n < 1 {
		n = 1
	}
	if n > len(idle) {
		n = len(idle)
	}
	for _, a := range idle[:n] {
		delete(d.entries, a.scope)
	}
}
