package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
)

var (
	redirectHostRe = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$`)
	// Only characters that cannot break out of a quoted Cloudflare expression string
	redirectPathRe = regexp.MustCompile(`^/[A-Za-z0-9._~/%:@+=,-]*$`)
)

type createRedirectRuleRequest struct {
	Hostname      string `json:"hostname"`
	Path          string `json:"path"`
	TargetURL     string `json:"targetUrl"`
	StatusCode    int    `json:"statusCode"`
	PreserveQuery bool   `json:"preserveQuery"`
	Description   string `json:"description"`
}

// buildRedirectRule validates the request and produces the Cloudflare rule.
// The expression is assembled from validated parts only, never from raw input.
func buildRedirectRule(req createRedirectRuleRequest) (cloudflareapi.RedirectRule, error) {
	host := strings.ToLower(strings.TrimSpace(req.Hostname))
	if !redirectHostRe.MatchString(host) {
		return cloudflareapi.RedirectRule{}, errors.New("hostname tidak valid (contoh: install.example.com)")
	}
	expression := fmt.Sprintf(`(http.host eq "%s")`, host)

	if path := strings.TrimSpace(req.Path); path != "" {
		if !redirectPathRe.MatchString(path) {
			return cloudflareapi.RedirectRule{}, errors.New("path harus diawali / dan hanya berisi karakter URL yang aman")
		}
		expression = fmt.Sprintf(`(http.host eq "%s" and http.request.uri.path eq "%s")`, host, path)
	}

	target := strings.TrimSpace(req.TargetURL)
	parsed, err := url.Parse(target)
	if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
		return cloudflareapi.RedirectRule{}, errors.New("targetUrl harus berupa URL http(s) lengkap")
	}

	status := req.StatusCode
	if status == 0 {
		status = 302
	}
	switch status {
	case 301, 302, 307, 308:
	default:
		return cloudflareapi.RedirectRule{}, errors.New("statusCode harus 301, 302, 307, atau 308")
	}

	description := strings.TrimSpace(req.Description)
	if description == "" {
		description = "Reneo redirect " + host
	}
	if len(description) > 120 {
		description = description[:120]
	}

	return cloudflareapi.RedirectRule{
		Action:      "redirect",
		Expression:  expression,
		Description: description,
		Enabled:     true,
		ActionParameters: map[string]any{
			"from_value": map[string]any{
				"status_code":           status,
				"target_url":            map[string]any{"value": target},
				"preserve_query_string": req.PreserveQuery,
			},
		},
	}, nil
}

func (s *Server) cloudflareZoneClient(w http.ResponseWriter, r *http.Request) (*cloudflareapi.Client, string, bool) {
	client, zones, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return nil, "", false
	}
	zoneID := r.PathValue("zoneId")
	if !zoneAllowed(zones, zoneID) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "zone not allowed"})
		return nil, "", false
	}
	return client, zoneID, true
}

func (s *Server) handleListCloudflareRedirects(w http.ResponseWriter, r *http.Request) {
	client, zoneID, ok := s.cloudflareZoneClient(w, r)
	if !ok {
		return
	}
	rules, err := client.ListRedirectRules(zoneID)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": rules})
}

func (s *Server) handleCreateCloudflareRedirect(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	client, zoneID, ok := s.cloudflareZoneClient(w, r)
	if !ok {
		return
	}
	var req createRedirectRuleRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	rule, err := buildRedirectRule(req)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	existing, err := client.ListRedirectRules(zoneID)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	// Same expression means the same traffic: replace instead of stacking a dead rule
	next := make([]cloudflareapi.RedirectRule, 0, len(existing)+1)
	for _, e := range existing {
		if e.Expression != rule.Expression {
			next = append(next, e)
		}
	}
	next = append(next, rule)

	saved, err := client.SetRedirectRules(zoneID, next)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	for _, e := range saved {
		if e.Expression == rule.Expression {
			s.writeJSON(w, http.StatusCreated, e)
			return
		}
	}
	s.writeJSON(w, http.StatusCreated, rule)
}

func (s *Server) handleDeleteCloudflareRedirect(w http.ResponseWriter, r *http.Request) {
	client, zoneID, ok := s.cloudflareZoneClient(w, r)
	if !ok {
		return
	}
	ruleID := r.PathValue("ruleId")
	existing, err := client.ListRedirectRules(zoneID)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	next := make([]cloudflareapi.RedirectRule, 0, len(existing))
	found := false
	for _, e := range existing {
		if e.ID == ruleID {
			found = true
			continue
		}
		next = append(next, e)
	}
	if !found {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "redirect rule not found"})
		return
	}
	if _, err := client.SetRedirectRules(zoneID, next); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}
