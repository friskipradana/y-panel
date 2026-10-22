package httpserver

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestPriceForTakesTheDurationDiscountThenTheVoucher(t *testing.T) {
	plan := &database.HostingPlan{PriceAmount: 75000, Period: "monthly", DurationDiscounts: []database.DurationDiscount{{Periods: 6, Percent: 10}, {Periods: 12, Percent: 20}}}
	cases := []struct {
		periods             int
		voucher             *database.HostingVoucher
		list, duration, off int64
		percent             int
		subtotal            int64
	}{
		{1, nil, 75000, 0, 0, 0, 75000},
		{3, nil, 225000, 0, 0, 0, 225000},
		{6, nil, 450000, 45000, 0, 10, 405000},
		// 7 months reach the 6 month tier but not the 12 month one
		{7, nil, 525000, 52500, 0, 10, 472500},
		{12, nil, 900000, 180000, 0, 20, 720000},
		// the voucher takes its part of what is left after the duration discount
		{12, &database.HostingVoucher{Kind: database.VoucherPercent, Value: 10}, 900000, 180000, 72000, 20, 648000},
		{1, &database.HostingVoucher{Kind: database.VoucherFixed, Value: 5000}, 75000, 0, 5000, 0, 70000},
		// a fixed voucher cannot take more than the price
		{1, &database.HostingVoucher{Kind: database.VoucherFixed, Value: 999999}, 75000, 0, 75000, 0, 0},
		{1, &database.HostingVoucher{Kind: database.VoucherPercent, Value: 100}, 75000, 0, 75000, 0, 0},
	}
	for _, c := range cases {
		q := priceFor(plan, c.periods, c.voucher, database.OrderNew, time.Now())
		if q.List != c.list || q.DurationDiscount != c.duration || q.VoucherDiscount != c.off || q.DurationPercent != c.percent || q.Subtotal != c.subtotal {
			t.Errorf("%d periods: %+v, want list %d duration %d voucher %d (%d%%) subtotal %d", c.periods, q, c.list, c.duration, c.off, c.percent, c.subtotal)
		}
	}
	if q := priceFor(&database.HostingPlan{PriceAmount: 0}, 6, nil, database.OrderNew, time.Now()); q.Subtotal != 0 || q.List != 0 {
		t.Errorf("a free plan stays free: %+v", q)
	}
}

func TestDurationDiscountsAreCheckedAndKeptInOrder(t *testing.T) {
	good := database.HostingPlan{Period: "monthly", DurationDiscounts: []database.DurationDiscount{{Periods: 12, Percent: 20}, {Periods: 3, Percent: 5}}}
	cleanDurationDiscounts(&good)
	if good.DurationDiscounts[0].Periods != 3 {
		t.Fatalf("tiers are sorted: %+v", good.DurationDiscounts)
	}
	if err := validateDurationDiscounts(good); err != nil {
		t.Fatal(err)
	}
	for name, tiers := range map[string][]database.DurationDiscount{
		"one period":     {{Periods: 1, Percent: 10}},
		"too long":       {{Periods: 99, Percent: 10}},
		"no percent":     {{Periods: 6, Percent: 0}},
		"too much":       {{Periods: 6, Percent: 95}},
		"the same twice": {{Periods: 6, Percent: 10}, {Periods: 6, Percent: 20}},
	} {
		if err := validateDurationDiscounts(database.HostingPlan{Period: "monthly", DurationDiscounts: tiers}); err == nil {
			t.Errorf("%s must be refused", name)
		}
	}
	once := database.HostingPlan{Period: "once", DurationDiscounts: []database.DurationDiscount{{Periods: 6, Percent: 10}}}
	cleanDurationDiscounts(&once)
	if len(once.DurationDiscounts) != 0 {
		t.Fatalf("a plan that never ends has no discounts: %+v", once.DurationDiscounts)
	}
}

