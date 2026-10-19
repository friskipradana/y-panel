package httpserver

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/database/dbtest"
)

// The hosting purchase flow against a real PostgreSQL (see dbtest): order, payment match, activation, trial, reminders.
// Skipped unless REN_TEST_DATABASE_URL is set.

type hostingFixture struct {
	s     *Server
	db    *database.Manager
	super *database.User
}

func newHostingFixture(t *testing.T) *hostingFixture {
	t.Helper()
	db := dbtest.New(t)
	cfg := config.Config{StateDir: t.TempDir()}
	s := &Server{cfg: cfg, database: db, auth: auth.NewManager(db, time.Hour), rateLimits: map[string]*rateLimitEntry{}}
	super, err := db.CreateUser("owner", "owner@example.com", "hash", auth.SuperadminRole, "Owner")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.saveSiteSettings(siteSettings{
		LandingEnabled: true, IndexingEnabled: true, HostingEnabled: true, SelfSignup: true,
		OrderBank: "BCA", OrderAccount: "1234567890", OrderHolder: "Reneo", OrderUniqueMax: 999,
	}); err != nil {
		t.Fatal(err)
	}
	forgetHostingHosts()
	return &hostingFixture{s: s, db: db, super: super}
}

func (f *hostingFixture) plan(t *testing.T, slug string, price int64, subdomains, trialDays int) *database.HostingPlan {
	t.Helper()
	p, err := f.db.CreateHostingPlan(database.HostingPlan{
		Slug: slug, Name: strings.ToUpper(slug[:1]) + slug[1:], Period: "monthly", PriceAmount: price,
		MaxProjects: 2, MaxTunnels: 2, MaxDatabases: 1, DiskQuotaMB: 1000, CPULimitPct: 100, MemoryLimitMB: 512,
		MaxSubdomains: subdomains, MaxCustomDomains: 1, TrialDays: trialDays, Visible: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func (f *hostingFixture) postOrder(t *testing.T, ip string, body map[string]any) (*httptest.ResponseRecorder, orderView) {
	t.Helper()
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/public/hosting/orders", bytes.NewReader(raw))
	req.RemoteAddr = ip + ":4000"
	rec := httptest.NewRecorder()
	f.s.handlePublicCreateOrder(rec, req)
	var view orderView
	_ = json.Unmarshal(rec.Body.Bytes(), &view)
	return rec, view
}

func lastNotification(t *testing.T, db *database.Manager, userID int64) string {
	t.Helper()
	n, err := db.GetLatestNotification(userID)
	if err != nil || n == nil {
		return ""
	}
	return n.Title + " | " + n.Body
}

func TestIntegrationBuyerOrdersPaysAndGetsActivated(t *testing.T) {
	f := newHostingFixture(t)
	plan := f.plan(t, "starter", 50000, 0, 7)

	rec, view := f.postOrder(t, "203.0.113.10", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "budi", "email": "budi@example.com", "password": "Sup3r-secret-pass",
	})
	if rec.Code != http.StatusCreated || view.Status != database.OrderPending {
		t.Fatalf("an order is created and waits: %d %s", rec.Code, rec.Body.String())
	}
	if view.AmountTotal <= 50000 || view.AmountTotal > 50999 || view.Payment == nil || len(view.Payment.Methods) != 1 || view.Payment.Methods[0].Account != "1234567890" {
		t.Fatalf("the buyer sees the exact total and where to pay: %+v", view)
	}

	// the account exists but cannot sign in yet, and a wrong password learns nothing about it
	if _, _, err := f.s.auth.Login("budi", "Sup3r-secret-pass", "", ""); !errors.Is(err, auth.ErrUserPending) {
		t.Fatalf("an unpaid account cannot sign in: %v", err)
	}
	if _, _, err := f.s.auth.Login("budi", "wrong-password", "", ""); !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Fatalf("a wrong password gives the same answer as for any account: %v", err)
	}
	if again, _ := f.postOrder(t, "203.0.113.11", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "budi", "email": "other@example.com", "password": "Sup3r-secret-pass",
	}); again.Code != http.StatusConflict {
		t.Fatalf("a taken username is refused, got %d", again.Code)
	}

	order, _ := f.db.GetHostingOrderByPublicID(view.PublicID)
	now := time.Now()

	// a transfer of another amount pays nothing
	f.s.matchHostingOrderPayment("Rp 12.345", 0, now)
	if o, _ := f.db.GetHostingOrder(order.ID); o.Status != database.OrderPending {
		t.Fatalf("another amount must not pay the order: %s", o.Status)
	}

	// with auto-confirm off the exact transfer waits for the superadmin
	f.s.matchHostingOrderPayment(formatAmount(view.AmountTotal), 0, now)
	if o, _ := f.db.GetHostingOrder(order.ID); o.Status != database.OrderReview {
		t.Fatalf("the exact transfer goes to review while auto-confirm is off: %s", o.Status)
	}
	if user, _ := f.db.GetUserByUsername("budi"); user.Status != "pending" {
		t.Fatal("the account stays off until the payment is confirmed")
	}

	// the superadmin confirms: the account is active, on its plan, and the buyer is told
	if err := f.s.fulfillOrder(order, nil, "dikonfirmasi admin"); err != nil {
		t.Fatal(err)
	}
	user, _ := f.db.GetUserByUsername("budi")
	if user.Status != "active" {
		t.Fatalf("a paid order switches the account on, got %s", user.Status)
	}
	up, _ := f.db.GetUserPlan(user.ID)
	if up == nil || up.PlanID == nil || *up.PlanID != plan.ID || up.ExpiresAt == nil || up.ExpiresAt.Before(now.Add(27*24*time.Hour)) {
		t.Fatalf("the account is on the plan for a month: %+v", up)
	}
	if quota, _ := f.db.GetUserQuota(user.ID); quota == nil || quota.MaxProjects != 2 || quota.MemoryLimitMB != 512 {
		t.Fatalf("the quota follows the plan: %+v", quota)
	}
	if got := lastNotification(t, f.db, user.ID); !strings.HasPrefix(got, "Akun aktif") {
		t.Fatalf("the buyer is told in the panel the account is active, got %q", got)
	}
	if _, _, err := f.s.auth.Login("budi", "Sup3r-secret-pass", "", ""); err != nil {
		t.Fatalf("the buyer can sign in now: %v", err)
	}
	// a second confirmation changes nothing
	before, _ := f.db.GetUserPlan(user.ID)
	if err := f.s.fulfillOrder(order, nil, "dua kali"); err != nil {
		t.Fatal(err)
	}
	if after, _ := f.db.GetUserPlan(user.ID); !after.ExpiresAt.Equal(*before.ExpiresAt) {
		t.Fatal("confirming twice must not extend the plan twice")
	}
}

