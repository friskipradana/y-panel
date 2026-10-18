// Package cloudflare provides a minimal Cloudflare API client for managing
// Cloudflare Tunnels and DNS records on behalf of individual users.
// Each user supplies their own API token, which is decrypted at call time.
package cloudflare

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const baseURL = "https://api.cloudflare.com/client/v4"

// Client is an authenticated Cloudflare API client for a specific user.
type Client struct {
	apiToken  string
	accountID string
	zoneID    string
	http      *http.Client
	base      string
}

// NewClient creates a new Client with the given credentials.
func NewClient(apiToken, accountID, zoneID string) *Client {
	return &Client{
		apiToken:  apiToken,
		accountID: accountID,
		zoneID:    zoneID,
		http:      &http.Client{Timeout: 15 * time.Second},
		base:      baseURL,
	}
}

// WithBaseURL points the client at another API address; tests use it to talk to a fake Cloudflare
func (c *Client) WithBaseURL(base string) *Client {
	c.base = strings.TrimRight(base, "/")
	return c
}

// VerifyToken validates the API token against the Cloudflare /user/tokens/verify endpoint.
func (c *Client) VerifyToken() error {
	resp, err := c.get("/user/tokens/verify")
	if err != nil {
		return err
	}
	if !resp.Success {
		return fmt.Errorf("token verification failed: %v", resp.Errors)
	}
	return nil
}

// TokenPermissions holds detailed capability test results for a Cloudflare API token.
type TokenPermissions struct {
	Valid          bool   `json:"valid"`
	Status         string `json:"status"`
	CanReadZones   bool   `json:"canReadZones"`
	CanManageDNS   bool   `json:"canManageDNS"`
	CanEditTunnels bool   `json:"canEditTunnels"`
	// CanManageRedirects reports access to Single Redirect rules (Rulesets) on the first zone
	CanManageRedirects bool `json:"canManageRedirects"`
	// CanManageCustomHostnames reports that the zone answers for custom hostnames: the SSL and Certificates permission
	// is on the token and Custom Hostnames (Cloudflare for SaaS) is switched on. Only the seller of hosting needs it.
	CanManageCustomHostnames bool `json:"canManageCustomHostnames"`
	AccountID          string   `json:"accountId,omitempty"`
	MissingScopes      []string `json:"missingScopes,omitempty"`
	Summary            string   `json:"summary"`
}

// VerifyTokenPermissions checks token validity and inspects required scopes (Zones, DNS, Tunnels).
func (c *Client) VerifyTokenPermissions() TokenPermissions {
	perm := TokenPermissions{
		AccountID: c.accountID,
	}

	// 1. Basic token status check
	if err := c.VerifyToken(); err != nil {
		perm.Valid = false
		perm.Status = "invalid"
		perm.Summary = fmt.Sprintf("Token tidak valid: %v", err)
		perm.MissingScopes = append(perm.MissingScopes, "Invalid Token")
		return perm
	}
	perm.Valid = true
	perm.Status = "active"

	// 2. Test Zone:Read
	zones, err := c.ListZones()
	if err == nil {
		perm.CanReadZones = true
		// 3. Test DNS on first zone if available
		if len(zones) > 0 {
			_, dnsErr := c.ListDNSRecords(zones[0].ID)
			if dnsErr == nil {
				perm.CanManageDNS = true
			} else {
				perm.MissingScopes = append(perm.MissingScopes, "Zone:DNS:Edit")
			}
			// Redirect rules are optional: report them separately instead of failing the token
			if _, redirErr := c.ListRedirectRules(zones[0].ID); redirErr == nil {
				perm.CanManageRedirects = true
			}
			// so are custom hostnames: they matter only to the seller of hosting
			perm.CanManageCustomHostnames = c.CanReadCustomHostnames(zones[0].ID)
		} else {
			perm.CanManageDNS = true
		}
	} else {
		perm.MissingScopes = append(perm.MissingScopes, "Zone:Zone:Read")
	}

	// 4. Test Cloudflare Tunnel access
	if c.accountID != "" {
		_, tunnelErr := c.ListTunnels()
		if tunnelErr == nil {
			perm.CanEditTunnels = true
		} else {
			perm.MissingScopes = append(perm.MissingScopes, "Account:Cloudflare Tunnel:Edit")
		}
	}

	if len(perm.MissingScopes) == 0 {
		perm.Summary = "Token Cloudflare aktif dengan hak akses lengkap (Zone:Read, DNS:Edit, Cloudflare Tunnel:Edit)."
		if !perm.CanManageRedirects && perm.CanReadZones {
			perm.Summary += " Izin Single Redirect (Zone:Single Redirect:Edit) belum ada, jadi tool redirect rule tidak dapat dipakai."
		}
	} else {
		perm.Summary = fmt.Sprintf("Token aktif, namun kekurangan izin: %s. Buat token baru di Cloudflare Dashboard dengan template 'Cloudflare Tunnel' & 'Edit zone DNS'.", strings.Join(perm.MissingScopes, ", "))
	}

	return perm
}

