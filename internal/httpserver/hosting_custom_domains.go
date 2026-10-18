package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// A buyer may bring a domain of their own. They point a CNAME at the panel's address (the target below) and the domain
// becomes another sign-in address for their panel. The domain is registered at Cloudflare as a custom hostname (Cloudflare
// for SaaS), which checks the CNAME and issues the certificate; the hosting tunnel then carries it to the panel.

const (
	customZoneStateKey   = "custom_zone"
	customTargetStateKey = "custom_target"
	customTargetLabel    = "cname"
	// how long a pending domain is left alone before its state is read again
	customRefreshAfter = 15 * time.Second
)

// validateCustomHostname accepts a plain domain name: letters, digits and hyphens in dot-separated labels
func validateCustomHostname(hostname string) error {
	if hostname == "" {
		return errors.New("enter the domain")
	}
	if len(hostname) > 253 {
		return errors.New("this domain is too long")
	}
	if strings.ContainsAny(hostname, "/:@ _*") {
		return errors.New("enter only the domain, like example.com, without https:// or a path")
	}
	if net.ParseIP(hostname) != nil {
		return errors.New("an IP address is not a domain")
	}
	labels := strings.Split(hostname, ".")
	if len(labels) < 2 {
		return errors.New("enter a full domain, like example.com")
	}
	for _, label := range labels {
		if label == "" || len(label) > 63 || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return errors.New("this is not a valid domain name")
		}
		for _, r := range label {
			if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') {
				return errors.New("use only letters, digits and hyphens")
			}
		}
	}
	tld := labels[len(labels)-1]
	if len(tld) < 2 || strings.ContainsAny(tld, "0123456789") {
		return errors.New("this is not a valid domain name")
	}
	if hostname == "localhost" || strings.HasSuffix(hostname, ".localhost") || strings.HasSuffix(hostname, ".local") || strings.HasSuffix(hostname, ".internal") {
		return errors.New("this domain cannot be used")
	}
	return nil
}

// customStateFromCloudflare turns what Cloudflare says about a custom hostname into our status, the certificate state and a note
func customStateFromCloudflare(ch *cloudflareapi.CustomHostname) (status, ssl, note string) {
	ssl = ch.SSL.Status
	switch ch.Status {
	case "active":
		if ch.SSL.Status == "active" {
			return "active", ssl, ""
		}
	case "blocked", "moved", "deleted", "pending_deletion":
		return "error", ssl, "Cloudflare reports this domain as " + ch.Status
	}
	note = "waiting for the CNAME to be detected"
	if len(ch.VerificationErrors) > 0 {
		note = ch.VerificationErrors[0]
	} else if len(ch.SSL.ValidationErrors) > 0 && ch.SSL.ValidationErrors[0].Message != "" {
		note = ch.SSL.ValidationErrors[0].Message
	} else if ch.Status == "active" {
		note = "waiting for the certificate"
	}
	return "pending", ssl, note
}

// customDomainSetup is the zone the target lives in and the name buyers point their CNAME at; empty until the superadmin sets it up
func (s *Server) customDomainSetup() (zoneID, target string) {
	zoneID, _ = s.database.GetHostingState(customZoneStateKey)
	target, _ = s.database.GetHostingState(customTargetStateKey)
	if zoneID == "" || target == "" {
		return "", ""
	}
	return zoneID, target
}

// effectivePlan is the plan whose limits apply to an account right now: the trial upgrade while it runs, else its own plan
func (s *Server) effectivePlan(u *database.User) *database.HostingPlan {
	if u == nil || u.Role == auth.SuperadminRole {
		return nil
	}
	up, _ := s.database.GetUserPlan(u.ID)
	if up == nil || up.PlanID == nil {
		return nil
	}
	planID := *up.PlanID
	if up.TrialRunning(time.Now()) && up.TrialPlanID != nil {
		planID = *up.TrialPlanID
	}
	plan, _ := s.database.GetHostingPlan(planID)
	return plan
}

func (s *Server) customDomainLimit(u *database.User) int {
	if plan := s.effectivePlan(u); plan != nil {
		return plan.MaxCustomDomains
	}
	return 0
}

// lookupCNAME is where the DNS answer comes from; a variable so a test can answer instead
var lookupCNAME = func(host string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return net.DefaultResolver.LookupCNAME(ctx, host)
}