func TestVoucherInputIsChecked(t *testing.T) {
	ok := database.HostingVoucher{Code: " save10 ", Kind: "Percent", Value: 10, AppliesTo: ""}
	cleanVoucher(&ok)
	if ok.Code != "SAVE10" || ok.Kind != "percent" || ok.AppliesTo != "both" {
		t.Fatalf("cleaned: %+v", ok)
	}
	if err := validateVoucher(ok); err != nil {
		t.Fatal(err)
	}
	for name, v := range map[string]database.HostingVoucher{
		"short code":       {Code: "AB", Kind: "percent", Value: 10, AppliesTo: "both"},
		"bad characters":   {Code: "HEMAT 10", Kind: "percent", Value: 10, AppliesTo: "both"},
		"unknown kind":     {Code: "HEMAT10", Kind: "gift", Value: 10, AppliesTo: "both"},
		"over 100 percent": {Code: "HEMAT10", Kind: "percent", Value: 101, AppliesTo: "both"},
		"no value":         {Code: "HEMAT10", Kind: "fixed", Value: 0, AppliesTo: "both"},
		"bad applies":      {Code: "HEMAT10", Kind: "percent", Value: 10, AppliesTo: "never"},
		"negative uses":    {Code: "HEMAT10", Kind: "percent", Value: 10, AppliesTo: "both", MaxUses: -1},
	} {
		if err := validateVoucher(v); err == nil {
			t.Errorf("%s must be refused", name)
		}
	}
	from, until := time.Now(), time.Now().Add(-time.Hour)
	if err := validateVoucher(database.HostingVoucher{Code: "HEMAT10", Kind: "percent", Value: 10, AppliesTo: "both", ValidFrom: &from, ValidUntil: &until}); err == nil {
		t.Error("a voucher cannot end before it starts")
	}
}

func (f *hostingFixture) quote(t *testing.T, body map[string]any) (int, map[string]any) {
	t.Helper()
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/public/hosting/quote", bytes.NewReader(raw))
	req.RemoteAddr = "203.0.113.50:4000"
	rec := httptest.NewRecorder()
	f.s.handlePublicQuote(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

// A voucher and a longer subscription change what an order costs, each is kept on the order, and a voucher stops at its limits.
// Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationDiscountsAndVouchersPriceTheOrder(t *testing.T) {
	f := newHostingFixture(t)
	plan, err := f.db.CreateHostingPlan(database.HostingPlan{
		Slug: "pro", Name: "Pro", Period: "monthly", PriceAmount: 100000, MaxProjects: 2, MaxTunnels: 2, MaxDatabases: 1, DiskQuotaMB: 1000,
		CPULimitPct: 100, MemoryLimitMB: 512, Visible: true, DurationDiscounts: []database.DurationDiscount{{Periods: 6, Percent: 10}},
	})
	if err != nil {
		t.Fatal(err)
	}
	other := f.plan(t, "basic", 30000, 0, 0)
	voucher, err := f.db.CreateHostingVoucher(database.HostingVoucher{Code: "HEMAT10", Kind: database.VoucherPercent, Value: 10, MaxUses: 1, MaxPerAccount: 1, AppliesTo: "new", PlanIDs: []int64{plan.ID}, Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.CreateHostingVoucher(database.HostingVoucher{Code: "OFF", Kind: database.VoucherFixed, Value: 5000, AppliesTo: "both", Enabled: false}); err != nil {
		t.Fatal(err)
	}

	// the price shown before ordering is the price of the order
	code, out := f.quote(t, map[string]any{"planId": plan.ID, "periods": 6, "voucher": "hemat10"})
	q := out["quote"].(map[string]any)
	if code != 200 || q["list"].(float64) != 600000 || q["durationDiscount"].(float64) != 60000 || q["voucherDiscount"].(float64) != 54000 || q["subtotal"].(float64) != 486000 {
		t.Fatalf("quote: %d %v", code, out)
	}
	if v := out["voucher"].(map[string]any); v["valid"] != true || v["code"] != "HEMAT10" {
		t.Fatalf("the voucher is valid whatever the letter case: %v", out["voucher"])
	}
	// reasons a code cannot be used are said, and the price stays the plain one
	for _, c := range []struct {
		plan   int64
		code   string
		reason string
	}{{plan.ID, "NOPE", "unknown"}, {plan.ID, "OFF", "disabled"}, {other.ID, "HEMAT10", "wrongPlan"}} {
		_, out := f.quote(t, map[string]any{"planId": c.plan, "periods": 1, "voucher": c.code})
		v := out["voucher"].(map[string]any)
		if v["valid"] != false || v["reason"] != c.reason {
			t.Errorf("%s on plan %d: %v, want %s", c.code, c.plan, v, c.reason)
		}
		if out["quote"].(map[string]any)["voucherDiscount"].(float64) != 0 {
			t.Errorf("an unusable code takes nothing off: %v", out["quote"])
		}
	}

	// the order keeps what it was priced with
	rec, view := f.postOrder(t, "203.0.113.60", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 6, "voucher": "hemat10", "username": "wati", "email": "wati@example.com", "password": "Sup3r-secret-pass",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("order with a voucher: %d %s", rec.Code, rec.Body.String())
	}
	if view.AmountList != 600000 || view.DiscountDuration != 60000 || view.DiscountVoucher != 54000 || view.AmountBase != 486000 || view.VoucherCode != "HEMAT10" {
		t.Fatalf("the order shows how its price came about: %+v", view)
	}
	if view.AmountTotal <= 486000 || view.AmountTotal > 486999 {
		t.Fatalf("the unique code is added to what is left: %d", view.AmountTotal)
	}
	// the one use is taken: the next buyer is told so, and no account is left behind
	rec, _ = f.postOrder(t, "203.0.113.61", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "voucher": "HEMAT10", "username": "joko", "email": "joko@example.com", "password": "Sup3r-secret-pass",
	})
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "usedUp") {
		t.Fatalf("a used up voucher: %d %s", rec.Code, rec.Body.String())
	}
	if u, _ := f.db.GetUserByUsername("joko"); u != nil {
		t.Fatal("a refused voucher must not leave an account")
	}
	if used, _ := f.db.GetHostingVoucher(voucher.ID); used == nil || used.Used != 1 {
		t.Fatalf("the voucher counts its use: %+v", used)
	}
	// cancelling the order gives the use back
	order, _ := f.db.GetHostingOrderByPublicID(view.PublicID)
	if _, err := f.db.SetOrderStatus(order.ID, database.OrderCancelled, ""); err != nil {
		t.Fatal(err)
	}
	if back, _ := f.db.GetHostingVoucher(voucher.ID); back.Used != 0 {
		t.Fatalf("a cancelled order gives the use back: %+v", back)
	}
	// a voucher that takes the whole price waits for the seller, like a free plan
	if _, err := f.db.CreateHostingVoucher(database.HostingVoucher{Code: "GRATIS", Kind: database.VoucherPercent, Value: 100, MaxPerAccount: 1, AppliesTo: "new", Enabled: true}); err != nil {
		t.Fatal(err)
	}
	rec, view = f.postOrder(t, "203.0.113.62", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "voucher": "gratis", "username": "rina", "email": "rina@example.com", "password": "Sup3r-secret-pass",
	})
	if rec.Code != http.StatusCreated || view.Status != database.OrderReview || view.AmountTotal != 0 {
		t.Fatalf("a free order waits for the seller: %d %+v", rec.Code, view)
	}
}

