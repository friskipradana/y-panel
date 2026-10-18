package httpserver

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// WhatsApp Cloud from the handlers down to a Meta that is faked. Skipped without REN_TEST_DATABASE_URL.

type metaStub struct {
	*httptest.Server
	mu        sync.Mutex
	messages  []map[string]any
	templates map[string]string
	failSend  int
}

func newMetaStub(t *testing.T) *metaStub {
	t.Helper()
	m := &metaStub{templates: map[string]string{}}
	m.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.mu.Lock()
		defer m.mu.Unlock()
		if r.Header.Get("Authorization") != "Bearer EAAB-token" {
			w.WriteHeader(401)
			_, _ = w.Write([]byte(`{"error":{"message":"Invalid OAuth access token","type":"OAuthException","code":190}}`))
			return
		}
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		switch {
		case strings.HasSuffix(r.URL.Path, "/messages"):
			if m.failSend > 0 {
				m.failSend--
				w.WriteHeader(400)
				_, _ = w.Write([]byte(`{"error":{"message":"Template name does not exist","code":132001}}`))
				return
			}
			m.messages = append(m.messages, body)
			_, _ = w.Write([]byte(`{"messages":[{"id":"wamid.` + strconv.Itoa(len(m.messages)) + `"}]}`))
		case strings.HasSuffix(r.URL.Path, "/message_templates") && r.Method == http.MethodGet:
			var data []map[string]string
			for key, status := range m.templates {
				p := strings.SplitN(key, "|", 2)
				data = append(data, map[string]string{"name": p[0], "language": p[1], "status": status})
			}
			out, _ := json.Marshal(map[string]any{"data": data})
			_, _ = w.Write(out)
		case strings.HasSuffix(r.URL.Path, "/message_templates"):
			m.templates[body["name"].(string)+"|"+body["language"].(string)] = "APPROVED"
			_, _ = w.Write([]byte(`{"id":"1"}`))
		default:
			_, _ = w.Write([]byte(`{"display_phone_number":"+62 812-0000-1111","verified_name":"Reneo Hosting"}`))
		}
	}))
	t.Cleanup(m.Close)
	return m
}

func (m *metaStub) to(number string) []map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []map[string]any
	for _, msg := range m.messages {
		if msg["to"] == number {
			out = append(out, msg)
		}
	}
	return out
}

func templateName(msg map[string]any) string {
	return msg["template"].(map[string]any)["name"].(string)
}

