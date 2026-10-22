package httpserver

import (
	"fmt"
	"slices"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// SeedPlansOptions says what the seeder may do. Without Force it only adds the example plans that are missing and reports the
// ones that differ; with Force it also puts a differing example plan back to the example.
type SeedPlansOptions struct {
	Force  bool
	DryRun bool
	// Slugs limits the seeder to some of the example plans; empty means all of them
	Slugs []string
}

// SeedPlanResult is what the seeder did, or would do, with one example plan
type SeedPlanResult struct {
	Slug string
	// Action is one of created, unchanged, updated, kept (differs and was left alone)
	Action string
	// Changes are the fields that differ from the example, as "field: now -> example"
	Changes []string
}

// planDifferences lists how a plan differs from the example it was made from. Trial days, the long-subscription discounts, and
// the own-notification switch, and the promo are the seller's own settings and are not compared.
func planDifferences(have, want database.HostingPlan) []string {
	var out []string
	add := func(field string, a, b any) {
		if fmt.Sprint(a) != fmt.Sprint(b) {
			out = append(out, fmt.Sprintf("%s: %v -> %v", field, a, b))
		}
	}
	add("name", have.Name, want.Name)
	add("tagline", have.Tagline, want.Tagline)
	add("price", have.PriceAmount, want.PriceAmount)
	add("period", have.Period, want.Period)
	add("maxProjects", have.MaxProjects, want.MaxProjects)
	add("maxTunnels", have.MaxTunnels, want.MaxTunnels)
	add("maxDatabases", have.MaxDatabases, want.MaxDatabases)
	add("diskQuotaMb", have.DiskQuotaMB, want.DiskQuotaMB)
	add("cpuLimitPct", have.CPULimitPct, want.CPULimitPct)
	add("memoryLimitMb", have.MemoryLimitMB, want.MemoryLimitMB)
	add("maxSubdomains", have.MaxSubdomains, want.MaxSubdomains)
	add("maxCustomDomains", have.MaxCustomDomains, want.MaxCustomDomains)
	add("highlighted", have.Highlighted, want.Highlighted)
	add("visible", have.Visible, want.Visible)
	if !slices.Equal(have.Features, want.Features) {
		out = append(out, "features: differ")
	}
	return out
}

// SeedHostingPlans brings the example plans (Starter, Pro, Bisnis) into the database. A plan is matched by its slug. Accounts that
// are already on a plan keep the quota they were given; the new numbers apply to the next purchase or renewal.
func SeedHostingPlans(db *database.Manager, opt SeedPlansOptions) ([]SeedPlanResult, error) {
	if db == nil || !db.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	want := exampleHostingPlans()
	if len(opt.Slugs) > 0 {
		for _, slug := range opt.Slugs {
			if !slices.ContainsFunc(want, func(p database.HostingPlan) bool { return p.Slug == strings.ToLower(strings.TrimSpace(slug)) }) {
				return nil, fmt.Errorf("unknown example plan %q (starter, pro, bisnis)", slug)
			}
		}
	}
	existing, err := db.ListHostingPlans(false)
	if err != nil {
		return nil, err
	}

	var results []SeedPlanResult
	for _, example := range want {
		if len(opt.Slugs) > 0 && !slices.ContainsFunc(opt.Slugs, func(s string) bool { return strings.ToLower(strings.TrimSpace(s)) == example.Slug }) {
			continue
		}
		idx := slices.IndexFunc(existing, func(p database.HostingPlan) bool { return p.Slug == example.Slug })
		if idx < 0 {
			if !opt.DryRun {
				if _, err := db.CreateHostingPlan(example); err != nil {
					return results, fmt.Errorf("create %s: %w", example.Slug, err)
				}
			}
			results = append(results, SeedPlanResult{Slug: example.Slug, Action: "created"})
			continue
		}
		have := existing[idx]
		changes := planDifferences(have, example)
		switch {
		case len(changes) == 0:
			results = append(results, SeedPlanResult{Slug: example.Slug, Action: "unchanged"})
		case !opt.Force:
			results = append(results, SeedPlanResult{Slug: example.Slug, Action: "kept", Changes: changes})
		default:
			if !opt.DryRun {
				next := example
				next.ID = have.ID
				next.TrialDays = have.TrialDays
				next.DurationDiscounts = have.DurationDiscounts
				next.OwnNotify = have.OwnNotify
				next.SortOrder = have.SortOrder
				next.PromoPercent, next.PromoEndsAt, next.PromoAppliesTo, next.PromoExclusive = have.PromoPercent, have.PromoEndsAt, have.PromoAppliesTo, have.PromoExclusive
				if _, err := db.UpdateHostingPlan(next); err != nil {
					return results, fmt.Errorf("update %s: %w", example.Slug, err)
				}
			}
			results = append(results, SeedPlanResult{Slug: example.Slug, Action: "updated", Changes: changes})
		}
	}
	return results, nil
}