// "I have transferred" tells the seller once and changes nothing on the order. Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationBuyerSayingTheyTransferredAlertsTheSellerOnce(t *testing.T) {
	f := newHostingFixture(t)
	plan := f.plan(t, "starter", 50000, 0, 0)
	rec, view := f.postOrder(t, "203.0.113.70", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "ina", "email": "ina@example.com", "password": "Sup3r-secret-pass",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("order: %d %s", rec.Code, rec.Body.String())
	}
	claim := func(id string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/public/hosting/orders/"+id+"/transferred", nil)
		req.SetPathValue("publicId", id)
		req.RemoteAddr = "203.0.113.70:4000"
		rec := httptest.NewRecorder()
		f.s.handlePublicOrderTransferred(rec, req)
		return rec
	}
	count := func() int {
		var n int
		if err := f.db.DB().QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id = $1`, f.super.ID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	before := count()
	if rec := claim(view.PublicID); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"status":"pending"`) {
		t.Fatalf("claim: %d %s", rec.Code, rec.Body.String())
	}
	claim(view.PublicID)
	claim(view.PublicID)
	after := count()
	if after != before+1 {
		t.Fatalf("the seller is told once, not three times: %d -> %d", before, after)
	}
	if note := lastNotification(t, f.db, f.super.ID); !strings.Contains(note, "ina") || !strings.Contains(note, "sudah transfer") {
		t.Fatalf("the notice names the buyer: %q", note)
	}
	if order, _ := f.db.GetHostingOrderByPublicID(view.PublicID); order.Status != database.OrderPending {
		t.Fatalf("saying so does not pay the order: %s", order.Status)
	}
	if rec := claim(strings.Repeat("x", 24)); rec.Code != http.StatusNotFound {
		t.Fatalf("an unknown order: %d", rec.Code)
	}
}

