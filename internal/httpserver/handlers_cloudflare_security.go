package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/netip"
	"regexp"
	"strings"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
)

const aiCrawlerPresetRef = "reneo_allow_ai_crawlers"

var (
	wafUserAgentRe = regexp.MustCompile(`^[A-Za-z0-9._/+ -]{2,64}$`)
	wafPathQueryRe = regexp.MustCompile(`^[A-Za-z0-9._~/%:@+=,-]{1,200}$`)
	wafCountryRe   = regexp.MustCompile(`^[A-Z]{2}$`)
)

type cloudflareZoneSecurityResponse struct {
	ZoneID             string                              `json:"zoneId"`
	ZoneName           string                              `json:"zoneName"`
	BotManagement      *cloudflareapi.BotManagementSettings `json:"botManagement"`
	BotPermissionError bool                                `json:"botPermissionError,omitempty"`
	BotError           string                              `json:"botError,omitempty"`
	CustomRules        []cloudflareapi.FirewallCustomRule   `json:"customRules"`
	WafPermissionError bool                                `json:"wafPermissionError,omitempty"`
	WafError           string                              `json:"wafError,omitempty"`
}

type updateBotManagementRequest struct {
	FightMode        *bool   `json:"fightMode"`
	AIBotsProtection *string `json:"aiBotsProtection"`
	EnableJS         *bool   `json:"enableJs"`
}

type applyAICrawlerPresetRequest struct {
	Hostname                string   `json:"hostname"`
	ApplyToAllHosts         bool     `json:"applyToAllHosts"`
	PathPrefixes            []string `json:"pathPrefixes"`
	AllowVerifiedBots       *bool    `json:"allowVerifiedBots"`
	UserAgents              []string `json:"userAgents"`
	DisableAIBotsProtection *bool    `json:"disableAiBotsProtection"`
	DisableFightMode        *bool    `json:"disableFightMode"`
	Description             string   `json:"description"`
}

type createWafRuleRequest struct {
	Description         string   `json:"description"`
	Action              string   `json:"action"`
	Hostname            string   `json:"hostname"`
	PathValue           string   `json:"pathValue"`
	PathMatchMode       string   `json:"pathMatchMode"`
	UserAgents          []string `json:"userAgents"`
	Countries           []string `json:"countries"`
	SourceIPs           []string `json:"sourceIps"`
	IncludeVerifiedBots bool     `json:"includeVerifiedBots"`
	CombineWith         string   `json:"combineWith"`
	Enabled             *bool    `json:"enabled"`
}

type toggleWafRuleRequest struct {
	Enabled bool `json:"enabled"`
}

type aiCrawlerPresetResult struct {
	Rule          cloudflareapi.FirewallCustomRule     `json:"rule"`
	Rules         []cloudflareapi.FirewallCustomRule   `json:"rules"`
	BotManagement *cloudflareapi.BotManagementSettings `json:"botManagement,omitempty"`
	BotWarning    string                               `json:"botWarning,omitempty"`
	SkippedScopes []string                             `json:"skippedScopes"`
}

func (s *Server) cloudflareZoneWithInfo(w http.ResponseWriter, r *http.Request) (*cloudflareapi.Client, cloudflareapi.ZoneInfo, bool) {
	client, zones, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return nil, cloudflareapi.ZoneInfo{}, false
	}
	zoneID := r.PathValue("zoneId")
	for _, z := range zones {
		if z.ID == zoneID {
			return client, z, true
		}
	}
	s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "zone not allowed"})
	return nil, cloudflareapi.ZoneInfo{}, false
}

