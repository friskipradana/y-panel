package httpserver

import (
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
	if waiting.Payment == nil || waiting.Payment.Account != "123" {
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
