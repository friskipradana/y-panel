package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// Hosting mode: the plans the superadmin sells, what the landing page shows of them, and which
// account is on which plan until when.

func (s *Server) requireHostingMode(w http.ResponseWriter) bool {
	if s.hostingEnabled() {
		return true
	}
	s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "turn hosting mode on first"})
	return false
}

func (s *Server) handleListHostingPlans(w http.ResponseWriter, _ *http.Request) {
	plans, err := s.database.ListHostingPlans(false)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"plans": plans})
}

func decodePlan(w http.ResponseWriter, r *http.Request) (database.HostingPlan, error) {
	defer r.Body.Close()
	var p database.HostingPlan
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&p); err != nil {
		return p, errors.New("invalid JSON")
	}
	cleanPlan(&p)
	return p, validatePlan(p)
}

func isDuplicate(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "duplicate key")
}

func (s *Server) handleCreateHostingPlan(w http.ResponseWriter, r *http.Request) {
	if !s.requireHostingMode(w) {
		return
	}
	plan, err := decodePlan(w, r)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	created, err := s.database.CreateHostingPlan(plan)
	if isDuplicate(err) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "a plan with this slug already exists"})
		return
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "hosting.plan.create", "ok", map[string]any{"plan": created.Slug})
	}
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateHostingPlan(w http.ResponseWriter, r *http.Request) {
	if !s.requireHostingMode(w) {
		return
	}
	plan, err := decodePlan(w, r)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	plan.ID = parsePathID(r, "id")
	updated, err := s.database.UpdateHostingPlan(plan)
	if isDuplicate(err) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "a plan with this slug already exists"})
		return
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if updated == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "plan not found"})
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "hosting.plan.update", "ok", map[string]any{"plan": updated.Slug})
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteHostingPlan(w http.ResponseWriter, r *http.Request) {
	if !s.requireHostingMode(w) {
		return
	}
	id := parsePathID(r, "id")
	plan, _ := s.database.GetHostingPlan(id)
	if plan == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "plan not found"})
		return
	}
	if err := s.database.DeleteHostingPlan(id); err != nil {
		if errors.Is(err, database.ErrPlanInUse) {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "move the accounts on this plan to another plan first"})
			return
		}
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "hosting.plan.delete", "ok", map[string]any{"plan": plan.Slug})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// publicPlan is a plan as visitors see it: no account counts, no internal ids beyond the slug
type publicPlan struct {
	ID            int64    `json:"id"`
	Slug          string   `json:"slug"`
	Name          string   `json:"name"`
	Tagline       string   `json:"tagline"`
	PriceAmount   int64    `json:"priceAmount"`
	Period        string   `json:"period"`
	Features      []string `json:"features"`
	MaxProjects   int      `json:"maxProjects"`
	MaxTunnels    int      `json:"maxTunnels"`
	MaxDatabases  int      `json:"maxDatabases"`
	DiskQuotaMB   int64    `json:"diskQuotaMb"`
	MemoryLimitMB int      `json:"memoryLimitMb"`
	MaxSubdomains int      `json:"maxSubdomains"`
	MaxCustomDomains int   `json:"maxCustomDomains"`
	Highlighted   bool     `json:"highlighted"`
	TrialDays     int      `json:"trialDays"`
}

// handlePublicHosting feeds the pricing section of the landing page. Nothing is offered while
// hosting mode or the public pages are off, or when no plan is visible.
func (s *Server) handlePublicHosting(w http.ResponseWriter, _ *http.Request) {
	settings := s.loadSiteSettings()
	w.Header().Set("Cache-Control", "public, max-age=30")
	if !settings.HostingEnabled || !settings.LandingEnabled || s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusOK, jsonResponse{"enabled": false, "plans": []publicPlan{}})
		return
	}
	plans, err := s.database.ListHostingPlans(true)
	if err != nil || len(plans) == 0 {
		s.writeJSON(w, http.StatusOK, jsonResponse{"enabled": false, "plans": []publicPlan{}})
		return
	}
	out := make([]publicPlan, 0, len(plans))
	for _, p := range plans {
		out = append(out, publicPlan{
			ID: p.ID, Slug: p.Slug, Name: p.Name, Tagline: p.Tagline, PriceAmount: p.PriceAmount, Period: p.Period, Features: p.Features,
			MaxProjects: p.MaxProjects, MaxTunnels: p.MaxTunnels, MaxDatabases: p.MaxDatabases, DiskQuotaMB: p.DiskQuotaMB,
			MemoryLimitMB: p.MemoryLimitMB, MaxSubdomains: p.MaxSubdomains, MaxCustomDomains: p.MaxCustomDomains, Highlighted: p.Highlighted, TrialDays: p.TrialDays,
		})
	}
	// ordering needs an address to give: without an offered domain the order buttons stay on the old way
	offered := []map[string]string{}
	for _, d := range s.enabledHostingDomains() {
		offered = append(offered, map[string]string{"zoneId": d.ZoneID, "name": d.Name})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"enabled": true, "currency": "IDR", "selfSignup": settings.SelfSignup && len(offered) > 0, "domains": offered, "orderUrl": settings.OrderURL, "orderMessage": settings.OrderMessage, "plans": out})
}