func TestIntegrationExactTransferActivatesWhenAutoConfirmIsOn(t *testing.T) {
	f := newHostingFixture(t)
	plan := f.plan(t, "starter", 50000, 0, 0)
	if err := f.db.UpdatePaymentSetting("auto_confirm", "true"); err != nil {
		t.Fatal(err)
	}
	device, err := f.db.RegisterNotificationDevice("dev-1", "key-1", nil)
	if err != nil {
		t.Fatal(err)
	}
	_, view := f.postOrder(t, "203.0.113.20", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 2, "username": "sari", "email": "sari@example.com", "password": "Sup3r-secret-pass",
	})
	if view.AmountBase != 100000 {
		t.Fatalf("two months cost twice the price: %d", view.AmountBase)
	}
	captured, err := f.db.InsertCapturedNotification(device.ID, "com.bank", "Bank", "Transfer masuk", "Terima Rp", formatAmount(view.AmountTotal))
	if err != nil || captured == nil {
		t.Fatalf("captured notification: %v", err)
	}
	f.s.matchHostingOrderPayment(formatAmount(view.AmountTotal), captured.ID, captured.ReceivedAt)

	order, _ := f.db.GetHostingOrderByPublicID(view.PublicID)
	if order.Status != database.OrderPaid || order.NotifID == nil || *order.NotifID != captured.ID {
		t.Fatalf("the notification pays its order and is remembered on it: %+v", order)
	}
	user, _ := f.db.GetUserByUsername("sari")
	if user.Status != "active" {
		t.Fatalf("the account is active, got %s", user.Status)
	}
	up, _ := f.db.GetUserPlan(user.ID)
	if up.ExpiresAt == nil || up.ExpiresAt.Before(time.Now().Add(55*24*time.Hour)) {
		t.Fatalf("two months are bought: %+v", up.ExpiresAt)
	}
	// the same notification arriving again pays nothing more
	f.s.matchHostingOrderPayment(formatAmount(view.AmountTotal), captured.ID, captured.ReceivedAt)
	if again, _ := f.db.GetUserPlan(user.ID); !again.ExpiresAt.Equal(*up.ExpiresAt) {
		t.Fatal("a repeated notification must not extend the plan")
	}
}

