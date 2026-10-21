package database_test

import (
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/database/migrations"
)

// the example plans of the old version, as the panel made them
func oldExamplePlans() []database.HostingPlan {
	return []database.HostingPlan{
		{Slug: "starter", Name: "Starter", Tagline: "Untuk satu situs atau aplikasi kecil", PriceAmount: 25000, Period: "monthly",
			Features: []string{"Terminal dan File Manager di panel"}, MaxProjects: 2, MaxTunnels: 2, MaxDatabases: 1, DiskQuotaMB: 2048, CPULimitPct: 100, MemoryLimitMB: 512, MaxSubdomains: 1, Visible: true},
		{Slug: "pro", Name: "Pro", Tagline: "Untuk beberapa aplikasi dan database", PriceAmount: 75000, Period: "monthly",
			Features: []string{"Semua fitur Starter"}, MaxProjects: 5, MaxTunnels: 5, MaxDatabases: 3, DiskQuotaMB: 10240, CPULimitPct: 200, MemoryLimitMB: 1024, MaxSubdomains: 3, MaxCustomDomains: 1, Highlighted: true, Visible: true, SortOrder: 1},
		{Slug: "bisnis", Name: "Bisnis", Tagline: "Untuk layanan yang lebih ramai", PriceAmount: 150000, Period: "monthly",
			Features: []string{"Semua fitur Pro", "CPU dan RAM terbesar"}, MaxProjects: 15, MaxTunnels: 15, MaxDatabases: 10, DiskQuotaMB: 51200, CPULimitPct: 400, MemoryLimitMB: 4096, MaxSubdomains: 10, MaxCustomDomains: 3, Visible: true, SortOrder: 2},
	}
}

func applyExamplePlansMigration(t *testing.T, m *database.Manager) {
	t.Helper()
	raw, err := migrations.Files.ReadFile("000038_example_plans_new_prices.sql")
	if err != nil {
		t.Fatal(err)
	}
	up := strings.Split(string(raw), "-- +goose Down")[0]
	up = strings.Replace(up, "-- +goose Up", "", 1)
	if _, err := m.DB().Exec(up); err != nil {
		t.Fatalf("the migration: %v", err)
	}
}

func TestExamplePlansMigrationChangesOnlyPlansThatWereNeverEdited(t *testing.T) {
	m := newIntegrationManager(t)
	for _, plan := range oldExamplePlans() {
		if plan.Slug == "pro" {
			plan.PriceAmount = 76000 // the seller changed the price of this one
		}
		if _, err := m.CreateHostingPlan(plan); err != nil {
			t.Fatalf("create %s: %v", plan.Slug, err)
		}
	}
	applyExamplePlansMigration(t, m)
	applyExamplePlansMigration(t, m) // a second run changes nothing more

	plans, err := m.ListHostingPlans(false)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]database.HostingPlan{}
	for _, p := range plans {
		got[p.Slug] = p
	}
	if s := got["starter"]; s.PriceAmount != 15000 || s.DiskQuotaMB != 1024 || s.MaxProjects != 2 {
		t.Errorf("starter: %+v", s)
	}
	if p := got["pro"]; p.PriceAmount != 76000 || p.DiskQuotaMB != 10240 || p.MaxProjects != 5 {
		t.Errorf("an edited plan is left alone: %+v", p)
	}
	b := got["bisnis"]
	if b.PriceAmount != 80000 || b.MemoryLimitMB != 2048 || b.CPULimitPct != 200 || b.MaxSubdomains != 6 || b.MaxCustomDomains != 2 || b.MaxProjects != 8 || b.MaxDatabases != 5 || b.DiskQuotaMB != 6144 {
		t.Errorf("bisnis: %+v", b)
	}
	if strings.Join(b.Features, "|") != "Semua fitur Pro|RAM 2 GB dan domain milik sendiri" {
		t.Errorf("the feature line that named the old limit: %v", b.Features)
	}
}