// ─── Accounts on a plan ───────────────────────────────────────────────────────

type userPlanView struct {
	Plan        *database.HostingPlan `json:"plan"`
	ExpiresAt   *time.Time            `json:"expiresAt"`
	State       string                `json:"state"`
	GraceEndsAt *time.Time            `json:"graceEndsAt"`
	GraceDays   int                   `json:"graceDays"`
	// Trial is the upgrade the account is trying; Plan is then the plan that waits
	Trial *planTrialView `json:"trial"`
}

func (s *Server) userPlanView(userID int64) (userPlanView, error) {
	grace := s.loadSiteSettings().GraceDays
	view := userPlanView{State: planStateNone, GraceDays: grace}
	up, err := s.database.GetUserPlan(userID)
	if err != nil || up == nil || up.PlanID == nil {
		return view, err
	}
	plan, err := s.database.GetHostingPlan(*up.PlanID)
	if err != nil {
		return view, err
	}
	view.Plan = plan
	view.ExpiresAt = up.ExpiresAt
	now := time.Now()
	view.State, view.GraceEndsAt = planState(up.ExpiresAt, grace, now)
	// the plan waits while the trial runs, so it is not counted as ended
	if view.Trial = s.trialViewFor(up, now); view.Trial != nil {
		view.State, view.GraceEndsAt = planStateActive, nil
	}
	return view, nil
}

func (s *Server) handleGetUserPlan(w http.ResponseWriter, r *http.Request) {
	view, err := s.userPlanView(parsePathID(r, "id"))
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, view)
}