func TestIntegrationTrialOrderStartsAtOnceAndOnePerAddress(t *testing.T) {
	f := newHostingFixture(t)
	plan := f.plan(t, "starter", 50000, 0, 7)
	rec, view := f.postOrder(t, "203.0.113.30", map[string]any{
		"planId": plan.ID, "kind": "trial", "username": "tia", "email": "tia@example.com", "password": "Sup3r-secret-pass",
	})
	if rec.Code != http.StatusCreated || view.Status != database.OrderPaid {
		t.Fatalf("a trial starts at once: %d %s", rec.Code, rec.Body.String())
	}
	user, _ := f.db.GetUserByUsername("tia")
	up, _ := f.db.GetUserPlan(user.ID)
	if user.Status != "active" || up.ExpiresAt == nil || up.ExpiresAt.After(time.Now().Add(8*24*time.Hour)) || up.ExpiresAt.Before(time.Now().Add(6*24*time.Hour)) {
		t.Fatalf("the account runs for the 7 days of the trial: %s %+v", user.Status, up)
	}
	if second, _ := f.postOrder(t, "203.0.113.30", map[string]any{
		"planId": plan.ID, "kind": "trial", "username": "tia2", "email": "tia2@example.com", "password": "Sup3r-secret-pass",
	}); second.Code != http.StatusTooManyRequests {
		t.Fatalf("a second trial from the same address in a day is refused, got %d", second.Code)
	}
}

func TestIntegrationPaidOrderCreatesThePickedSubdomain(t *testing.T) {
	f := newHostingFixture(t)
	plan := f.plan(t, "starter", 50000, 1, 0)
	buyer, err := f.db.CreateUser("rina", "rina@example.com", "hash", "user", "Rina")
	if err != nil {
		t.Fatal(err)
	}
	_ = f.db.UpdateUser(buyer.ID, map[string]any{"status": "pending"})
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
	subs, _ := f.db.ListHostingSubdomains(buyer.ID)
	if len(subs) != 1 || subs[0].Hostname != "rina.reneo.my.id" {
		t.Fatalf("the address picked with the order is created for the buyer: %+v", subs)
	}
	forgetHostingHosts()
	if owner := f.s.hostingHostOwner("rina.reneo.my.id"); owner != buyer.ID {
		t.Fatalf("the address belongs to the buyer, only they may sign in there: %d", owner)
	}
	if got := lastNotification(t, f.db, buyer.ID); !strings.Contains(got, "https://rina.reneo.my.id") {
		t.Fatalf("the buyer is told where to sign in, got %q", got)
	}
}

func TestIntegrationRemindersAreSentOncePerEndDate(t *testing.T) {
	f := newHostingFixture(t)
	plan := f.plan(t, "starter", 50000, 0, 0)
	u, _ := f.db.CreateUser("lia", "lia@example.com", "hash", "user", "Lia")
	end := time.Now().Add(2 * 24 * time.Hour)
	_ = f.db.SetUserPlan(u.ID, plan.ID, &end)

	f.s.remindPlans(time.Now())
	if got := lastNotification(t, f.db, u.ID); !strings.HasPrefix(got, "Paket hosting segera berakhir") {
		t.Fatalf("the account is told its plan runs out, got %q", got)
	}
	count, _ := f.db.CountUnreadNotifications(u.ID)
	f.s.remindPlans(time.Now())
	if again, _ := f.db.CountUnreadNotifications(u.ID); again != count {
		t.Fatalf("the same end date is announced once, not again (%d then %d)", count, again)
	}
}