func (s *Server) handleCloudflareZoneSecurity(w http.ResponseWriter, r *http.Request) {
	client, zone, ok := s.cloudflareZoneWithInfo(w, r)
	if !ok {
		return
	}
	res := cloudflareZoneSecurityResponse{
		ZoneID:      zone.ID,
		ZoneName:    zone.Name,
		CustomRules: []cloudflareapi.FirewallCustomRule{},
	}

	if bm, err := client.GetBotManagement(zone.ID); err != nil {
		res.BotError = err.Error()
		res.BotPermissionError = cloudflareapi.IsAuthOrPermissionError(err)
	} else {
		res.BotManagement = bm
	}

	if rules, err := client.ListFirewallCustomRules(zone.ID); err != nil {
		res.WafError = err.Error()
		res.WafPermissionError = cloudflareapi.IsAuthOrPermissionError(err)
	} else {
		res.CustomRules = rules
	}

	s.writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleUpdateCloudflareBotManagement(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	client, zone, ok := s.cloudflareZoneWithInfo(w, r)
	if !ok {
		return
	}
	var req updateBotManagementRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if req.FightMode == nil && req.AIBotsProtection == nil && req.EnableJS == nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "at least one setting must be provided"})
		return
	}
	if req.AIBotsProtection != nil {
		val := strings.TrimSpace(*req.AIBotsProtection)
		switch val {
		case "disabled", "block", "only_on_ad_pages":
			req.AIBotsProtection = &val
		default:
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "aiBotsProtection must be disabled, block, or only_on_ad_pages"})
			return
		}
	}

	updated, err := client.UpdateBotManagement(zone.ID, cloudflareapi.BotManagementUpdate{
		FightMode:        req.FightMode,
		AIBotsProtection: req.AIBotsProtection,
		EnableJS:         req.EnableJS,
	})
	if err != nil {
		status := http.StatusBadGateway
		if cloudflareapi.IsAuthOrPermissionError(err) {
			status = http.StatusForbidden
		}
		s.writeError(w, status, err)
		return
	}

	s.auditSensitiveAction(r, s.currentUserRecord(r), "cloudflare.bot_management.update", "ok", map[string]any{
		"zoneId":   zone.ID,
		"zoneName": zone.Name,
	})
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleApplyCloudflareAICrawlerPreset(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	client, zone, ok := s.cloudflareZoneWithInfo(w, r)
	if !ok {
		return
	}
	var req applyAICrawlerPresetRequest
	if r.Body != nil {
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil && !errors.Is(err, http.ErrBodyReadAfterClose) && err.Error() != "EOF" {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
			return
		}
	}

	rule, err := buildAICrawlerSkipRule(req, zone.Name)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	existing, err := client.ListFirewallCustomRules(zone.ID)
	if err != nil {
		status := http.StatusBadGateway
		if cloudflareapi.IsAuthOrPermissionError(err) {
			status = http.StatusForbidden
		}
		s.writeError(w, status, err)
		return
	}

	next, targetIdx := upsertAICrawlerPresetRule(existing, rule)
	saved, chosenScopes, err := setRulesWithSkipFallback(client, zone.ID, next, targetIdx)
	if err != nil {
		status := http.StatusBadGateway
		if cloudflareapi.IsAuthOrPermissionError(err) {
			status = http.StatusForbidden
		}
		s.writeError(w, status, err)
		return
	}

	outRule := savedRuleByRef(saved, aiCrawlerPresetRef, rule)
	result := aiCrawlerPresetResult{
		Rule:          outRule,
		Rules:         saved,
		SkippedScopes: chosenScopes,
	}

	disableAI := req.DisableAIBotsProtection == nil || *req.DisableAIBotsProtection
	disableFight := req.DisableFightMode != nil && *req.DisableFightMode
	if disableAI || disableFight {
		bmUpdate := cloudflareapi.BotManagementUpdate{}
		if disableAI {
			v := "disabled"
			bmUpdate.AIBotsProtection = &v
		}
		if disableFight {
			v := false
			bmUpdate.FightMode = &v
		}
		bm, bmErr := client.UpdateBotManagement(zone.ID, bmUpdate)
		if bmErr != nil {
			result.BotWarning = bmErr.Error()
		} else {
			result.BotManagement = bm
		}
	}

	s.auditSensitiveAction(r, s.currentUserRecord(r), "cloudflare.waf.ai_preset", "ok", map[string]any{
		"zoneId":   zone.ID,
		"zoneName": zone.Name,
	})
	s.writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleCreateCloudflareWafRule(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	client, zone, ok := s.cloudflareZoneWithInfo(w, r)
	if !ok {
		return
	}
	var req createWafRuleRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}

	rule, err := buildCustomWafRule(req)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	existing, err := client.ListFirewallCustomRules(zone.ID)
	if err != nil {
		status := http.StatusBadGateway
		if cloudflareapi.IsAuthOrPermissionError(err) {
			status = http.StatusForbidden
		}
		s.writeError(w, status, err)
		return
	}

	next := append([]cloudflareapi.FirewallCustomRule{}, existing...)
	var saved []cloudflareapi.FirewallCustomRule
	if rule.Action == "skip" {
		// Prepend skip rules so they are evaluated before block rules, and gracefully match plan skip capabilities.
		next = append([]cloudflareapi.FirewallCustomRule{rule}, existing...)
		saved, _, err = setRulesWithSkipFallback(client, zone.ID, next, 0)
	} else {
		next = append(next, rule)
		saved, err = client.SetFirewallCustomRules(zone.ID, next)
	}
	if err != nil {
		status := http.StatusBadGateway
		if cloudflareapi.IsAuthOrPermissionError(err) {
			status = http.StatusForbidden
		}
		s.writeError(w, status, err)
		return
	}

	s.auditSensitiveAction(r, s.currentUserRecord(r), "cloudflare.waf.create", "ok", map[string]any{
		"zoneId": zone.ID,
		"action": rule.Action,
	})
	s.writeJSON(w, http.StatusCreated, jsonResponse{
		"rule":  savedRuleByExpression(saved, rule.Expression, rule),
		"rules": saved,
	})
}

