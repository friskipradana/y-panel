package httpserver

import (
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// monthlyPrice is what a plan costs for one month, so a monthly and a yearly plan can be compared
func monthlyPrice(plan *database.HostingPlan) float64 {
	switch plan.Period {
	case "monthly":
		return float64(plan.PriceAmount)
	case "yearly":
		return float64(plan.PriceAmount) / 12
	}
	return 0
}

// isUpgrade tells if target is a plan an account on current may move up to: a plan bought by period that costs more
// per month than the current one (any such plan for an account on a free plan)
func isUpgrade(current, target *database.HostingPlan) bool {
	if current == nil || target == nil || target.ID == current.ID || !target.Visible {
		return false
	}
	if target.PriceAmount <= 0 || (target.Period != "monthly" && target.Period != "yearly") {
		return false
	}
	return current.Period == "once" || monthlyPrice(target) > monthlyPrice(current)
}

// minUpgradeDifference is the least a difference payment may be: under it the upgrade is better made as a renewal
const minUpgradeDifference int64 = 1000

// upgradeDifference is what moving to next costs for the time that is left on old: the difference of the monthly prices
// times the months remaining (30 days each), in whole rupiah. An account on a free plan pays the whole price of the time left.
func upgradeDifference(old, next *database.HostingPlan, remaining time.Duration) int64 {
	if old == nil || next == nil || remaining <= 0 {
		return 0
	}
	perMonth := monthlyPrice(next) - monthlyPrice(old)
	if perMonth <= 0 {
		return 0
	}
	months := remaining.Hours() / 24 / 30
	return int64(perMonth*months + 0.5)
}

// upgradeCarry is the time on the new plan that what is left of the old one is worth: the remaining time times the
// ratio of the monthly prices. A free or once-paid old plan has nothing to carry.
func upgradeCarry(old, next *database.HostingPlan, remaining time.Duration) time.Duration {
	oldPrice, newPrice := monthlyPrice(old), monthlyPrice(next)
	if remaining <= 0 || oldPrice <= 0 || newPrice <= 0 || newPrice < oldPrice {
		return 0
	}
	return time.Duration(float64(remaining) * oldPrice / newPrice)
}