// An order is a record of money asked for: cancelling it drops the account made for it, and the order stays with the name of
// its buyer; deleting a buyer cancels what still waits and keeps the rest. Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationOrdersSurviveTheirAccounts(t *testing.T) {
	f := newHostingFixture(t)
	plan := f.plan(t, "starter", 50000, 0, 0)
	order := func(ip, name string) *database.HostingOrder {
		rec, view := f.postOrder(t, ip, map[string]any{
			"planId": plan.ID, "kind": "new", "periods": 1, "username": name, "email": name + "@example.com", "password": "Sup3r-secret-pass",
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("order of %s: %d %s", name, rec.Code, rec.Body.String())
		}
		o, _ := f.db.GetHostingOrderByPublicID(view.PublicID)
		return o
	}

	// cancelled by the seller: the account that never paid goes, the order does not
	first := order("203.0.113.80", "rani")
	req := httptest.NewRequest(http.MethodPost, "/x", nil)
	req.SetPathValue("id", strconv.FormatInt(first.ID, 10))
	rec := httptest.NewRecorder()
	f.s.handleCancelOrder(rec, asUser(req, f.super))
	if rec.Code != http.StatusOK {
		t.Fatalf("cancel: %d %s", rec.Code, rec.Body.String())
	}
	if u, _ := f.db.GetUserByUsername("rani"); u != nil {
		t.Fatal("the unpaid account is dropped with the cancelled order")
	}
	kept, _ := f.db.GetHostingOrder(first.ID)
	if kept == nil || kept.Status != database.OrderCancelled || kept.Username != "rani" || kept.UserID != 0 {
		t.Fatalf("the cancelled order stays, with the name of its buyer: %+v", kept)
	}
	if list, total, _ := f.db.ListHostingOrders(0, "", 50, 0); total != 1 || len(list) != 1 || list[0].Username != "rani" {
		t.Fatalf("it still shows in the list of orders: %d %+v", total, list)
	}

	// a buyer deleted by the seller: a waiting order is cancelled, not left holding its total
	second := order("203.0.113.81", "sinta")
	user, _ := f.db.GetUserByUsername("sinta")
	if err := f.db.DeleteUser(user.ID); err != nil {
		t.Fatal(err)
	}
	after, _ := f.db.GetHostingOrder(second.ID)
	if after == nil || after.Status != database.OrderCancelled || after.Username != "sinta" {
		t.Fatalf("a waiting order of a deleted buyer is cancelled and kept: %+v", after)
	}
}

// The link a buyer gets goes to the public address of the seller, not to the address the form was opened from.
func TestIntegrationOrderLinksUseTheMainDomain(t *testing.T) {
	f := newHostingFixture(t)
	request := func(host string) *http.Request {
		req := httptest.NewRequest(http.MethodPost, "http://"+host+"/api/v1/public/hosting/orders", nil)
		req.Host = host
		return req
	}
	// without a domain offered, the address of the request is all there is
	if got := f.s.orderBaseURL(request("100.70.209.107:8787")); got != "http://100.70.209.107:8787" {
		t.Fatalf("no main domain: %s", got)
	}
	if err := f.db.SetHostingDomain("z1", "reneo.my.id", true); err != nil {
		t.Fatal(err)
	}
	_ = f.db.SetMainHostingDomain("z1")
	forgetHostingHosts()
	if got := f.s.orderBaseURL(request("100.70.209.107:8787")); got != "https://reneo.my.id" {
		t.Fatalf("opened from an IP, the link still uses the domain: %s", got)
	}
	// opened from the domain itself or a name under it, the address stays what it was
	req := request("reneo.my.id")
	req.Header.Set("X-Forwarded-Proto", "https")
	if got := f.s.orderBaseURL(req); got != "https://reneo.my.id" {
		t.Fatalf("from the domain: %s", got)
	}
	req = request("renal.reneo.my.id")
	req.Header.Set("X-Forwarded-Proto", "https")
	if got := f.s.orderBaseURL(req); got != "https://renal.reneo.my.id" {
		t.Fatalf("from a name under the domain: %s", got)
	}
}

