package cloudflare

import (
	"fmt"
	"net/url"
	"strings"
)

const firewallCustomPhase = "http_request_firewall_custom"

// BotManagementSettings holds Cloudflare zone Bot Management and AI bot settings.
type BotManagementSettings struct {
	FightMode         bool   `json:"fight_mode"`
	AIBotsProtection  string `json:"ai_bots_protection"`
	EnableJS          bool   `json:"enable_js"`
	CrawlerProtection string `json:"crawler_protection,omitempty"`
	UsingLatestModel  bool   `json:"using_latest_model,omitempty"`
}

// BotManagementUpdate carries optional fields to update via PUT /bot_management.
type BotManagementUpdate struct {
	FightMode         *bool   `json:"fight_mode,omitempty"`
	AIBotsProtection  *string `json:"ai_bots_protection,omitempty"`
	EnableJS          *bool   `json:"enable_js,omitempty"`
	CrawlerProtection *string `json:"crawler_protection,omitempty"`
}

// FirewallCustomRule is a rule in a zone's http_request_firewall_custom ruleset.
type FirewallCustomRule struct {
	ID               string         `json:"id,omitempty"`
	Ref              string         `json:"ref,omitempty"`
	Description      string         `json:"description,omitempty"`
	Expression       string         `json:"expression"`
	Action           string         `json:"action"`
	Enabled          bool           `json:"enabled"`
	ActionParameters map[string]any `json:"action_parameters,omitempty"`
	LastUpdated      string         `json:"last_updated,omitempty"`
}

type firewallCustomRuleWrite struct {
	ID               string         `json:"id,omitempty"`
	Ref              string         `json:"ref,omitempty"`
	Description      string         `json:"description,omitempty"`
	Expression       string         `json:"expression"`
	Action           string         `json:"action"`
	Enabled          bool           `json:"enabled"`
	ActionParameters map[string]any `json:"action_parameters,omitempty"`
}

func firewallCustomEntrypoint(zoneID string) string {
	return fmt.Sprintf("/zones/%s/rulesets/phases/%s/entrypoint", url.PathEscape(zoneID), firewallCustomPhase)
}

// IsAuthOrPermissionError reports whether a Cloudflare API failure indicates a missing or invalid token scope.
func IsAuthOrPermissionError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "status 401") ||
		strings.Contains(msg, "status 403") ||
		strings.Contains(msg, "[9109]") ||
		strings.Contains(msg, "[10000]")
}

// GetBotManagement fetches Bot Management settings for a Cloudflare zone.
func (c *Client) GetBotManagement(zoneID string) (*BotManagementSettings, error) {
	resp, err := c.get(fmt.Sprintf("/zones/%s/bot_management", url.PathEscape(zoneID)))
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("get bot management failed: %v", resp.Errors)
	}
	var out BotManagementSettings
	if err := mapResult(resp.Result, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// UpdateBotManagement updates Bot Management settings on a Cloudflare zone.
func (c *Client) UpdateBotManagement(zoneID string, update BotManagementUpdate) (*BotManagementSettings, error) {
	resp, err := c.put(fmt.Sprintf("/zones/%s/bot_management", url.PathEscape(zoneID)), update)
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("update bot management failed: %v", resp.Errors)
	}
	var out BotManagementSettings
	if err := mapResult(resp.Result, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ListFirewallCustomRules returns custom WAF rules for the zone, or an empty slice if none exist yet.
func (c *Client) ListFirewallCustomRules(zoneID string) ([]FirewallCustomRule, error) {
	resp, err := c.get(firewallCustomEntrypoint(zoneID))
	if err != nil {
		if resp != nil && strings.Contains(err.Error(), "status 404") {
			return []FirewallCustomRule{}, nil
		}
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("list firewall custom rules failed: %v", resp.Errors)
	}
	var ruleset struct {
		Rules []FirewallCustomRule `json:"rules"`
	}
	if err := mapResult(resp.Result, &ruleset); err != nil {
		return nil, err
	}
	if ruleset.Rules == nil {
		ruleset.Rules = []FirewallCustomRule{}
	}
	return ruleset.Rules, nil
}

// SetFirewallCustomRules replaces the zone's http_request_firewall_custom entrypoint ruleset.
func (c *Client) SetFirewallCustomRules(zoneID string, rules []FirewallCustomRule) ([]FirewallCustomRule, error) {
	payloadRules := make([]firewallCustomRuleWrite, 0, len(rules))
	for _, r := range rules {
		payloadRules = append(payloadRules, firewallCustomRuleWrite{
			ID:               r.ID,
			Ref:              r.Ref,
			Description:      r.Description,
			Expression:       r.Expression,
			Action:           r.Action,
			Enabled:          r.Enabled,
			ActionParameters: r.ActionParameters,
		})
	}
	resp, err := c.put(firewallCustomEntrypoint(zoneID), map[string]any{"rules": payloadRules})
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("update firewall custom rules failed: %v", resp.Errors)
	}
	var ruleset struct {
		Rules []FirewallCustomRule `json:"rules"`
	}
	if err := mapResult(resp.Result, &ruleset); err != nil {
		return nil, err
	}
	if ruleset.Rules == nil {
		ruleset.Rules = []FirewallCustomRule{}
	}
	return ruleset.Rules, nil
}
