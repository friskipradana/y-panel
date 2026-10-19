package httpserver

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// WhatsApp through WAHA, from the handlers down to a WAHA that is faked and a docker that is not run.
// Skipped without REN_TEST_DATABASE_URL.

type wahaStub struct {
	*httptest.Server
	mu       sync.Mutex
	key      string
	sessions map[string]*stubSession
	sent     []struct{ session, chat, text string }
	badKey   int
	// the keys WAHA made for single sessions: key to session; and how many calls each kind of key made
	keys         map[string]string
	keyIDs       map[string]string
	madeKeys     int
	sessionCalls int
	adminCalls   int
	forbidden    int
	// the key each text was sent with
	sentWith []string
	// what the last request carried, for the dashboard proxy
	lastHeader http.Header
	lastPath   string
	calls      int
}

type stubSession struct{ status, me string }

func newWahaStub(t *testing.T, key string) *wahaStub {
	t.Helper()
	stub := &wahaStub{key: key, sessions: map[string]*stubSession{}, keys: map[string]string{}, keyIDs: map[string]string{}}
	stub.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		stub.mu.Lock()
		defer stub.mu.Unlock()
		stub.calls++
		stub.lastHeader, stub.lastPath = r.Header.Clone(), r.URL.Path
		presented := r.Header.Get("X-Api-Key")
		keySession, isSessionKey := stub.keys[presented]
		if presented != stub.key && !isSessionKey {
			stub.badKey++
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		path := strings.TrimPrefix(r.URL.Path, "/api/")
		w.Header().Set("Content-Type", "application/json")
		reply := func(v any) { _ = json.NewEncoder(w).Encode(v) }
		parts := strings.Split(path, "/")
		// a key of one session may only act on that session; the panel key does everything
		if isSessionKey {
			stub.sessionCalls++
			target := ""
			switch {
			case len(parts) >= 2 && parts[0] == "sessions":
				target = parts[1]
			case len(parts) >= 2 && parts[1] == "auth":
				target = parts[0]
			case path == "sendText":
				target, _ = body["session"].(string)
			}
			forbidden := strings.HasPrefix(path, "keys") || (path == "sessions" && r.Method == http.MethodPost) ||
				(len(parts) >= 3 && parts[0] == "sessions" && parts[2] == "start") || (target != "" && target != keySession)
			if forbidden {
				stub.forbidden++
				w.WriteHeader(http.StatusForbidden)
				reply(map[string]string{"message": "forbidden for this key"})
				return
			}
		} else {
			stub.adminCalls++
		}
		switch {
		case strings.HasPrefix(r.URL.Path, "/dashboard"):
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("<html>WAHA dashboard</html>"))
		case path == "keys" && r.Method == http.MethodPost:
			session, _ := body["session"].(string)
			stub.madeKeys++
			id := "kid-" + strconv.Itoa(stub.madeKeys)
			key := "key_" + strconv.Itoa(stub.madeKeys) + "_" + session
			stub.keys[key], stub.keyIDs[id] = session, key
			reply(map[string]any{"id": id, "key": key, "isAdmin": false, "isActive": true, "session": session})
		case len(parts) == 2 && parts[0] == "keys" && r.Method == http.MethodDelete:
			if key, ok := stub.keyIDs[parts[1]]; ok {
				delete(stub.keys, key)
				delete(stub.keyIDs, parts[1])
			}
			reply(map[string]string{})
		case path == "server/version":
			reply(map[string]string{"version": "2026.1.1", "engine": "GOWS"})
		case path == "sessions" && r.Method == http.MethodGet:
			list := []map[string]string{}
			for name := range stub.sessions {
				if isSessionKey && name != keySession {
					continue
				}
				list = append(list, map[string]string{"name": name})
			}
			reply(list)
		case path == "sessions" && r.Method == http.MethodPost:
			name, _ := body["name"].(string)
			if _, exists := stub.sessions[name]; exists {
				w.WriteHeader(http.StatusUnprocessableEntity)
				reply(map[string]string{"message": "Session already exists"})
				return
			}
			stub.sessions[name] = &stubSession{status: "SCAN_QR_CODE"}
			w.WriteHeader(http.StatusCreated)
			reply(map[string]string{"name": name, "status": "STARTING"})
		case len(parts) == 2 && parts[0] == "sessions" && r.Method == http.MethodGet:
			sess := stub.sessions[parts[1]]
			if sess == nil {
				w.WriteHeader(http.StatusNotFound)
				reply(map[string]string{"message": "Session not found"})
				return
			}
			out := map[string]any{"name": parts[1], "status": sess.status}
			if sess.me != "" {
				out["me"] = map[string]string{"id": sess.me, "pushName": "Tester"}
			}
			reply(out)
		case len(parts) == 3 && parts[0] == "sessions" && parts[2] == "start":
			if sess := stub.sessions[parts[1]]; sess != nil {
				sess.status = "SCAN_QR_CODE"
			}
			reply(map[string]string{"name": parts[1]})
		case len(parts) == 3 && parts[0] == "sessions" && parts[2] == "logout":
			if sess := stub.sessions[parts[1]]; sess != nil {
				sess.status, sess.me = "STOPPED", ""
			}
			reply(map[string]string{})
		case len(parts) == 2 && parts[0] == "sessions" && r.Method == http.MethodDelete:
			delete(stub.sessions, parts[1])
			reply(map[string]string{})
		case len(parts) == 3 && parts[1] == "auth" && parts[2] == "qr":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("\x89PNG-fake-" + parts[0]))
		case path == "sendText":
			session, _ := body["session"].(string)
			chat, _ := body["chatId"].(string)
			text, _ := body["text"].(string)
			stub.sent = append(stub.sent, struct{ session, chat, text string }{session, chat, text})
			stub.sentWith = append(stub.sentWith, presented)
			reply(map[string]any{"id": map[string]string{"_serialized": "true_" + chat + "_ABC"}})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(stub.Close)
	return stub
}