// ZoneInfo represents a Cloudflare Zone (Domain).
type ZoneInfo struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Status      string   `json:"status,omitempty"`
	NameServers []string `json:"name_servers,omitempty"`
}

type CreateZonePayload struct {
	Name    string `json:"name"`
	Type    string `json:"type,omitempty"`
	Account struct {
		ID string `json:"id"`
	} `json:"account"`
}

// ListZones returns all zones accessible by the API token.
func (c *Client) ListZones() ([]ZoneInfo, error) {
	resp, err := c.get("/zones?per_page=200")
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("list zones failed: %v", resp.Errors)
	}
	var zones []ZoneInfo
	if err := mapResult(resp.Result, &zones); err != nil {
		return nil, err
	}
	return zones, nil
}

func (c *Client) CreateZone(name string) (*ZoneInfo, error) {
	payload := CreateZonePayload{Name: strings.TrimSpace(name), Type: "full"}
	payload.Account.ID = strings.TrimSpace(c.accountID)
	if payload.Account.ID == "" {
		return nil, fmt.Errorf("account ID is required to create a Cloudflare zone")
	}
	resp, err := c.post("/zones", payload)
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("create zone failed: %v", resp.Errors)
	}
	var zone ZoneInfo
	if err := mapResult(resp.Result, &zone); err != nil {
		return nil, err
	}
	return &zone, nil
}

func (c *Client) GetZone(zoneID string) (*ZoneInfo, error) {
	resp, err := c.get(fmt.Sprintf("/zones/%s", zoneID))
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("get zone failed: %v", resp.Errors)
	}
	var zone ZoneInfo
	if err := mapResult(resp.Result, &zone); err != nil {
		return nil, err
	}
	return &zone, nil
}

func (c *Client) DeleteZone(zoneID string) error {
	resp, err := c.delete(fmt.Sprintf("/zones/%s", zoneID))
	if err != nil {
		return err
	}
	if !resp.Success {
		return fmt.Errorf("delete zone failed: %v", resp.Errors)
	}
	return nil
}

// ─── Tunnel Operations ────────────────────────────────────────────────────────

// TunnelInfo represents a Cloudflare tunnel.
type TunnelInfo struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateTunnel creates a new named Cloudflare Tunnel and returns its info + credential bytes.
// The credential bytes should be saved as a tunnel credential file on disk for cloudflared.
func (c *Client) CreateTunnel(name string) (*TunnelInfo, []byte, error) {
	secret, err := generateSecret()
	if err != nil {
		return nil, nil, fmt.Errorf("generate tunnel secret: %w", err)
	}
	body := map[string]any{
		"name":          name,
		"tunnel_secret": secret,
	}
	resp, err := c.post(fmt.Sprintf("/accounts/%s/cfd_tunnel", c.accountID), body)
	if err != nil {
		return nil, nil, err
	}
	if !resp.Success {
		return nil, nil, fmt.Errorf("create tunnel failed: %v", resp.Errors)
	}
	var info TunnelInfo
	if err := mapResult(resp.Result, &info); err != nil {
		return nil, nil, err
	}
	credObj := map[string]string{
		"AccountTag":   c.accountID,
		"TunnelSecret": secret,
		"TunnelID":     info.ID,
	}
	credBytes, _ := json.Marshal(credObj)
	return &info, credBytes, nil
}