func (s *Server) handleToggleCloudflareWafRule(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	client, zone, ok := s.cloudflareZoneWithInfo(w, r)
	if !ok {
		return
	}
	ruleID := strings.TrimSpace(r.PathValue("ruleId"))
	var req toggleWafRuleRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}

	existing, err := client.ListFirewallCustomRules(zone.ID)
	if err != nil {
		status := http.StatusBadGateway
		if cloudflareapi.IsAuthOrPermissionError(err) {
			status = http.StatusForbidden
		}
		s.writeError(w, status, err)
		return
	}

	found := false
	next := make([]cloudflareapi.FirewallCustomRule, 0, len(existing))
	for _, rule := range existing {
		if rule.ID == ruleID || (ruleID != "" && rule.Ref == ruleID) {
			rule.Enabled = req.Enabled
			found = true
		}
		next = append(next, rule)
	}
	if !found {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "WAF rule not found"})
		return
	}

	saved, err := client.SetFirewallCustomRules(zone.ID, next)
	if err != nil {
		status := http.StatusBadGateway
		if cloudflareapi.IsAuthOrPermissionError(err) {
			status = http.StatusForbidden
		}
		s.writeError(w, status, err)
		return
	}

	s.auditSensitiveAction(r, s.currentUserRecord(r), "cloudflare.waf.toggle", "ok", map[string]any{
		"zoneId":  zone.ID,
		"ruleId":  ruleID,
		"enabled": req.Enabled,
	})
	s.writeJSON(w, http.StatusOK, jsonResponse{"rules": saved})
}

func (s *Server) handleDeleteCloudflareWafRule(w http.ResponseWriter, r *http.Request) {
	client, zone, ok := s.cloudflareZoneWithInfo(w, r)
	if !ok {
		return
	}
	ruleID := strings.TrimSpace(r.PathValue("ruleId"))

	existing, err := client.ListFirewallCustomRules(zone.ID)
	if err != nil {
		status := http.StatusBadGateway
		if cloudflareapi.IsAuthOrPermissionError(err) {
			status = http.StatusForbidden
		}
		s.writeError(w, status, err)
		return
	}

	found := false
	next := make([]cloudflareapi.FirewallCustomRule, 0, len(existing))
	for _, rule := range existing {
		if rule.ID == ruleID || (ruleID != "" && rule.Ref == ruleID) {
			found = true
			continue
		}
		next = append(next, rule)
	}
	if !found {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "WAF rule not found"})
		return
	}

	saved, err := client.SetFirewallCustomRules(zone.ID, next)
	if err != nil {
		status := http.StatusBadGateway
		if cloudflareapi.IsAuthOrPermissionError(err) {
			status = http.StatusForbidden
		}
		s.writeError(w, status, err)
		return
	}

	s.auditSensitiveAction(r, s.currentUserRecord(r), "cloudflare.waf.delete", "ok", map[string]any{
		"zoneId": zone.ID,
		"ruleId": ruleID,
	})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "rules": saved})
}

func defaultAICrawlerPaths() []string {
	return []string{"/app/reneo-crm", "/llms.txt", "/llms-full.txt", "/sitemap.xml", "/robots.txt"}
}

func defaultAIUserAgents() []string {
	return []string{"ChatGPT-User", "OAI-SearchBot", "GPTBot"}
}

