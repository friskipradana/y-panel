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
		q := priceFor(plan, c.periods, c.voucher)
		if q.List != c.list || q.DurationDiscount != c.duration || q.VoucherDiscount != c.off || q.DurationPercent != c.percent || q.Subtotal != c.subtotal {
			t.Errorf("%d periods: %+v, want list %d duration %d voucher %d (%d%%) subtotal %d", c.periods, q, c.list, c.duration, c.off, c.percent, c.subtotal)
		}
	}
	if q := priceFor(&database.HostingPlan{PriceAmount: 0}, 6, nil); q.Subtotal != 0 || q.List != 0 {
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