func TestIntegrationTrialUpgradeRunsThenReturnsWithCredit(t *testing.T) {
	f := newHostingFixture(t)
	own, bigger := f.plan(t, "starter", 50000, 1, 0), f.plan(t, "pro", 150000, 5, 0)
	u, _ := f.db.CreateUser("omar", "omar@example.com", "hash", "user", "Omar")
	end := time.Now().Add(30 * 24 * time.Hour).Truncate(time.Second)
	if err := f.s.applyUserPlan(u.ID, own, &end); err != nil {
		t.Fatal(err)
	}
	_ = f.db.UpdateUser(u.ID, map[string]any{"status": "active"})

	start := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"planId":`+itoa(bigger.ID)+`,"days":7}`))
	start.SetPathValue("id", itoa(u.ID))
	rec := httptest.NewRecorder()
	f.s.handleStartPlanTrial(rec, start)
	if rec.Code != http.StatusOK {
		t.Fatalf("the trial starts: %d %s", rec.Code, rec.Body.String())
	}
	if f.s.subdomainLimit(u) != 5 {
		t.Fatalf("during the trial the bigger plan decides the subdomains, got %d", f.s.subdomainLimit(u))
	}
	if q, _ := f.db.GetUserQuota(u.ID); q.MaxProjects != bigger.MaxProjects {
		t.Fatalf("the quota follows the trial plan, got %+v", q)
	}
	if got := lastNotification(t, f.db, u.ID); !strings.HasPrefix(got, "Trial upgrade paket") {
		t.Fatalf("the account is told about the trial, got %q", got)
	}

	// a second trial while one runs is refused
	again := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"planId":`+itoa(bigger.ID)+`,"days":3}`))
	again.SetPathValue("id", itoa(u.ID))
	rec = httptest.NewRecorder()
	f.s.handleStartPlanTrial(rec, again)
	if rec.Code != http.StatusConflict {
		t.Fatalf("one trial at a time, got %d", rec.Code)
	}

	// the days pass: the account is back on its own plan with 7 days added
	f.s.endPlanTrials(time.Now().Add(8 * 24 * time.Hour))
	up, _ := f.db.GetUserPlan(u.ID)
	if up.TrialEndsAt != nil || *up.PlanID != own.ID {
		t.Fatalf("the trial is closed and the own plan is back: %+v", up)
	}
	if want := end.Add(7 * 24 * time.Hour); up.ExpiresAt.Sub(want) > time.Second || want.Sub(*up.ExpiresAt) > time.Second {
		t.Fatalf("the own plan got the 7 days of the trial: want %v got %v", want, up.ExpiresAt)
	}
	if q, _ := f.db.GetUserQuota(u.ID); q.MaxProjects != own.MaxProjects {
		t.Fatalf("the quota is the own plan's again, got %+v", q)
	}
	if f.s.subdomainLimit(u) != 1 {
		t.Fatalf("the subdomain limit is the own plan's again, got %d", f.s.subdomainLimit(u))
	}
}

func TestIntegrationCustomDomainRules(t *testing.T) {
	f := newHostingFixture(t)
	if err := f.db.SetHostingDomain("z1", "reneo.my.id", true); err != nil {
		t.Fatal(err)
	}
	u, _ := f.db.CreateUser("nina", "nina@example.com", "hash", "user", "Nina")
	if _, err := f.db.CreateHostingCustomDomain(u.ID, "toko.com", "cf-1", "active", "active", ""); err != nil {
		t.Fatal(err)
	}
	forgetHostingHosts()
	if owner := f.s.hostingHostOwner("toko.com"); owner != u.ID {
		t.Fatalf("a custom domain is the owner's address too, got %d", owner)
	}
	cases := map[string]string{
		"toko.com":           "in use",
		"shop.reneo.my.id":   "panel addresses",
		"reneo.my.id":        "panel addresses",
		"cname.reneo.my.id":  "cannot be used",
		"https://bukan.com/": "without https",
	}
	for hostname, want := range cases {
		if got := f.s.customDomainAvailability(hostname, "cname.reneo.my.id"); !strings.Contains(got, want) {
			t.Errorf("%q: want a reason with %q, got %q", hostname, want, got)
		}
	}
	if got := f.s.customDomainAvailability("baru.com", "cname.reneo.my.id"); got != "" {
		t.Fatalf("a free domain is accepted, got %q", got)
	}
	// an account that is suspended is not served on its domain
	_ = f.db.UpdateUser(u.ID, map[string]any{"status": "suspended"})
	if rules := f.s.customIngress("http://localhost:8787", true); len(rules) != 0 {
		t.Fatalf("a suspended owner's domain is not carried by the tunnel: %+v", rules)
	}
	_ = f.db.UpdateUser(u.ID, map[string]any{"status": "active"})
	if rules := f.s.customIngress("http://localhost:8787", true); len(rules) != 1 || rules[0].Hostname != "toko.com" {
		t.Fatalf("an active owner's domain is carried: %+v", rules)
	}
	if rules := f.s.customIngress("http://localhost:8787", false); len(rules) != 0 {
		t.Fatal("nothing is carried while hosting mode is off")
	}
}

func formatAmount(n int64) string {
	digits := itoa(n)
	var out []byte
	for i, c := range []byte(digits) {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, c)
	}
	return "Rp " + string(out) + ",00"
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