// DeleteTunnel removes a Cloudflare Tunnel by ID.
func (c *Client) DeleteTunnel(tunnelID string) error {
	resp, err := c.request("DELETE", fmt.Sprintf("/accounts/%s/cfd_tunnel/%s", c.accountID, tunnelID), nil)
	if err != nil {
		return err
	}
	if !resp.Success {
		return fmt.Errorf("delete tunnel failed: %v", resp.Errors)
	}
	return nil
}

func (c *Client) GetTunnel(tunnelID string) (*TunnelInfo, error) {
	resp, err := c.get(fmt.Sprintf("/accounts/%s/cfd_tunnel/%s", c.accountID, tunnelID))
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("get tunnel failed: %v", resp.Errors)
	}
	var info TunnelInfo
	if err := mapResult(resp.Result, &info); err != nil {
		return nil, err
	}
	return &info, nil
}

// ListTunnels returns all non-deleted tunnels for the account.
func (c *Client) ListTunnels() ([]TunnelInfo, error) {
	resp, err := c.get(fmt.Sprintf("/accounts/%s/cfd_tunnel?is_deleted=false", c.accountID))
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("list tunnels failed: %v", resp.Errors)
	}
	var tunnels []TunnelInfo
	if err := mapResult(resp.Result, &tunnels); err != nil {
		return nil, err
	}
	return tunnels, nil
}

// ─── DNS Operations ───────────────────────────────────────────────────────────

// DNSRecord represents a Cloudflare DNS record.
type DNSRecord struct {
	ID         string    `json:"id"`
	Type       string    `json:"type"`
	Name       string    `json:"name"`
	Content    string    `json:"content"`
	Proxied    bool      `json:"proxied"`
	TTL        int       `json:"ttl"`
	Priority   *int      `json:"priority,omitempty"`
	Comment    string    `json:"comment,omitempty"`
	CreatedOn  time.Time `json:"created_on,omitempty"`
	ModifiedOn time.Time `json:"modified_on,omitempty"`
}

type DNSRecordPayload struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	Content  string `json:"content"`
	TTL      int    `json:"ttl"`
	Proxied  bool   `json:"proxied"`
	Priority *int   `json:"priority,omitempty"`
	Comment  string `json:"comment,omitempty"`
}

func (c *Client) ListDNSRecords(zoneID string) ([]DNSRecord, error) {
	resp, err := c.get(fmt.Sprintf("/zones/%s/dns_records?per_page=200", zoneID))
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("list DNS records failed: %v", resp.Errors)
	}
	var records []DNSRecord
	if err := mapResult(resp.Result, &records); err != nil {
		return nil, err
	}
	return records, nil
}

// DNSRecordsByName lists every record, of any type, with exactly this name. A name that already
// holds a record (an A, MX or TXT as well as a CNAME) is not free to give away.
func (c *Client) DNSRecordsByName(zoneID, hostname string) ([]DNSRecord, error) {
	resp, err := c.get(fmt.Sprintf("/zones/%s/dns_records?name=%s&per_page=100", zoneID, url.QueryEscape(hostname)))
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("list DNS records failed: %v", resp.Errors)
	}
	var records []DNSRecord
	if err := mapResult(resp.Result, &records); err != nil {
		return nil, err
	}
	return records, nil
}

func (c *Client) CreateDNSRecord(zoneID string, payload DNSRecordPayload) (*DNSRecord, error) {
	resp, err := c.post(fmt.Sprintf("/zones/%s/dns_records", zoneID), payload)
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("create DNS record failed: %v", resp.Errors)
	}
	var record DNSRecord
	if err := mapResult(resp.Result, &record); err != nil {
		return nil, err
	}
	return &record, nil
}

