package httpserver

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
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
	// the gaps are read when the worker starts, so they are set before the fixture makes it
	t.Cleanup(notify.SetWhatsAppGaps(time.Millisecond, time.Millisecond))
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

func TestIntegrationNoticesGoToTheNumberTheAccountChoosesNotTheSessionItself(t *testing.T) {
	f, stub, user, _ := scanFixture(t)
	f.connectPhone(t, stub, user, "628111111111")
	if body := f.waState(user); !strings.Contains(body, `"destinationIsSession":true`) {
		t.Fatalf("by default the notices go to the session's own number: %s", body)
	}

	// another number is chosen: the session only sends
	setDest := func(number string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]string{"number": number})
		return f.call(f.s.handleSetWhatsAppDestination, "PUT", "/", string(body), user)
	}
	if rec := setDest("0812 9999 0000"); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"destinationIsSession":false`) {
		t.Fatalf("choose a destination: %d %s", rec.Code, rec.Body.String())
	}
	rec, _ := f.db.GetNotifyRecipient(user.ID, "waha")
	if rec.Address != "6281299990000" {
		t.Fatalf("the destination is kept normalised: %s", rec.Address)
	}
	// the page asking again, and the session being read again, do not put the session's number back
	for i := 0; i < 3; i++ {
		f.waState(user)
	}
	if rec, _ = f.db.GetNotifyRecipient(user.ID, "waha"); rec.Address != "6281299990000" {
		t.Fatalf("a chosen number stays chosen: %s", rec.Address)
	}

	// what is sent goes from the session to the chosen number, and nothing goes to the session's own chat
	if r := f.call(f.s.handleTestWhatsApp, "POST", "/", "", user); r.Code != 202 {
		t.Fatalf("test: %d %s", r.Code, r.Body.String())
	}
	f.s.emitPasswordChanged(user, "")
	eventually(t, "both messages at the chosen number", func() bool { return len(stub.textsTo("6281299990000@c.us")) >= 2 })
	if len(stub.textsTo("628111111111@c.us")) != 0 {
		t.Fatal("nothing is sent to the number of the session itself")
	}
	stub.mu.Lock()
	for _, m := range stub.sent {
		if m.session != "user-andi" {
			t.Fatalf("it is sent from the session of the account: %s", m.session)
		}
	}
	stub.mu.Unlock()

	// another phone is scanned later: the chosen number still stands
	stub.scanned("user-andi", "628333333333")
	f.waState(user)
	if rec, _ = f.db.GetNotifyRecipient(user.ID, "waha"); rec.Address != "6281299990000" {
		t.Fatalf("a new phone does not take the chosen number's place: %s", rec.Address)
	}

	// back to the session's number: it then follows the session, also when another phone is connected
	if r := setDest(""); r.Code != 200 || !strings.Contains(r.Body.String(), `"destinationIsSession":true`) {
		t.Fatalf("back to the session: %d %s", r.Code, r.Body.String())
	}
	if rec, _ = f.db.GetNotifyRecipient(user.ID, "waha"); rec.Address != "628333333333" {
		t.Fatalf("the session's number: %s", rec.Address)
	}
	stub.scanned("user-andi", "628444444444")
	f.waState(user)
	if rec, _ = f.db.GetNotifyRecipient(user.ID, "waha"); rec.Address != "628444444444" {
		t.Fatalf("by default it follows the session: %s", rec.Address)
	}

	// a number that cannot be one is refused, and an account with no session cannot choose
	for _, bad := range []string{"abc", "123", "0712345678"} {
		if r := setDest(bad); r.Code != 400 {
			t.Fatalf("%q: %d", bad, r.Code)
		}
	}
	other, _ := f.db.CreateUser("budi", "budi@example.com", "hash", auth.UserRole, "Budi")
	body, _ := json.Marshal(map[string]string{"number": "0812 5555 6666"})
	if r := f.call(f.s.handleSetWhatsAppDestination, "PUT", "/", string(body), other); r.Code != 400 || !strings.Contains(r.Body.String(), "connect WhatsApp first") {
		t.Fatalf("no session, no destination: %d %s", r.Code, r.Body.String())
	}
}
