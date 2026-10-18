package httpserver

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// What people send back: "stop" and "start", and what the channels say about a message after it left.
// Skipped without REN_TEST_DATABASE_URL.

func signedPost(handler http.HandlerFunc, path, header, signature string, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
	req.RemoteAddr = "198.51.100.77:4000"
	if signature != "" {
		req.Header.Set(header, signature)
	}
	rec := httptest.NewRecorder()
	handler(rec, req)
	return rec
}

func sha256Sig(secret, body string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func sha512Sig(key, body string) string {
	mac := hmac.New(sha512.New, []byte(key))
	mac.Write([]byte(body))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestIntegrationStopAndStartOnTelegram(t *testing.T) {
	f := newNotifyFixture(t)
	// the superadmin of the fixture is linked to chat 9001; an update from that chat says stop
	push := func(id int, text string) {
		f.tg.mu.Lock()
		f.tg.updates = append(f.tg.updates, map[string]any{"update_id": id, "message": map[string]any{"text": text, "chat": map[string]any{"id": 9001, "type": "private"}}})
		f.tg.mu.Unlock()
	}
	muted := func() string {
		rec, _ := f.db.GetNotifyRecipient(f.owner.ID, "telegram")
		return strings.Join(rec.MutedEvents, ",")
	}
	push(1, "/stop")
	eventually(t, "stop to be heard", func() bool { return strings.Contains(muted(), "attack") && strings.Contains(muted(), "buyer") })
	if !strings.Contains(strings.Join(f.tg.textsTo("9001"), "|"), "dihentikan") {
		t.Fatal("the chat is told that the notices stopped")
	}
	// what was switched off stays off: an event of the seller does not reach the chat
	before := len(f.tg.textsTo("9001"))
	f.s.notify.Emit(notify.Event{Name: notify.EventOrderPaid, Key: "after-stop", Data: map[string]any{"username": "x", "plan": "P", "note": ""}})
	time.Sleep(400 * time.Millisecond)
	if len(f.tg.textsTo("9001")) != before {
		t.Fatal("nothing is sent after stop")
	}
	// a sentence that holds the word does not stop anything; a plain /start brings the notices back
	push(2, "please do not stop the server")
	push(3, "/start")
	eventually(t, "start to be heard", func() bool { return muted() == "" })
	if !strings.Contains(strings.Join(f.tg.textsTo("9001"), "|"), "menyala lagi") {
		t.Fatal("the chat is told that the notices are on again")
	}
	f.s.notify.Emit(notify.Event{Name: notify.EventOrderPaid, Key: "after-start", Data: map[string]any{"username": "y", "plan": "P", "note": ""}})
	eventually(t, "the notice after start", func() bool {
		for _, text := range f.tg.textsTo("9001") {
			if strings.Contains(text, "Pesanan terbayar") {
				return true
			}
		}
		return false
	})
}

func TestIntegrationMetaWebhookStatusesSignaturesAndStop(t *testing.T) {
	t.Cleanup(notify.SetWhatsAppGaps(time.Millisecond, time.Millisecond))
	f := newNotifyFixture(t)
	meta := newMetaStub(t)
	f.s.notify.UseCloudBase(meta.URL)
	rec := f.call(f.s.handleSaveCloudChannel, "PUT", "/", `{"enabled":true,"accessToken":"EAAB-token","phoneId":"555","wabaId":"777","appSecret":"app-secret-1"}`, f.super)
	if rec.Code != 200 || strings.Contains(rec.Body.String(), "app-secret-1") || !strings.Contains(rec.Body.String(), `"secretSet":true`) || !strings.Contains(rec.Body.String(), `"verifyToken":"`) {
		t.Fatalf("saved; the secret never returns, and the token to paste in Meta is shown: %d %s", rec.Code, rec.Body.String())
	}
	info, _ := f.s.notify.CloudWebhookInfo()

	// Meta's check of the address
	get := func(token string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/?hub.mode=subscribe&hub.verify_token="+token+"&hub.challenge=12345", nil)
		req.RemoteAddr = "198.51.100.77:4000"
		out := httptest.NewRecorder()
		f.s.handleCloudWebhookVerify(out, req)
		return out
	}
	if out := get(info.VerifyToken); out.Code != 200 || out.Body.String() != "12345" {
		t.Fatalf("the right token gets the challenge back: %d %q", out.Code, out.Body.String())
	}
	if out := get("wrong"); out.Code != 403 {
		t.Fatalf("a wrong token is refused: %d", out.Code)
	}

	// a buyer ordered with a number; the order notice went out and Meta says it was delivered
	plan := f.plan(t, "starter", 50000, 0, 0)
	if rec, _ := f.postOrder(t, "203.0.113.90", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "rina", "email": "rina@example.com", "password": "Sup3r-secret-pass", "whatsapp": "0812 1111 2222",
	}); rec.Code != 201 {
		t.Fatalf("order: %d %s", rec.Code, rec.Body.String())
	}
	eventually(t, "the buyer's notice", func() bool { return len(meta.to("6281211112222")) == 1 })
	rows, _ := f.db.ListOutbox("sent", 10)
	var providerID string
	for _, r := range rows {
		if r.Event == notify.EventBuyerOrderCreated {
			providerID = r.ProviderID
		}
	}
	if providerID == "" {
		t.Fatal("the message has the id Meta gave it")
	}
	status := `{"entry":[{"changes":[{"value":{"statuses":[{"id":"` + providerID + `","status":"failed","errors":[{"code":131026,"title":"Message undeliverable"}]}]}}]}]}`
	if out := signedPost(f.s.handleCloudWebhook, "/", "X-Hub-Signature-256", sha256Sig("app-secret-1", status), status); out.Code != 200 {
		t.Fatalf("a signed status is taken: %d %s", out.Code, out.Body.String())
	}
	rows, _ = f.db.ListOutbox("", 10)
	for _, r := range rows {
		if r.ProviderID == providerID && (r.ProviderStatus != "failed" || !strings.Contains(r.Error, "131026")) {
			t.Fatalf("what Meta said is kept beside the message: %+v", r)
		}
	}

	// unsigned, wrongly signed, and signed with another secret are all refused, and change nothing
	stop := `{"entry":[{"changes":[{"value":{"messages":[{"from":"6281211112222","type":"text","text":{"body":"BERHENTI"}}]}}]}]}`
	for name, sig := range map[string]string{"none": "", "garbage": "sha256=abc", "other secret": sha256Sig("another", stop)} {
		if out := signedPost(f.s.handleCloudWebhook, "/", "X-Hub-Signature-256", sig, stop); out.Code != 401 {
			t.Fatalf("%s must be refused: %d", name, out.Code)
		}
	}
	if out, _ := f.db.IsNotifyOptedOut("whatsapp_cloud", "6281211112222"); out {
		t.Fatal("a refused request must not stop anyone")
	}

	// a signed "stop" from the buyer's number: remembered, answered, and nothing more is sent
	if out := signedPost(f.s.handleCloudWebhook, "/", "X-Hub-Signature-256", sha256Sig("app-secret-1", stop), stop); out.Code != 200 {
		t.Fatalf("stop: %d %s", out.Code, out.Body.String())
	}
	if out, _ := f.db.IsNotifyOptedOut("whatsapp_cloud", "6281211112222"); !out {
		t.Fatal("the number asked to stop")
	}
	replied := false
	meta.mu.Lock()
	for _, m := range meta.messages {
		if m["type"] == "text" && m["to"] == "6281211112222" && strings.Contains(m["text"].(map[string]any)["body"].(string), "dihentikan") {
			replied = true
		}
	}
	meta.mu.Unlock()
	if !replied {
		t.Fatal("the number is told that it stopped, as plain text")
	}
	order := newestOrder(t, f)
	if err := f.s.fulfillOrder(order, nil, "dikonfirmasi"); err != nil {
		t.Fatal(err)
	}
	time.Sleep(500 * time.Millisecond)
	if n := len(meta.to("6281211112222")); n != 2 {
		// the notice, and the reply to stop; the activation notice must not follow
		t.Fatalf("nothing is sent to a number that asked to stop: %d messages", n)
	}

	// "mulai" brings it back
	start := `{"entry":[{"changes":[{"value":{"messages":[{"from":"6281211112222","type":"text","text":{"body":"mulai"}}]}}]}]}`
	if out := signedPost(f.s.handleCloudWebhook, "/", "X-Hub-Signature-256", sha256Sig("app-secret-1", start), start); out.Code != 200 {
		t.Fatalf("start: %d", out.Code)
	}
	if out, _ := f.db.IsNotifyOptedOut("whatsapp_cloud", "6281211112222"); out {
		t.Fatal("the number is back")
	}
	// a number nobody wrote to us from before gets no answer to "mulai", so a stranger cannot make the panel message it
	stranger := `{"entry":[{"changes":[{"value":{"messages":[{"from":"6289999999999","type":"text","text":{"body":"mulai"}}]}}]}]}`
	before := len(meta.to("6289999999999"))
	signedPost(f.s.handleCloudWebhook, "/", "X-Hub-Signature-256", sha256Sig("app-secret-1", stranger), stranger)
	if len(meta.to("6289999999999")) != before {
		t.Fatal("no reply to a stranger")
	}
}

func TestIntegrationWahaWebhookStopsANumber(t *testing.T) {
	t.Cleanup(notify.SetWhatsAppGaps(time.Millisecond, time.Millisecond))
	f := newNotifyFixture(t)
	f.s.notify.SetInboundBase("http://host.docker.internal:8787")

	var hmacKey, command string
	original := notify.DockerRun
	var stub *wahaStub
	notify.DockerRun = func(_ context.Context, env []string, args ...string) (string, error) {
		for _, e := range env {
			switch {
			case strings.HasPrefix(e, "WAHA_API_KEY="):
				stub.mu.Lock()
				stub.key = strings.TrimPrefix(e, "WAHA_API_KEY=")
				stub.mu.Unlock()
			case strings.HasPrefix(e, "WHATSAPP_HOOK_HMAC_KEY="):
				hmacKey = strings.TrimPrefix(e, "WHATSAPP_HOOK_HMAC_KEY=")
			}
		}
		if len(args) > 0 && args[0] == "run" {
			command = strings.Join(args, " ")
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
	if hmacKey == "" || strings.Contains(command, hmacKey) || !strings.Contains(command, "--add-host host.docker.internal:host-gateway") ||
		!strings.Contains(command, "-e WHATSAPP_HOOK_URL") {
		t.Fatalf("the container gets the webhook, its key by name and not on the command line: %q", command)
	}

	f.connectPhone(t, stub, f.super, "628111111111")
	plan := f.plan(t, "starter", 50000, 0, 0)
	if rec, _ := f.postOrder(t, "203.0.113.95", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "yuni", "email": "yuni@example.com", "password": "Sup3r-secret-pass", "whatsapp": "0813 5555 6666",
	}); rec.Code != 201 {
		t.Fatalf("order: %d %s", rec.Code, rec.Body.String())
	}
	eventually(t, "the buyer's notice", func() bool { return len(stub.textsTo("6281355556666@c.us")) == 1 })

	hook := func(sig string, body string) *httptest.ResponseRecorder {
		return signedPost(f.s.handleWahaWebhook, "/", "X-Webhook-Hmac", sig, body)
	}
	msg := func(from, text, session string, fromMe bool) string {
		me := "false"
		if fromMe {
			me = "true"
		}
		return `{"event":"message","session":"` + session + `","payload":{"from":"` + from + `","fromMe":` + me + `,"body":"` + text + `"}}`
	}
	stop := msg("6281355556666@c.us", "BERHENTI", "superadmin-owner", false)
	for name, sig := range map[string]string{"none": "", "wrong key": sha512Sig("nope", stop), "sha256 instead": sha256Sig(hmacKey, stop)} {
		if out := hook(sig, stop); out.Code != 401 {
			t.Fatalf("%s must be refused: %d", name, out.Code)
		}
	}
	if out, _ := f.db.IsNotifyOptedOut("waha", "6281355556666"); out {
		t.Fatal("a refused request must not stop anyone")
	}
	// our own messages and groups are not answers
	for _, body := range []string{msg("6281355556666@c.us", "BERHENTI", "superadmin-owner", true), msg("12345-678@g.us", "BERHENTI", "superadmin-owner", false)} {
		if out := hook(sha512Sig(hmacKey, body), body); out.Code != 200 {
			t.Fatalf("taken and ignored: %d", out.Code)
		}
	}
	if out, _ := f.db.IsNotifyOptedOut("waha", "6281355556666"); out {
		t.Fatal("only an answer from the number counts")
	}

	if out := hook(sha512Sig(hmacKey, stop), stop); out.Code != 200 {
		t.Fatalf("stop: %d %s", out.Code, out.Body.String())
	}
	if out, _ := f.db.IsNotifyOptedOut("waha", "6281355556666"); !out {
		t.Fatal("the number asked to stop")
	}
	eventually(t, "the answer to stop", func() bool {
		texts := stub.textsTo("6281355556666@c.us")
		return len(texts) == 2 && strings.Contains(texts[1], "dihentikan")
	})
	order := newestOrder(t, f)
	if err := f.s.fulfillOrder(order, nil, "dikonfirmasi"); err != nil {
		t.Fatal(err)
	}
	time.Sleep(500 * time.Millisecond)
	if n := len(stub.textsTo("6281355556666@c.us")); n != 2 {
		t.Fatalf("nothing more goes to a number that stopped: %d", n)
	}
}

func newestOrder(t *testing.T, f *notifyFixture) *database.HostingOrder {
	t.Helper()
	orders, _, err := f.db.ListHostingOrders(0, "", 5, 0)
	if err != nil || len(orders) == 0 {
		t.Fatalf("no order: %v", err)
	}
	newest := orders[0]
	for _, o := range orders {
		if o.ID > newest.ID {
			newest = o
		}
	}
	return &newest
}