// buildAICrawlerSkipRule validates inputs and constructs a safe Cloudflare WAF Skip expression.
func buildAICrawlerSkipRule(req applyAICrawlerPresetRequest, zoneName string) (cloudflareapi.FirewallCustomRule, error) {
	host := strings.ToLower(strings.TrimSpace(req.Hostname))
	if !req.ApplyToAllHosts {
		if host == "" && zoneName != "" {
			host = "panel." + strings.ToLower(strings.TrimSpace(zoneName))
		}
		if !redirectHostRe.MatchString(host) {
			return cloudflareapi.FirewallCustomRule{}, errors.New("hostname tidak valid (contoh: panel.example.com)")
		}
	} else {
		host = ""
	}

	paths := req.PathPrefixes
	if len(paths) == 0 {
		paths = defaultAICrawlerPaths()
	}
	cleanPaths := make([]string, 0, len(paths))
	seenPaths := map[string]struct{}{}
	for _, raw := range paths {
		p := strings.TrimSpace(raw)
		if p == "" {
			continue
		}
		if !redirectPathRe.MatchString(p) {
			return cloudflareapi.FirewallCustomRule{}, fmt.Errorf("path %q harus diawali / dan hanya berisi karakter URL aman", p)
		}
		if _, dup := seenPaths[p]; !dup {
			seenPaths[p] = struct{}{}
			cleanPaths = append(cleanPaths, p)
		}
	}

	allowVerified := req.AllowVerifiedBots == nil || *req.AllowVerifiedBots

	agents := req.UserAgents
	if len(agents) == 0 && req.UserAgents == nil {
		agents = defaultAIUserAgents()
	}
	cleanAgents := make([]string, 0, len(agents))
	seenAgents := map[string]struct{}{}
	for _, raw := range agents {
		ua := strings.TrimSpace(raw)
		if ua == "" {
			continue
		}
		if !wafUserAgentRe.MatchString(ua) {
			return cloudflareapi.FirewallCustomRule{}, fmt.Errorf("user-agent %q mengandung karakter tidak valid", ua)
		}
		if _, dup := seenAgents[ua]; !dup {
			seenAgents[ua] = struct{}{}
			cleanAgents = append(cleanAgents, ua)
		}
	}

	var branches []string
	if len(cleanPaths) > 0 {
		pathParts := make([]string, 0, len(cleanPaths))
		for _, p := range cleanPaths {
			pathParts = append(pathParts, fmt.Sprintf(`starts_with(http.request.uri.path, "%s")`, p))
		}
		pathExpr := "(" + strings.Join(pathParts, " or ") + ")"
		if host != "" {
			branches = append(branches, fmt.Sprintf(`(http.host eq "%s" and %s)`, host, pathExpr))
		} else {
			branches = append(branches, pathExpr)
		}
	} else if host != "" {
		branches = append(branches, fmt.Sprintf(`(http.host eq "%s")`, host))
	}

	if allowVerified {
		branches = append(branches, "cf.client.bot")
	}

	if len(cleanAgents) > 0 {
		uaParts := make([]string, 0, len(cleanAgents))
		for _, ua := range cleanAgents {
			uaParts = append(uaParts, fmt.Sprintf(`http.user_agent contains "%s"`, ua))
		}
		branches = append(branches, "("+strings.Join(uaParts, " or ")+")")
	}

	if len(branches) == 0 {
		return cloudflareapi.FirewallCustomRule{}, errors.New("minimal satu kondisi kecocokan harus dipilih (path, verified bots, atau user-agent)")
	}

	description := strings.TrimSpace(req.Description)
	if description == "" {
		if host != "" {
			description = "Reneo: Allow AI crawlers & public pages (" + host + ")"
		} else {
			description = "Reneo: Allow AI crawlers & public pages"
		}
	}
	if len(description) > 120 {
		description = description[:120]
	}

	return cloudflareapi.FirewallCustomRule{
		Ref:         aiCrawlerPresetRef,
		Description: description,
		Action:      "skip",
		Enabled:     true,
		Expression:  strings.Join(branches, " or "),
		ActionParameters: map[string]any{
			"ruleset": "current",
		},
	}, nil
}

