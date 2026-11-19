package cloudflare

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestBotManagementAndFirewallCustomRules(t *testing.T) {
	client, seen := fakeCloudflare(t, func(r *http.Request) (int, string) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/zones/zone-1/bot_management":
			return 200, `{"success":true,"errors":[],"result":{"fight_mode":true,"ai_bots_protection":"block","enable_js":true}}`
		case r.Method == http.MethodPut && r.URL.Path == "/zones/zone-1/bot_management":
			return 200, `{"success":true,"errors":[],"result":{"fight_mode":false,"ai_bots_protection":"disabled","enable_js":true}}`
		case r.Method == http.MethodGet && r.URL.Path == "/zones/zone-1/rulesets/phases/http_request_firewall_custom/entrypoint":
			return 404, `{"success":false,"errors":[{"code":10000,"message":"ruleset not found"}],"result":null}`
		case r.Method == http.MethodPut && r.URL.Path == "/zones/zone-1/rulesets/phases/http_request_firewall_custom/entrypoint":
			return 200, `{"success":true,"errors":[],"result":{"id":"rs-1","rules":[{"id":"rule-1","ref":"reneo_allow_ai_crawlers","description":"Allow AI crawlers","expression":"(http.host eq \"panel.example.com\")","action":"skip","enabled":true,"action_parameters":{"ruleset":"current"}}]}}`
		}
		return 404, `{"success":false,"errors":[{"code":1000,"message":"not found"}],"result":null}`
	})

	bm, err := client.GetBotManagement("zone-1")
	if err != nil {
		t.Fatalf("GetBotManagement: %v", err)
	}
	if !bm.FightMode || bm.AIBotsProtection != "block" || !bm.EnableJS {
		t.Fatalf("unexpected bot management: %+v", bm)
	}

	disabled := "disabled"
	fightOff := false
	updated, err := client.UpdateBotManagement("zone-1", BotManagementUpdate{
		FightMode:        &fightOff,
		AIBotsProtection: &disabled,
	})
	if err != nil {
		t.Fatalf("UpdateBotManagement: %v", err)
	}
	if updated.FightMode || updated.AIBotsProtection != "disabled" {
		t.Fatalf("unexpected updated bot management: %+v", updated)
	}

	emptyRules, err := client.ListFirewallCustomRules("zone-1")
	if err != nil {
		t.Fatalf("ListFirewallCustomRules on 404 should return empty, got %v", err)
	}
	if len(emptyRules) != 0 {
		t.Fatalf("expected 0 rules, got %d", len(emptyRules))
	}

	saved, err := client.SetFirewallCustomRules("zone-1", []FirewallCustomRule{
		{
			Ref:              "reneo_allow_ai_crawlers",
			Description:      "Allow AI crawlers",
			Expression:       `(http.host eq "panel.example.com")`,
			Action:           "skip",
			Enabled:          true,
			ActionParameters: map[string]any{"ruleset": "current"},
			LastUpdated:      "2026-11-19T00:00:00Z",
		},
	})
	if err != nil {
		t.Fatalf("SetFirewallCustomRules: %v", err)
	}
	if len(saved) != 1 || saved[0].ID != "rule-1" {
		t.Fatalf("unexpected saved rules: %+v", saved)
	}

	if len(*seen) != 4 {
		t.Fatalf("expected 4 API requests, got %d", len(*seen))
	}
	var putBody map[string]any
	if err := json.Unmarshal([]byte((*seen)[3].body), &putBody); err != nil {
		t.Fatalf("unmarshal put ruleset body: %v", err)
	}
	rulesRaw, _ := putBody["rules"].([]any)
	firstRule, _ := rulesRaw[0].(map[string]any)
	if _, exists := firstRule["last_updated"]; exists {
		t.Fatalf("read-only last_updated must not be sent on PUT: %s", (*seen)[3].body)
	}
	if !strings.Contains((*seen)[1].body, `"ai_bots_protection":"disabled"`) {
		t.Fatalf("expected ai_bots_protection in PUT body, got %s", (*seen)[1].body)
	}
}

func TestVerifyTokenPermissionsIncludesSecurityScopes(t *testing.T) {
	client, _ := fakeCloudflare(t, func(r *http.Request) (int, string) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/user/tokens/verify":
			return 200, `{"success":true,"errors":[],"result":{"status":"active"}}`
		case r.Method == http.MethodGet && r.URL.Path == "/zones":
			return 200, `{"success":true,"errors":[],"result":[{"id":"z-1","name":"reneo.my.id","status":"active"}]}`
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/zones/z-1/dns_records"):
			return 200, `{"success":true,"errors":[],"result":[]}`
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/http_request_dynamic_redirect/entrypoint"):
			return 200, `{"success":true,"errors":[],"result":{"rules":[]}}`
		case r.Method == http.MethodGet && r.URL.Path == "/zones/z-1/bot_management":
			return 200, `{"success":true,"errors":[],"result":{"fight_mode":false,"ai_bots_protection":"disabled"}}`
		case r.Method == http.MethodGet && r.URL.Path == "/zones/z-1/rulesets/phases/http_request_firewall_custom/entrypoint":
			return 403, `{"success":false,"errors":[{"code":9109,"message":"Unauthorized to access requested resource"}],"result":null}`
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/zones/z-1/custom_hostnames"):
			return 403, `{"success":false,"errors":[{"code":9109,"message":"Unauthorized"}],"result":null}`
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/accounts/acct/cfd_tunnel"):
			return 200, `{"success":true,"errors":[],"result":[]}`
		}
		return 404, `{"success":false,"errors":[{"code":1000,"message":"not found"}],"result":null}`
	})

	perm := client.VerifyTokenPermissions()
	if !perm.Valid || !perm.CanReadZones || !perm.CanManageDNS || !perm.CanEditTunnels {
		t.Fatalf("expected basic permissions valid, got %+v", perm)
	}
	if !perm.CanManageBotManagement {
		t.Fatalf("expected CanManageBotManagement=true, got %+v", perm)
	}
	if perm.CanManageWAF {
		t.Fatalf("expected CanManageWAF=false on 403, got %+v", perm)
	}
}
