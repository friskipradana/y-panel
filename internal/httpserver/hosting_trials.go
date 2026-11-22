package httpserver

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// A trial upgrade lets an account try a bigger plan for a while. Its own plan waits: the end date stays where it is
// until the trial is over, and then moves later by the time the trial lasted, so the paid time is not used up.

// planTrialView is the trial an account is on, as the plan views show it
type planTrialView struct {
	Plan      *database.HostingPlan `json:"plan"`
	StartedAt *time.Time            `json:"startedAt"`
	EndsAt    *time.Time            `json:"endsAt"`
}

// trialViewFor describes the running trial of an account, or nil when there is none
func (s *Server) trialViewFor(up *database.UserPlan, now time.Time) *planTrialView {
	if !up.TrialRunning(now) {
		return nil
	}
	view := &planTrialView{StartedAt: up.TrialStartedAt, EndsAt: up.TrialEndsAt}
	if up.TrialPlanID != nil {
		view.Plan, _ = s.database.GetHostingPlan(*up.TrialPlanID)
	}
	return view
}

// finishPlanTrial ends the trial of an account (it ran out, or the superadmin cut it short or changed the plan):
// the account's own plan gets its time back and its quota. It does nothing when no trial is running.
func (s *Server) finishPlanTrial(userID int64, at time.Time) {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	finished, err := s.database.FinishPlanTrial(userID, at)
	if err != nil {
		log.Printf("[hosting] could not end the trial of account %d: %v", userID, err)
		return
	}
	if !finished {
		return
	}
	up, _ := s.database.GetUserPlan(userID)
	if up != nil && up.PlanID != nil {
		if plan, _ := s.database.GetHostingPlan(*up.PlanID); plan != nil {
			if err := s.database.UpdateUserQuota(planQuota(*plan, userID)); err != nil {
				log.Printf("[hosting] could not restore the quota of account %d after the trial: %v", userID, err)
			}
		}
	}
	s.notifyUserAction(userID, "Trial paket selesai", "Trial paket sudah berakhir. Akun kembali ke paket Anda, dan masa berlakunya ditambah sebanyak lama trial.", "info")
	go s.syncHostingRoutes()
}

// endPlanTrials closes the trials whose time is over; the expiry loop calls it
func (s *Server) endPlanTrials(now time.Time) {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	ended, err := s.database.ListEndedTrials(now)
	if err != nil {
		log.Printf("[hosting] trial check failed: %v", err)
		return
	}
	for _, userID := range ended {
		s.finishPlanTrial(userID, now)
	}
}

// handleStartPlanTrial lets an account run on another plan for some days
func (s *Server) handleStartPlanTrial(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireHostingMode(w) {
		return
	}
	var req struct {
		PlanID int64 `json:"planId"`
		Days   int   `json:"days"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if req.Days < 1 || req.Days > planMaxTrialDays {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": fmt.Sprintf("days must be between 1 and %d", planMaxTrialDays)})
		return
	}
	userID := parsePathID(r, "id")
	target, _ := s.database.GetUserByID(userID)
	if target == nil || target.Role == auth.SuperadminRole {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}
	now := time.Now()
	up, _ := s.database.GetUserPlan(userID)
	if up == nil || up.PlanID == nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "the account has no plan to upgrade from; give it a plan or a trial of days instead"})
		return
	}
	if up.TrialRunning(now) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "a trial is already running; end it first"})
		return
	}
	if state, _ := planState(up.ExpiresAt, s.loadSiteSettings().GraceDays, now); state != planStateActive {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "the plan of this account has ended; renew it before a trial upgrade"})
		return
	}
	if *up.PlanID == req.PlanID {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "the trial must be a different plan from the one the account is on"})
		return
	}
	plan, _ := s.database.GetHostingPlan(req.PlanID)
	if plan == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "plan not found"})
		return
	}
	// a leftover trial row that already ended is closed first, so its time is credited
	s.finishPlanTrial(userID, now)
	if err := s.database.UpdateUserQuota(planQuota(*plan, userID)); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	started, err := s.database.StartPlanTrial(userID, plan.ID, now, now.AddDate(0, 0, req.Days))
	if err != nil || !started {
		// put the quota of the account's own plan back
		s.restoreOwnQuota(userID)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "the trial could not be started"})
		return
	}
	s.notifyUserAction(userID, "Trial upgrade paket", fmt.Sprintf("Anda mencoba paket %s selama %d hari. Setelah itu akun kembali ke paket Anda, dan masa berlakunya ditambah sebanyak lama trial.", plan.Name, req.Days), "success")
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "hosting.plan.trial", "ok", map[string]any{"user": target.Username, "planId": plan.ID, "days": req.Days})
	}
	go s.syncHostingRoutes()
	view, err := s.userPlanView(userID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, view)
}

// handleEndPlanTrial cuts a trial short: the account goes back to its own plan, which gets the time the trial used
func (s *Server) handleEndPlanTrial(w http.ResponseWriter, r *http.Request) {
	if !s.requireHostingMode(w) {
		return
	}
	userID := parsePathID(r, "id")
	up, _ := s.database.GetUserPlan(userID)
	if up == nil || up.TrialEndsAt == nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "no trial is running for this account"})
		return
	}
	s.finishPlanTrial(userID, time.Now())
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "hosting.plan.trial.end", "ok", map[string]any{"user": userID})
	}
	view, err := s.userPlanView(userID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, view)
}

// restoreOwnQuota sets the quota of an account back to what its own plan allows
func (s *Server) restoreOwnQuota(userID int64) {
	up, _ := s.database.GetUserPlan(userID)
	if up == nil || up.PlanID == nil {
		return
	}
	if plan, _ := s.database.GetHostingPlan(*up.PlanID); plan != nil {
		_ = s.database.UpdateUserQuota(planQuota(*plan, userID))
	}
}