// pointsAtTarget says whether the domain's CNAME already leads to the target
func pointsAtTarget(hostname, target string) bool {
	got, err := lookupCNAME(hostname)
	if err != nil {
		return false
	}
	return strings.EqualFold(strings.TrimSuffix(got, "."), strings.TrimSuffix(target, "."))
}

// customDomainAvailability says why a domain cannot be added, or "" when it can
func (s *Server) customDomainAvailability(hostname, target string) string {
	if err := validateCustomHostname(hostname); err != nil {
		return err.Error()
	}
	if existing, _ := s.database.GetHostingCustomDomainByHostname(hostname); existing != nil {
		return "this domain is already in use"
	}
	if sub, _ := s.database.GetHostingSubdomainByHostname(hostname); sub != nil {
		return "this domain is already in use"
	}
	if hostname == target {
		return "this domain cannot be used"
	}
	// names under the domains we sell are panel addresses, picked as a subdomain
	for _, offered := range s.enabledHostingDomains() {
		name := strings.ToLower(offered.Name)
		if hostname == name || strings.HasSuffix(hostname, "."+name) {
			return "names under " + offered.Name + " are panel addresses: pick it as a subdomain"
		}
	}
	return ""
}

type customDomainsView struct {
	Ready  bool                         `json:"ready"`
	Target string                       `json:"target"`
	Limit  int                          `json:"limit"`
	Used   int                          `json:"used"`
	Items  []database.HostingCustomDomain `json:"items"`
}

// refreshCustomDomain reads the state of a custom hostname at Cloudflare and stores it; the owner hears when it goes live
func (s *Server) refreshCustomDomain(client *cloudflareapi.Client, zoneID string, row database.HostingCustomDomain) database.HostingCustomDomain {
	if row.CFID == "" || row.Status == "suspended" {
		return row
	}
	ch, err := client.GetCustomHostname(zoneID, row.CFID)
	if err != nil {
		if strings.Contains(err.Error(), "status 404") {
			_ = s.database.SetHostingCustomDomainState(row.ID, "error", row.SSLStatus, "this domain is no longer registered at Cloudflare; remove it and add it again")
		}
		return row
	}
	status, ssl, note := customStateFromCloudflare(ch)
	if status == row.Status && ssl == row.SSLStatus && note == row.Note {
		return row
	}
	if err := s.database.SetHostingCustomDomainState(row.ID, status, ssl, note); err != nil {
		log.Printf("[hosting] custom domain %s: %v", row.Hostname, err)
		return row
	}
	if status == "error" && row.Status != "error" {
		s.emitDomainError(row, note)
	}
	if status == "active" && row.Status != "active" {
		s.notifyUserAction(row.UserID, "Domain aktif", fmt.Sprintf("Domain %s sudah tersambung ke panel Anda dan bisa dipakai untuk masuk.", row.Hostname), "success")
	}
	row.Status, row.SSLStatus, row.Note = status, ssl, note
	return row
}

// refreshPendingCustomDomains reads the state of the domains that are not live yet; the expiry loop calls it
func (s *Server) refreshPendingCustomDomains() {
	if s.database == nil || !s.database.IsConnected() || !s.hostingEnabled() {
		return
	}
	zoneID, _ := s.customDomainSetup()
	if zoneID == "" {
		return
	}
	rows, err := s.database.ListHostingCustomDomains(0)
	if err != nil {
		return
	}
	client, _, cfErr := s.hostingCloudflare()
	if cfErr != nil {
		return
	}
	for _, row := range rows {
		if row.Status == "pending" || row.Status == "error" {
			s.refreshCustomDomain(client, zoneID, row)
		}
	}
}