func (w *wahaStub) scanned(name, phone string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.sessions[name].status, w.sessions[name].me = "WORKING", phone+"@c.us"
}

func (w *wahaStub) textsTo(chat string) []string {
	w.mu.Lock()
	defer w.mu.Unlock()
	var out []string
	for _, m := range w.sent {
		if m.chat == chat {
			out = append(out, m.text)
		}
	}
	return out
}

func TestIntegrationWhatsAppFromTheRuntimeToTheMessage(t *testing.T) {
	restore := notify.SetWhatsAppGaps(time.Millisecond, time.Millisecond)
	t.Cleanup(restore)
	f := newNotifyFixture(t)

	// docker is not run: every command is recorded, and the key the container would get is handed to the fake WAHA
	var stub *wahaStub
	var mu sync.Mutex
	var commands []string
	original := notify.DockerRun
	notify.DockerRun = func(_ context.Context, env []string, args ...string) (string, error) {
		mu.Lock()
		defer mu.Unlock()
		commands = append(commands, strings.Join(args, " "))
		for _, e := range env {
			if strings.HasPrefix(e, "WAHA_API_KEY=") {
				stub.mu.Lock()
				stub.key = strings.TrimPrefix(e, "WAHA_API_KEY=")
				stub.mu.Unlock()
			}
		}
		return "", nil
	}
	t.Cleanup(func() { notify.DockerRun = original })
	stub = newWahaStub(t, "unset")
	f.s.notify.UseWahaBase(stub.URL)

	user, err := f.db.CreateUser("andi", "andi@example.com", "hash", auth.UserRole, "Andi")
	if err != nil {
		t.Fatal(err)
	}

	// before the owner switches it on, an account cannot connect
	if rec := f.call(f.s.handleConnectWhatsApp, "POST", "/", "", user); rec.Code != 409 {
		t.Fatalf("WhatsApp is off: %d %s", rec.Code, rec.Body.String())
	}
	// and only the owner sees the runtime route (the router guards it); the status of a fresh panel is "off"
	rec := f.call(f.s.handleWahaStatus, "GET", "/", "", f.super)
	if !strings.Contains(rec.Body.String(), `"state":"off"`) {
		t.Fatalf("a fresh panel has no runtime: %s", rec.Body.String())
	}

	// switching it on twice starts one container
	for i := 0; i < 2; i++ {
		if rec := f.call(f.s.handleSetWaha, "PUT", "/", `{"enabled":true}`, f.super); rec.Code != 200 {
			t.Fatalf("switch on: %d %s", rec.Code, rec.Body.String())
		}
	}
	eventually(t, "the runtime to answer", func() bool {
		rec := f.call(f.s.handleWahaStatus, "GET", "/", "", f.super)
		return strings.Contains(rec.Body.String(), `"state":"running"`)
	})
	rec = f.call(f.s.handleWahaStatus, "GET", "/", "", f.super)
	body := rec.Body.String()
	if !strings.Contains(body, `"version":"2026.1.1"`) || !strings.Contains(body, `"engine":"GOWS"`) || !strings.Contains(body, `"dashboardUrl":"http://127.0.0.1:`) {
		t.Fatalf("the status says what runs: %s", body)
	}
	if strings.Contains(body, stub.key) {
		t.Fatalf("the API key never reaches the page: %s", body)
	}
	mu.Lock()
	runs := 0
	for _, c := range commands {
		if strings.HasPrefix(c, "run ") {
			runs++
			if !strings.Contains(c, "-p 127.0.0.1:") || strings.Contains(c, stub.key) || !strings.Contains(c, "-e WAHA_API_KEY ") {
				t.Fatalf("the container is on the loopback address and the key goes by name, not on the command line: %s", c)
			}
		}
	}
	mu.Unlock()
	if runs != 1 {
		t.Fatalf("one container, not %d", runs)
	}

	// the account connects: a session named after its role and username, and a code to scan
	rec = f.call(f.s.handleConnectWhatsApp, "POST", "/", "", user)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"sessionName":"user-andi"`) || !strings.Contains(rec.Body.String(), `"status":"SCAN_QR_CODE"`) || !strings.Contains(rec.Body.String(), `"connected":false`) {
		t.Fatalf("connect: %d %s", rec.Code, rec.Body.String())
	}
	// pressing it again, or from two devices at once, is the same session
	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			f.call(f.s.handleConnectWhatsApp, "POST", "/", "", user)
		}()
	}
	wg.Wait()
	if n, _ := f.db.CountWhatsAppSessions(); n != 1 {
		t.Fatalf("one session for the account, got %d", n)
	}
	if len(stub.sessions) != 1 {
		t.Fatalf("one session in WAHA, got %d", len(stub.sessions))
	}
	rec = f.call(f.s.handleWhatsAppQR, "GET", "/", "", user)
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "image/png" || !strings.Contains(rec.Body.String(), "user-andi") {
		t.Fatalf("the code of this account's session: %d %s", rec.Code, rec.Body.String())
	}

	// a notice before the scan has nowhere to go
	if rec := f.call(f.s.handleTestWhatsApp, "POST", "/", "", user); rec.Code != 409 {
		t.Fatalf("not connected yet: %d", rec.Code)
	}

	// the phone scans: the status turns connected and the number becomes the place of the notices, shown masked
	stub.scanned("user-andi", "628123456789")
	rec = f.call(f.s.handleMyWhatsApp, "GET", "/", "", user)
	if !strings.Contains(rec.Body.String(), `"connected":true`) || !strings.Contains(rec.Body.String(), `"linked":true`) || strings.Contains(rec.Body.String(), "628123456789") {
		t.Fatalf("connected, and the number is masked: %s", rec.Body.String())
	}

	// a test message and a real event go out from the account's own session, in WhatsApp's marks
	if rec := f.call(f.s.handleTestWhatsApp, "POST", "/", "", user); rec.Code != 202 {
		t.Fatalf("test: %d %s", rec.Code, rec.Body.String())
	}
	eventually(t, "the test message", func() bool { return len(stub.textsTo("628123456789@c.us")) >= 1 })
	f.s.notify.Emit(notify.Event{Name: notify.EventPasswordChanged, UserIDs: []int64{user.ID}, Key: "pw-1", Data: map[string]any{"username": "andi", "time": "10:00"}})
	eventually(t, "the password notice", func() bool {
		for _, text := range stub.textsTo("628123456789@c.us") {
			if strings.Contains(text, "*Kata sandi diganti*") && !strings.Contains(text, "<b>") {
				return true
			}
		}
		return false
	})
	stub.mu.Lock()
	for _, m := range stub.sent {
		if m.session != "user-andi" {
			t.Fatalf("sent from another session: %s", m.session)
		}
	}
	stub.mu.Unlock()

	// switching a group off is kept; unknown notices are refused
	if rec := f.call(f.s.handleSetWhatsAppMuted, "PUT", "/", `{"mutedEvents":["bogus"]}`, user); rec.Code != 400 {
		t.Fatalf("unknown notice: %d", rec.Code)
	}
	if rec := f.call(f.s.handleSetWhatsAppMuted, "PUT", "/", `{"mutedEvents":["security"]}`, user); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"mutedEvents":["security"]`) {
		t.Fatalf("mute: %d %s", rec.Code, rec.Body.String())
	}

	// the owner's session is not the account's: each asks for its own code
	if rec := f.call(f.s.handleWhatsAppQR, "GET", "/", "", f.super); rec.Code != 409 {
		t.Fatalf("the owner has not connected: %d", rec.Code)
	}

	// WAHA lost the session (a container made again without its volume): the account is asked to connect again
	stub.mu.Lock()
	delete(stub.sessions, "user-andi")
	stub.mu.Unlock()
	rec = f.call(f.s.handleMyWhatsApp, "GET", "/", "", user)
	if !strings.Contains(rec.Body.String(), `"connected":false`) || !strings.Contains(rec.Body.String(), `"linked":false`) {
		t.Fatalf("a lost session is not shown as connected: %s", rec.Body.String())
	}

	// disconnecting removes the session and the recipient
	f.call(f.s.handleConnectWhatsApp, "POST", "/", "", user)
	stub.scanned("user-andi", "628123456789")
	f.call(f.s.handleMyWhatsApp, "GET", "/", "", user)
	if rec := f.call(f.s.handleDisconnectWhatsApp, "DELETE", "/", "", user); rec.Code != 200 {
		t.Fatalf("disconnect: %d %s", rec.Code, rec.Body.String())
	}
	if n, _ := f.db.CountWhatsAppSessions(); n != 0 {
		t.Fatalf("no session left, got %d", n)
	}
	if r, _ := f.db.GetNotifyRecipient(user.ID, "waha"); r != nil {
		t.Fatalf("no recipient left: %+v", r)
	}
	if len(stub.sessions) != 0 {
		t.Fatalf("WAHA has no session left")
	}

	// the demo account cannot connect
	demo := &database.User{ID: 999999, Username: "demo", Role: auth.UserRole}
	if rec := f.call(f.s.handleConnectWhatsApp, "POST", "/", "", demo); rec.Code == 200 {
		t.Fatalf("the demo account must not connect: %d", rec.Code)
	}

	// switching it off stops the container but keeps the sessions on disk
	if rec := f.call(f.s.handleSetWaha, "PUT", "/", `{"enabled":false}`, f.super); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"state":"stopped"`) {
		t.Fatalf("switch off: %d %s", rec.Code, rec.Body.String())
	}
	mu.Lock()
	defer mu.Unlock()
	last := commands[len(commands)-1]
	if last != "stop reneo-waha" {
		t.Fatalf("the container is stopped, not removed: %q", last)
	}
	if stub.badKey != 0 {
		t.Fatalf("the agent used a wrong key %d times", stub.badKey)
	}
}

// withWaha switches WhatsApp on against a fake WAHA, with the superadmin's phone connected, and returns the fake
func withWaha(t *testing.T, f *notifyFixture) *wahaStub {
	t.Helper()
	var stub *wahaStub
	original := notify.DockerRun
	notify.DockerRun = func(_ context.Context, env []string, args ...string) (string, error) {
		for _, e := range env {
			if strings.HasPrefix(e, "WAHA_API_KEY=") {
				stub.mu.Lock()
				stub.key = strings.TrimPrefix(e, "WAHA_API_KEY=")
				stub.mu.Unlock()
			}
		}
		return "", nil
	}
	t.Cleanup(func() { notify.DockerRun = original })
	stub = newWahaStub(t, "unset")
	f.s.notify.UseWahaBase(stub.URL)
	if err := f.s.notify.EnableWaha(); err != nil {
		t.Fatal(err)
	}
	eventually(t, "WAHA to run", func() bool {
		return strings.Contains(f.call(f.s.handleWahaStatus, "GET", "/", "", f.super).Body.String(), `"state":"running"`)
	})
	return stub
}

func (f *notifyFixture) connectPhone(t *testing.T, stub *wahaStub, u *database.User, phone string) {
	t.Helper()
	if rec := f.call(f.s.handleConnectWhatsApp, "POST", "/", "", u); rec.Code != 200 {
		t.Fatalf("connect %s: %d %s", u.Username, rec.Code, rec.Body.String())
	}
	name := notify.SessionName(string(u.Role), u.Username)
	stub.scanned(name, phone)
	f.call(f.s.handleMyWhatsApp, "GET", "/", "", u)
}

func TestIntegrationTheBuyerHearsAboutTheOrderOnTheirNumber(t *testing.T) {
	// the gaps are read when the worker starts, so they are set before the fixture makes it
	t.Cleanup(notify.SetWhatsAppGaps(time.Millisecond, time.Millisecond))
	f := newNotifyFixture(t)
	plan := f.plan(t, "starter", 50000, 0, 0)

	// WhatsApp is off: the number is optional, and nothing is sent
	_, view := f.postOrder(t, "203.0.113.70", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "sari", "email": "sari@example.com", "password": "Sup3r-secret-pass",
	})
	if view.PublicID == "" {
		t.Fatal("an order without a number is fine while WhatsApp is off")
	}

	stub := withWaha(t, f)
	f.connectPhone(t, stub, f.super, "628111111111")

	// now the number is required, and badly written ones are refused with a reason
	rec, _ := f.postOrder(t, "203.0.113.71", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "andi2", "email": "andi2@example.com", "password": "Sup3r-secret-pass",
	})
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "WhatsApp number") {
		t.Fatalf("a number is needed: %d %s", rec.Code, rec.Body.String())
	}
	for _, bad := range []string{"123", "abc", "0712345678", "+1 (555) 12"} {
		if rec, _ := f.postOrder(t, "203.0.113.72", map[string]any{
			"planId": plan.ID, "kind": "new", "periods": 1, "username": "andi3", "email": "andi3@example.com", "password": "Sup3r-secret-pass", "whatsapp": bad,
		}); rec.Code != 400 {
			t.Fatalf("%q is not a mobile number: %d", bad, rec.Code)
		}
	}
	// a refused order leaves no account behind
	if u, _ := f.db.GetUserByUsername("andi2"); u != nil {
		t.Fatal("a refused order must not create an account")
	}

	// a good number, written as people write it
	rec, view = f.postOrder(t, "203.0.113.73", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "budi2", "email": "budi2@example.com", "password": "Sup3r-secret-pass", "whatsapp": "0812-3456-7890",
	})
	if rec.Code != 201 {
		t.Fatalf("order: %d %s", rec.Code, rec.Body.String())
	}
	// it goes to the buyer's number, from the superadmin's session, with how to pay
	eventually(t, "the buyer's payment instructions", func() bool {
		for _, text := range stub.textsTo("6281234567890@c.us") {
			if strings.Contains(text, "*Pesanan Starter diterima*") && strings.Contains(text, rupiah(view.AmountTotal)) && strings.Contains(text, "BCA") && strings.Contains(text, "/order/"+view.PublicID) {
				return true
			}
		}
		return false
	})
	stub.mu.Lock()
	for _, m := range stub.sent {
		if m.chat == "6281234567890@c.us" && m.session != "superadmin-owner" {
			t.Fatalf("a buyer without a phone connected is told from the superadmin's session, not %s", m.session)
		}
	}
	stub.mu.Unlock()
	// the seller's own number heard about the order too, and the buyer's number did not get the seller's text
	for _, text := range stub.textsTo("6281234567890@c.us") {
		if strings.Contains(text, "Pesanan baru") {
			t.Fatalf("the buyer must not get the seller's notice: %q", text)
		}
	}

	// paid: the account is active and the buyer is told where to sign in
	order, _ := f.db.GetHostingOrderByPublicID(view.PublicID)
	if err := f.s.fulfillOrder(order, nil, "dikonfirmasi"); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if t.Failed() {
			rows, _ := f.db.ListOutbox("", 20)
			for _, r := range rows {
				t.Logf("outbox #%d %s user=%d status=%s attempts=%d err=%q", r.ID, r.Event, r.UserID, r.Status, r.Attempts, r.Error)
			}
		}
	}()
	eventually(t, "the buyer's activation notice", func() bool {
		for _, text := range stub.textsTo("6281234567890@c.us") {
			if strings.Contains(text, "*Pembayaran diterima, akun aktif*") && strings.Contains(text, "budi2") && strings.Contains(text, "/login") {
				return true
			}
		}
		return false
	})
	// paying twice does not tell twice
	_ = f.s.fulfillOrder(order, nil, "dikonfirmasi")
	time.Sleep(300 * time.Millisecond)
	n := 0
	for _, text := range stub.textsTo("6281234567890@c.us") {
		if strings.Contains(text, "Pembayaran diterima") {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("the activation notice is sent once, got %d", n)
	}

	// the number of an unverified buyer gets at most three notices a day from sessions that are not its own
	buyer, _ := f.db.GetUserByUsername("budi2")
	for i := 0; i < 5; i++ {
		f.s.notify.Emit(notify.Event{Name: notify.EventBuyerOrderCreated, UserIDs: []int64{buyer.ID}, Key: "flood-" + strconv.Itoa(i), Data: map[string]any{"plan": "X"}})
	}
	time.Sleep(500 * time.Millisecond)
	total := len(stub.textsTo("6281234567890@c.us"))
	if total > 3 {
		t.Fatalf("an unverified number is told at most 3 times a day, got %d", total)
	}
}

func TestIntegrationEachSessionActsWithItsOwnKey(t *testing.T) {
	t.Cleanup(notify.SetWhatsAppGaps(time.Millisecond, time.Millisecond))
	f := newNotifyFixture(t)
	stub := withWaha(t, f)
	andi, _ := f.db.CreateUser("andi", "andi@example.com", "hash", auth.UserRole, "Andi")
	budi, _ := f.db.CreateUser("budi", "budi@example.com", "hash", auth.UserRole, "Budi")
	f.connectPhone(t, stub, andi, "628111111111")
	f.connectPhone(t, stub, budi, "628222222222")

	// WAHA made one key for each session, limited to it, and the panel keeps them where only the agent reads
	stub.mu.Lock()
	if len(stub.keys) != 2 {
		t.Fatalf("one key a session: %v", stub.keys)
	}
	owners := map[string]bool{}
	for _, session := range stub.keys {
		owners[session] = true
	}
	stub.mu.Unlock()
	if !owners["user-andi"] || !owners["user-budi"] {
		t.Fatalf("each key belongs to its session: %v", owners)
	}
	row, _ := f.db.GetWhatsAppSession(andi.ID)
	if row.APIKeyID == "" || row.APIKeyEncrypted == "" || strings.Contains(row.APIKeyEncrypted, "key_") {
		t.Fatalf("the key is kept encrypted: %+v", row)
	}
	if body := f.call(f.s.handleMyWhatsApp, "GET", "/", "", andi).Body.String(); strings.Contains(body, "key_") || strings.Contains(strings.ToLower(body), "apikey") {
		t.Fatalf("no key ever reaches the page: %s", body)
	}

	// what each account sends goes out with the key of its own session, and WAHA refused nothing
	for _, u := range []*database.User{andi, budi} {
		if rec := f.call(f.s.handleTestWhatsApp, "POST", "/", "", u); rec.Code != 202 {
			t.Fatalf("test: %d", rec.Code)
		}
	}
	eventually(t, "both test messages", func() bool {
		return len(stub.textsTo("628111111111@c.us")) >= 1 && len(stub.textsTo("628222222222@c.us")) >= 1
	})
	stub.mu.Lock()
	for i, m := range stub.sent {
		if stub.keys[stub.sentWith[i]] != m.session {
			t.Fatalf("a text of %s was sent with a key of %q, not its own", m.session, stub.keys[stub.sentWith[i]])
		}
	}
	if stub.forbidden != 0 {
		t.Fatalf("WAHA refused %d calls of the panel", stub.forbidden)
	}
	stub.mu.Unlock()

	// the container was made again and its keys are gone: the next message gets a new key and still goes out
	stub.mu.Lock()
	stub.keys, stub.keyIDs = map[string]string{}, map[string]string{}
	made := stub.madeKeys
	stub.mu.Unlock()
	if rec := f.call(f.s.handleTestWhatsApp, "POST", "/", "", andi); rec.Code != 202 {
		t.Fatalf("test: %d", rec.Code)
	}
	eventually(t, "the message after the keys were lost", func() bool { return len(stub.textsTo("628111111111@c.us")) >= 2 })
	stub.mu.Lock()
	if stub.madeKeys != made+1 {
		t.Fatalf("a new key was made once: %d then %d", made, stub.madeKeys)
	}
	stub.mu.Unlock()

	// disconnecting removes the key with the session
	if rec := f.call(f.s.handleDisconnectWhatsApp, "DELETE", "/", "", andi); rec.Code != 200 {
		t.Fatalf("disconnect: %d", rec.Code)
	}
	stub.mu.Lock()
	for _, session := range stub.keys {
		if session == "user-andi" {
			t.Fatal("the key of a disconnected session is removed")
		}
	}
	stub.mu.Unlock()

	// an account with no session cannot be sent to, and that is final
	ch, _ := f.s.notify.Channel("waha")
	sender, ok := ch.(notify.UserSender)
	if !ok {
		t.Fatal("the channel sends from sessions")
	}
	_, err := sender.SendToUser(context.Background(), andi.ID, "628111111111", "x")
	if se := notify.AsSendError(err); !se.Blocked || se.Temporary {
		t.Fatalf("no session is final: %+v", se)
	}
}
