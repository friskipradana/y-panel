package notify

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

func newClockedDetector(cfg DetectorConfig) (*Detector, *clock) {
	c := &clock{t: time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)}
	d := NewDetector(cfg)
	d.now = c.now
	return d, c
}

var loginCfg = DetectorConfig{Event: EventLoginFailed, Levels: []int{3, 10, 30}, WindowSec: 600, CooldownSec: 900, QuietSec: 600}

func TestOneOrTwoFailuresNeverSpeak(t *testing.T) {
	d, _ := newClockedDetector(loginCfg)
	for i := 0; i < 2; i++ {
		if a := d.Record("budi", "1.1.1.1"); a != nil {
			t.Fatalf("failure %d must only be counted, got %+v", i+1, a)
		}
	}
}

func TestThirdFailureSpeaksOnceAndThenStaysQuiet(t *testing.T) {
	d, clk := newClockedDetector(loginCfg)
	var alerts []*Alert
	for i := 0; i < 9; i++ {
		if a := d.Record("budi", fmt.Sprintf("1.1.1.%d", i%3)); a != nil {
			alerts = append(alerts, a)
		}
		clk.advance(5 * time.Second)
	}
	if len(alerts) != 1 {
		t.Fatalf("nine failures cross the first level once, got %d alerts", len(alerts))
	}
	a := alerts[0]
	if a.Variant != "first" || a.Level != 1 || a.Total != 3 || a.Distinct != 3 || a.Event != EventLoginFailed || a.Scope != "budi" {
		t.Fatalf("the first alert says what happened: %+v", a)
	}
}

func TestAlertEscalatesWhenTheLevelRisesAndNotBefore(t *testing.T) {
	d, clk := newClockedDetector(loginCfg)
	var variants []string
	for i := 0; i < 31; i++ {
		if a := d.Record("budi", "9.9.9.9"); a != nil {
			variants = append(variants, fmt.Sprintf("%s:%d", a.Variant, a.Level))
		}
		clk.advance(time.Second)
	}
	want := []string{"first:1", "escalated:2", "escalated:3"}
	if fmt.Sprint(variants) != fmt.Sprint(want) {
		t.Fatalf("one message per level, got %v want %v", variants, want)
	}
}

func TestOngoingMessageAfterTheCooldownOnlyWhileItContinues(t *testing.T) {
	cfg := DetectorConfig{Event: EventLoginFailed, Levels: []int{3}, WindowSec: 600, CooldownSec: 900, QuietSec: 600}
	d, clk := newClockedDetector(cfg)
	var variants []string
	var since int
	// failures keep coming, one every 30 seconds, for 20 minutes
	for i := 0; i < 40; i++ {
		if a := d.Record("budi", "1.1.1.1"); a != nil {
			variants = append(variants, a.Variant)
			since = a.Since
		}
		clk.advance(30 * time.Second)
	}
	if fmt.Sprint(variants) != "[first ongoing]" {
		t.Fatalf("one message when it starts, one more after the cooldown while it goes on, got %v", variants)
	}
	if since < 25 {
		t.Fatalf("the ongoing message counts what came since the last one, got %d", since)
	}

	// trouble that stopped does not produce an ongoing message
	d2, clk2 := newClockedDetector(cfg)
	for i := 0; i < 3; i++ {
		d2.Record("budi", "1.1.1.1")
	}
	clk2.advance(20 * time.Minute)
	if a := d2.Record("budi", "1.1.1.1"); a != nil {
		t.Fatalf("a single failure long after is only counted, got %+v", a)
	}
}

func TestQuietEndsTheAlertAndRecoveryIsOptional(t *testing.T) {
	cfg := DetectorConfig{Event: EventRequestFlood, Levels: []int{5}, WindowSec: 60, CooldownSec: 900, QuietSec: 600, Recovery: true}
	d, clk := newClockedDetector(cfg)
	for i := 0; i < 8; i++ {
		d.Record("*", fmt.Sprintf("2.2.2.%d", i))
		clk.advance(2 * time.Second)
	}
	if len(d.Sweep()) != 0 {
		t.Fatal("an alert that is still fresh does not end")
	}
	clk.advance(11 * time.Minute)
	ended := d.Sweep()
	if len(ended) != 1 || ended[0].Variant != "ended" || ended[0].Total != 8 {
		t.Fatalf("after the quiet time one message says it is over, with the total: %+v", ended)
	}
	if d.Len() != 0 {
		t.Fatal("an ended alert is forgotten")
	}
	// the next burst is a new alert
	for i := 0; i < 5; i++ {
		d.Record("*", "3.3.3.3")
	}
	if a := d.Record("*", "3.3.3.3"); a != nil {
		t.Fatalf("the fifth event of the new burst spoke already above: %+v", a)
	}

	// without recovery the end is silent
	cfg.Recovery = false
	d2, clk2 := newClockedDetector(cfg)
	for i := 0; i < 5; i++ {
		d2.Record("*", "4.4.4.4")
	}
	clk2.advance(11 * time.Minute)
	if got := d2.Sweep(); len(got) != 0 {
		t.Fatalf("an alert without recovery ends silently, got %+v", got)
	}
}

