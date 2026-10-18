package notify

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestEveryEventHasBothLanguagesAndNoRawPlaceholderSurvives(t *testing.T) {
	for event, x := range catalog {
		if strings.TrimSpace(x.id) == "" || strings.TrimSpace(x.en) == "" {
			t.Errorf("%s needs an Indonesian and an English text", event)
		}
		for _, locale := range []string{"id", "en"} {
			out := Render(event, locale, nil)
			if strings.ContainsAny(out, "{}") {
				t.Errorf("%s (%s) leaves a placeholder: %q", event, locale, out)
			}
		}
	}
	for _, event := range append([]string{}, DetectorEvents...) {
		if !Known(event) {
			t.Errorf("the detector event %s has no text", event)
		}
	}
}

func TestValuesAreEscapedSoTheyCannotAddMarkup(t *testing.T) {
	out := Render(EventOrderPaid, "id", map[string]any{"username": "<b>x</b>&", "plan": "Pro", "note": ""})
	if strings.Contains(out, "<b>x</b>") || !strings.Contains(out, "&lt;b&gt;x&lt;/b&gt;&amp;") {
		t.Fatalf("a username must not add tags: %q", out)
	}
	if !strings.Contains(out, "<b>Pesanan terbayar</b>") {
		t.Fatalf("the title of the catalog keeps its own tag: %q", out)
	}
}

func TestNumbersFromJSONReadAsWholeNumbers(t *testing.T) {
	var data map[string]any
	_ = json.Unmarshal([]byte(`{"count": 7, "ips": 3, "minutes": 10, "ip": "1.2.3.4", "username": "budi"}`), &data)
	out := Render(EventLoginFailed, "id", data)
	if !strings.Contains(out, "7 percobaan") || !strings.Contains(out, "dari 3 alamat IP") || strings.Contains(out, "7.0") {
		t.Fatalf("whole numbers are not shown with decimals: %q", out)
	}
}

func TestVariantAddsALineAndLanguageFallsBackToIndonesian(t *testing.T) {
	d := map[string]any{"variant": "ended", "total": 40, "duration": "12 menit", "ip": "-"}
	if out := Render(EventRequestFlood, "en", d); !strings.Contains(out, "calmed down") || !strings.Contains(out, "40") {
		t.Fatalf("the ended line is English for an English recipient: %q", out)
	}
	if out := Render(EventRequestFlood, "fr", d); !strings.Contains(out, "Sudah reda") {
		t.Fatalf("an unknown language falls back to Indonesian: %q", out)
	}
	if Render("no.such.event", "id", nil) != "" {
		t.Fatal("an unknown event has no text")
	}
}

func TestGroupsAndMuting(t *testing.T) {
	if Group(EventLoginFailed) != "security" || Group(EventTest) != "test" {
		t.Fatal("the group is the part before the dot")
	}
	if !IsMuted([]string{"attack"}, EventAccountScan) || IsMuted([]string{"attack"}, EventLoginFailed) {
		t.Fatal("switching a group off mutes its events and no others")
	}
	if !IsMuted([]string{EventOrderCreated}, EventOrderCreated) || IsMuted(nil, EventOrderCreated) {
		t.Fatal("an event can be muted by itself")
	}
	if PriorityOf(EventLoginFailed) != PriorityUrgent || PriorityOf(EventOrderCreated) != PriorityNormal || PriorityOf(EventOrderReview) != PriorityUrgent {
		t.Fatal("security and what needs review go first")
	}
	if !ForSeller(EventAccountScan) || ForSeller(EventLoginFailed) {
		t.Fatal("attacks are told to the seller, a failed sign-in to its owner")
	}
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

func fakeTelegramServer(t *testing.T, reply func(method string, body map[string]any) (int, string)) *Telegram {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		method := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		status, payload := reply(method, body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(payload))
	}))
	t.Cleanup(srv.Close)
	return NewTelegram("123:SECRET-TOKEN").WithBase(srv.URL)
}

func TestTelegramSendsAndReturnsTheMessageID(t *testing.T) {
	var got map[string]any
	tg := fakeTelegramServer(t, func(method string, body map[string]any) (int, string) {
		got = body
		return 200, `{"ok":true,"result":{"message_id":4242}}`
	})
	id, err := tg.Send(context.Background(), "555", "<b>hi</b>")
	if err != nil || id != "4242" {
		t.Fatalf("send: %q %v", id, err)
	}
	if got["chat_id"] != "555" || got["text"] != "<b>hi</b>" || got["parse_mode"] != "HTML" || got["disable_web_page_preview"] != true {
		t.Fatalf("what was sent: %+v", got)
	}
}

