package database_test

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/database/dbtest"
	"github.com/friskipradana/panel-desktop-ui/internal/database/migrations"
)

// These tests run against a real PostgreSQL. Set REN_TEST_DATABASE_URL to a server a throwaway database may be
// created on, for example postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable. Without it they are skipped.

func newIntegrationManager(t *testing.T) *database.Manager { return dbtest.New(t) }

func testUser(t *testing.T, m *database.Manager, name string) *database.User {
	t.Helper()
	u, err := m.CreateUser(name, name+"@example.com", "hash", "user", name)
	if err != nil {
		t.Fatalf("create user %s: %v", name, err)
	}
	return u
}

func testPlan(t *testing.T, m *database.Manager, slug string, price int64) *database.HostingPlan {
	t.Helper()
	p, err := m.CreateHostingPlan(database.HostingPlan{
		Slug: slug, Name: slug, Period: "monthly", PriceAmount: price, Features: []string{"a"},
		MaxProjects: 1, MaxTunnels: 1, MaxDatabases: 1, DiskQuotaMB: 100, CPULimitPct: 100, MemoryLimitMB: 256,
		MaxSubdomains: 2, MaxCustomDomains: 3, TrialDays: 7, Visible: true,
	})
	if err != nil {
		t.Fatalf("create plan %s: %v", slug, err)
	}
	return p
}

func TestIntegrationPlanColumnsRoundTrip(t *testing.T) {
	m := newIntegrationManager(t)
	p := testPlan(t, m, "starter", 50000)
	if p.MaxCustomDomains != 3 || p.TrialDays != 7 || p.MaxSubdomains != 2 {
		t.Fatalf("new plan columns must come back as written: %+v", p)
	}
	p.MaxCustomDomains, p.TrialDays = 5, 14
	updated, err := m.UpdateHostingPlan(*p)
	if err != nil || updated == nil || updated.MaxCustomDomains != 5 || updated.TrialDays != 14 {
		t.Fatalf("update must keep the new columns: %+v %v", updated, err)
	}
}

func TestIntegrationOrdersUniqueTotalsAndPayment(t *testing.T) {
	m := newIntegrationManager(t)
	plan := testPlan(t, m, "starter", 50000)
	now := time.Now()

	// a range of 3 codes holds 3 waiting orders, and the 4th has no free total
	var totals []int64
	for i := 0; i < 3; i++ {
		u := testUser(t, m, fmt.Sprintf("buyer%d", i))
		o, err := m.CreateHostingOrder(database.HostingOrder{
			Kind: database.OrderNew, PlanID: &plan.ID, PlanName: plan.Name, UserID: u.ID, Periods: 1, AmountBase: 50000,
			Status: database.OrderPending, ExpiresAt: now.Add(time.Hour),
		}, 3)
		if err != nil {
			t.Fatalf("order %d: %v", i, err)
		}
		if o.AmountTotal <= 50000 || o.AmountTotal > 50003 || o.UniqueCode < 1 || o.UniqueCode > 3 {
			t.Fatalf("total must be the price plus a code from 1 to 3, got %+v", o)
		}
		for _, seen := range totals {
			if seen == o.AmountTotal {
				t.Fatalf("two waiting orders share the total %d", seen)
			}
		}
		totals = append(totals, o.AmountTotal)
	}
	extra := testUser(t, m, "buyer-extra")
	if _, err := m.CreateHostingOrder(database.HostingOrder{
		Kind: database.OrderNew, PlanID: &plan.ID, PlanName: plan.Name, UserID: extra.ID, Periods: 1, AmountBase: 50000,
		Status: database.OrderPending, ExpiresAt: now.Add(time.Hour),
	}, 3); !errors.Is(err, database.ErrNoFreeTotal) {
		t.Fatalf("with every total taken the order must say so, got %v", err)
	}

	// a payment of an exact total finds exactly its order, and only once
	found, err := m.PendingOrdersForTotal(totals[0], now.Add(time.Minute))
	if err != nil || len(found) != 1 {
		t.Fatalf("one waiting order has this total, got %d (%v)", len(found), err)
	}
	if none, _ := m.PendingOrdersForTotal(totals[0], now.Add(-time.Hour)); len(none) != 0 {
		t.Fatal("a payment from before the order existed must not match it")
	}
	if none, _ := m.PendingOrdersForTotal(totals[0], now.Add(2*time.Hour)); len(none) != 0 {
		t.Fatal("a payment after the order expired must not match it")
	}
	first, err := m.MarkOrderPaid(found[0].ID, nil, "test")
	if err != nil || !first {
		t.Fatalf("the first payment closes the order: %v %v", first, err)
	}
	if again, _ := m.MarkOrderPaid(found[0].ID, nil, "test"); again {
		t.Fatal("a second payment of the same order must not close it again")
	}
	// the total is free for another order once this one is paid
	if _, err := m.CreateHostingOrder(database.HostingOrder{
		Kind: database.OrderNew, PlanID: &plan.ID, PlanName: plan.Name, UserID: extra.ID, Periods: 1, AmountBase: 50000,
		Status: database.OrderPending, ExpiresAt: now.Add(time.Hour),
	}, 3); err != nil {
		t.Fatalf("a paid order frees its total: %v", err)
	}
}

