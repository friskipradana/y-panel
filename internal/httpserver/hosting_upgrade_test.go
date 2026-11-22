package httpserver

import (
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func plan(id int64, price int64, period string, visible bool) *database.HostingPlan {
	return &database.HostingPlan{ID: id, PriceAmount: price, Period: period, Visible: visible}
}

func TestIsUpgrade(t *testing.T) {
	starter := plan(1, 25000, "monthly", true)
	cases := map[string]struct {
		current, target *database.HostingPlan
		want            bool
	}{
		"dearer monthly plan":           {starter, plan(2, 75000, "monthly", true), true},
		"yearly plan dearer per month":  {starter, plan(3, 600000, "yearly", true), true},
		"yearly plan cheaper per month": {plan(2, 75000, "monthly", true), plan(3, 600000, "yearly", true), false},
		"same plan":                     {starter, starter, false},
		"cheaper plan":                  {plan(2, 75000, "monthly", true), starter, false},
		"hidden plan":                   {starter, plan(4, 99000, "monthly", false), false},
		"paid once target":              {starter, plan(5, 900000, "once", true), false},
		"free target":                   {starter, plan(6, 0, "monthly", true), false},
		"free current, any paid plan":   {plan(7, 0, "monthly", true), starter, true},
		"once current, any paid plan":   {plan(8, 500000, "once", true), starter, true},
		"missing current":               {nil, starter, false},
	}
	for name, tc := range cases {
		if got := isUpgrade(tc.current, tc.target); got != tc.want {
			t.Errorf("%s: isUpgrade = %v, want %v", name, got, tc.want)
		}
	}
}

func TestUpgradeCarryConvertsByPriceRatio(t *testing.T) {
	old := plan(1, 25000, "monthly", true)
	next := plan(2, 75000, "monthly", true)
	// 15 days at a third of the price are worth 5 days
	if got, want := upgradeCarry(old, next, 15*24*time.Hour), 5*24*time.Hour; got != want {
		t.Errorf("carry = %v, want %v", got, want)
	}
	// a yearly new plan is compared per month
	yearly := plan(3, 900000, "yearly", true) // 75000 a month
	if got, want := upgradeCarry(old, yearly, 30*24*time.Hour), 10*24*time.Hour; got != want {
		t.Errorf("carry to a yearly plan = %v, want %v", got, want)
	}
	// nothing carries from a free plan, or when nothing is left, or to a cheaper plan
	if upgradeCarry(plan(4, 0, "monthly", true), next, 10*24*time.Hour) != 0 {
		t.Error("a free plan carries no time")
	}
	if upgradeCarry(old, next, 0) != 0 || upgradeCarry(old, next, -time.Hour) != 0 {
		t.Error("no time left carries nothing")
	}
	if upgradeCarry(next, old, 10*24*time.Hour) != 0 {
		t.Error("a move to a cheaper plan carries nothing")
	}
}

func TestUpgradeDifferenceIsThePriceGapForTheTimeLeft(t *testing.T) {
	old := plan(1, 25000, "monthly", true)
	next := plan(2, 75000, "monthly", true)
	// 15 days left: half a month of the 50000 gap
	if got, want := upgradeDifference(old, next, 15*24*time.Hour), int64(25000); got != want {
		t.Errorf("difference = %d, want %d", got, want)
	}
	// a yearly plan counts per month: 900000 a year is 75000 a month
	yearly := plan(3, 900000, "yearly", true)
	if got, want := upgradeDifference(old, yearly, 30*24*time.Hour), int64(50000); got != want {
		t.Errorf("difference to a yearly plan = %d, want %d", got, want)
	}
	// a free plan pays the whole price of the time left
	if got, want := upgradeDifference(plan(4, 0, "monthly", true), next, 30*24*time.Hour), int64(75000); got != want {
		t.Errorf("difference from a free plan = %d, want %d", got, want)
	}
	// nothing left, or no gap, is nothing to pay
	if upgradeDifference(old, next, 0) != 0 || upgradeDifference(next, old, 10*24*time.Hour) != 0 || upgradeDifference(nil, next, time.Hour) != 0 {
		t.Error("no time or no gap must cost nothing")
	}
}