func (c *Client) UpdateDNSRecord(zoneID, recordID string, payload DNSRecordPayload) (*DNSRecord, error) {
	resp, err := c.put(fmt.Sprintf("/zones/%s/dns_records/%s", zoneID, recordID), payload)
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("update DNS record failed: %v", resp.Errors)
	}
	var record DNSRecord
	if err := mapResult(resp.Result, &record); err != nil {
		return nil, err
	}
	return &record, nil
}

// EnsureCNAMERecord creates or updates a CNAME record pointing hostname → tunnelID.cfargotunnel.com.
func (c *Client) EnsureCNAMERecord(zoneID, hostname, tunnelID string) (*DNSRecord, error) {
	content := fmt.Sprintf("%s.cfargotunnel.com", tunnelID)

	// Check if record exists
	getResp, err := c.get(fmt.Sprintf("/zones/%s/dns_records?name=%s&type=CNAME", zoneID, hostname))
	if err == nil && getResp.Success {
		var existingRecords []DNSRecord
		if err := mapResult(getResp.Result, &existingRecords); err == nil && len(existingRecords) > 0 {
			record := existingRecords[0]
			if record.Content == content {
				return &record, nil // Already correct
			}
			updated, putErr := c.UpdateDNSRecord(zoneID, record.ID, DNSRecordPayload{Type: "CNAME", Name: hostname, Content: content, Proxied: true, TTL: 1})
			if putErr == nil {
				return updated, nil
			}
		}
	}

	return c.CreateDNSRecord(zoneID, DNSRecordPayload{Type: "CNAME", Name: hostname, Content: content, Proxied: true, TTL: 1})
}

// DeleteDNSRecord removes a DNS record from the zone by record ID.
func (c *Client) DeleteDNSRecord(zoneID, recordID string) error {
	resp, err := c.request("DELETE", fmt.Sprintf("/zones/%s/dns_records/%s", zoneID, recordID), nil)
	if err != nil {
		return err
	}
	if !resp.Success {
		return fmt.Errorf("delete DNS record failed: %v", resp.Errors)
	}
	return nil
}

// DeleteDNSRecordByHostname removes all CNAME records for a given hostname in the zone.
func (c *Client) DeleteDNSRecordByHostname(zoneID, hostname string) error {
	getResp, err := c.get(fmt.Sprintf("/zones/%s/dns_records?name=%s&type=CNAME", zoneID, hostname))
	if err != nil {
		return err
	}
	if !getResp.Success {
		return fmt.Errorf("list DNS records failed: %v", getResp.Errors)
	}
	var existingRecords []DNSRecord
	if err := mapResult(getResp.Result, &existingRecords); err != nil {
		return err
	}
	for _, rec := range existingRecords {
		if err := c.DeleteDNSRecord(zoneID, rec.ID); err != nil {
			return err
		}
	}
	return nil
}

// ─── Tunnel Routing ───────────────────────────────────────────────────────────

// IngressRule maps a hostname to a service URL within a tunnel config.
type IngressRule struct {
	Hostname string `json:"hostname,omitempty"`
	Path     string `json:"path,omitempty"`
	Service  string `json:"service"`
}

// UpdateTunnelConfig replaces the ingress configuration for a tunnel via the Cloudflare API.
// A catch-all rule (empty hostname) is automatically appended if not present.
func (c *Client) UpdateTunnelConfig(tunnelID string, rules []IngressRule) error {
	// Ensure catch-all is present at the end
	hasCatchAll := false
	for _, r := range rules {
		if r.Hostname == "" {
			hasCatchAll = true
			break
		}
	}
	if !hasCatchAll {
		rules = append(rules, IngressRule{Service: "http_status:404"})
	}

	body := map[string]any{
		"config": map[string]any{
			"ingress": rules,
		},
	}
	resp, err := c.put(fmt.Sprintf("/accounts/%s/cfd_tunnel/%s/configurations", c.accountID, tunnelID), body)
	if err != nil {
		return err
	}
	if !resp.Success {
		return fmt.Errorf("update tunnel config failed: %v", resp.Errors)
	}
	return nil
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

type apiResponse struct {
	Success bool            `json:"success"`
	Result  json.RawMessage `json:"result"`
	Errors  []cfError       `json:"errors"`
}

type cfError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e cfError) Error() string {
	return fmt.Sprintf("[%d] %s", e.Code, e.Message)
}

