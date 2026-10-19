package httpserver

import (
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// A session that waits for a scan has limits, and the account can always start it over.
// Skipped without REN_TEST_DATABASE_URL.

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	c.mu.Unlock()
}

func scanFixture(t *testing.T) (*notifyFixture, *wahaStub, *database.User, *fakeClock) {
	t.Helper()
	f := newNotifyFixture(t)
	stub := withWaha(t, f)
	clock := &fakeClock{now: time.Now()}
	f.s.notify.SetClock(clock.Now)
	user, _ := f.db.CreateUser("andi", "andi@example.com", "hash", auth.UserRole, "Andi")
	return f, stub, user, clock
}

func (f *notifyFixture) waState(user *database.User) string {
	return f.call(f.s.handleMyWhatsApp, "GET", "/", "", user).Body.String()
}

func TestIntegrationAWaitForAScanEndsAfterFiveMinutes(t *testing.T) {
	f, stub, user, clock := scanFixture(t)
	if rec := f.call(f.s.handleConnectWhatsApp, "POST", "/", "", user); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"SCAN_QR_CODE"`) {
		t.Fatalf("connect: %d %s", rec.Code, rec.Body.String())
	}
	// four minutes in, the code is still there
	clock.Advance(4 * time.Minute)
	if body := f.waState(user); !strings.Contains(body, `"status":"SCAN_QR_CODE"`) {
		t.Fatalf("still waiting after four minutes: %s", body)
	}
	if rec := f.call(f.s.handleWhatsAppQR, "GET", "/", "", user); rec.Code != 200 {
		t.Fatalf("the code is given: %d", rec.Code)
	}
	// past five minutes the wait ends: WAHA is told to stop making codes, and the code is refused
	clock.Advance(2 * time.Minute)
	if body := f.waState(user); !strings.Contains(body, `"status":"EXPIRED"`) || strings.Contains(body, `"connected":true`) {
		t.Fatalf("the wait ended: %s", body)
	}
	stub.mu.Lock()
	if st := stub.sessions["user-andi"].status; st != "STOPPED" {
		t.Fatalf("WAHA stops the session, got %s", st)
	}
	stub.mu.Unlock()
	if rec := f.call(f.s.handleWhatsAppQR, "GET", "/", "", user); rec.Code != 409 || !strings.Contains(rec.Body.String(), "expired") {
		t.Fatalf("no code for a wait that ended: %d %s", rec.Code, rec.Body.String())
	}
	// it stays ended on the next look, whatever WAHA says about a stopped session
	if body := f.waState(user); !strings.Contains(body, `"status":"EXPIRED"`) {
		t.Fatalf("an end stays an end: %s", body)
	}

	// the account starts it over: a new session, a new key, a new wait
	stub.mu.Lock()
	made := stub.madeKeys
	stub.mu.Unlock()
	rec := f.call(f.s.handleRestartWhatsApp, "POST", "/", "", user)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"SCAN_QR_CODE"`) {
		t.Fatalf("restart: %d %s", rec.Code, rec.Body.String())
	}
	stub.mu.Lock()
	if stub.madeKeys != made+1 || len(stub.sessions) != 1 || len(stub.keys) != 1 {
		t.Fatalf("one session and one key, the key new: keys made %d then %d, %d sessions, %d keys", made, stub.madeKeys, len(stub.sessions), len(stub.keys))
	}
	stub.mu.Unlock()
	if rec := f.call(f.s.handleWhatsAppQR, "GET", "/", "", user); rec.Code != 200 {
		t.Fatalf("a new code after the restart: %d %s", rec.Code, rec.Body.String())
	}
	// and the clock of the wait began again
	clock.Advance(4 * time.Minute)
	if body := f.waState(user); !strings.Contains(body, `"status":"SCAN_QR_CODE"`) {
		t.Fatalf("the new wait has its own five minutes: %s", body)
	}
}