func TestDistinctSubjectsAreWhatCountsForAScan(t *testing.T) {
	cfg := DetectorConfig{Event: EventAccountScan, Levels: []int{10}, WindowSec: 600, CooldownSec: 900, QuietSec: 600, CountDistinct: true}
	d, _ := newClockedDetector(cfg)
	// a hundred tries of one name from one address is not a scan
	for i := 0; i < 100; i++ {
		if a := d.Record("5.5.5.5", "budi"); a != nil {
			t.Fatalf("the same name again and again is not a scan: %+v", a)
		}
	}
	var fired *Alert
	for i := 0; i < 12; i++ {
		if a := d.Record("6.6.6.6", fmt.Sprintf("user%d", i)); a != nil {
			fired = a
		}
	}
	if fired == nil || fired.Total != 10 || fired.Scope != "6.6.6.6" {
		t.Fatalf("ten different names make a scan: %+v", fired)
	}
}

func TestADistributedFloodNeedsManySources(t *testing.T) {
	cfg := DetectorConfig{Event: EventLoginFlood, Levels: []int{30}, WindowSec: 300, CooldownSec: 900, QuietSec: 600, MinDistinct: 5}
	d, _ := newClockedDetector(cfg)
	for i := 0; i < 100; i++ {
		if a := d.Record("*", "7.7.7.7"); a != nil {
			t.Fatalf("a hundred failures from one address are not distributed: %+v", a)
		}
	}
	var fired *Alert
	for i := 0; i < 6; i++ {
		if a := d.Record("*", fmt.Sprintf("8.8.8.%d", i)); a != nil {
			fired = a
		}
	}
	if fired == nil || fired.Distinct < 5 {
		t.Fatalf("with enough different sources the flood speaks: %+v", fired)
	}
}

func TestCountsOutsideTheWindowAreForgotten(t *testing.T) {
	d, clk := newClockedDetector(loginCfg)
	d.Record("budi", "1.1.1.1")
	d.Record("budi", "1.1.1.1")
	clk.advance(11 * time.Minute)
	if a := d.Record("budi", "1.1.1.1"); a != nil {
		t.Fatalf("two old failures and a new one are not three in ten minutes: %+v", a)
	}
}

// A burst from many goroutines crosses the threshold exactly once: only one of them sees the change.
func TestABurstCrossesTheThresholdExactlyOnce(t *testing.T) {
	d := NewDetector(DetectorConfig{Event: EventLoginFailed, Levels: []int{3}, WindowSec: 600, CooldownSec: 900, QuietSec: 600})
	var fired atomic.Int64
	var wg sync.WaitGroup
	for g := 0; g < 50; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < 20; i++ {
				if d.Record("budi", fmt.Sprintf("10.0.%d.%d", g, i)) != nil {
					fired.Add(1)
				}
			}
		}(g)
	}
	wg.Wait()
	if fired.Load() != 1 {
		t.Fatalf("1000 failures at once must speak exactly once, spoke %d times", fired.Load())
	}
}

func TestMemoryStaysBoundedUnderManyScopes(t *testing.T) {
	d := NewDetector(loginCfg)
	d.maxKeys = 100
	for i := 0; i < 5000; i++ {
		d.Record(fmt.Sprintf("name%d", i), "1.1.1.1")
	}
	if d.Len() > 100 {
		t.Fatalf("the number of counted scopes is capped at 100, got %d", d.Len())
	}
}

func TestAScopeInAnAlertIsNotEvictedByNoise(t *testing.T) {
	d, _ := newClockedDetector(loginCfg)
	d.maxKeys = 50
	for i := 0; i < 3; i++ {
		d.Record("victim", "1.1.1.1")
	}
	for i := 0; i < 2000; i++ {
		d.Record(fmt.Sprintf("noise%d", i), "2.2.2.2")
	}
	d.mu.Lock()
	_, kept := d.entries["victim"]
	d.mu.Unlock()
	if !kept {
		t.Fatal("an alert in progress must survive a flood of other names")
	}
}

func TestDetectorSettingsAreValidatedAndOnlyChangesAreKept(t *testing.T) {
	bad := DefaultDetectors()[EventLoginFailed]
	bad.Levels = []int{10, 5}
	if ValidateDetector(bad) == nil {
		t.Fatal("levels must rise")
	}
	bad.Levels, bad.WindowSec = []int{3}, 5
	if ValidateDetector(bad) == nil {
		t.Fatal("a window under a minute is refused")
	}
	all := DefaultDetectors()
	encoded, err := EncodeDetectors(all)
	if err != nil || encoded != "" {
		t.Fatalf("defaults alone store nothing, got %q %v", encoded, err)
	}
	changed := all[EventRequestFlood]
	changed.Levels = []int{50, 200}
	all[EventRequestFlood] = changed
	encoded, err = EncodeDetectors(all)
	if err != nil || encoded == "" {
		t.Fatalf("a changed detector is stored: %q %v", encoded, err)
	}
}
