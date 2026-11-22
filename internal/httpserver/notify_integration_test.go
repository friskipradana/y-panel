package httpserver

import (
	"bytes"
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

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// Notices outside the panel, from the handlers down to a Telegram that is faked. Skipped without REN_TEST_DATABASE_URL.

type telegramStub struct {
	*httptest.Server
	mu      sync.Mutex
	sent    []struct{ chat, text string }
	updates []map[string]any
	// what the bots of accounts were sent and what was said to them, by token (the bot of the panel is 123:TEST)
	sentVia    []struct{ token, chat, text string }
	updatesVia map[string][]map[string]any
}

func newTelegramStub(t *testing.T) *telegramStub {
	t.Helper()
	stub := &telegramStub{}
	stub.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		method := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		token := strings.TrimPrefix(r.URL.Path[:strings.LastIndex(r.URL.Path, "/")], "/bot")
		w.Header().Set("Content-Type", "application/json")
		switch method {
		case "getMe":
			username := "reneo_test_bot"
			if token != "123:TEST" {
				// the bot of another account is named after its token: 555:DEWI is dewi_bot
				username = strings.ToLower(token[strings.Index(token, ":")+1:]) + "_bot"
			}
			_, _ = w.Write([]byte(`{"ok":true,"result":{"id":9,"username":"` + username + `","first_name":"Reneo"}}`))
		case "getUpdates":
			offset, _ := body["offset"].(float64)
			stub.mu.Lock()
			var out []map[string]any
			source := stub.updates
			if own, ok := stub.updatesVia[token]; ok {
				source = own
			}
			for _, u := range source {
				if id, _ := u["update_id"].(int); float64(id) >= offset {
					out = append(out, u)
				}
			}
			stub.mu.Unlock()
			raw, _ := json.Marshal(map[string]any{"ok": true, "result": out})
			_, _ = w.Write(raw)
		case "sendMessage":
			chat, _ := body["chat_id"].(string)
			text, _ := body["text"].(string)
			stub.mu.Lock()
			stub.sent = append(stub.sent, struct{ chat, text string }{chat, text})
			stub.sentVia = append(stub.sentVia, struct{ token, chat, text string }{token, chat, text})
			n := len(stub.sent)
			stub.mu.Unlock()
			_, _ = w.Write([]byte(`{"ok":true,"result":{"message_id":` + strconv.Itoa(n) + `}}`))
		}
	}))
	t.Cleanup(stub.Close)
	return stub
}

func (t *telegramStub) textsTo(chat string) []string {
	t.mu.Lock()
	defer t.mu.Unlock()
	var out []string
	for _, m := range t.sent {
		if m.chat == chat {
			out = append(out, m.text)
		}
	}
	return out
}

type notifyFixture struct {
	*hostingFixture
	tg    *telegramStub
	owner *database.User
}

// newNotifyFixture is the hosting fixture with a notify service whose Telegram channel is on and linked to the superadmin
func newNotifyFixture(t *testing.T) *notifyFixture {
	t.Helper()
	f := newHostingFixture(t)
	tg := newTelegramStub(t)
	f.s.notify = notify.New(f.db, testNotifyKey)
	f.s.notify.UseTelegramBase(tg.URL)
	token := "123:TEST"
	if err := f.s.notify.ConfigureTelegram(context.Background(), &token, true); err != nil {
		t.Fatal(err)
	}
	f.s.notify.Start(2)
	t.Cleanup(f.s.notify.Stop)

	owner := f.super
	link, err := f.s.notify.StartTelegramLink(owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if id, err := f.db.CompleteNotifyLink("telegram", link.Code, "9001"); err != nil || id != owner.ID {
		t.Fatalf("link the superadmin: %d %v", id, err)
	}
	return &notifyFixture{hostingFixture: f, tg: tg, owner: owner}
}

const testNotifyKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func asUser(r *http.Request, u *database.User) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), ctxUser, u))
}

