package httpserver

import (
	"testing"
	"time"
)

func TestShouldLogDriftOncePerWindow(t *testing.T) {
	driftLoggedMu.Lock()
	driftLogged = map[string]time.Time{}
	driftLoggedMu.Unlock()

	now := time.Now()
	if !shouldLogDrift(1, "expected_active_but_not_running", now) {
		t.Fatal("the first sight of a drift must be logged")
	}
	if shouldLogDrift(1, "expected_active_but_not_running", now.Add(driftLogEvery-time.Second)) {
		t.Fatal("the same drift inside the window must stay quiet")
	}
	if !shouldLogDrift(1, "expected_stopped_but_running", now) {
		t.Fatal("another reason is a new drift")
	}
	if !shouldLogDrift(2, "expected_active_but_not_running", now) {
		t.Fatal("another project is a new drift")
	}
	if !shouldLogDrift(1, "expected_active_but_not_running", now.Add(driftLogEvery+time.Second)) {
		t.Fatal("after the window the drift is told again")
	}
}