func TestIntegrationAWaitForAScanEndsAfterThreeNewCodes(t *testing.T) {
	f, stub, user, _ := scanFixture(t)
	f.call(f.s.handleConnectWhatsApp, "POST", "/", "", user)
	stub.mu.Lock()
	stub.qrVaries = true
	stub.mu.Unlock()
	// the first code, then three that replace it: the third replacement ends the wait
	for i, want := range []int{200, 200, 200, 409} {
		rec := f.call(f.s.handleWhatsAppQR, "GET", "/", "", user)
		if rec.Code != want {
			t.Fatalf("code %d: want %d got %d %s", i+1, want, rec.Code, rec.Body.String())
		}
	}
	if body := f.waState(user); !strings.Contains(body, `"status":"EXPIRED"`) {
		t.Fatalf("three new codes ended the wait: %s", body)
	}
	stub.mu.Lock()
	if stub.sessions["user-andi"].status != "STOPPED" {
		t.Fatal("WAHA stopped the session")
	}
	stub.mu.Unlock()

	// the same code asked for again is not a new code
	f.call(f.s.handleRestartWhatsApp, "POST", "/", "", user)
	stub.mu.Lock()
	stub.qrVaries = false
	stub.mu.Unlock()
	for i := 0; i < 6; i++ {
		if rec := f.call(f.s.handleWhatsAppQR, "GET", "/", "", user); rec.Code != 200 {
			t.Fatalf("the same code is not a change: %d", rec.Code)
		}
	}
}

func TestIntegrationAFailedSessionCanBeRestarted(t *testing.T) {
	f, stub, user, _ := scanFixture(t)
	f.call(f.s.handleConnectWhatsApp, "POST", "/", "", user)
	stub.mu.Lock()
	stub.sessions["user-andi"].status = "FAILED"
	stub.mu.Unlock()
	if body := f.waState(user); !strings.Contains(body, `"status":"FAILED"`) {
		t.Fatalf("failed is shown as failed: %s", body)
	}
	rec := f.call(f.s.handleRestartWhatsApp, "POST", "/", "", user)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"SCAN_QR_CODE"`) {
		t.Fatalf("a failed session is made again: %d %s", rec.Code, rec.Body.String())
	}
	// an account that never connected has nothing to restart
	other, _ := f.db.CreateUser("budi", "budi@example.com", "hash", auth.UserRole, "Budi")
	if rec := f.call(f.s.handleRestartWhatsApp, "POST", "/", "", other); rec.Code != 409 {
		t.Fatalf("nothing to restart: %d", rec.Code)
	}
	// and the demo account cannot
	demo := &database.User{ID: 999999, Username: "demo", Role: auth.UserRole}
	if rec := f.call(f.s.handleRestartWhatsApp, "POST", "/", "", demo); rec.Code == 200 {
		t.Fatalf("not for the demo: %d", rec.Code)
	}
}

func TestIntegrationARunningSessionRestartsWithoutLosingItsPhone(t *testing.T) {
	f, stub, user, _ := scanFixture(t)
	f.connectPhone(t, stub, user, "628111111111")
	stub.mu.Lock()
	made := stub.madeKeys
	stub.mu.Unlock()
	rec := f.call(f.s.handleRestartWhatsApp, "POST", "/", "", user)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"connected":true`) || !strings.Contains(rec.Body.String(), `"status":"WORKING"`) {
		t.Fatalf("a working session stays connected: %d %s", rec.Code, rec.Body.String())
	}
	stub.mu.Lock()
	if stub.madeKeys != made || len(stub.sessions) != 1 || stub.sessions["user-andi"].me == "" {
		t.Fatalf("the same session, the same key, the phone still linked: %d keys, %+v", stub.madeKeys, stub.sessions["user-andi"])
	}
	stub.mu.Unlock()
	// a scan that finished ends the wait: a working session is never expired
	if body := f.waState(user); strings.Contains(body, "EXPIRED") {
		t.Fatalf("a working session does not expire: %s", body)
	}
}
