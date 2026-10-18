package httpserver

import (
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestTrialRunning(t *testing.T) {
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	later, earlier := now.Add(time.Hour), now.Add(-time.Hour)
	var none *database.UserPlan
	if none.TrialRunning(now) {
		t.Fatal("no plan row, no trial")
	}
	if (&database.UserPlan{}).TrialRunning(now) {
		t.Fatal("a plan without trial columns has no trial")
	}
	if !(&database.UserPlan{TrialEndsAt: &later}).TrialRunning(now) {
		t.Fatal("a trial that ends later is running")
	}
	if (&database.UserPlan{TrialEndsAt: &earlier}).TrialRunning(now) {
		t.Fatal("a trial whose time is over is not running, even before it is closed")
	}
}

func TestPlanWaitingDuringTrialIsNotCountedAsEnded(t *testing.T) {
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	ended, trialEnd := now.Add(-48*time.Hour), now.Add(24*time.Hour)
	planID := int64(1)
	info := database.UserHosting{PlanID: &planID, PlanName: "Starter", ExpiresAt: &ended, TrialPlanName: "Pro", TrialEndsAt: &trialEnd}

	view := hostingViewFor(info, 0, now)
	if view.State != planStateActive || view.TrialPlanName != "Pro" {
		t.Fatalf("on a trial the account counts as active and names the trial, got %+v", view)
	}
	info.TrialEndsAt = nil
	if view := hostingViewFor(info, 0, now); view.State == planStateActive {
		t.Fatalf("without a trial the ended plan stays ended, got %+v", view)
	}
}