// handleSetUserPlan puts an account on a plan (quota follows the plan), renews it, or takes it off
func (s *Server) handleSetUserPlan(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireHostingMode(w) {
		return
	}
	var req struct {
		PlanID    *int64  `json:"planId"`
		ExpiresAt *string `json:"expiresAt"`
		Months    *int    `json:"months"`
		// Days gives a trial: the plan ends that many days from now
		Days *int `json:"days"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	userID := parsePathID(r, "id")
	target, _ := s.database.GetUserByID(userID)
	if target == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}
	if target.Role == auth.SuperadminRole {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "the superadmin account does not take a plan"})
		return
	}
	// a trial upgrade in progress ends first, so its time is credited before the plan changes
	s.finishPlanTrial(userID, time.Now())
	previous, _ := s.database.GetUserPlan(userID)

	if req.PlanID == nil {
		if err := s.database.ClearUserPlan(userID); err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		s.liftExpirySuspension(target, previous)
	} else {
		plan, err := s.database.GetHostingPlan(*req.PlanID)
		if err != nil || plan == nil {
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "plan not found"})
			return
		}
		now := time.Now()
		expires, err := planEnd(plan, previous, req.ExpiresAt, req.Months, now)
		if req.Days != nil {
			if *req.Days < 1 || *req.Days > planMaxTrialDays {
				err = errors.New("days must be between 1 and 90")
			} else {
				end := now.AddDate(0, 0, *req.Days)
				expires = &end
			}
		}
		if err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
			return
		}
		if err := s.applyUserPlan(userID, plan, expires); err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		s.liftExpirySuspension(target, previous)
	}

	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "hosting.plan.assign", "ok", map[string]any{"user": target.Username, "planId": req.PlanID})
	}
	view, err := s.userPlanView(userID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, view)
}

// seedExamplePlans offers the example plans once: only when there are no plans yet, and never again
// after that, even if the superadmin deletes them
func (s *Server) seedExamplePlans() {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	settings := s.loadSiteSettings()
	if settings.ExamplePlansSeeded {
		return
	}
	existing, err := s.database.ListHostingPlans(false)
	if err != nil {
		log.Printf("[hosting] cannot check the plans before seeding: %v", err)
		return
	}
	if len(existing) == 0 {
		for _, plan := range exampleHostingPlans() {
			if _, err := s.database.CreateHostingPlan(plan); err != nil {
				log.Printf("[hosting] cannot add the example plan %s: %v", plan.Slug, err)
				return
			}
		}
	}
	settings.ExamplePlansSeeded = true
	if err := s.saveSiteSettings(settings); err != nil {
		log.Printf("[hosting] cannot remember the example plans: %v", err)
	}
}

// applyUserPlan gives an account its plan: the quota follows the plan, and the end date is stored
func (s *Server) applyUserPlan(userID int64, plan *database.HostingPlan, expires *time.Time) error {
	if err := s.database.UpdateUserQuota(planQuota(*plan, userID)); err != nil {
		return err
	}
	return s.database.SetUserPlan(userID, plan.ID, expires)
}

// userHostingView is the plan of an account as the account list shows it
type userHostingView struct {
	PlanID        *int64     `json:"planId"`
	PlanName      string     `json:"planName"`
	ExpiresAt     *time.Time `json:"expiresAt"`
	State         string     `json:"state"`
	GraceEndsAt   *time.Time `json:"graceEndsAt"`
	Subdomains    int        `json:"subdomains"`
	MaxSubdomains int        `json:"maxSubdomains"`
	// the trial upgrade the account is on, if any
	TrialPlanName string     `json:"trialPlanName,omitempty"`
	TrialEndsAt   *time.Time `json:"trialEndsAt,omitempty"`
}

func hostingViewFor(info database.UserHosting, graceDays int, now time.Time) userHostingView {
	view := userHostingView{State: planStateNone, Subdomains: info.Subdomains, MaxSubdomains: info.MaxSubdomains}
	if info.PlanID == nil {
		return view
	}
	view.PlanID, view.PlanName, view.ExpiresAt = info.PlanID, info.PlanName, info.ExpiresAt
	view.State, view.GraceEndsAt = planState(info.ExpiresAt, graceDays, now)
	if info.TrialEndsAt != nil && info.TrialEndsAt.After(now) {
		view.TrialPlanName, view.TrialEndsAt = info.TrialPlanName, info.TrialEndsAt
		view.State, view.GraceEndsAt = planStateActive, nil
	}
	return view
}

// releaseUserSubdomains removes the DNS records of an account that is being deleted
func (s *Server) releaseUserSubdomains(userID int64) {
	rows, err := s.database.ListHostingSubdomains(userID)
	if err != nil || len(rows) == 0 {
		return
	}
	for _, row := range rows {
		if err := s.removeHostingDNS(row); err != nil {
			log.Printf("[hosting] release %s: %v", row.Hostname, err)
		}
	}
}

// planEnd decides when the plan ends: an explicit date, a number of months, or the plan's own
// period. A renewal extends from the current end while it is still ahead; "once" never ends.
func planEnd(plan *database.HostingPlan, previous *database.UserPlan, expiresAt *string, months *int, now time.Time) (*time.Time, error) {
	if expiresAt != nil && strings.TrimSpace(*expiresAt) != "" {
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*expiresAt))
		if err != nil {
			return nil, errors.New("expiresAt must be an RFC 3339 date")
		}
		return &parsed, nil
	}
	n := 0
	switch {
	case months != nil:
		if *months < 1 || *months > 60 {
			return nil, errors.New("months must be between 1 and 60")
		}
		n = *months
	case plan.Period == "monthly":
		n = 1
	case plan.Period == "yearly":
		n = 12
	default:
		return nil, nil
	}
	base := now
	if previous != nil && previous.PlanID != nil && *previous.PlanID == plan.ID && previous.ExpiresAt != nil && previous.ExpiresAt.After(now) {
		base = *previous.ExpiresAt
	}
	end := addMonths(base, n)
	return &end, nil
}

// liftExpirySuspension reactivates an account that only the expiry check had suspended
func (s *Server) liftExpirySuspension(target *database.User, previous *database.UserPlan) {
	if previous == nil || !previous.SuspendedForExpiry || target.Status != "suspended" {
		return
	}
	if err := s.database.UpdateUser(target.ID, map[string]any{"status": "active"}); err != nil {
		log.Printf("[hosting] could not reactivate %s: %v", target.Username, err)
		return
	}
	// their subdomains come back with the account
	go s.syncHostingRoutes()
}

// expirePlans suspends accounts whose plan ended and whose grace period is over. Accounts the
// superadmin suspended by hand are untouched, and nothing runs while hosting mode is off.
func (s *Server) expirePlans(now time.Time) {
	if s.database == nil || !s.database.IsConnected() || !s.hostingEnabled() {
		return
	}
	cutoff := now.Add(-time.Duration(s.loadSiteSettings().GraceDays) * 24 * time.Hour)
	expired, err := s.database.ListExpiredUserPlans(cutoff)
	if err != nil {
		log.Printf("[hosting] expiry check failed: %v", err)
		return
	}
	suspendedAny := false
	for _, up := range expired {
		user, _ := s.database.GetUserByID(up.UserID)
		if user == nil || user.Role == auth.SuperadminRole {
			continue
		}
		if user.Status == "active" {
			if err := s.database.UpdateUser(user.ID, map[string]any{"status": "suspended"}); err != nil {
				log.Printf("[hosting] could not suspend %s: %v", user.Username, err)
				continue
			}
			s.recordRuntimeLog("warning", "account suspended: plan ended", map[string]any{"user": user.Username})
			s.terminalManager.CloseOwned(user.ID)
			suspendedAny = true
		}
		if err := s.database.SetPlanSuspendedForExpiry(user.ID, true); err != nil {
			log.Printf("[hosting] could not mark %s: %v", user.Username, err)
		}
	}
	// their subdomains stop with the account
	if suspendedAny {
		s.syncHostingRoutes()
	}
}

// planReminderWindow is how long before its end an account is told that its plan is running out
const planReminderWindow = 3 * 24 * time.Hour

// remindPlans tells the accounts whose plan ends soon, once per end date
func (s *Server) remindPlans(now time.Time) {
	if s.database == nil || !s.database.IsConnected() || !s.hostingEnabled() {
		return
	}
	due, err := s.database.ListPlansToRemind(now, planReminderWindow)
	if err != nil {
		log.Printf("[hosting] reminder check failed: %v", err)
		return
	}
	for _, up := range due {
		user, _ := s.database.GetUserByID(up.UserID)
		if user == nil || user.Role == auth.SuperadminRole || user.Status != "active" || up.ExpiresAt == nil {
			continue
		}
		left := up.ExpiresAt.Sub(now)
		days := int((left + 24*time.Hour - 1) / (24 * time.Hour))
		s.notifyUserAction(user.ID, "Paket hosting segera berakhir", fmt.Sprintf("Paket Anda berakhir %s (sekitar %d hari lagi). Perpanjang dari Profil agar akun tidak ditangguhkan.", up.ExpiresAt.Local().Format("02 Jan 2006 15:04"), days), "warning")
		if err := s.database.MarkPlanReminded(user.ID, *up.ExpiresAt); err != nil {
			log.Printf("[hosting] could not mark the reminder of %s: %v", user.Username, err)
		}
	}
}

// syncHostingRoutesIfOn repairs the subdomain routes (a restart, a failed call, a project that got its port)
func (s *Server) syncHostingRoutesIfOn() {
	if s.hostingEnabled() {
		s.syncHostingRoutes()
	}
}

func (s *Server) runPlanExpiryLoop(interval time.Duration) {
	stop := s.reconcileStop
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	s.expirePlans(time.Now())
	s.expireOrders(time.Now())
	s.endPlanTrials(time.Now())
	s.remindPlans(time.Now())
	s.refreshPendingCustomDomains()
	if s.hostingEnabled() {
		// an install that had hosting mode on before the example plans existed gets them too
		s.seedExamplePlans()
	}
	s.syncHostingRoutesIfOn()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			s.expirePlans(time.Now())
			s.expireOrders(time.Now())
			s.endPlanTrials(time.Now())
			s.remindPlans(time.Now())
			s.refreshPendingCustomDomains()
			s.syncHostingRoutesIfOn()
		}
	}
}

