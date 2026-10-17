package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// Buyers pick a subdomain under a domain the superadmin offers; the superadmin decides which
// domains of its Cloudflare account are offered and can suspend or release any subdomain.

// subdomainLimit is how many subdomains the plan of an account allows. The superadmin has its own
// Cloudflare access and does not buy a plan.
func (s *Server) subdomainLimit(u *database.User) int {
	if u == nil || u.Role == auth.SuperadminRole {
		return 0
	}
	up, _ := s.database.GetUserPlan(u.ID)
	if up == nil || up.PlanID == nil {
		return 0
	}
	plan, _ := s.database.GetHostingPlan(*up.PlanID)
	if plan == nil {
		return 0
	}
	return plan.MaxSubdomains
}

func (s *Server) enabledHostingDomains() []database.HostingDomain {
	all, _ := s.database.ListHostingDomains()
	out := make([]database.HostingDomain, 0, len(all))
	for _, d := range all {
		if d.Enabled {
			out = append(out, d)
		}
	}
	return out
}

type mySubdomainsView struct {
	Enabled bool                       `json:"enabled"`
	Limit   int                        `json:"limit"`
	Used    int                        `json:"used"`
	Domains []database.HostingDomain   `json:"domains"`
	Items   []database.HostingSubdomain `json:"items"`
}

func (s *Server) handleListMySubdomains(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	view := mySubdomainsView{Domains: []database.HostingDomain{}, Items: []database.HostingSubdomain{}}
	if !s.hostingEnabled() {
		s.writeJSON(w, http.StatusOK, view)
		return
	}
	view.Enabled = true
	view.Limit = s.subdomainLimit(u)
	view.Domains = s.enabledHostingDomains()
	items, err := s.database.ListHostingSubdomains(u.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	view.Items = items
	view.Used = len(items)
	s.writeJSON(w, http.StatusOK, view)
}

// resolveOffered finds the offered domain for a zone id
func (s *Server) resolveOffered(zoneID string) *database.HostingDomain {
	for _, d := range s.enabledHostingDomains() {
		if d.ZoneID == zoneID {
			picked := d
			return &picked
		}
	}
	return nil
}

// subdomainAvailability reports why a label cannot be used, or "" when it is free
func (s *Server) subdomainAvailability(label, zoneID string) (reason string, domain *database.HostingDomain, err error) {
	if verr := validateSubdomainLabel(label); verr != nil {
		return verr.Error(), nil, nil
	}
	domain = s.resolveOffered(zoneID)
	if domain == nil {
		return "this domain is not offered", nil, nil
	}
	hostname := hostnameFor(label, domain.Name)
	all, listErr := s.database.ListHostingSubdomains(0)
	if listErr != nil {
		return "", domain, listErr
	}
	for _, row := range all {
		if row.Hostname == hostname {
			return "this name is taken", domain, nil
		}
	}
	// a record that already exists in the zone (a website, mail, anything) is not ours to give away
	client, _, cfErr := s.hostingCloudflare()
	if cfErr != nil {
		return "", domain, cfErr
	}
	records, dnsErr := client.DNSRecordsByName(zoneID, hostname)
	if dnsErr != nil {
		return "", domain, dnsErr
	}
	if len(records) > 0 {
		return "this name is taken", domain, nil
	}
	return "", domain, nil
}

// subdomainThrottle keeps one account from spending the Cloudflare API allowance of the superadmin
func (s *Server) subdomainThrottle(w http.ResponseWriter, r *http.Request) bool {
	u := userFromCtx(r)
	if u == nil {
		return true
	}
	allowed, retry := s.allowRateLimit(fmt.Sprintf("subdomain:%d", u.ID), rateLimitRule{Window: time.Minute, Limit: 30})
	if !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())+1))
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many requests, wait a moment"})
	}
	return allowed
}

func (s *Server) handleCheckSubdomain(w http.ResponseWriter, r *http.Request) {
	if !s.hostingEnabled() {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "hosting mode is off"})
		return
	}
	if !s.subdomainThrottle(w, r) {
		return
	}
	label := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("label")))
	reason, _, err := s.subdomainAvailability(label, r.URL.Query().Get("zoneId"))
	if err != nil {
		log.Printf("[hosting] availability check: %v", err)
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "the subdomain service is not ready, try again later"})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"available": reason == "", "reason": reason})
}

func (s *Server) projectTarget(userID int64, projectID *int64) (*int64, string) {
	if projectID == nil {
		return nil, "choose a project for the subdomain"
	}
	project, _ := s.database.GetProject(*projectID, userID)
	if project == nil {
		return nil, "project not found"
	}
	if project.AssignedPort <= 0 {
		return nil, "the project has no port yet; start it first"
	}
	return projectID, ""
}

