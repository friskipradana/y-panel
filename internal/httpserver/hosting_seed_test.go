package httpserver

import (
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/database/dbtest"
)

func TestPlanDifferences(t *testing.T) {
	example := exampleHostingPlans()[0]
	if got := planDifferences(example, example); len(got) != 0 {
		t.Fatalf("the same plan has no differences: %v", got)
	}
	edited := example
	edited.PriceAmount = 25000
	edited.Features = []string{"x"}
	edited.TrialDays = 7 // the seller's own setting, not compared
	got := strings.Join(planDifferences(edited, example), "|")
	if !strings.Contains(got, "price: 25000 -> 15000") || !strings.Contains(got, "features: differ") || strings.Contains(got, "trial") {
		t.Fatalf("unexpected differences: %s", got)
	}
}

func TestSeedHostingPlansWithADatabase(t *testing.T) {
	m := dbtest.New(t)
	// the migrations leave no plan; the seeder adds all three
	res, err := SeedHostingPlans(m, SeedPlansOptions{})
	if err != nil || len(res) != 3 || res[0].Action != "created" {
		t.Fatalf("first run: %+v %v", res, err)
	}
	res, _ = SeedHostingPlans(m, SeedPlansOptions{})
	for _, r := range res {
		if r.Action != "unchanged" {
			t.Fatalf("second run must change nothing: %+v", res)
		}
	}

	// the seller changes Starter: without force it is kept, a dry run changes nothing, force puts it back and keeps the trial
	plans, _ := m.ListHostingPlans(false)
	var starter database.HostingPlan
	for _, p := range plans {
		if p.Slug == "starter" {
			starter = p
		}
	}
	starter.PriceAmount = 99000
	starter.TrialDays = 5
	if _, err := m.UpdateHostingPlan(starter); err != nil {
		t.Fatal(err)
	}
	res, _ = SeedHostingPlans(m, SeedPlansOptions{})
	if res[0].Action != "kept" {
		t.Fatalf("a changed plan is kept without force: %+v", res)
	}
	_, _ = SeedHostingPlans(m, SeedPlansOptions{Force: true, DryRun: true})
	if got, _ := m.GetHostingPlan(starter.ID); got.PriceAmount != 99000 {
		t.Fatal("a dry run must not write")
	}
	res, _ = SeedHostingPlans(m, SeedPlansOptions{Force: true, Slugs: []string{"starter"}})
	got, _ := m.GetHostingPlan(starter.ID)
	if len(res) != 1 || res[0].Action != "updated" || got.PriceAmount != 15000 || got.TrialDays != 5 {
		t.Fatalf("force restores the example and keeps the seller's trial: %+v %+v", res, got)
	}
	if _, err := SeedHostingPlans(m, SeedPlansOptions{Slugs: []string{"nope"}}); err == nil {
		t.Fatal("an unknown slug is refused")
	}
}