func (c *Client) get(path string) (*apiResponse, error) {
	return c.request("GET", path, nil)
}

func (c *Client) post(path string, body any) (*apiResponse, error) {
	return c.request("POST", path, body)
}

func (c *Client) put(path string, body any) (*apiResponse, error) {
	return c.request("PUT", path, body)
}

func (c *Client) delete(path string) (*apiResponse, error) {
	return c.request("DELETE", path, nil)
}

func (c *Client) request(method, path string, body any) (*apiResponse, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.base+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	httpResp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http %s %s: %w", method, path, err)
	}
	defer httpResp.Body.Close()

	data, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var resp apiResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("cloudflare returned non-json response for %s %s (status %d): %s", method, path, httpResp.StatusCode, strings.TrimSpace(string(data)))
	}
	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		return &resp, fmt.Errorf("cloudflare API %s %s returned status %d: %v", method, path, httpResp.StatusCode, resp.Errors)
	}

	return &resp, nil
}

func mapResult(raw json.RawMessage, target any) error {
	return json.Unmarshal(raw, target)
}

// generateSecret creates a cryptographically random 32-byte base64 string for tunnel secrets.
func generateSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(buf), nil
}

// ─── Redirect rules (Single Redirects via the Rulesets API) ───────────────────

const redirectPhase = "http_request_dynamic_redirect"

// RedirectRule is one rule of a zone's dynamic redirect ruleset.
type RedirectRule struct {
	ID               string         `json:"id,omitempty"`
	Ref              string         `json:"ref,omitempty"`
	Action           string         `json:"action"`
	Expression       string         `json:"expression"`
	Description      string         `json:"description,omitempty"`
	Enabled          bool           `json:"enabled"`
	ActionParameters map[string]any `json:"action_parameters,omitempty"`
}

func redirectEntrypoint(zoneID string) string {
	return fmt.Sprintf("/zones/%s/rulesets/phases/%s/entrypoint", zoneID, redirectPhase)
}

// ListRedirectRules returns the zone's redirect rules (empty when none exist yet).
func (c *Client) ListRedirectRules(zoneID string) ([]RedirectRule, error) {
	resp, err := c.get(redirectEntrypoint(zoneID))
	if err != nil {
		// No entrypoint ruleset yet: Cloudflare answers 404 until the first rule is created
		if resp != nil && strings.Contains(err.Error(), "status 404") {
			return []RedirectRule{}, nil
		}
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("list redirect rules failed: %v", resp.Errors)
	}
	var ruleset struct {
		Rules []RedirectRule `json:"rules"`
	}
	if err := mapResult(resp.Result, &ruleset); err != nil {
		return nil, err
	}
	if ruleset.Rules == nil {
		ruleset.Rules = []RedirectRule{}
	}
	return ruleset.Rules, nil
}

// SetRedirectRules replaces the zone's redirect ruleset with the given rules.
func (c *Client) SetRedirectRules(zoneID string, rules []RedirectRule) ([]RedirectRule, error) {
	resp, err := c.put(redirectEntrypoint(zoneID), map[string]any{"rules": rules})
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("update redirect rules failed: %v", resp.Errors)
	}
	var ruleset struct {
		Rules []RedirectRule `json:"rules"`
	}
	if err := mapResult(resp.Result, &ruleset); err != nil {
		return nil, err
	}
	return ruleset.Rules, nil
}
