package httpserver

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestOrderMonthsAndPeriods(t *testing.T) {
	cases := []struct {
		period         string
		periods        int
		months, maxFor int
	}{
		{"monthly", 3, 3, orderMaxPeriods},
		{"yearly", 2, 24, 5},
		{"once", 1, 0, 1},
	}
	for _, c := range cases {
		plan := &database.HostingPlan{Period: c.period}
		if got := orderMonths(plan, c.periods); got != c.months {
			t.Errorf("%s x%d: months = %d, want %d", c.period, c.periods, got, c.months)
		}
		if got := maxPeriods(plan); got != c.maxFor {
			t.Errorf("%s: max periods = %d, want %d", c.period, got, c.maxFor)
		}
	}
}

func TestOrderSettingsFallBackToSafeDefaults(t *testing.T) {
	if got := (siteSettings{}).orderExpiry(); got != 24*time.Hour {
		t.Errorf("default expiry = %v", got)
	}
	if got := (siteSettings{OrderExpiryMinutes: 5}).orderExpiry(); got != 24*time.Hour {
		t.Errorf("too short an expiry must fall back, got %v", got)
	}
	if got := (siteSettings{OrderExpiryMinutes: 120}).orderExpiry(); got != 2*time.Hour {
		t.Errorf("expiry = %v", got)
	}
	if got := (siteSettings{}).orderUniqueMax(); got != 999 {
		t.Errorf("default unique max = %d", got)
	}
	if got := (siteSettings{OrderUniqueMax: 50000}).orderUniqueMax(); got != 999 {
		t.Errorf("huge unique max must fall back, got %d", got)
	}
}

func TestOrderViewShowsPaymentDetailsOnlyWhileWaiting(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	if err := s.saveSiteSettings(siteSettings{LandingEnabled: true, OrderBank: "BCA", OrderAccount: "123", OrderHolder: "Reneo"}); err != nil {
		t.Fatal(err)
	}
	waiting := s.orderViewFor(database.HostingOrder{Status: database.OrderPending, AmountTotal: 50123})
	// the single account of older settings still counts, as a bank
	if waiting.Payment == nil || len(waiting.Payment.Methods) != 1 || waiting.Payment.Methods[0].Account != "123" || waiting.Payment.Methods[0].Kind != "bank" {
		t.Fatalf("a waiting order shows where to pay, got %+v", waiting.Payment)
	}
	for _, o := range []database.HostingOrder{
		{Status: database.OrderPaid, AmountTotal: 50123},
		{Status: database.OrderExpired, AmountTotal: 50123},
		{Status: database.OrderPending, AmountTotal: 0},
	} {
		if s.orderViewFor(o).Payment != nil {
			t.Errorf("status %s total %d must not show payment details", o.Status, o.AmountTotal)
		}
	}
}

func TestOrdersAreOffUntilSelfSignupIsOn(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	if err := s.saveSiteSettings(siteSettings{LandingEnabled: true, HostingEnabled: true}); err != nil {
		t.Fatal(err)
	}
	if s.selfServiceOn() {
		t.Fatal("ordering is off until the seller turns it on")
	}
}

func TestOrderMethodsListBanksAndWalletsAndOnlyEnabledOnesAreShown(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	put := func(body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		s.handleSetSiteSettings(rec, httptest.NewRequest(http.MethodPut, "/api/v1/settings/site", strings.NewReader(body)))
		return rec
	}
	// orders cannot be turned on without a way to pay
	if rec := put(`{"hostingEnabled":true,"selfSignup":true}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("no way to pay: %d %s", rec.Code, rec.Body.String())
	}
	for _, bad := range []string{
		`{"orderMethods":[{"kind":"crypto","name":"X","account":"1","holder":"A","enabled":true}]}`,
		`{"orderMethods":[{"kind":"bank","name":"BCA","account":"","holder":"A","enabled":true}]}`,
		`{"orderMethods":[{"kind":"bank","name":"BCA","account":"1","holder":"A","enabled":true},{"kind":"bank","name":"bca","account":"1","holder":"A","enabled":true}]}`,
		`{"orderMethods":[{"kind":"bank","name":"BCA","account":"1
2","holder":"A","enabled":true}]}`,
	} {
		if rec := put(bad); rec.Code != http.StatusBadRequest {
			t.Errorf("%s must be refused, got %d", bad, rec.Code)
		}
	}
	rec := put(`{"hostingEnabled":true,"orderMethods":[
		{"kind":"bank","name":"BCA","account":"1234567890","holder":"Reneo","enabled":true},
		{"kind":"ewallet","name":"DANA","account":"081234567890","holder":"Reneo","enabled":true},
		{"kind":"ewallet","name":"OVO","account":"081200000000","holder":"Reneo","enabled":false}]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("a list of ways to pay: %d %s", rec.Code, rec.Body.String())
	}
	if rec = put(`{"selfSignup":true}`); rec.Code != http.StatusOK {
		t.Fatalf("orders on with ways to pay: %d %s", rec.Code, rec.Body.String())
	}
	saved := s.loadSiteSettings()
	if len(saved.OrderMethods) != 3 || saved.OrderMethods[0].ID == "" {
		t.Fatalf("each way to pay gets an id: %+v", saved.OrderMethods)
	}
	view := s.orderViewFor(database.HostingOrder{Status: database.OrderPending, AmountTotal: 50123})
	if view.Payment == nil || len(view.Payment.Methods) != 2 || view.Payment.Methods[1].Name != "DANA" {
		t.Fatalf("the buyer sees the enabled ones only: %+v", view.Payment)
	}
	// switching every one off leaves nothing to pay to: orders cannot stay on
	if rec = put(`{"orderMethods":[{"kind":"bank","name":"BCA","account":"1","holder":"A","enabled":false}],"selfSignup":true}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("all off: %d %s", rec.Code, rec.Body.String())
	}
}