func (s *Server) handleCreateMySubdomain(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.hostingEnabled() {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "hosting mode is off"})
		return
	}
	if !s.subdomainThrottle(w, r) {
		return
	}
	u := userFromCtx(r)
	var req struct {
		Label     string `json:"label"`
		ZoneID    string `json:"zoneId"`
		ProjectID *int64 `json:"projectId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	label := strings.ToLower(strings.TrimSpace(req.Label))

	limit := s.subdomainLimit(u)
	used, _ := s.database.CountHostingSubdomains(u.ID)
	if limit <= 0 {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "your plan does not include subdomains"})
		return
	}
	if used >= limit {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "subdomain quota exceeded"})
		return
	}
	projectID, problem := s.projectTarget(u.ID, req.ProjectID)
	if problem != "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": problem})
		return
	}
	reason, domain, err := s.subdomainAvailability(label, req.ZoneID)
	if err != nil {
		log.Printf("[hosting] create subdomain: %v", err)
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "the subdomain service is not ready, try again later"})
		return
	}
	if reason != "" {
		status := http.StatusBadRequest
		if strings.Contains(reason, "taken") {
			status = http.StatusConflict
		}
		s.writeJSON(w, status, jsonResponse{"error": reason})
		return
	}

	created, err := s.database.CreateHostingSubdomain(u.ID, label, domain.ZoneID, domain.Name, hostnameFor(label, domain.Name), projectID)
	if errors.Is(err, database.ErrHostnameTaken) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "this name is taken"})
		return
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "hosting.subdomain.create", "ok", map[string]any{"hostname": created.Hostname})
	s.syncHostingRoutes()
	if fresh, _ := s.database.GetHostingSubdomain(created.ID); fresh != nil {
		created = fresh
	}
	s.writeJSON(w, http.StatusCreated, created)
}

// ownedSubdomain loads a subdomain of the caller; the superadmin may reach any
func (s *Server) ownedSubdomain(w http.ResponseWriter, r *http.Request) (*database.User, *database.HostingSubdomain) {
	u := userFromCtx(r)
	row, _ := s.database.GetHostingSubdomain(parsePathID(r, "id"))
	if u == nil || row == nil || (row.UserID != u.ID && u.Role != auth.SuperadminRole) {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "subdomain not found"})
		return nil, nil
	}
	return u, row
}

func (s *Server) handleRetargetMySubdomain(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.hostingEnabled() {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "hosting mode is off"})
		return
	}
	u, row := s.ownedSubdomain(w, r)
	if row == nil {
		return
	}
	var req struct {
		ProjectID *int64 `json:"projectId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	// the project must belong to the owner of the subdomain, not to whoever asks
	projectID, problem := s.projectTarget(row.UserID, req.ProjectID)
	if problem != "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": problem})
		return
	}
	if err := s.database.SetHostingSubdomainProject(row.ID, projectID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "hosting.subdomain.retarget", "ok", map[string]any{"hostname": row.Hostname})
	s.syncHostingRoutes()
	fresh, _ := s.database.GetHostingSubdomain(row.ID)
	s.writeJSON(w, http.StatusOK, fresh)
}

func (s *Server) handleDeleteMySubdomain(w http.ResponseWriter, r *http.Request) {
	u, row := s.ownedSubdomain(w, r)
	if row == nil {
		return
	}
	if err := s.removeHostingDNS(*row); err != nil {
		log.Printf("[hosting] release %s: %v", row.Hostname, err)
	}
	if err := s.database.DeleteHostingSubdomain(row.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "hosting.subdomain.delete", "ok", map[string]any{"hostname": row.Hostname})
	s.syncHostingRoutes()
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// ─── Superadmin: domains and every subdomain ──────────────────────────────────

type hostingDomainView struct {
	ZoneID  string `json:"zoneId"`
	Name    string `json:"name"`
	Status  string `json:"status"`
	Enabled bool   `json:"enabled"`
}

// handleListHostingDomains lists the zones of the superadmin's Cloudflare account with the choice made for each
func (s *Server) handleListHostingDomains(w http.ResponseWriter, _ *http.Request) {
	client, _, err := s.hostingCloudflare()
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	zones, err := client.ListZones()
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "Cloudflare did not answer: " + err.Error()})
		return
	}
	chosen := map[string]bool{}
	stored, _ := s.database.ListHostingDomains()
	for _, d := range stored {
		chosen[d.ZoneID] = d.Enabled
	}
	out := make([]hostingDomainView, 0, len(zones))
	for _, z := range zones {
		out = append(out, hostingDomainView{ZoneID: z.ID, Name: z.Name, Status: z.Status, Enabled: chosen[z.ID]})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"domains": out})
}

func (s *Server) handleSetHostingDomain(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireHostingMode(w) {
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	zoneID := r.PathValue("zoneId")
	client, _, err := s.hostingCloudflare()
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	// only a zone that really belongs to the superadmin's account can be offered; its name comes from Cloudflare
	zones, err := client.ListZones()
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "Cloudflare did not answer: " + err.Error()})
		return
	}
	name := ""
	for _, z := range zones {
		if z.ID == zoneID {
			name = z.Name
		}
	}
	if name == "" {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "domain not found in the Cloudflare account"})
		return
	}
	if err := s.database.SetHostingDomain(zoneID, strings.ToLower(name), req.Enabled); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "hosting.domain.set", "ok", map[string]any{"domain": name, "enabled": req.Enabled})
	}
	s.writeJSON(w, http.StatusOK, hostingDomainView{ZoneID: zoneID, Name: name, Enabled: req.Enabled})
}

func (s *Server) handleListAllSubdomains(w http.ResponseWriter, _ *http.Request) {
	items, err := s.database.ListHostingSubdomains(0)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}

// handleSetSubdomainStatus lets the superadmin suspend or lift a subdomain
func (s *Server) handleSetSubdomainStatus(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil || (req.Status != subdomainActive && req.Status != subdomainSuspended) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "status must be active or suspended"})
		return
	}
	row, _ := s.database.GetHostingSubdomain(parsePathID(r, "id"))
	if row == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "subdomain not found"})
		return
	}
	status := req.Status
	if status == subdomainActive {
		// lifting a suspension re-checks everything: the sync turns it active when it works
		status = subdomainPending
	}
	if err := s.database.SetHostingSubdomainStatus(row.ID, status, ""); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "hosting.subdomain.status", "ok", map[string]any{"hostname": row.Hostname, "status": req.Status})
	}
	s.syncHostingRoutes()
	fresh, _ := s.database.GetHostingSubdomain(row.ID)
	s.writeJSON(w, http.StatusOK, fresh)
}
