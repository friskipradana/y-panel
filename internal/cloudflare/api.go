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
}

// NewClient creates a new Client with the given credentials.
func NewClient(apiToken, accountID, zoneID string) *Client {
	return &Client{
		apiToken:  apiToken,
		accountID: accountID,
		zoneID:    zoneID,
		http:      &http.Client{Timeout: 15 * time.Second},
	}
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

// ZoneInfo represents a Cloudflare Zone (Domain).
type ZoneInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// ListZones returns all active zones accessible by the API token.
func (c *Client) ListZones() ([]ZoneInfo, error) {
	resp, err := c.get("/zones?status=active")
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
	ID      string `json:"id"`
	Type    string `json:"type"`
	Name    string `json:"name"`
	Content string `json:"content"`
	Proxied bool   `json:"proxied"`
	TTL     int    `json:"ttl"`
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
			// Update existing
			body := map[string]any{
				"type":    "CNAME",
				"name":    hostname,
				"content": content,
				"proxied": true,
				"ttl":     1,
			}
			putResp, putErr := c.put(fmt.Sprintf("/zones/%s/dns_records/%s", zoneID, record.ID), body)
			if putErr == nil && putResp.Success {
				var updated DNSRecord
				_ = mapResult(putResp.Result, &updated)
				return &updated, nil
			}
		}
	}

	// Create new
	body := map[string]any{
		"type":    "CNAME",
		"name":    hostname,
		"content": content,
		"proxied": true,
		"ttl":     1,
	}
	resp, err := c.post(fmt.Sprintf("/zones/%s/dns_records", zoneID), body)
	if err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, fmt.Errorf("create CNAME failed: %v", resp.Errors)
	}
	var record DNSRecord
	if err := mapResult(resp.Result, &record); err != nil {
		return nil, err
	}
	return &record, nil
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

func (c *Client) request(method, path string, body any) (*apiResponse, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, baseURL+path, bodyReader)
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
		return nil, fmt.Errorf("parse response: %w (body: %s)", err, strings.TrimSpace(string(data)))
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
