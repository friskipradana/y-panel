package httpserver

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// via lists what a bot (by token) was asked to send to a chat
func (t *telegramStub) via(token, chat string) []string {
	t.mu.Lock()
	defer t.mu.Unlock()
	var out []string
	for _, m := range t.sentVia {
		if m.token == token && m.chat == chat {
			out = append(out, m.text)
		}
	}
	return out
}

// A plan can include bringing your own notification bot: the account keeps its own Telegram bot, links its chat through it, and its
// notices leave from that bot and no other, for as long as the plan includes it. Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationPlanWithYourOwnNotificationBot(t *testing.T) {
	f := newNotifyFixture(t)
	free := f.plan(t, "plain", 25000, 0, 0)
	withBot, err := f.db.CreateHostingPlan(database.HostingPlan{
		Slug: "pro", Name: "Pro", Period: "monthly", PriceAmount: 75000, OwnNotify: true, Visible: true,
		MaxProjects: 2, MaxTunnels: 2, MaxDatabases: 1, DiskQuotaMB: 1000, CPULimitPct: 100, MemoryLimitMB: 512,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !withBot.OwnNotify {
		t.Fatal("the plan keeps the feature")
	}
	dewi, err := f.db.CreateUser("dewi", "dewi@example.com", "hash", "user", "Dewi")
	if err != nil {
		t.Fatal(err)
	}
	ina, err := f.db.CreateUser("ina", "ina@example.com", "hash", "user", "Ina")
	if err != nil {
		t.Fatal(err)
	}
	until := time.Now().Add(30 * 24 * time.Hour)
	setPlan := func(u *database.User, planID int64) {
		t.Helper()
		if err := f.db.SetUserPlan(u.ID, planID, &until); err != nil {
			t.Fatal(err)
		}
	}
	saveBot := func(u *database.User, body string) (code int, text string) {
		rec := f.call(f.s.handleSaveOwnBot, http.MethodPut, "/api/v1/me/telegram/bot", body, u)
		return rec.Code, rec.Body.String()
	}

	// a plan without the feature cannot bring a bot
	setPlan(dewi, free.ID)
	if code, text := saveBot(dewi, `{"botToken":"555:DEWI","enabled":true}`); code != http.StatusForbidden || !strings.Contains(text, "does not include") {
		t.Fatalf("a plan without the feature: %d %s", code, text)
	}
	if state, _ := f.s.notify.OwnBot(dewi.ID); state.Allowed || state.Configured {
		t.Fatalf("not allowed, nothing saved: %+v", state)
	}

	setPlan(dewi, withBot.ID)
	if code, text := saveBot(dewi, `{"botToken":"555:DEWI","enabled":true}`); code != http.StatusOK || !strings.Contains(text, `"botUsername":"dewi_bot"`) || strings.Contains(text, "555:DEWI") {
		t.Fatalf("saving the bot of an account: %d %s", code, text)
	}
	// the token is stored encrypted, never as it was typed
	if bot, _ := f.db.GetUserTelegramBot(dewi.ID); bot == nil || bot.TokenEnc == "" || strings.Contains(bot.TokenEnc, "555:DEWI") {
		t.Fatalf("stored token: %+v", bot)
	}
	// the bot of the panel, and the bot of another account, are not hers to take
	if code, text := saveBot(dewi, `{"botToken":"123:TEST","enabled":true}`); code != http.StatusBadRequest || !strings.Contains(text, "bot of the panel") {
		t.Fatalf("the bot of the panel: %d %s", code, text)
	}
	setPlan(ina, withBot.ID)
	if code, text := saveBot(ina, `{"botToken":"555:DEWI","enabled":true}`); code != http.StatusBadRequest || !strings.Contains(text, "already used") {
		t.Fatalf("the bot of another account: %d %s", code, text)
	}

	// the link goes through her own bot, and only her code completes it there
	link := f.call(f.s.handleStartTelegramLink, http.MethodPost, "/api/v1/me/telegram/link", "", dewi)
	if link.Code != http.StatusOK || !strings.Contains(link.Body.String(), "t.me/dewi_bot?start=") {
		t.Fatalf("link: %d %s", link.Code, link.Body.String())
	}
	rec, _ := f.db.GetNotifyRecipient(dewi.ID, "telegram")
	f.tg.mu.Lock()
	f.tg.updatesVia = map[string][]map[string]any{"555:DEWI": {
		{"update_id": 1, "message": map[string]any{"text": "/start " + rec.LinkCode, "chat": map[string]any{"id": 7001, "type": "private"}}},
	}}
	f.tg.mu.Unlock()
	if check := f.call(f.s.handleCheckTelegramLink, http.MethodPost, "/api/v1/me/telegram/link/check", "", dewi); check.Code != http.StatusOK || !strings.Contains(check.Body.String(), `"linked":true`) {
		t.Fatalf("check: %d %s", check.Code, check.Body.String())
	}
	if rec, _ = f.db.GetNotifyRecipient(dewi.ID, "telegram"); rec == nil || !rec.OwnBot || rec.Address != "7001" {
		t.Fatalf("linked through her own bot: %+v", rec)
	}
	eventually(t, "the confirmation from her own bot", func() bool { return len(f.tg.via("555:DEWI", "7001")) >= 1 })

	// her notices leave from her bot, the seller's from the seller's
	f.s.notify.Emit(notify.Event{Name: notify.EventLoginNew, UserIDs: []int64{dewi.ID}, Key: "a", Data: map[string]any{"username": "dewi", "ip": "203.0.113.9", "browser": "Chrome", "time": "now"}})
	eventually(t, "her notice from her own bot", func() bool { return len(f.tg.via("555:DEWI", "7001")) >= 2 })
	if got := f.tg.via("123:TEST", "7001"); len(got) != 0 {
		t.Fatalf("the bot of the seller never writes to her chat: %v", got)
	}
	f.s.notify.Emit(notify.Event{Name: notify.EventOrderCreated, Key: "o1", Data: map[string]any{"order": 1, "username": "x", "plan": "Pro"}})
	eventually(t, "the notice of the seller from the bot of the seller", func() bool { return len(f.tg.via("123:TEST", "9001")) >= 1 })

	// a test message goes through her bot too
	if test := f.call(f.s.handleTestTelegram, http.MethodPost, "/api/v1/me/telegram/test", "", dewi); test.Code != http.StatusAccepted {
		t.Fatalf("test: %d %s", test.Code, test.Body.String())
	}
	eventually(t, "the test message from her own bot", func() bool { return len(f.tg.via("555:DEWI", "7001")) >= 3 })

	// the account shows the bot as its channel
	if my := f.call(f.s.handleMyTelegram, http.MethodGet, "/api/v1/me/telegram", "", dewi); !strings.Contains(my.Body.String(), `"own":true`) || !strings.Contains(my.Body.String(), "dewi_bot") {
		t.Fatalf("my telegram: %s", my.Body.String())
	}

	// when the plan no longer includes it nothing is sent from the bot, and not from the bot of the seller either
	before := len(f.tg.via("555:DEWI", "7001"))
	setPlan(dewi, free.ID)
	f.s.notify.Emit(notify.Event{Name: notify.EventLoginNew, UserIDs: []int64{dewi.ID}, Key: "b", Data: map[string]any{"username": "dewi", "ip": "203.0.113.9", "browser": "Chrome", "time": "later"}})
	time.Sleep(300 * time.Millisecond)
	if after := len(f.tg.via("555:DEWI", "7001")); after != before {
		t.Fatalf("a plan without the feature sends nothing from her bot: %d -> %d", before, after)
	}
	if got := f.tg.via("123:TEST", "7001"); len(got) != 0 {
		t.Fatalf("and the seller's bot does not stand in: %v", got)
	}

	// a notice that was already queued when the plan ended is cancelled, not sent through another bot
	queued, _, err := f.db.EnqueueOutbox(database.OutboxMessage{
		Event: notify.EventLoginNew, UserID: dewi.ID, Kind: "telegram", Address: "7001", Payload: []byte(`{"username":"dewi"}`),
		Key: "late", Priority: notify.PriorityNormal,
	})
	if err != nil {
		t.Fatal(err)
	}
	f.s.notify.Wake()
	eventually(t, "the queued notice to be cancelled", func() bool {
		m, _ := f.db.GetOutbox(queued)
		return m != nil && m.Status == database.OutboxCancelled && strings.Contains(m.Error, "plan")
	})
	if got := f.tg.via("123:TEST", "7001"); len(got) != 0 {
		t.Fatalf("the seller's bot did not take it over: %v", got)
	}

	// removing the bot removes the chat linked through it
	setPlan(dewi, withBot.ID)
	if rec := f.call(f.s.handleRemoveOwnBot, http.MethodDelete, "/api/v1/me/telegram/bot", "", dewi); rec.Code != http.StatusOK {
		t.Fatalf("remove: %d", rec.Code)
	}
	if rec, _ := f.db.GetNotifyRecipient(dewi.ID, "telegram"); rec != nil && rec.Address != "" {
		t.Fatalf("the chat linked through the bot is gone: %+v", rec)
	}
	if state, _ := f.s.notify.OwnBot(dewi.ID); state.Configured {
		t.Fatalf("the bot is gone: %+v", state)
	}
}