func (s *Server) handleListMyCustomDomains(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	view := customDomainsView{Items: []database.HostingCustomDomain{}}
	if !s.hostingEnabled() || u == nil {
		s.writeJSON(w, http.StatusOK, view)
		return
	}
	zoneID, target := s.customDomainSetup()
	view.Ready, view.Target = zoneID != "", target
	view.Limit = s.customDomainLimit(u)
	items, err := s.database.ListHostingCustomDomains(u.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if client, _, cfErr := s.hostingCloudflare(); cfErr == nil && zoneID != "" {
		for i, row := range items {
			if (row.Status == "pending" || row.Status == "error") && time.Since(row.UpdatedAt) > customRefreshAfter {
				items[i] = s.refreshCustomDomain(client, zoneID, row)
			}
		}
	}
	view.Items, view.Used = items, len(items)
	s.writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleCheckCustomDomain(w http.ResponseWriter, r *http.Request) {
	if !s.hostingEnabled() {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "hosting mode is off"})
		return
	}
	if !s.subdomainThrottle(w, r) {
		return
	}
	_, target := s.customDomainSetup()
	hostname := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("hostname")))
	reason := s.customDomainAvailability(hostname, target)
	resp := jsonResponse{"available": reason == "", "reason": reason, "target": target}
	if reason == "" && target != "" {
		resp["pointing"] = pointsAtTarget(hostname, target)
	}
	s.writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleCreateMyCustomDomain(w http.ResponseWriter, r *http.Request) {
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
		Hostname string `json:"hostname"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	hostname := strings.ToLower(strings.TrimSpace(req.Hostname))
	zoneID, target := s.customDomainSetup()
	if zoneID == "" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "custom domains are not set up on this server yet"})
		return
	}
	limit := s.customDomainLimit(u)
	if limit <= 0 {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "your plan does not include a domain of your own"})
		return
	}
	if used, _ := s.database.CountHostingCustomDomains(u.ID); used >= limit {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "custom domain quota exceeded"})
		return
	}
	if reason := s.customDomainAvailability(hostname, target); reason != "" {
		status := http.StatusBadRequest
		if strings.Contains(reason, "in use") {
			status = http.StatusConflict
		}
		s.writeJSON(w, status, jsonResponse{"error": reason})
		return
	}
	client, _, cfErr := s.hostingCloudflare()
	if cfErr != nil {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "the domain service is not ready, try again later"})
		return
	}
	ch, err := client.CreateCustomHostname(zoneID, hostname)
	if err != nil {
		log.Printf("[hosting] custom hostname %s: %v", hostname, err)
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "Cloudflare did not accept this domain: " + err.Error()})
		return
	}
	status, ssl, note := customStateFromCloudflare(ch)
	created, err := s.database.CreateHostingCustomDomain(u.ID, hostname, ch.ID, status, ssl, note)
	if errors.Is(err, database.ErrCustomDomainTaken) {
		_ = client.DeleteCustomHostname(zoneID, ch.ID)
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "this domain is already in use"})
		return
	}
	if err != nil {
		_ = client.DeleteCustomHostname(zoneID, ch.ID)
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "hosting.customdomain.create", "ok", map[string]any{"hostname": hostname})
	forgetHostingHosts()
	go s.syncHostingRoutes()
	s.writeJSON(w, http.StatusCreated, created)
}

// ownedCustomDomain loads a domain of the caller; the superadmin may reach any
func (s *Server) ownedCustomDomain(w http.ResponseWriter, r *http.Request) (*database.User, *database.HostingCustomDomain) {
	u := userFromCtx(r)
	row, _ := s.database.GetHostingCustomDomain(parsePathID(r, "id"))
	if u == nil || row == nil || (row.UserID != u.ID && u.Role != auth.SuperadminRole) {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "domain not found"})
		return nil, nil
	}
	return u, row
}

func (s *Server) handleRefreshMyCustomDomain(w http.ResponseWriter, r *http.Request) {
	_, row := s.ownedCustomDomain(w, r)
	if row == nil {
		return
	}
	if !s.subdomainThrottle(w, r) {
		return
	}
	zoneID, _ := s.customDomainSetup()
	if client, _, err := s.hostingCloudflare(); err == nil && zoneID != "" {
		*row = s.refreshCustomDomain(client, zoneID, *row)
	}
	s.writeJSON(w, http.StatusOK, row)
}

func (s *Server) handleDeleteMyCustomDomain(w http.ResponseWriter, r *http.Request) {
	u, row := s.ownedCustomDomain(w, r)
	if row == nil {
		return
	}
	s.releaseCustomDomain(*row)
	if err := s.database.DeleteHostingCustomDomain(row.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "hosting.customdomain.delete", "ok", map[string]any{"hostname": row.Hostname})
	forgetHostingHosts()
	go s.syncHostingRoutes()
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// releaseCustomDomain removes the custom hostname at Cloudflare; a failure is logged and does not stop the removal here
func (s *Server) releaseCustomDomain(row database.HostingCustomDomain) {
	zoneID, _ := s.customDomainSetup()
	if row.CFID == "" || zoneID == "" {
		return
	}
	client, _, err := s.hostingCloudflare()
	if err != nil {
		log.Printf("[hosting] cannot release %s at Cloudflare: %v", row.Hostname, err)
		return
	}
	if err := client.DeleteCustomHostname(zoneID, row.CFID); err != nil && !strings.Contains(err.Error(), "status 404") {
		log.Printf("[hosting] cannot release %s at Cloudflare: %v", row.Hostname, err)
	}
}

// releaseUserCustomDomains removes the custom hostnames of an account that is being deleted
func (s *Server) releaseUserCustomDomains(userID int64) {
	rows, err := s.database.ListHostingCustomDomains(userID)
	if err != nil {
		return
	}
	for _, row := range rows {
		s.releaseCustomDomain(row)
	}
}

// customIngress is the tunnel rules of the custom domains that should be served: the owner can sign in and the domain is not suspended
func (s *Server) customIngress(service string, hostingOn bool) []cloudflareapi.IngressRule {
	if !hostingOn {
		return nil
	}
	rows, err := s.database.ListHostingCustomDomains(0)
	if err != nil {
		return nil
	}
	active := map[int64]bool{}
	rules := []cloudflareapi.IngressRule{}
	for _, row := range rows {
		if row.Status == "suspended" {
			continue
		}
		if _, seen := active[row.UserID]; !seen {
			user, _ := s.database.GetUserByID(row.UserID)
			active[row.UserID] = user != nil && user.Status == "active"
		}
		if active[row.UserID] {
			rules = append(rules, cloudflareapi.IngressRule{Hostname: row.Hostname, Service: service})
		}
	}
	sort.Slice(rules, func(i, j int) bool { return rules[i].Hostname < rules[j].Hostname })
	return rules
}

// ─── Superadmin: the target ───────────────────────────────────────────────────

type customDomainAdminView struct {
	Ready  bool                           `json:"ready"`
	ZoneID string                         `json:"zoneId"`
	Target string                         `json:"target"`
	Items  []database.HostingCustomDomain `json:"items"`
}

func (s *Server) handleAdminCustomDomains(w http.ResponseWriter, _ *http.Request) {
	zoneID, target := s.customDomainSetup()
	items, err := s.database.ListHostingCustomDomains(0)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, customDomainAdminView{Ready: zoneID != "", ZoneID: zoneID, Target: target, Items: items})
}

// handleSetupCustomDomains picks the zone whose "cname" name buyers point at, and tells Cloudflare it is the fallback origin
func (s *Server) handleSetupCustomDomains(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireHostingMode(w) {
		return
	}
	var req struct {
		ZoneID string `json:"zoneId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	domain := s.resolveOffered(req.ZoneID)
	if domain == nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "pick one of the domains you offer"})
		return
	}
	tunnelID, _ := s.database.GetHostingState(hostingTunnelStateKey)
	if tunnelID == "" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "the hosting tunnel does not exist yet; it is created with the first panel subdomain"})
		return
	}
	client, _, err := s.hostingCloudflare()
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	target := hostnameFor(customTargetLabel, domain.Name)
	content := tunnelID + ".cfargotunnel.com"
	records, err := client.DNSRecordsByName(domain.ZoneID, target)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "Cloudflare did not answer: " + err.Error()})
		return
	}
	switch judgeDNS(records, content) {
	case dnsTaken:
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": target + " is already used by another DNS record"})
		return
	case dnsFree:
		if _, err := client.CreateDNSRecord(domain.ZoneID, cloudflareapi.DNSRecordPayload{Type: "CNAME", Name: target, Content: content, TTL: 1, Proxied: true, Comment: "Reneo custom domain target"}); err != nil {
			s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "could not create the DNS record: " + err.Error()})
			return
		}
	}
	if err := client.SetFallbackOrigin(domain.ZoneID, target); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "Cloudflare did not accept the fallback origin (is Custom Hostnames enabled on " + domain.Name + "?): " + err.Error()})
		return
	}
	if err := s.database.SetHostingState(customZoneStateKey, domain.ZoneID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.database.SetHostingState(customTargetStateKey, target); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "hosting.customdomain.setup", "ok", map[string]any{"target": target})
	}
	s.handleAdminCustomDomains(w, r)
}