// The address of a buyer's panel opens that panel and nothing of the seller's public site. Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationBuyerPanelAddressesServeNoPublicSite(t *testing.T) {
	f := newHostingFixture(t)
	buyer, err := f.db.CreateUser("dewi", "dewi@example.com", "hash", "user", "Dewi")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.CreateHostingSubdomain(buyer.ID, "dewi", "z1", "reneo.my.id", "dewi.reneo.my.id", true); err != nil {
		t.Fatal(err)
	}
	forgetHostingHosts()

	reached := false
	page := f.s.requireHTMLAuthV2(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached = true }))
	call := func(host, path string) *httptest.ResponseRecorder {
		reached = false
		req := httptest.NewRequest(http.MethodGet, "http://"+host+path, nil)
		req.Host = host
		rec := httptest.NewRecorder()
		page.ServeHTTP(rec, req)
		return rec
	}

	// the seller's own address keeps its landing page and the pages around it
	for _, path := range []string{"/", "/articles", "/install", "/terms", "/privacy", "/order", "/docs/mcp", "/sitemap.xml"} {
		if call("reneo.my.id", path); !reached {
			t.Errorf("%s is served on the seller's address", path)
		}
	}
	// the buyer's panel address does not: the front page leads to the login, the rest does not exist
	if rec := call("dewi.reneo.my.id", "/"); reached || rec.Code != http.StatusFound || rec.Header().Get("Location") != "/login" {
		t.Errorf("the front page on a buyer address leads to the login: %d %q reached=%v", rec.Code, rec.Header().Get("Location"), reached)
	}
	for _, path := range []string{"/articles", "/articles/a-post", "/install", "/terms", "/privacy", "/order", "/order/abc", "/docs/mcp", "/sitemap.xml", "/llms.txt"} {
		if rec := call("dewi.reneo.my.id", path); reached || rec.Code != http.StatusNotFound {
			t.Errorf("%s does not exist on a buyer address: %d reached=%v", path, rec.Code, reached)
		}
	}
	// the login stays, it is the panel
	if call("dewi.reneo.my.id", "/login"); !reached {
		t.Error("the login is served on a buyer address")
	}

	// the public data goes the same way
	apiCalled := false
	api := f.s.requireLanding(func(w http.ResponseWriter, r *http.Request) { apiCalled = true })
	for host, want := range map[string]bool{"reneo.my.id": true, "dewi.reneo.my.id": false} {
		apiCalled = false
		req := httptest.NewRequest(http.MethodGet, "http://"+host+"/api/v1/public/hosting", nil)
		req.Host = host
		api.ServeHTTP(httptest.NewRecorder(), req)
		if apiCalled != want {
			t.Errorf("public data on %s: served=%v, want %v", host, apiCalled, want)
		}
	}
	req := httptest.NewRequest(http.MethodGet, "http://dewi.reneo.my.id/api/v1/public/site", nil)
	req.Host = "dewi.reneo.my.id"
	rec := httptest.NewRecorder()
	f.s.handlePublicSite(rec, req)
	if !strings.Contains(rec.Body.String(), `"landing":false`) {
		t.Errorf("the page is told there is no landing here: %s", rec.Body.String())
	}
}

