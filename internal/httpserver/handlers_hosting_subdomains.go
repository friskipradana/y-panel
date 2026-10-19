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
	plan := s.effectivePlan(u)
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

// mainHostingDomain is where the panel address of every buyer is made: the domain the owner marked as main, or the
// first one offered when none is marked. nil when no domain is offered.
func (s *Server) mainHostingDomain() *database.HostingDomain {
	offered := s.enabledHostingDomains()
	for i := range offered {
		if offered[i].IsMain {
			return &offered[i]
		}
	}
	if len(offered) > 0 {
		return &offered[0]
	}
	return nil
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
	for _, item := range items {
		// the panel address comes with every plan and is not one of its subdomains
		if !item.Panel {
			view.Used++
		}
	}
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
	// an address a buyer picked in an order that waits for its payment is theirs for now
	if held, heldErr := s.database.SubdomainReserved(hostname); heldErr != nil {
		return "", domain, heldErr
	} else if held {
		return "this name is taken", domain, nil
	}
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
		Label  string `json:"label"`
		ZoneID string `json:"zoneId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	s.createSubdomainFor(w, r, u, u, strings.ToLower(strings.TrimSpace(req.Label)), req.ZoneID, true)
}

// handleCreateSubdomainForUser lets the superadmin give an account its panel address, so the
// access sent to a buyer already works (the plan quota is the buyer's limit, not the seller's)
func (s *Server) handleCreateSubdomainForUser(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.hostingEnabled() {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "hosting mode is off"})
		return
	}
	if !s.subdomainThrottle(w, r) {
		return
	}
	var req struct {
		UserID int64  `json:"userId"`
		Label  string `json:"label"`
		ZoneID string `json:"zoneId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	owner, _ := s.database.GetUserByID(req.UserID)
	if owner == nil || owner.Role == auth.SuperadminRole {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}
	s.createSubdomainFor(w, r, userFromCtx(r), owner, strings.ToLower(strings.TrimSpace(req.Label)), req.ZoneID, false)
}

// createSubdomainFor makes the subdomain of owner; actor is who asked (the owner, or the superadmin)
func (s *Server) createSubdomainFor(w http.ResponseWriter, r *http.Request, actor, owner *database.User, label, zoneID string, enforceQuota bool) {
	if enforceQuota {
		limit := s.subdomainLimit(owner)
		used, _ := s.database.CountHostingSubdomains(owner.ID)
		if limit <= 0 {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "your plan does not include subdomains"})
			return
		}
		if used >= limit {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "subdomain quota exceeded"})
			return
		}
	}
	reason, domain, err := s.subdomainAvailability(label, zoneID)
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

	// the owner of the panel gives an account its panel address first; every address after that is one of its subdomains
	panel := false
	if !enforceQuota {
		has, _ := s.database.HasPanelAddress(owner.ID)
		panel = !has
	}
	created, err := s.database.CreateHostingSubdomain(owner.ID, label, domain.ZoneID, domain.Name, hostnameFor(label, domain.Name), panel)
	if errors.Is(err, database.ErrHostnameTaken) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "this name is taken"})
		return
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, actor, "hosting.subdomain.create", "ok", map[string]any{"hostname": created.Hostname, "owner": owner.Username})
	forgetHostingHosts()
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

func (s *Server) handleDeleteMySubdomain(w http.ResponseWriter, r *http.Request) {
	u, row := s.ownedSubdomain(w, r)
	if row == nil {
		return
	}
	// the panel address is where the account signs in; only the owner of the panel can take it away
	if row.Panel && u.Role != auth.SuperadminRole {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "the panel address cannot be removed"})
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
	forgetHostingHosts()
	s.syncHostingRoutes()
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// ─── Superadmin: domains and every subdomain ──────────────────────────────────

type hostingDomainView struct {
	ZoneID  string `json:"zoneId"`
	Name    string `json:"name"`
	Status  string `json:"status"`
	Enabled bool   `json:"enabled"`
	// IsMain: the panel addresses of buyers are made here
	IsMain bool `json:"isMain"`
}

// handleListHostingDomains lists the zones of the superadmin's Cloudflare account with the choice made for each
func (s *Server) handleListHostingDomains(w http.ResponseWriter, _ *http.Request) {
	out, status, err := s.hostingDomainViews()
	if err != nil {
		s.writeJSON(w, status, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"domains": out})
}

// hostingDomainViews is the zones of the Cloudflare account with the choice made for each; the status is the one to answer with on an error
func (s *Server) hostingDomainViews() ([]hostingDomainView, int, error) {
	client, _, err := s.hostingCloudflare()
	if err != nil {
		return nil, http.StatusConflict, err
	}
	zones, err := client.ListZones()
	if err != nil {
		return nil, http.StatusBadGateway, errors.New("Cloudflare did not answer: " + err.Error())
	}
	chosen := map[string]bool{}
	main := ""
	stored, _ := s.database.ListHostingDomains()
	for _, d := range stored {
		chosen[d.ZoneID] = d.Enabled
		if d.IsMain {
			main = d.ZoneID
		}
	}
	out := make([]hostingDomainView, 0, len(zones))
	for _, z := range zones {
		out = append(out, hostingDomainView{ZoneID: z.ID, Name: z.Name, Status: z.Status, Enabled: chosen[z.ID], IsMain: z.ID == main})
	}
	return out, http.StatusOK, nil
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

// handleSetMainHostingDomain chooses the offered domain where the panel addresses of buyers are made
func (s *Server) handleSetMainHostingDomain(w http.ResponseWriter, r *http.Request) {
	if !s.requireHostingMode(w) {
		return
	}
	zoneID := r.PathValue("zoneId")
	if err := s.database.SetMainHostingDomain(zoneID); err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "hosting.domain.main", "ok", map[string]any{"zone": zoneID})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
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
