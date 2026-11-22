package httpserver

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
)

func TestBuildAICrawlerSkipRuleDefaultsAndSafety(t *testing.T) {
	rule, err := buildAICrawlerSkipRule(applyAICrawlerPresetRequest{}, "reneo.my.id")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rule.Ref != aiCrawlerPresetRef || rule.Action != "skip" || !rule.Enabled {
		t.Fatalf("unexpected rule metadata: %+v", rule)
	}
	for _, want := range []string{
		`http.host eq "panel.reneo.my.id"`,
		`starts_with(http.request.uri.path, "/app/reneo-crm")`,
		`starts_with(http.request.uri.path, "/llms.txt")`,
		`cf.client.bot`,
		`http.user_agent contains "ChatGPT-User"`,
		`http.user_agent contains "OAI-SearchBot"`,
	} {
		if !strings.Contains(rule.Expression, want) {
			t.Errorf("expression missing %q: %s", want, rule.Expression)
		}
	}

	allHostsRule, err := buildAICrawlerSkipRule(applyAICrawlerPresetRequest{
		ApplyToAllHosts: true,
		PathPrefixes:    []string{"/llms.txt"},
		UserAgents:      []string{},
	}, "reneo.my.id")
	if err != nil {
		t.Fatalf("allHosts rule failed: %v", err)
	}
	if strings.Contains(allHostsRule.Expression, "http.host eq") {
		t.Errorf("applyToAllHosts should omit host check: %s", allHostsRule.Expression)
	}
	if strings.Contains(allHostsRule.Expression, "http.user_agent") {
		t.Errorf("explicit empty userAgents slice should omit UA check: %s", allHostsRule.Expression)
	}
}

func TestBuildAICrawlerSkipRuleRejectsUnsafeInput(t *testing.T) {
	f := false
	badCases := []applyAICrawlerPresetRequest{
		{Hostname: `bad" or true or "a.com`},
		{Hostname: "localhost"},
		{Hostname: "panel.reneo.my.id", PathPrefixes: []string{"no-leading-slash"}},
		{Hostname: "panel.reneo.my.id", PathPrefixes: []string{`/bad"injection`}},
		{Hostname: "panel.reneo.my.id", UserAgents: []string{`ChatGPT" or true`}},
		{ApplyToAllHosts: true, PathPrefixes: []string{""}, AllowVerifiedBots: &f, UserAgents: []string{}},
	}
	for i, tc := range badCases {
		if _, err := buildAICrawlerSkipRule(tc, ""); err == nil {
			t.Errorf("case %d: expected rejection for %+v", i, tc)
		}
	}
}

func TestBuildCustomWafRuleAndRejectsUnsafeInput(t *testing.T) {
	rule, err := buildCustomWafRule(createWafRuleRequest{
		Description:         "Challenge risky requests",
		Action:              "managed_challenge",
		Hostname:            "Panel.Reneo.my.id",
		PathValue:           "/api/private",
		PathMatchMode:       "starts_with",
		Countries:           []string{"cn", "ru"},
		SourceIPs:           []string{"203.0.113.0/24"},
		IncludeVerifiedBots: false,
		CombineWith:         "and",
	})
	if err != nil {
		t.Fatalf("buildCustomWafRule failed: %v", err)
	}
	for _, want := range []string{
		`http.host eq "panel.reneo.my.id"`,
		`starts_with(http.request.uri.path, "/api/private")`,
		`ip.geoip.country in {"CN" "RU"}`,
		`ip.src in {203.0.113.0/24}`,
	} {
		if !strings.Contains(rule.Expression, want) {
			t.Errorf("expression missing %q: %s", want, rule.Expression)
		}
	}

	bad := []createWafRuleRequest{
		{Action: "invalid_action", Hostname: "a.example.com"},
		{Action: "block", Hostname: "a.example.com", Countries: []string{"INVALID"}},
		{Action: "block", Hostname: "a.example.com", SourceIPs: []string{"not-an-ip"}},
		{Action: "block", PathValue: `/bad"quote`},
		{Action: "block"},
	}
	for i, tc := range bad {
		if _, err := buildCustomWafRule(tc); err == nil {
			t.Errorf("case %d: expected error for %+v", i, tc)
		}
	}
}

