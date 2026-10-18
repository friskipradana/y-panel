package notify

import (
	"encoding/json"
	"errors"
	"fmt"
)

// The detectors and their defaults (docs/NOTIFIKASI-KANAL.md, section 2.3). The superadmin can change the levels and the
// times; what a detector counts and whether it says when it is over are part of what it is.

// DetectorEvents is the order the detectors are listed in
var DetectorEvents = []string{
	EventLoginFailed, EventLoginLocked, EventAccountScan, EventLoginFlood, EventRequestFlood, EventOrderAbuse, EventWebhookProbe,
}

// DefaultDetectors returns the settings every detector starts with
func DefaultDetectors() map[string]DetectorConfig {
	return map[string]DetectorConfig{
		// failed sign-ins to one account, told to its owner
		EventLoginFailed: {Event: EventLoginFailed, Levels: []int{3, 10, 30}, WindowSec: 600, CooldownSec: 900, QuietSec: 600},
		// the account was locked; told once an hour at most
		EventLoginLocked: {Event: EventLoginLocked, Levels: []int{1}, WindowSec: 600, CooldownSec: 3600, QuietSec: 600},
		// one address trying many usernames
		EventAccountScan: {Event: EventAccountScan, Levels: []int{10, 30, 100}, WindowSec: 600, CooldownSec: 900, QuietSec: 600, CountDistinct: true, Recovery: true},
		// failed sign-ins everywhere from many addresses
		EventLoginFlood: {Event: EventLoginFlood, Levels: []int{30, 100, 300}, WindowSec: 300, CooldownSec: 900, QuietSec: 600, MinDistinct: 5, Recovery: true},
		// requests refused by the rate limit, anywhere on the panel
		EventRequestFlood: {Event: EventRequestFlood, Levels: []int{100, 500, 2000}, WindowSec: 60, CooldownSec: 900, QuietSec: 600, Recovery: true},
		// the order form and the address check refused
		EventOrderAbuse: {Event: EventOrderAbuse, Levels: []int{20, 60, 200}, WindowSec: 600, CooldownSec: 900, QuietSec: 600, Recovery: true},
		// the notification reader called with a wrong key
		EventWebhookProbe: {Event: EventWebhookProbe, Levels: []int{5, 20, 60}, WindowSec: 600, CooldownSec: 900, QuietSec: 600, Recovery: true},
	}
}

// ValidateDetector says whether a changed setting makes sense
func ValidateDetector(cfg DetectorConfig) error {
	if len(cfg.Levels) < 1 || len(cfg.Levels) > 3 {
		return errors.New("a detector has one to three levels")
	}
	prev := 0
	for _, level := range cfg.Levels {
		if level < 1 || level > 1_000_000 {
			return errors.New("a level is between 1 and 1000000")
		}
		if level <= prev {
			return errors.New("the levels rise: each is larger than the one before")
		}
		prev = level
	}
	if cfg.WindowSec < 60 || cfg.WindowSec > 86400 {
		return errors.New("the window is between 1 minute and 1 day")
	}
	if cfg.CooldownSec < 60 || cfg.CooldownSec > 86400 {
		return errors.New("the cooldown is between 1 minute and 1 day")
	}
	if cfg.QuietSec < 60 || cfg.QuietSec > 86400 {
		return errors.New("the quiet time is between 1 minute and 1 day")
	}
	if cfg.MinDistinct < 0 || cfg.MinDistinct > 1000 {
		return errors.New("the number of different sources is between 0 and 1000")
	}
	return nil
}

// MergeDetectors puts the changed settings over the defaults; only what may be changed is taken from them
func MergeDetectors(stored map[string]DetectorConfig) (map[string]DetectorConfig, error) {
	out := DefaultDetectors()
	for event, changed := range stored {
		base, ok := out[event]
		if !ok {
			continue
		}
		base.Levels, base.WindowSec, base.CooldownSec, base.QuietSec, base.MinDistinct = changed.Levels, changed.WindowSec, changed.CooldownSec, changed.QuietSec, changed.MinDistinct
		if err := ValidateDetector(base); err != nil {
			return nil, fmt.Errorf("%s: %w", event, err)
		}
		out[event] = base
	}
	return out, nil
}

// EncodeDetectors keeps only what differs from the defaults, so a later change of a default reaches whoever did not touch it
func EncodeDetectors(cfgs map[string]DetectorConfig) (string, error) {
	defaults := DefaultDetectors()
	changed := map[string]DetectorConfig{}
	for event, cfg := range cfgs {
		base, ok := defaults[event]
		if !ok {
			return "", fmt.Errorf("%s is not a detector", event)
		}
		cfg.CountDistinct, cfg.Recovery, cfg.Event = base.CountDistinct, base.Recovery, base.Event
		if err := ValidateDetector(cfg); err != nil {
			return "", fmt.Errorf("%s: %w", event, err)
		}
		if !sameConfig(base, cfg) {
			changed[event] = cfg
		}
	}
	if len(changed) == 0 {
		return "", nil
	}
	raw, err := json.Marshal(changed)
	return string(raw), err
}

func sameConfig(a, b DetectorConfig) bool {
	if len(a.Levels) != len(b.Levels) {
		return false
	}
	for i := range a.Levels {
		if a.Levels[i] != b.Levels[i] {
			return false
		}
	}
	return a.WindowSec == b.WindowSec && a.CooldownSec == b.CooldownSec && a.QuietSec == b.QuietSec && a.MinDistinct == b.MinDistinct
}

// SortedDetectors lists the settings in the order of DetectorEvents
func SortedDetectors(cfgs map[string]DetectorConfig) []DetectorConfig {
	out := make([]DetectorConfig, 0, len(cfgs))
	for _, event := range DetectorEvents {
		if cfg, ok := cfgs[event]; ok {
			out = append(out, cfg)
		}
	}
	return out
}