func TestIntegrationWhatsAppCloudFromTheSettingsToTheBuyer(t *testing.T) {
	// the gaps are read when the worker starts, so they are set before the fixture makes it
	t.Cleanup(notify.SetWhatsAppGaps(time.Millisecond, time.Millisecond))
	f := newNotifyFixture(t)
	meta := newMetaStub(t)
	f.s.notify.UseCloudBase(meta.URL)

	// the details are checked with Meta: a wrong token is refused and nothing is saved
	rec := f.call(f.s.handleSaveCloudChannel, "PUT", "/", `{"enabled":true,"accessToken":"wrong","phoneId":"555","wabaId":"777"}`, f.super)
	if rec.Code != 400 || !strings.Contains(rec.Body.String(), "Meta did not accept") {
		t.Fatalf("a wrong token: %d %s", rec.Code, rec.Body.String())
	}
	if rec := f.call(f.s.handleSaveCloudChannel, "PUT", "/", `{"enabled":true,"accessToken":"EAAB-token","phoneId":"","wabaId":"777"}`, f.super); rec.Code != 400 {
		t.Fatalf("the phone number id is needed: %d", rec.Code)
	}
	rec = f.call(f.s.handleSaveCloudChannel, "PUT", "/", `{"enabled":true,"accessToken":"EAAB-token","phoneId":"555","wabaId":"777"}`, f.super)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"phoneName":"Reneo Hosting"`) || strings.Contains(rec.Body.String(), "EAAB-token") {
		t.Fatalf("saved, whose number is named, and the token never returns: %d %s", rec.Code, rec.Body.String())
	}
	// the switch alone does not need the token again
	if rec := f.call(f.s.handleSaveCloudChannel, "PUT", "/", `{"enabled":true,"phoneId":"555","wabaId":"777"}`, f.super); rec.Code != 200 {
		t.Fatalf("keeping the saved token: %d %s", rec.Code, rec.Body.String())
	}

	// the templates: all missing, then made, then all there
	rec = f.call(f.s.handleCloudTemplates, "GET", "/", "", f.super)
	if rec.Code != 200 || strings.Count(rec.Body.String(), `"status":"MISSING"`) < 20 {
		t.Fatalf("a fresh account has no template: %d", rec.Code)
	}
	rec = f.call(f.s.handleCreateCloudTemplates, "POST", "/", "", f.super)
	var made struct{ Created int }
	_ = json.Unmarshal(rec.Body.Bytes(), &made)
	if rec.Code != 200 || made.Created < 20 {
		t.Fatalf("templates made: %d %s", rec.Code, rec.Body.String())
	}
	if rec := f.call(f.s.handleCloudTemplates, "GET", "/", "", f.super); strings.Contains(rec.Body.String(), "MISSING") {
		t.Fatalf("none is missing now: %s", rec.Body.String()[:200])
	}

	// the seller's number: refused when badly written, saved when good, and a test message goes out as a template
	if rec := f.call(f.s.handleSetCloudNumber, "PUT", "/", `{"number":"12"}`, f.super); rec.Code != 400 {
		t.Fatalf("a bad number: %d", rec.Code)
	}
	if rec := f.call(f.s.handleSetCloudNumber, "PUT", "/", `{"number":"0811 2233 4455"}`, f.super); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"linked":true`) {
		t.Fatalf("a good number: %d %s", rec.Code, rec.Body.String())
	}
	if rec := f.call(f.s.handleTestCloud, "POST", "/", "", f.super); rec.Code != 202 {
		t.Fatalf("test: %d %s", rec.Code, rec.Body.String())
	}
	eventually(t, "the test template", func() bool { return len(meta.to("6281122334455")) >= 1 })
	if name := templateName(meta.to("6281122334455")[0]); name != "reneo_test" {
		t.Fatalf("the test goes as its own template: %s", name)
	}

	// an event of the seller goes there as well, as a template with its variables
	f.s.notify.Emit(notify.Event{Name: notify.EventOrderPaid, Key: "o-9", Data: map[string]any{"username": "andi", "plan": "Pro", "note": "dikonfirmasi"}})
	eventually(t, "the order notice on WhatsApp Cloud", func() bool {
		for _, m := range meta.to("6281122334455") {
			if templateName(m) == "reneo_order_paid" {
				return true
			}
		}
		return false
	})

	// a message whose template Meta does not have fails by itself and does not spoil the channel
	meta.mu.Lock()
	meta.failSend = 1
	meta.mu.Unlock()
	f.s.notify.Emit(notify.Event{Name: notify.EventPlanEnded, Key: "p-1", Data: map[string]any{"username": "andi", "plan": "Pro"}})
	eventually(t, "the failed message", func() bool {
		rows, _ := f.db.ListOutbox("failed", 10)
		for _, r := range rows {
			if r.Event == notify.EventPlanEnded && strings.Contains(r.Error, "132001") {
				return true
			}
		}
		return false
	})
	if rec := f.call(f.s.handleNotifyOverview, "GET", "/", "", f.super); strings.Contains(rec.Body.String(), `"kind":"whatsapp_cloud","enabled":true,"configured":true,"status":"error"`) {
		t.Fatalf("one missing template must not put the channel in error: %s", rec.Body.String())
	}

	// a buyer orders while WAHA is off: the number is kept for WhatsApp Cloud, and the notices go as templates
	plan := f.plan(t, "starter", 50000, 0, 0)
	rec, view := f.postOrder(t, "203.0.113.80", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "dewi", "email": "dewi@example.com", "password": "Sup3r-secret-pass", "whatsapp": "0813 9999 0000",
	})
	if rec.Code != 201 {
		t.Fatalf("order: %d %s", rec.Code, rec.Body.String())
	}
	eventually(t, "the buyer's template", func() bool {
		for _, m := range meta.to("6281399990000") {
			if templateName(m) == "reneo_buyer_order_created" {
				return true
			}
		}
		return false
	})
	// and without a number the form refuses, since a channel can carry it
	if rec, _ := f.postOrder(t, "203.0.113.81", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "tono", "email": "tono@example.com", "password": "Sup3r-secret-pass",
	}); rec.Code != 400 {
		t.Fatalf("a number is needed now: %d", rec.Code)
	}
	order, _ := f.db.GetHostingOrderByPublicID(view.PublicID)
	if err := f.s.fulfillOrder(order, nil, "dikonfirmasi"); err != nil {
		t.Fatal(err)
	}
	eventually(t, "the buyer's activation template", func() bool {
		for _, m := range meta.to("6281399990000") {
			if templateName(m) == "reneo_buyer_order_paid" {
				return true
			}
		}
		return false
	})

	// let everything queued so far leave before the channel is switched off
	eventually(t, "the queue to empty", func() bool {
		pending, _, _ := f.db.OutboxCounts()
		return pending == 0
	})
	// switching the channel off stops the sending
	if rec := f.call(f.s.handleSaveCloudChannel, "PUT", "/", `{"enabled":false,"phoneId":"555","wabaId":"777"}`, f.super); rec.Code != 200 {
		t.Fatalf("off: %d", rec.Code)
	}
	before := len(meta.to("6281122334455"))
	f.s.notify.Emit(notify.Event{Name: notify.EventOrderPaid, Key: "o-10", Data: map[string]any{"username": "x", "plan": "Pro", "note": ""}})
	time.Sleep(400 * time.Millisecond)
	if len(meta.to("6281122334455")) != before {
		t.Fatal("nothing is sent while the channel is off")
	}
}