// buildCustomWafRule validates structured rule inputs and generates a safe Cloudflare Wirefilter rule.
func buildCustomWafRule(req createWafRuleRequest) (cloudflareapi.FirewallCustomRule, error) {
	action := strings.TrimSpace(req.Action)
	switch action {
	case "skip", "managed_challenge", "block", "js_challenge", "log":
	default:
		return cloudflareapi.FirewallCustomRule{}, errors.New("action harus skip, managed_challenge, block, js_challenge, atau log")
	}

	joiner := " and "
	if strings.EqualFold(strings.TrimSpace(req.CombineWith), "or") {
		joiner = " or "
	}

	var clauses []string
	if host := strings.ToLower(strings.TrimSpace(req.Hostname)); host != "" {
		if !redirectHostRe.MatchString(host) {
			return cloudflareapi.FirewallCustomRule{}, errors.New("hostname tidak valid (contoh: panel.example.com)")
		}
		clauses = append(clauses, fmt.Sprintf(`http.host eq "%s"`, host))
	}

	if pv := strings.TrimSpace(req.PathValue); pv != "" {
		mode := strings.TrimSpace(req.PathMatchMode)
		if mode == "" {
			mode = "starts_with"
		}
		switch mode {
		case "starts_with":
			if !redirectPathRe.MatchString(pv) {
				return cloudflareapi.FirewallCustomRule{}, errors.New("path harus diawali / dan hanya berisi karakter URL aman")
			}
			clauses = append(clauses, fmt.Sprintf(`starts_with(http.request.uri.path, "%s")`, pv))
		case "eq":
			if !redirectPathRe.MatchString(pv) {
				return cloudflareapi.FirewallCustomRule{}, errors.New("path harus diawali / dan hanya berisi karakter URL aman")
			}
			clauses = append(clauses, fmt.Sprintf(`http.request.uri.path eq "%s"`, pv))
		case "contains":
			if !wafPathQueryRe.MatchString(pv) {
				return cloudflareapi.FirewallCustomRule{}, errors.New("kata kunci path mengandung karakter tidak valid")
			}
			clauses = append(clauses, fmt.Sprintf(`http.request.uri.path contains "%s"`, pv))
		default:
			return cloudflareapi.FirewallCustomRule{}, errors.New("pathMatchMode harus starts_with, eq, atau contains")
		}
	}

	if len(req.UserAgents) > 0 {
		var uaParts []string
		for _, raw := range req.UserAgents {
			ua := strings.TrimSpace(raw)
			if ua == "" {
				continue
			}
			if !wafUserAgentRe.MatchString(ua) {
				return cloudflareapi.FirewallCustomRule{}, fmt.Errorf("user-agent %q mengandung karakter tidak valid", ua)
			}
			uaParts = append(uaParts, fmt.Sprintf(`http.user_agent contains "%s"`, ua))
		}
		if len(uaParts) == 1 {
			clauses = append(clauses, uaParts[0])
		} else if len(uaParts) > 1 {
			clauses = append(clauses, "("+strings.Join(uaParts, " or ")+")")
		}
	}

	if len(req.Countries) > 0 {
		var quoted []string
		for _, raw := range req.Countries {
			cc := strings.ToUpper(strings.TrimSpace(raw))
			if cc == "" {
				continue
			}
			if !wafCountryRe.MatchString(cc) {
				return cloudflareapi.FirewallCustomRule{}, fmt.Errorf("kode negara %q harus 2 huruf ISO (contoh: ID, US)", raw)
			}
			quoted = append(quoted, fmt.Sprintf(`"%s"`, cc))
		}
		if len(quoted) > 0 {
			clauses = append(clauses, fmt.Sprintf("ip.geoip.country in {%s}", strings.Join(quoted, " ")))
		}
	}

	if len(req.SourceIPs) > 0 {
		var ipTokens []string
		for _, raw := range req.SourceIPs {
			s := strings.TrimSpace(raw)
			if s == "" {
				continue
			}
			if p, err := netip.ParsePrefix(s); err == nil {
				ipTokens = append(ipTokens, p.String())
				continue
			}
			if a, err := netip.ParseAddr(s); err == nil {
				ipTokens = append(ipTokens, a.String())
				continue
			}
			return cloudflareapi.FirewallCustomRule{}, fmt.Errorf("alamat IP/CIDR %q tidak valid", s)
		}
		if len(ipTokens) == 1 && !strings.Contains(ipTokens[0], "/") {
			clauses = append(clauses, fmt.Sprintf("ip.src eq %s", ipTokens[0]))
		} else if len(ipTokens) > 0 {
			clauses = append(clauses, fmt.Sprintf("ip.src in {%s}", strings.Join(ipTokens, " ")))
		}
	}

	if req.IncludeVerifiedBots {
		clauses = append(clauses, "cf.client.bot")
	}

	if len(clauses) == 0 {
		return cloudflareapi.FirewallCustomRule{}, errors.New("minimal satu filter (hostname, path, user-agent, negara, IP, atau verified bots) wajib diisi")
	}

	description := strings.TrimSpace(req.Description)
	if description == "" {
		description = "Reneo WAF " + action
	}
	if len(description) > 120 {
		description = description[:120]
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	var params map[string]any
	if action == "skip" {
		params = map[string]any{"ruleset": "current"}
	}

	return cloudflareapi.FirewallCustomRule{
		Description:      description,
		Action:           action,
		Expression:       "(" + strings.Join(clauses, joiner) + ")",
		Enabled:          enabled,
		ActionParameters: params,
	}, nil
}

type skipActionCandidate struct {
	scopes []string
	params map[string]any
}

func skipActionCandidates() []skipActionCandidate {
	return []skipActionCandidate{
		{
			scopes: []string{"ruleset:current", "sbfm", "managed_waf", "ratelimit", "securityLevel", "bic"},
			params: map[string]any{
				"ruleset":  "current",
				"phases":   []string{"http_request_sbfm", "http_request_firewall_managed", "http_ratelimit"},
				"products": []string{"securityLevel", "bic"},
			},
		},
		{
			scopes: []string{"ruleset:current", "managed_waf", "ratelimit", "securityLevel", "bic"},
			params: map[string]any{
				"ruleset":  "current",
				"phases":   []string{"http_request_firewall_managed", "http_ratelimit"},
				"products": []string{"securityLevel", "bic"},
			},
		},
		{
			scopes: []string{"ruleset:current", "ratelimit", "securityLevel", "bic"},
			params: map[string]any{
				"ruleset":  "current",
				"phases":   []string{"http_ratelimit"},
				"products": []string{"securityLevel", "bic"},
			},
		},
		{
			scopes: []string{"ruleset:current", "securityLevel", "bic"},
			params: map[string]any{
				"ruleset":  "current",
				"products": []string{"securityLevel", "bic"},
			},
		},
		{
			scopes: []string{"ruleset:current"},
			params: map[string]any{
				"ruleset": "current",
			},
		},
	}
}

func isSkipEntitlementError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	// Do not mask missing token scope (9109 / authentication error)
	if strings.Contains(msg, "[9109]") || strings.Contains(msg, "[10000]") || strings.Contains(msg, "authentication") {
		return false
	}
	if strings.Contains(msg, "status 401") {
		return false
	}
	if strings.Contains(msg, "status 400") {
		return true
	}
	return strings.Contains(msg, "entitled") ||
		strings.Contains(msg, "phase") ||
		strings.Contains(msg, "product") ||
		strings.Contains(msg, "action_parameters") ||
		strings.Contains(msg, "not allowed for this plan")
}

