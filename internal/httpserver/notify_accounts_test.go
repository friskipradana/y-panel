package httpserver

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// Notices for accounts that are not the owner: their own Telegram, and what a buyer hears about the plan.
// Skipped without REN_TEST_DATABASE_URL.

func TestIntegrationAnAccountLinksItsOwnTelegramForSecurityNotices(t *testing.T) {
	f := newNotifyFixture(t)
	user, err := f.db.CreateUser("rani", "rani@example.com", "hash", auth.UserRole, "Rani")
	if err != nil {
		t.Fatal(err)
	}
	admin, err := f.db.CreateUser("adi", "adi@example.com", "hash", auth.AdminRole, "Adi")
	if err != nil {
		t.Fatal(err)
	}

	// the bot is the owner's; an account sees only whether it is there and its own state, never the token
	rec := f.call(f.s.handleMyTelegram, "GET", "/", "", user)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"botUsername":"reneo_test_bot"`) || !strings.Contains(rec.Body.String(), `"linked":false`) || strings.Contains(rec.Body.String(), "TEST") {
		t.Fatalf("overview: %d %s", rec.Code, rec.Body.String())
	}
	// the demo account has no chat of its own
	demo := &database.User{ID: 999999, Username: "demo", Role: auth.UserRole}
	if rec := f.call(f.s.forAccount(f.s.handleStartTelegramLink), "POST", "/", "", demo); rec.Code == 200 {
		t.Fatalf("the demo account must not link: %d", rec.Code)
	}

	// each account links its own chat, and two accounts never share one
	for _, c := range []struct {
		u    *database.User
		chat int
		id   int
	}{{user, 5001, 1}, {admin, 5002, 2}} {
		rec := f.call(f.s.forAccount(f.s.handleStartTelegramLink), "POST", "/", "", c.u)
		var link struct{ Code string }
		_ = json.Unmarshal(rec.Body.Bytes(), &link)
		if rec.Code != 200 || len(link.Code) != 8 {
			t.Fatalf("link for %s: %d %s", c.u.Username, rec.Code, rec.Body.String())
		}
		f.tg.mu.Lock()
		f.tg.updates = append(f.tg.updates, map[string]any{"update_id": 100 + c.id, "message": map[string]any{"text": "/start " + link.Code, "chat": map[string]any{"id": c.chat, "type": "private"}}})
		f.tg.mu.Unlock()
	}
	for _, u := range []*database.User{user, admin} {
		rec := f.call(f.s.forAccount(f.s.handleCheckTelegramLink), "POST", "/", "", u)
		if !strings.Contains(rec.Body.String(), `"linked":true`) {
			t.Fatalf("%s is linked: %s", u.Username, rec.Body.String())
		}
	}

	// a security notice goes to that account's chat and to no other
	f.s.emitPasswordChanged(user, "")
	eventually(t, "the notice to Rani", func() bool {
		for _, text := range f.tg.textsTo("5001") {
			if strings.Contains(text, "Kata sandi diganti") && strings.Contains(text, "rani") {
				return true
			}
		}
		return false
	})
	time.Sleep(300 * time.Millisecond)
	for _, chat := range []string{"5002", "9001"} {
		for _, text := range f.tg.textsTo(chat) {
			if strings.Contains(text, "Kata sandi diganti") {
				t.Fatalf("chat %s got the notice of another account", chat)
			}
		}
	}

	// the account can try it, and switch the notices off
	if rec := f.call(f.s.forAccount(f.s.handleTestTelegram), "POST", "/", "", user); rec.Code != 202 {
		t.Fatalf("test: %d %s", rec.Code, rec.Body.String())
	}
	if rec := f.call(f.s.forAccount(f.s.handleSetTelegramMuted), "PUT", "/", `{"mutedEvents":["security"]}`, user); rec.Code != 200 {
		t.Fatalf("mute: %d", rec.Code)
	}
	before := len(f.tg.textsTo("5001"))
	f.s.emitTokenCreated(user, "deploy")
	time.Sleep(400 * time.Millisecond)
	if len(f.tg.textsTo("5001")) != before {
		t.Fatal("a muted group is not sent")
	}
	// an account that never linked hears nothing
	other, _ := f.db.CreateUser("lia", "lia@example.com", "hash", auth.UserRole, "Lia")
	f.s.emitPasswordChanged(other, "")
	time.Sleep(300 * time.Millisecond)
}

func TestIntegrationTheBuyerHearsThePlanIsRunningOutAndEnded(t *testing.T) {
	t.Cleanup(notify.SetWhatsAppGaps(time.Millisecond, time.Millisecond))
	f := newNotifyFixture(t)
	meta := newMetaStub(t)
	f.s.notify.UseCloudBase(meta.URL)
	if rec := f.call(f.s.handleSaveCloudChannel, "PUT", "/", `{"enabled":true,"accessToken":"EAAB-token","phoneId":"555","wabaId":"777"}`, f.super); rec.Code != 200 {
		t.Fatalf("cloud: %d %s", rec.Code, rec.Body.String())
	}
	plan := f.plan(t, "starter", 50000, 0, 0)
	if rec, _ := f.postOrder(t, "203.0.113.99", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "tari", "email": "tari@example.com", "password": "Sup3r-secret-pass", "whatsapp": "0812 7777 8888",
	}); rec.Code != 201 {
		t.Fatalf("order: %d %s", rec.Code, rec.Body.String())
	}
	buyer, _ := f.db.GetUserByUsername("tari")
	ends := time.Now().Add(48 * time.Hour)
	f.s.buyerPlanReminder(buyer, "Starter", ends, 2)
	f.s.buyerPlanReminder(buyer, "Starter", ends, 2)
	f.s.buyerPlanEnded(buyer, "Starter", &ends)
	names := func() map[string]int {
		out := map[string]int{}
		for _, m := range meta.to("6281277778888") {
			out[templateName(m)]++
		}
		return out
	}
	eventually(t, "both notices", func() bool { n := names(); return n["reneo_buyer_plan_reminder"] == 1 && n["reneo_buyer_plan_ended"] == 1 })
	time.Sleep(300 * time.Millisecond)
	if n := names(); n["reneo_buyer_plan_reminder"] != 1 {
		t.Fatalf("the reminder for one end date is told once: %v", n)
	}
}