func TestTelegramFailuresAreSortedForTheWorker(t *testing.T) {
	cases := []struct {
		name  string
		code  int
		body  string
		check func(*SendError) bool
	}{
		{"429 asks to wait", 429, `{"ok":false,"error_code":429,"description":"Too Many Requests","parameters":{"retry_after":7}}`,
			func(e *SendError) bool { return e.Temporary && e.RetryAfter == 7*time.Second }},
		{"500 can work later", 500, `{"ok":false,"error_code":500,"description":"Internal"}`, func(e *SendError) bool { return e.Temporary }},
		{"403 means blocked", 403, `{"ok":false,"error_code":403,"description":"Forbidden: bot was blocked by the user"}`, func(e *SendError) bool { return e.Blocked && !e.Temporary }},
		{"401 is the token", 401, `{"ok":false,"error_code":401,"description":"Unauthorized"}`, func(e *SendError) bool { return e.Config && !e.Temporary }},
		{"400 never works", 400, `{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}`, func(e *SendError) bool { return !e.Temporary && !e.Blocked && !e.Config }},
	}
	for _, c := range cases {
		tg := fakeTelegramServer(t, func(string, map[string]any) (int, string) { return c.code, c.body })
		_, err := tg.Send(context.Background(), "1", "x")
		se := AsSendError(err)
		if !c.check(se) {
			t.Errorf("%s: got %+v", c.name, se)
		}
	}
}

func TestTheTokenNeverReachesAnErrorMessage(t *testing.T) {
	tg := NewTelegram("123:SECRET-TOKEN").WithBase("http://127.0.0.1:1")
	_, err := tg.Send(context.Background(), "1", "x")
	if err == nil {
		t.Fatal("nothing listens there")
	}
	if strings.Contains(err.Error(), "SECRET-TOKEN") {
		t.Fatalf("the token leaked into the error: %v", err)
	}
	if !AsSendError(err).Temporary {
		t.Fatal("a network failure can work later")
	}
}

func TestGetMeAndUpdatesAndStartCodes(t *testing.T) {
	tg := fakeTelegramServer(t, func(method string, body map[string]any) (int, string) {
		switch method {
		case "getMe":
			return 200, `{"ok":true,"result":{"id":9,"username":"reneo_bot","first_name":"Reneo"}}`
		case "getUpdates":
			return 200, `{"ok":true,"result":[{"update_id":10,"message":{"text":"/start abc12345","chat":{"id":-100123,"type":"group","title":"Tim"}}},{"update_id":11}]}`
		}
		return 404, `{"ok":false,"error_code":404,"description":"not found"}`
	})
	bot, err := tg.GetMe(context.Background())
	if err != nil || bot.Username != "reneo_bot" {
		t.Fatalf("getMe: %+v %v", bot, err)
	}
	updates, err := tg.GetUpdates(context.Background(), 0)
	if err != nil || len(updates) != 2 || updates[0].Message.Chat.ID != -100123 {
		t.Fatalf("updates: %+v %v", updates, err)
	}
	for text, want := range map[string]string{
		"/start abc12345": "ABC12345", "/start@reneo_bot abc12345": "ABC12345", "/start": "", "hello abc": "", "": "",
	} {
		if got := StartCode(text); got != want {
			t.Errorf("StartCode(%q) = %q, want %q", text, got, want)
		}
	}
}

func TestLinkCodesLookAlikeFree(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		code := NewLinkCode()
		if len(code) != 8 || strings.ContainsAny(code, "01OIl") {
			t.Fatalf("a code is eight characters without look-alikes: %q", code)
		}
		seen[code] = true
	}
	if len(seen) < 190 {
		t.Fatal("codes must not repeat")
	}
}

func TestDevicesAreNamedByNetworkAndBrowserNotByTheAddress(t *testing.T) {
	chrome := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
	if Fingerprint("203.0.113.5", chrome) != Fingerprint("203.0.113.200", chrome) {
		t.Fatal("two addresses of one network are one device")
	}
	if Fingerprint("203.0.113.5", chrome) == Fingerprint("198.51.100.5", chrome) {
		t.Fatal("another network is another device")
	}
	firefox := "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"
	if Fingerprint("203.0.113.5", chrome) == Fingerprint("203.0.113.5", firefox) {
		t.Fatal("another browser is another device")
	}
	if Browser(chrome) != "Chrome di Windows" || Browser(firefox) != "Firefox di Linux" || Browser("curl/8.4") != "alat baris perintah" {
		t.Fatalf("browsers: %q %q %q", Browser(chrome), Browser(firefox), Browser("curl/8.4"))
	}
	if Fingerprint("2001:db8:1:2::1", chrome) != Fingerprint("2001:db8:1:ffff::9", chrome) {
		t.Fatal("an IPv6 network is the first 48 bits")
	}
}

func TestRetryDelaysGrowAndHonourWhatTheChannelAsked(t *testing.T) {
	if DelayAfter(1, 0) != 5*time.Second || DelayAfter(3, 0) != 5*time.Minute || DelayAfter(99, 0) != 2*time.Hour {
		t.Fatal("the wait grows with the tries and stops at two hours")
	}
	if DelayAfter(1, time.Minute) != time.Minute {
		t.Fatal("when the channel asks for longer, wait that long")
	}
	if MaxAttempts != len(RetryDelays)+1 {
		t.Fatal("the first try and the retries")
	}
}