func (f *notifyFixture) call(handler http.HandlerFunc, method, path, body string, user *database.User) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.RemoteAddr = "203.0.113.50:5000"
	rec := httptest.NewRecorder()
	handler(rec, asUser(req, user))
	return rec
}

func eventually(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if ok() {
			return
		}
		time.Sleep(15 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func TestIntegrationSettingUpTelegramFromTheHandlers(t *testing.T) {
	f := newHostingFixture(t)
	tg := newTelegramStub(t)
	f.s.notify = notify.New(f.db, testNotifyKey)
	f.s.notify.UseTelegramBase(tg.URL)
	f.s.notify.Start(2)
	t.Cleanup(f.s.notify.Stop)
	nf := &notifyFixture{hostingFixture: f, tg: tg, owner: f.super}

	// nothing is set up yet
	rec := nf.call(f.s.handleNotifyOverview, "GET", "/", "", f.super)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"configured":false`) {
		t.Fatalf("a fresh panel has no channel: %d %s", rec.Code, rec.Body.String())
	}
	// switching it on with no token is refused with a reason
	if rec := nf.call(f.s.handleSaveTelegramChannel, "PUT", "/", `{"enabled":true}`, f.super); rec.Code != 400 {
		t.Fatalf("no token, no channel: %d %s", rec.Code, rec.Body.String())
	}
	// a link cannot start before the bot exists
	if rec := nf.call(f.s.handleStartTelegramLink, "POST", "/", "", f.super); rec.Code != 409 {
		t.Fatalf("link before the bot: %d", rec.Code)
	}

	rec = nf.call(f.s.handleSaveTelegramChannel, "PUT", "/", `{"enabled":true,"botToken":"123:TEST"}`, f.super)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"botUsername":"reneo_test_bot"`) || strings.Contains(rec.Body.String(), "123:TEST") {
		t.Fatalf("the bot is known and the token never comes back: %d %s", rec.Code, rec.Body.String())
	}

	// link: open the address, press Start, and the panel notices
	rec = nf.call(f.s.handleStartTelegramLink, "POST", "/", "", f.super)
	var link struct{ Code, URL string }
	_ = json.Unmarshal(rec.Body.Bytes(), &link)
	if rec.Code != 200 || len(link.Code) != 8 || !strings.Contains(link.URL, "https://t.me/reneo_test_bot?start="+link.Code) {
		t.Fatalf("the link: %d %s", rec.Code, rec.Body.String())
	}
	if rec := nf.call(f.s.handleCheckTelegramLink, "POST", "/", "", f.super); !strings.Contains(rec.Body.String(), `"linked":false`) {
		t.Fatalf("nothing arrived yet: %s", rec.Body.String())
	}
	tg.mu.Lock()
	tg.updates = []map[string]any{{"update_id": 1, "message": map[string]any{"text": "/start " + link.Code, "chat": map[string]any{"id": 4242, "type": "private"}}}}
	tg.mu.Unlock()
	rec = nf.call(f.s.handleCheckTelegramLink, "POST", "/", "", f.super)
	if !strings.Contains(rec.Body.String(), `"linked":true`) || strings.Contains(rec.Body.String(), `"address":"4242"`) || !strings.Contains(rec.Body.String(), "••42") {
		t.Fatalf("linked, and the chat id is shown masked: %s", rec.Body.String())
	}

	// a test message goes through the queue to the chat
	if rec := nf.call(f.s.handleTestTelegram, "POST", "/", "", f.super); rec.Code != 202 {
		t.Fatalf("test: %d %s", rec.Code, rec.Body.String())
	}
	eventually(t, "the test message", func() bool {
		// the chat that got the confirmation of the link also gets the test
		return len(tg.textsTo("4242")) >= 2
	})

	// muting: only known events or groups
	if rec := nf.call(f.s.handleSetTelegramMuted, "PUT", "/", `{"mutedEvents":["nonsense"]}`, f.super); rec.Code != 400 {
		t.Fatalf("an unknown notice cannot be switched off: %d", rec.Code)
	}
	if rec := nf.call(f.s.handleSetTelegramMuted, "PUT", "/", `{"mutedEvents":["attack","order.created","attack"]}`, f.super); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"mutedEvents":["attack","order.created"]`) {
		t.Fatalf("muting is saved without repeats: %d %s", rec.Code, rec.Body.String())
	}
	if rec := nf.call(f.s.handleUnlinkTelegram, "DELETE", "/", "", f.super); rec.Code != 200 {
		t.Fatalf("unlink: %d", rec.Code)
	}
	if got, _ := f.db.GetNotifyRecipient(f.super.ID, "telegram"); got != nil {
		t.Fatal("unlinking removes the recipient")
	}
}

func TestIntegrationTheSellerHearsAboutTheOrderStepByStep(t *testing.T) {
	f := newNotifyFixture(t)
	plan := f.plan(t, "starter", 50000, 0, 0)

	_, view := f.postOrder(t, "203.0.113.60", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "andi", "email": "andi@example.com", "password": "Sup3r-secret-pass",
	})
	eventually(t, "the new order notice", func() bool {
		for _, text := range f.tg.textsTo("9001") {
			if strings.Contains(text, "Pesanan baru") && strings.Contains(text, "andi") && strings.Contains(text, "Total: Rp 50.") {
				return true
			}
		}
		return false
	})

	// the transfer matches but waits for the seller (auto-confirm is off): the seller is told it needs review
	f.s.matchHostingOrderPayment(formatAmount(view.AmountTotal), 0, time.Now())
	eventually(t, "the review notice", func() bool {
		for _, text := range f.tg.textsTo("9001") {
			if strings.Contains(text, "perlu diperiksa") && strings.Contains(text, "andi") && strings.Contains(text, rupiah(view.AmountTotal)) {
				return true
			}
		}
		return false
	})

	order, _ := f.db.GetHostingOrderByPublicID(view.PublicID)
	if err := f.s.fulfillOrder(order, nil, "dikonfirmasi"); err != nil {
		t.Fatal(err)
	}
	eventually(t, "the paid notice", func() bool {
		for _, text := range f.tg.textsTo("9001") {
			if strings.Contains(text, "lunas") && strings.Contains(text, "Starter") {
				return true
			}
		}
		return false
	})
	// confirming the paid order again says nothing again
	before := len(f.tg.textsTo("9001"))
	_ = f.s.fulfillOrder(order, nil, "dua kali")
	time.Sleep(400 * time.Millisecond)
	if len(f.tg.textsTo("9001")) != before {
		t.Fatal("an order that is already paid is not announced again")
	}
}

func TestIntegrationAFailedOrderStepNeedsTheSellerAttention(t *testing.T) {
	f := newNotifyFixture(t)
	plan := f.plan(t, "starter", 50000, 1, 0)
	buyer, _ := f.db.CreateUser("rina", "rina@example.com", "hash", "user", "Rina")
	_ = f.db.UpdateUser(buyer.ID, map[string]any{"status": "pending"})
	// the address was taken by someone else in the meantime: it cannot be made when the order is paid
	other, _ := f.db.CreateUser("lain", "lain@example.com", "hash", "user", "Lain")
	if _, err := f.db.CreateHostingSubdomain(other.ID, "rina", "z1", "reneo.my.id", "rina.reneo.my.id", false); err != nil {
		t.Fatal(err)
	}
	order, err := f.db.CreateHostingOrder(database.HostingOrder{
		Kind: database.OrderNew, PlanID: &plan.ID, PlanName: plan.Name, UserID: buyer.ID, Periods: 1, AmountBase: 50000,
		Status: database.OrderPending, ExpiresAt: time.Now().Add(time.Hour),
		SubLabel: "rina", SubZoneID: "z1", SubDomain: "reneo.my.id", SubHostname: "rina.reneo.my.id",
	}, 999)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.s.fulfillOrder(order, nil, "test"); err != nil {
		t.Fatal(err)
	}
	eventually(t, "the attention notice", func() bool {
		for _, text := range f.tg.textsTo("9001") {
			if strings.Contains(text, "perlu ditangani") && strings.Contains(text, "rina.reneo.my.id") {
				return true
			}
		}
		return false
	})
}

func postLogin(f *notifyFixture, username, password, userAgent, ip string) int {
	body, _ := json.Marshal(map[string]string{"username": username, "password": password})
	req := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(body))
	req.RemoteAddr = ip + ":4000"
	req.Header.Set("User-Agent", userAgent)
	rec := httptest.NewRecorder()
	f.s.handleLoginV2(rec, req)
	return rec.Code
}

func TestIntegrationFailedSignInsAreToldOnlyWhenTheyPileUp(t *testing.T) {
	f := newNotifyFixture(t)
	chrome := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
	// the superadmin has a real password here, so a right and a wrong sign-in can be told apart
	const name, chat = "owner", "9001"
	if err := f.s.auth.ResetPassword(f.super.ID, "Boss-pass-123456"); err != nil {
		t.Fatal(err)
	}
	loginFailures.clear(name)
	t.Cleanup(func() { loginFailures.clear(name) })

	for i := 0; i < 2; i++ {
		if code := postLogin(f, name, "wrong-password", chrome, "198.51.100."+strconv.Itoa(10+i)); code != 401 {
			t.Fatalf("a wrong password is refused: %d", code)
		}
	}
	time.Sleep(400 * time.Millisecond)
	if len(f.tg.textsTo(chat)) != 0 {
		t.Fatalf("two failures tell nobody: %v", f.tg.textsTo(chat))
	}
	postLogin(f, name, "wrong-password", chrome, "198.51.100.12")
	eventually(t, "the warning", func() bool {
		for _, text := range f.tg.textsTo(chat) {
			if strings.Contains(text, "Peringatan keamanan") && strings.Contains(text, "Percobaan gagal: 3") && strings.Contains(text, name) {
				return true
			}
		}
		return false
	})
	n := len(f.tg.textsTo(chat))
	for i := 0; i < 3; i++ {
		postLogin(f, name, "wrong-password", chrome, "198.51.100.13")
	}
	time.Sleep(400 * time.Millisecond)
	if len(f.tg.textsTo(chat)) != n {
		t.Fatalf("more failures at the same level are not new messages: %v", f.tg.textsTo(chat))
	}
	// a name that is no account tells nobody, and a flood of such names from one address is for the seller
	for i := 0; i < 12; i++ {
		postLogin(f, "ghost"+strconv.Itoa(i), "x", chrome, "192.0.2.77")
	}
	eventually(t, "the scan alert to the seller", func() bool {
		for _, text := range f.tg.textsTo("9001") {
			if strings.Contains(text, "Pemindaian akun") && strings.Contains(text, "192.0.2.77") {
				return true
			}
		}
		return false
	})
}

func TestIntegrationASignInFromANewDeviceIsToldToItsOwner(t *testing.T) {
	f := newNotifyFixture(t)
	chrome := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
	phone := "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"
	if err := f.s.auth.ResetPassword(f.super.ID, "Sultan-pass-12345"); err != nil {
		t.Fatal(err)
	}
	loginFailures.clear("owner")
	if code := postLogin(f, "owner", "Sultan-pass-12345", chrome, "203.0.113.5"); code != 200 {
		t.Fatalf("sign in: %d", code)
	}
	time.Sleep(400 * time.Millisecond)
	if len(f.tg.textsTo("9001")) != 0 {
		t.Fatal("the first sign-in is no surprise")
	}
	if code := postLogin(f, "owner", "Sultan-pass-12345", phone, "198.51.100.9"); code != 200 {
		t.Fatalf("sign in from the phone: %d", code)
	}
	eventually(t, "the new device notice", func() bool {
		for _, text := range f.tg.textsTo("9001") {
			if strings.Contains(text, "perangkat baru") && strings.Contains(text, "Android") && strings.Contains(text, "198.51.100.9") {
				return true
			}
		}
		return false
	})
}

func TestIntegrationPasswordAndTokenChangesAreToldToTheAccount(t *testing.T) {
	f := newNotifyFixture(t)
	req := httptest.NewRequest("POST", "/api/v1/me/api-tokens", strings.NewReader(`{"name":"laptop kantor"}`))
	req.RemoteAddr = "203.0.113.5:1"
	rec := httptest.NewRecorder()
	f.s.handleCreateAPIToken(rec, asUser(req, f.super))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create the token: %d %s", rec.Code, rec.Body.String())
	}
	eventually(t, "the token notice", func() bool {
		for _, text := range f.tg.textsTo("9001") {
			if strings.Contains(text, "Token API baru") && strings.Contains(text, "laptop kantor") {
				return true
			}
		}
		return false
	})
	if strings.Contains(strings.Join(f.tg.textsTo("9001"), " "), "ypat_") {
		t.Fatal("the token itself is never sent")
	}
}

func TestIntegrationThresholdsCanBeReadChangedAndReset(t *testing.T) {
	f := newNotifyFixture(t)
	rec := f.call(f.s.handleGetThresholds, "GET", "/", "", f.super)
	var got struct {
		Detectors []notify.DetectorConfig `json:"detectors"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if rec.Code != 200 || len(got.Detectors) != 7 {
		t.Fatalf("seven detectors are listed: %d %s", rec.Code, rec.Body.String())
	}
	body := `{"detectors":[{"event":"attack.request_flood","levels":[50,200],"windowSec":60,"cooldownSec":600,"quietSec":300,"minDistinct":0}]}`
	if rec := f.call(f.s.handleSetThresholds, "PUT", "/", body, f.super); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"levels":[50,200]`) {
		t.Fatalf("a change is saved and shown: %d %s", rec.Code, rec.Body.String())
	}
	bad := `{"detectors":[{"event":"attack.request_flood","levels":[200,50],"windowSec":60,"cooldownSec":600,"quietSec":300,"minDistinct":0}]}`
	if rec := f.call(f.s.handleSetThresholds, "PUT", "/", bad, f.super); rec.Code != 400 {
		t.Fatalf("levels that do not rise are refused: %d", rec.Code)
	}
	if rec := f.call(f.s.handleResetThresholds, "DELETE", "/", "", f.super); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"levels":[100,500,2000]`) {
		t.Fatalf("reset: %d %s", rec.Code, rec.Body.String())
	}
}