func setRulesWithSkipFallback(client *cloudflareapi.Client, zoneID string, rules []cloudflareapi.FirewallCustomRule, skipIdx int) ([]cloudflareapi.FirewallCustomRule, []string, error) {
	candidates := skipActionCandidates()
	var lastErr error
	for _, cand := range candidates {
		attempt := make([]cloudflareapi.FirewallCustomRule, len(rules))
		copy(attempt, rules)
		attempt[skipIdx].ActionParameters = cand.params
		saved, err := client.SetFirewallCustomRules(zoneID, attempt)
		if err == nil {
			return saved, cand.scopes, nil
		}
		lastErr = err
		if !isSkipEntitlementError(err) {
			return nil, nil, err
		}
	}
	return nil, nil, lastErr
}

func upsertAICrawlerPresetRule(existing []cloudflareapi.FirewallCustomRule, nextRule cloudflareapi.FirewallCustomRule) ([]cloudflareapi.FirewallCustomRule, int) {
	out := make([]cloudflareapi.FirewallCustomRule, 0, len(existing)+1)
	for i, r := range existing {
		if r.Ref == aiCrawlerPresetRef {
			nextRule.ID = r.ID
			out = append(out, existing...)
			out[i] = nextRule
			return out, i
		}
	}
	// Put new AI allow skip rule first so it bypasses custom challenge/block rules below it.
	out = append(out, nextRule)
	out = append(out, existing...)
	return out, 0
}

func savedRuleByRef(saved []cloudflareapi.FirewallCustomRule, ref string, fallback cloudflareapi.FirewallCustomRule) cloudflareapi.FirewallCustomRule {
	for _, r := range saved {
		if r.Ref == ref {
			return r
		}
	}
	return fallback
}

func savedRuleByExpression(saved []cloudflareapi.FirewallCustomRule, expr string, fallback cloudflareapi.FirewallCustomRule) cloudflareapi.FirewallCustomRule {
	for _, r := range saved {
		if r.Expression == expr {
			return r
		}
	}
	return fallback
}