func TestPromoRunsUntilItsEndDateThenTheListPriceIsBack(t *testing.T) {
	now := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	ends := now.Add(48 * time.Hour)
	plan := &database.HostingPlan{PriceAmount: 40000, Period: "monthly", PromoPercent: 25, PromoEndsAt: &ends, PromoAppliesTo: "both",
		DurationDiscounts: []database.DurationDiscount{{Periods: 6, Percent: 10}}}

	q := priceFor(plan, 1, nil, database.OrderNew, now)
	if q.PromoPercent != 25 || q.PromoDiscount != 10000 || q.Subtotal != 30000 {
		t.Fatalf("running promo: %+v", q)
	}
	// the promo comes first, the long-subscription discount takes its part of what is left, then a voucher
	q = priceFor(plan, 6, &database.HostingVoucher{Kind: database.VoucherFixed, Value: 5000}, database.OrderNew, now)
	// list 240000, promo 60000, left 180000, 10% of that 18000, left 162000, voucher 5000
	if q.PromoDiscount != 60000 || q.DurationDiscount != 18000 || q.VoucherDiscount != 5000 || q.Subtotal != 157000 {
		t.Fatalf("promo, duration and voucher together: %+v", q)
	}

	// at the end date and after it, the list price is back with nothing changed
	for _, at := range []time.Time{ends, ends.Add(time.Second), ends.Add(30 * 24 * time.Hour)} {
		if q := priceFor(plan, 1, nil, database.OrderNew, at); q.PromoDiscount != 0 || q.Subtotal != 40000 {
			t.Fatalf("after the end: %+v", q)
		}
	}

	// who the promo is for
	plan.PromoAppliesTo = "new"
	if q := priceFor(plan, 1, nil, database.OrderRenew, now); q.PromoDiscount != 0 {
		t.Fatalf("a new-orders promo does not apply to a renewal: %+v", q)
	}
	plan.PromoAppliesTo = "renew"
	if q := priceFor(plan, 1, nil, database.OrderNew, now); q.PromoDiscount != 0 {
		t.Fatalf("a renewal promo does not apply to a new order: %+v", q)
	}
	if q := priceFor(plan, 1, nil, database.OrderRenew, now); q.PromoDiscount != 10000 {
		t.Fatalf("a renewal promo applies to a renewal: %+v", q)
	}
	if q := priceFor(plan, 1, nil, database.OrderTrial, now); q.PromoDiscount != 0 {
		t.Fatalf("a trial has no promo: %+v", q)
	}
}

func TestAnExclusivePromoTakesNoVoucherAndNoLongSubscriptionDiscount(t *testing.T) {
	now := time.Now()
	ends := now.Add(time.Hour)
	plan := &database.HostingPlan{PriceAmount: 40000, Period: "monthly", PromoPercent: 25, PromoEndsAt: &ends, PromoAppliesTo: "both", PromoExclusive: true,
		DurationDiscounts: []database.DurationDiscount{{Periods: 6, Percent: 10}}}
	q := priceFor(plan, 6, &database.HostingVoucher{Kind: database.VoucherPercent, Value: 50}, database.OrderNew, now)
	if q.DurationDiscount != 0 || q.VoucherDiscount != 0 || !q.PromoExclusive || q.Subtotal != 180000 {
		t.Fatalf("only the promo counts: %+v", q)
	}
	// once the promo is over, the plan takes a voucher and the discount again
	later := ends.Add(time.Minute)
	if q := priceFor(plan, 6, nil, database.OrderNew, later); q.DurationDiscount != 24000 || q.PromoExclusive {
		t.Fatalf("after the promo: %+v", q)
	}
}

func TestPlanPromoRules(t *testing.T) {
	ends := time.Now().Add(time.Hour)
	base := database.HostingPlan{Slug: "starter", Name: "Starter", Period: "monthly", PriceAmount: 15000, MaxProjects: 1, MaxTunnels: 1, MaxDatabases: 1,
		DiskQuotaMB: 1024, CPULimitPct: 100, MemoryLimitMB: 256, Features: []string{}}
	good := base
	good.PromoPercent, good.PromoEndsAt = 20, &ends
	cleanPlan(&good)
	if err := validatePlan(good); err != nil || good.PromoAppliesTo != "both" {
		t.Fatalf("a promo with an end date is fine: %v %+v", err, good)
	}
	noDate := base
	noDate.PromoPercent = 20
	cleanPlan(&noDate)
	if validatePlan(noDate) == nil {
		t.Fatal("a promo needs an end date")
	}
	tooBig := good
	tooBig.PromoPercent = 95
	if validatePlan(tooBig) == nil {
		t.Fatal("a promo is at most 90 percent")
	}
	bad := good
	bad.PromoAppliesTo = "later"
	if validatePlan(bad) == nil {
		t.Fatal("a promo is for new, renew or both")
	}
	off := base
	off.PromoPercent, off.PromoEndsAt, off.PromoExclusive, off.PromoAppliesTo = 0, &ends, true, "new"
	cleanPlan(&off)
	if off.PromoEndsAt != nil || off.PromoExclusive || off.PromoAppliesTo != "both" {
		t.Fatalf("without a percent nothing of a promo is kept: %+v", off)
	}
}