func TestIntegrationOrderHoldsItsSubdomain(t *testing.T) {
	m := newIntegrationManager(t)
	plan := testPlan(t, m, "starter", 50000)
	a, b := testUser(t, m, "alice"), testUser(t, m, "bob")
	now := time.Now()
	order := func(userID int64, expires time.Time) (*database.HostingOrder, error) {
		return m.CreateHostingOrder(database.HostingOrder{
			Kind: database.OrderNew, PlanID: &plan.ID, PlanName: plan.Name, UserID: userID, Periods: 1, AmountBase: 50000,
			Status: database.OrderPending, ExpiresAt: expires,
			SubLabel: "budi", SubZoneID: "z1", SubDomain: "reneo.my.id", SubHostname: "budi.reneo.my.id",
		}, 999)
	}
	first, err := order(a.ID, now.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if first.SubHostname != "budi.reneo.my.id" {
		t.Fatalf("the address is kept with the order, got %q", first.SubHostname)
	}
	if held, _ := m.SubdomainReserved("budi.reneo.my.id"); !held {
		t.Fatal("a waiting order holds its address")
	}
	if _, err := order(b.ID, now.Add(time.Hour)); !errors.Is(err, database.ErrSubdomainReserved) {
		t.Fatalf("a second order for the same address must be refused, got %v", err)
	}
	if _, err := m.SetOrderStatus(first.ID, database.OrderCancelled, "x"); err != nil {
		t.Fatal(err)
	}
	if held, _ := m.SubdomainReserved("budi.reneo.my.id"); held {
		t.Fatal("a cancelled order lets go of its address")
	}
	if _, err := order(b.ID, now.Add(time.Hour)); err != nil {
		t.Fatalf("the address is free again: %v", err)
	}
}

func TestIntegrationExpireOrders(t *testing.T) {
	m := newIntegrationManager(t)
	plan := testPlan(t, m, "starter", 50000)
	u := testUser(t, m, "late")
	now := time.Now()
	o, err := m.CreateHostingOrder(database.HostingOrder{
		Kind: database.OrderNew, PlanID: &plan.ID, PlanName: plan.Name, UserID: u.ID, Periods: 1, AmountBase: 50000,
		Status: database.OrderPending, ExpiresAt: now.Add(-time.Minute),
		SubLabel: "late", SubZoneID: "z1", SubDomain: "reneo.my.id", SubHostname: "late.reneo.my.id",
	}, 999)
	if err != nil {
		t.Fatal(err)
	}
	expired, err := m.ExpireHostingOrders(now)
	if err != nil || len(expired) != 1 || expired[0].ID != o.ID || expired[0].Status != database.OrderExpired || expired[0].SubHostname != "late.reneo.my.id" {
		t.Fatalf("the order that ran out of time is closed and returned whole: %+v %v", expired, err)
	}
	if held, _ := m.SubdomainReserved("late.reneo.my.id"); held {
		t.Fatal("an expired order lets go of its address")
	}
}

func TestIntegrationTrialUpgradePausesAndCreditsThePlan(t *testing.T) {
	m := newIntegrationManager(t)
	own, trial := testPlan(t, m, "starter", 50000), testPlan(t, m, "pro", 150000)
	u := testUser(t, m, "carol")
	base := time.Now().UTC().Truncate(time.Second)
	expires := base.Add(30 * 24 * time.Hour)
	if err := m.SetUserPlan(u.ID, own.ID, &expires); err != nil {
		t.Fatal(err)
	}

	started, err := m.StartPlanTrial(u.ID, trial.ID, base, base.Add(7*24*time.Hour))
	if err != nil || !started {
		t.Fatalf("a trial starts on an account with a plan: %v %v", started, err)
	}
	if again, _ := m.StartPlanTrial(u.ID, trial.ID, base, base.Add(7*24*time.Hour)); again {
		t.Fatal("a second trial must not start while one runs")
	}
	up, _ := m.GetUserPlan(u.ID)
	if !up.TrialRunning(base.Add(time.Hour)) || up.TrialPlanID == nil || *up.TrialPlanID != trial.ID {
		t.Fatalf("the trial is stored: %+v", up)
	}
	info, _ := m.UserHostingInfo([]int64{u.ID})
	if info[u.ID].TrialPlanName != "pro" || info[u.ID].PlanName != "starter" {
		t.Fatalf("the list shows the plan that waits and the trial: %+v", info[u.ID])
	}

	// the plan that waits is not expired or reminded about while the trial runs, even if its date passes
	if err := m.DB().QueryRow(`UPDATE user_plans SET expires_at = $2 WHERE user_id = $1 RETURNING user_id`, u.ID, base.Add(-time.Hour)).Scan(new(int64)); err != nil {
		t.Fatal(err)
	}
	if expired, _ := m.ListExpiredUserPlans(base); len(expired) != 0 {
		t.Fatal("a plan on hold must not be listed as expired")
	}
	if err := m.DB().QueryRow(`UPDATE user_plans SET expires_at = $2 WHERE user_id = $1 RETURNING user_id`, u.ID, expires).Scan(new(int64)); err != nil {
		t.Fatal(err)
	}
	if due, _ := m.ListPlansToRemind(expires.Add(-time.Hour), 3*24*time.Hour); len(due) != 0 {
		t.Fatal("a plan on hold must not be reminded about")
	}

	// the trial ran its whole length: the plan moves later by 7 days
	if ended, _ := m.ListEndedTrials(base.Add(8 * 24 * time.Hour)); len(ended) != 1 || ended[0] != u.ID {
		t.Fatalf("the trial is listed once its time is over, got %v", ended)
	}
	if finished, err := m.FinishPlanTrial(u.ID, base.Add(8*24*time.Hour)); err != nil || !finished {
		t.Fatalf("the trial finishes: %v %v", finished, err)
	}
	up, _ = m.GetUserPlan(u.ID)
	if up.TrialEndsAt != nil || up.TrialPlanID != nil {
		t.Fatalf("the trial is cleared: %+v", up)
	}
	if want := expires.Add(7 * 24 * time.Hour); !up.ExpiresAt.Equal(want) {
		t.Fatalf("the plan gets the 7 days the trial lasted: want %v got %v", want, up.ExpiresAt)
	}
	if again, _ := m.FinishPlanTrial(u.ID, base.Add(9*24*time.Hour)); again {
		t.Fatal("finishing twice must credit nothing the second time")
	}

	// cut short after 3 days: only those days are credited
	before := *up.ExpiresAt
	if _, err := m.StartPlanTrial(u.ID, trial.ID, base, base.Add(7*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := m.FinishPlanTrial(u.ID, base.Add(3*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	up, _ = m.GetUserPlan(u.ID)
	if want := before.Add(3 * 24 * time.Hour); !up.ExpiresAt.Equal(want) {
		t.Fatalf("an early end credits only the time used: want %v got %v", want, up.ExpiresAt)
	}
}

func TestIntegrationTrialOnAPlanWithoutAnEndKeepsItOpen(t *testing.T) {
	m := newIntegrationManager(t)
	own, trial := testPlan(t, m, "forever", 0), testPlan(t, m, "pro", 150000)
	u := testUser(t, m, "dave")
	if err := m.SetUserPlan(u.ID, own.ID, nil); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	if started, err := m.StartPlanTrial(u.ID, trial.ID, now, now.Add(24*time.Hour)); err != nil || !started {
		t.Fatalf("%v %v", started, err)
	}
	if _, err := m.FinishPlanTrial(u.ID, now.Add(48*time.Hour)); err != nil {
		t.Fatal(err)
	}
	if up, _ := m.GetUserPlan(u.ID); up.ExpiresAt != nil {
		t.Fatalf("a plan that never ends still never ends, got %v", up.ExpiresAt)
	}
}

func TestIntegrationAssigningAPlanEndsTheTrialRow(t *testing.T) {
	m := newIntegrationManager(t)
	own, trial := testPlan(t, m, "starter", 50000), testPlan(t, m, "pro", 150000)
	u := testUser(t, m, "erin")
	now := time.Now()
	end := now.Add(10 * 24 * time.Hour)
	_ = m.SetUserPlan(u.ID, own.ID, &end)
	_, _ = m.StartPlanTrial(u.ID, trial.ID, now, now.Add(24*time.Hour))
	if err := m.SetUserPlan(u.ID, own.ID, &end); err != nil {
		t.Fatal(err)
	}
	if up, _ := m.GetUserPlan(u.ID); up.TrialEndsAt != nil || up.TrialPlanID != nil {
		t.Fatalf("setting the plan clears a leftover trial: %+v", up)
	}
}

func TestIntegrationPlanReminders(t *testing.T) {
	m := newIntegrationManager(t)
	plan := testPlan(t, m, "starter", 50000)
	u := testUser(t, m, "frank")
	now := time.Now().UTC().Truncate(time.Second)
	end := now.Add(2 * 24 * time.Hour)
	if err := m.SetUserPlan(u.ID, plan.ID, &end); err != nil {
		t.Fatal(err)
	}
	if due, _ := m.ListPlansToRemind(now, 3*24*time.Hour); len(due) != 1 {
		t.Fatalf("a plan that ends within the window is due, got %d", len(due))
	}
	if far, _ := m.ListPlansToRemind(now, time.Hour); len(far) != 0 {
		t.Fatal("a plan that ends later than the window is not due")
	}
	if err := m.MarkPlanReminded(u.ID, end); err != nil {
		t.Fatal(err)
	}
	if due, _ := m.ListPlansToRemind(now, 3*24*time.Hour); len(due) != 0 {
		t.Fatal("a reminded end date is not due again")
	}
	// a renewal moves the end date, so the next period reminds again
	next := end.Add(30 * 24 * time.Hour)
	_ = m.SetUserPlan(u.ID, plan.ID, &next)
	if due, _ := m.ListPlansToRemind(next.Add(-24*time.Hour), 3*24*time.Hour); len(due) != 1 {
		t.Fatal("a new end date is announced again")
	}
	// marking an old date does nothing
	if err := m.MarkPlanReminded(u.ID, end); err != nil {
		t.Fatal(err)
	}
	if due, _ := m.ListPlansToRemind(next.Add(-24*time.Hour), 3*24*time.Hour); len(due) != 1 {
		t.Fatal("a reminder for a date that has since moved must not silence the new one")
	}
}

func TestIntegrationCustomDomains(t *testing.T) {
	m := newIntegrationManager(t)
	u := testUser(t, m, "grace")
	d, err := m.CreateHostingCustomDomain(u.ID, "Toko.COM", "cf-1", "pending", "", "waiting")
	if err != nil {
		t.Fatal(err)
	}
	if d.Hostname != "toko.com" || d.Status != "pending" || d.Username != "grace" {
		t.Fatalf("stored lower-cased with its owner: %+v", d)
	}
	if _, err := m.CreateHostingCustomDomain(u.ID, "toko.com", "cf-2", "pending", "", ""); !errors.Is(err, database.ErrCustomDomainTaken) {
		t.Fatalf("a domain is registered once, got %v", err)
	}
	if found, _ := m.GetHostingCustomDomainByHostname("TOKO.com"); found == nil || found.ID != d.ID {
		t.Fatal("lookup by hostname ignores case")
	}
	if err := m.SetHostingCustomDomainState(d.ID, "active", "active", ""); err != nil {
		t.Fatal(err)
	}
	if got, _ := m.GetHostingCustomDomain(d.ID); got.Status != "active" || got.SSLStatus != "active" {
		t.Fatalf("state is updated: %+v", got)
	}
	if n, _ := m.CountHostingCustomDomains(u.ID); n != 1 {
		t.Fatalf("count = %d", n)
	}
	if all, _ := m.ListHostingCustomDomains(0); len(all) != 1 {
		t.Fatalf("list all = %d", len(all))
	}
	if err := m.DeleteUser(u.ID); err != nil {
		t.Fatal(err)
	}
	if all, _ := m.ListHostingCustomDomains(0); len(all) != 0 {
		t.Fatal("deleting the account removes its domains")
	}
}

func TestIntegrationNewMigrationsGoDownAndUpAgain(t *testing.T) {
	m := newIntegrationManager(t)
	// the four newest migrations come off one by one, and go on again
	for i := 0; i < 4; i++ {
		if err := migrations.Down(m.DB()); err != nil {
			t.Fatalf("down step %d: %v", i+1, err)
		}
	}
	if err := migrations.Up(m.DB()); err != nil {
		t.Fatalf("up again: %v", err)
	}
	if _, err := m.GetHostingCustomDomain(1); err != nil {
		t.Fatalf("the custom domain table is back: %v", err)
	}
}

func TestIntegrationPlanPromoRoundTrip(t *testing.T) {
	m := newIntegrationManager(t)
	ends := time.Now().Add(48 * time.Hour).Truncate(time.Second)
	p, err := m.CreateHostingPlan(database.HostingPlan{
		Slug: "promo", Name: "Promo", Period: "monthly", PriceAmount: 40000, Features: []string{"a"},
		MaxProjects: 1, MaxTunnels: 1, MaxDatabases: 1, DiskQuotaMB: 100, CPULimitPct: 100, MemoryLimitMB: 256, Visible: true,
		PromoPercent: 25, PromoEndsAt: &ends, PromoAppliesTo: "renew", PromoExclusive: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if p.PromoPercent != 25 || p.PromoEndsAt == nil || !p.PromoEndsAt.Equal(ends) || p.PromoAppliesTo != "renew" || !p.PromoExclusive {
		t.Fatalf("the promo must come back as written: %+v", p)
	}
	plain := testPlan(t, m, "plain", 1000)
	if plain.PromoPercent != 0 || plain.PromoEndsAt != nil || plain.PromoAppliesTo != "both" || plain.PromoExclusive {
		t.Fatalf("a plan without a promo has none: %+v", plain)
	}
	p.PromoPercent, p.PromoEndsAt, p.PromoExclusive = 0, nil, false
	p.PromoAppliesTo = ""
	updated, err := m.UpdateHostingPlan(*p)
	if err != nil || updated.PromoPercent != 0 || updated.PromoEndsAt != nil || updated.PromoAppliesTo != "both" {
		t.Fatalf("a promo can be removed: %v %+v", err, updated)
	}
}

func TestIntegrationOrderKeepsWhatThePromoTookOff(t *testing.T) {
	m := newIntegrationManager(t)
	plan := testPlan(t, m, "starter", 40000)
	u := testUser(t, m, "promobuyer")
	o, err := m.CreateHostingOrder(database.HostingOrder{
		Kind: database.OrderNew, PlanID: &plan.ID, PlanName: plan.Name, UserID: u.ID, Periods: 1,
		AmountList: 40000, DiscountPromo: 10000, AmountBase: 30000, Status: database.OrderPending, ExpiresAt: time.Now().Add(time.Hour),
	}, 99)
	if err != nil {
		t.Fatal(err)
	}
	got, err := m.GetHostingOrder(o.ID)
	if err != nil || got.DiscountPromo != 10000 || got.AmountList != 40000 || got.AmountBase != 30000 {
		t.Fatalf("the promo discount must be kept with the order: %v %+v", err, got)
	}
}

func TestIntegrationProjectRunRoundTrip(t *testing.T) {
	m := newIntegrationManager(t)
	u := testUser(t, m, "runowner")
	p, err := m.CreateProject(u.ID, "Fullstack", "fullstack", "", "stack", "", "/home/x/fullstack", true, 10001)
	if err != nil {
		t.Fatalf("a project of several processes has its own type: %v", err)
	}
	if p.Run.Services == nil || len(p.Run.Services) != 0 || p.Run.Start != "" {
		t.Fatalf("a new project has an empty way of running: %+v", p.Run)
	}
	run := database.ProjectRun{
		Services: []database.ProjectService{
			{Name: "web", Kind: "static", Dir: "web", Serve: "dist", Path: "/", Build: "bun run build"},
			{Name: "api", Kind: "process", Dir: "api", Path: "/api", Command: "bun run start", Port: 3001},
		},
		Env:    map[string]string{"NEVER": "stored in clear"},
		EnvEnc: "ciphertext-here",
	}
	saved, err := m.UpdateProjectRun(p.ID, u.ID, run)
	if err != nil || saved == nil {
		t.Fatalf("save: %v", err)
	}
	got, err := m.GetProject(p.ID, u.ID)
	if err != nil || got == nil {
		t.Fatalf("read: %v", err)
	}
	if len(got.Run.Services) != 2 || got.Run.Services[1].Port != 3001 || got.Run.Services[0].Serve != "dist" || got.Run.EnvEnc != "ciphertext-here" {
		t.Fatalf("the way of running must come back as saved: %+v", got.Run)
	}
	if got.Run.Env != nil {
		t.Fatalf("the variables are never read back in clear: %+v", got.Run.Env)
	}
	list, _, err := m.ListProjectsFiltered(u.ID, false, "", 10, 0)
	if err != nil || len(list) != 1 || len(list[0].Run.Services) != 2 {
		t.Fatalf("the list carries it too: %v %+v", err, list)
	}
}