func TestSetRulesWithSkipFallbackAndUpsert(t *testing.T) {
	t.Run("falls back gracefully on Free plan phase entitlement errors", func(t *testing.T) {
		var attempts int
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			attempts++
			body, _ := io.ReadAll(r.Body)
			w.Header().Set("Content-Type", "application/json")
			if strings.Contains(string(body), "http_request_sbfm") || strings.Contains(string(body), "http_request_firewall_managed") {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"success":false,"errors":[{"code":20213,"message":"phase http_request_sbfm is not entitled on your plan"}]}`))
				return
			}
			var parsed struct {
				Rules []cloudflareapi.FirewallCustomRule `json:"rules"`
			}
			_ = json.Unmarshal(body, &parsed)
			if len(parsed.Rules) > 0 {
				parsed.Rules[0].ID = "saved-1"
			}
			out, _ := json.Marshal(map[string]any{
				"success": true,
				"errors":  []any{},
				"result":  map[string]any{"rules": parsed.Rules},
			})
			_, _ = w.Write(out)
		}))
		defer srv.Close()

		client := cloudflareapi.NewClient("tok", "acct", "").WithBaseURL(srv.URL)
		existing := []cloudflareapi.FirewallCustomRule{
			{ID: "blk-1", Action: "block", Expression: `(ip.src eq 198.51.100.1)`, Enabled: true},
		}
		preset, err := buildAICrawlerSkipRule(applyAICrawlerPresetRequest{}, "reneo.my.id")
		if err != nil {
			t.Fatal(err)
		}
		next, idx := upsertAICrawlerPresetRule(existing, preset)
		if idx != 0 || next[0].Ref != aiCrawlerPresetRef || next[1].ID != "blk-1" {
			t.Fatalf("preset should prepend before block rule: idx=%d next=%+v", idx, next)
		}

		saved, scopes, err := setRulesWithSkipFallback(client, "zone-1", next, idx)
		if err != nil {
			t.Fatalf("setRulesWithSkipFallback failed: %v", err)
		}
		if attempts != 3 {
			t.Fatalf("expected 3 attempts until Free-compatible candidate, got %d", attempts)
		}
		if len(saved) != 2 || saved[0].ID != "saved-1" {
			t.Fatalf("unexpected saved rules: %+v", saved)
		}
		if strings.Join(scopes, ",") != "ruleset:current,ratelimit,securityLevel,bic" {
			t.Fatalf("unexpected scopes: %v", scopes)
		}

		// Updating again preserves existing ID in-place.
		updatedList, updIdx := upsertAICrawlerPresetRule(saved, preset)
		if updIdx != 0 || updatedList[0].ID != "saved-1" || len(updatedList) != 2 {
			t.Fatalf("expected in-place update preserving ID, got idx=%d list=%+v", updIdx, updatedList)
		}
	})

	t.Run("does not retry when token lacks WAF permission", func(t *testing.T) {
		var attempts int
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			attempts++
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"success":false,"errors":[{"code":9109,"message":"Unauthorized to access requested resource"}]}`))
		}))
		defer srv.Close()

		client := cloudflareapi.NewClient("tok", "acct", "").WithBaseURL(srv.URL)
		preset, _ := buildAICrawlerSkipRule(applyAICrawlerPresetRequest{}, "reneo.my.id")
		if _, _, err := setRulesWithSkipFallback(client, "zone-1", []cloudflareapi.FirewallCustomRule{preset}, 0); err == nil {
			t.Fatal("expected error for unauthorized token")
		}
		if attempts != 1 {
			t.Fatalf("expected immediate failure without retrying 403 [9109], got %d attempts", attempts)
		}
	})
}