func TestIntegrationTheQueueCanBeReadAndAFailedMessageSentAgain(t *testing.T) {
	f := newNotifyFixture(t)
	id, _, err := f.db.EnqueueOutbox(database.OutboxMessage{Event: notify.EventOrderAttention, UserID: f.super.ID, Kind: "telegram", Address: "9001",
		Payload: json.RawMessage(`{"detail":"coba"}`), Key: "manual-1", Priority: 0})
	if err != nil {
		t.Fatal(err)
	}
	// let it be sent, then list it with its text and a masked address
	f.s.notify.Wake()
	eventually(t, "it to be sent", func() bool { m, _ := f.db.GetOutbox(id); return m != nil && m.Status == database.OutboxSent })
	rec := f.call(f.s.handleListOutbox, "GET", "/?status=sent", "", f.super)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "coba") || !strings.Contains(rec.Body.String(), "••01") || strings.Contains(rec.Body.String(), `"address":"9001"`) {
		t.Fatalf("the queue shows the text and hides the address: %d %s", rec.Code, rec.Body.String())
	}
	// only a failed or cancelled message can be sent again
	req := httptest.NewRequest("POST", "/", nil)
	req.SetPathValue("id", strconv.FormatInt(id, 10))
	retryRec := httptest.NewRecorder()
	f.s.handleRetryOutbox(retryRec, asUser(req, f.super))
	if retryRec.Code != 409 {
		t.Fatalf("a sent message is not sent again: %d", retryRec.Code)
	}
}
