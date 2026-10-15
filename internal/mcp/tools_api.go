package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// apiClient is a lightweight HTTP client that talks to the local panel API.
// It authenticates using a pre-issued session token stored as a cookie.
type apiClient struct {
	baseURL string
	token   string
	http    *http.Client
}

func newAPIClient(baseURL, token string) *apiClient {
	return &apiClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *apiClient) do(ctx context.Context, method, path string, body any) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, 0, fmt.Errorf("create request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	// Explicitly set Host to 127.0.0.1 when talking to local panel API to avoid host guard rejection
	if strings.Contains(c.baseURL, "127.0.0.1") || strings.Contains(c.baseURL, "localhost") {
		req.Host = "127.0.0.1"
	}
	// Use Authorization Bearer if token is a ypat_ API token, otherwise use cookie (legacy session token)
	if strings.HasPrefix(c.token, "ypat_") {
		req.Header.Set("Authorization", "Bearer "+c.token)
	} else if c.token != "" {
		req.AddCookie(&http.Cookie{Name: "ypanel_session", Value: c.token})
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("http %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}
	return data, resp.StatusCode, nil
}


func (c *apiClient) get(ctx context.Context, path string) ([]byte, int, error) {
	return c.do(ctx, http.MethodGet, path, nil)
}

func (c *apiClient) post(ctx context.Context, path string, body any) ([]byte, int, error) {
	return c.do(ctx, http.MethodPost, path, body)
}

func (c *apiClient) put(ctx context.Context, path string, body any) ([]byte, int, error) {
	return c.do(ctx, http.MethodPut, path, body)
}

func (c *apiClient) delete(ctx context.Context, path string) ([]byte, int, error) {
	return c.do(ctx, http.MethodDelete, path, nil)
}

func jsonResponseText(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func apiResult(data []byte, statusCode int, err error) (string, error) {
	if err != nil {
		return "", err
	}
	if statusCode >= 400 {
		errMsg := strings.TrimSpace(string(data))
		var errObj struct {
			Error   string `json:"error"`
			Message string `json:"message"`
		}
		if json.Unmarshal(data, &errObj) == nil {
			if errObj.Error != "" {
				errMsg = errObj.Error
			} else if errObj.Message != "" {
				errMsg = errObj.Message
			}
		}
		return "", fmt.Errorf("API error %d: %s", statusCode, errMsg)
	}
	var pretty bytes.Buffer
	if json.Indent(&pretty, data, "", "  ") == nil {
		return pretty.String(), nil
	}
	return string(data), nil
}

// registerProjectTools adds project management tools.
func registerProjectTools(s *Server, client *apiClient) {
	s.Register(Tool{
		Name:        "project_list",
		Description: "List all Reneo projects (web/app projects managed by the panel) with their status.",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		data, code, err := client.get(ctx, "/api/v1/projects")
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "project_get",
		Description: "Get detailed information about a specific Reneo project.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {Type: "string", Description: "Project ID."},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := stringArg(args, "id", "")
		if id == "" {
			return "", fmt.Errorf("project id is required")
		}
		data, code, err := client.get(ctx, "/api/v1/projects/"+id)
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "project_start",
		Description: "Start a Reneo project.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {Type: "string", Description: "Project ID to start."},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := stringArg(args, "id", "")
		if id == "" {
			return "", fmt.Errorf("project id is required")
		}
		data, code, err := client.post(ctx, "/api/v1/projects/"+id+"/start", nil)
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "project_stop",
		Description: "Stop a running Reneo project.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {Type: "string", Description: "Project ID to stop."},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := stringArg(args, "id", "")
		if id == "" {
			return "", fmt.Errorf("project id is required")
		}
		data, code, err := client.post(ctx, "/api/v1/projects/"+id+"/stop", nil)
		return apiResult(data, code, err)
	})
}

// registerUserTools adds user management tools.
func registerUserTools(s *Server, client *apiClient) {
	s.Register(Tool{
		Name:        "user_list",
		Description: "List all Reneo users with their roles, status, and quota info.",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		data, code, err := client.get(ctx, "/api/v1/users")
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "user_get",
		Description: "Get a single Reneo user by ID.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {Type: "string", Description: "User ID."},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := stringArg(args, "id", "")
		if id == "" {
			return "", fmt.Errorf("user id is required")
		}
		data, code, err := client.get(ctx, "/api/v1/users/"+id)
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "user_suspend",
		Description: "Suspend a Reneo user account (prevent login).",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {Type: "string", Description: "User ID to suspend."},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := stringArg(args, "id", "")
		if id == "" {
			return "", fmt.Errorf("user id is required")
		}
		data, code, err := client.post(ctx, "/api/v1/users/"+id+"/suspend", nil)
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "user_activate",
		Description: "Activate a suspended Reneo user account.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"id": {Type: "string", Description: "User ID to activate."},
			},
			Required: []string{"id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		id := stringArg(args, "id", "")
		if id == "" {
			return "", fmt.Errorf("user id is required")
		}
		data, code, err := client.post(ctx, "/api/v1/users/"+id+"/activate", nil)
		return apiResult(data, code, err)
	})
}

// registerCloudflareTools adds Cloudflare domain and tunnel tools.
func registerCloudflareTools(s *Server, client *apiClient) {
	s.Register(Tool{
		Name:        "cloudflare_list_domains",
		Description: "List all Cloudflare domains (zones) connected to Reneo.",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		data, code, err := client.get(ctx, "/api/v1/cloudflare/domains")
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "cloudflare_list_dns",
		Description: "List DNS records for a Cloudflare zone managed by Reneo.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"zone_id": {Type: "string", Description: "Cloudflare Zone ID."},
			},
			Required: []string{"zone_id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		zoneID := stringArg(args, "zone_id", "")
		if zoneID == "" {
			return "", fmt.Errorf("zone_id is required")
		}
		data, code, err := client.get(ctx, "/api/v1/cloudflare/domains/"+zoneID+"/dns")
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "cloudflare_list_tunnel_profiles",
		Description: "List all Cloudflare tunnel profiles configured in Reneo.",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		data, code, err := client.get(ctx, "/api/v1/cloudflare/tunnel-profiles")
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "cloudflare_verify_token",
		Description: "Verify Cloudflare API token status and check required permissions (Zone:Read, DNS:Edit, Cloudflare Tunnel:Edit).",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		data, code, err := client.post(ctx, "/api/v1/me/cloudflare/verify", nil)
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "cloudflare_create_dns",
		Description: "Create a DNS record (CNAME, A, AAAA, TXT) in Cloudflare for a domain/zone managed by Reneo.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"zone_id": {Type: "string", Description: "Cloudflare Zone ID."},
				"type":    {Type: "string", Description: "Record type: CNAME, A, AAAA, TXT."},
				"name":    {Type: "string", Description: "Hostname / record name (e.g. app.domain.com)."},
				"content": {Type: "string", Description: "Record content (e.g. <tunnel-id>.cfargotunnel.com or IP)."},
				"proxied": {Type: "boolean", Description: "Enable Cloudflare proxy (orange cloud). Defaults to true."},
			},
			Required: []string{"zone_id", "type", "name", "content"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		zoneID := stringArg(args, "zone_id", "")
		if zoneID == "" {
			return "", fmt.Errorf("zone_id is required")
		}
		proxied := true
		if p, ok := args["proxied"].(bool); ok {
			proxied = p
		}
		payload := map[string]any{
			"type":    stringArg(args, "type", "CNAME"),
			"name":    stringArg(args, "name", ""),
			"content": stringArg(args, "content", ""),
			"proxied": proxied,
			"ttl":     1,
		}
		data, code, err := client.post(ctx, "/api/v1/cloudflare/domains/"+zoneID+"/dns", payload)
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "cloudflare_delete_dns",
		Description: "Delete a DNS record from a Cloudflare zone.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"zone_id":   {Type: "string", Description: "Cloudflare Zone ID."},
				"record_id": {Type: "string", Description: "DNS Record ID to delete."},
			},
			Required: []string{"zone_id", "record_id"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		zoneID := stringArg(args, "zone_id", "")
		recordID := stringArg(args, "record_id", "")
		if zoneID == "" || recordID == "" {
			return "", fmt.Errorf("zone_id and record_id are required")
		}
		data, code, err := client.delete(ctx, fmt.Sprintf("/api/v1/cloudflare/domains/%s/dns/%s", zoneID, recordID))
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "cloudflare_ensure_dns_cname",
		Description: "Automatically create or update a Cloudflare DNS CNAME pointing an ingress hostname (e.g. test.aknalre.my.id) to a Cloudflare tunnel. Overwrites conflicting A/AAAA records automatically.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"hostname":  {Type: "string", Description: "The public ingress hostname to point (e.g. test.aknalre.my.id)."},
				"tunnel_id": {Type: "string", Description: "Optional: Cloudflare tunnel ID. If omitted, automatically uses the active tunnel in Reneo."},
			},
			Required: []string{"hostname"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		hostname := strings.TrimSpace(stringArg(args, "hostname", ""))
		if hostname == "" {
			return "", fmt.Errorf("hostname is required")
		}
		tunnelID := strings.TrimSpace(stringArg(args, "tunnel_id", ""))

		// 1. Get zones to match root domain
		zonesData, code, err := client.get(ctx, "/api/v1/cloudflare/domains")
		if err != nil || code >= 400 {
			return "", fmt.Errorf("failed to fetch Cloudflare zones: %s", string(zonesData))
		}
		var zones []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		if err := json.Unmarshal(zonesData, &zones); err != nil || len(zones) == 0 {
			return "", fmt.Errorf("no active Cloudflare domains found in Reneo")
		}

		// Find best matching zone for hostname (e.g. aknalre.my.id matches test.aknalre.my.id)
		var targetZoneID string
		for _, z := range zones {
			if strings.EqualFold(hostname, z.Name) || strings.HasSuffix(strings.ToLower(hostname), "."+strings.ToLower(z.Name)) {
				targetZoneID = z.ID
				break
			}
		}
		if targetZoneID == "" {
			return "", fmt.Errorf("could not find a matching Cloudflare zone for hostname %q in connected domains", hostname)
		}

		// 2. If tunnelID not provided, fetch from tunnel-profiles
		if tunnelID == "" {
			profData, pCode, pErr := client.get(ctx, "/api/v1/cloudflare/tunnel-profiles")
			if pErr == nil && pCode < 400 {
				var profiles []struct {
					ID       string `json:"id"`
					TunnelID string `json:"tunnelId"`
				}
				if json.Unmarshal(profData, &profiles) == nil {
					for _, p := range profiles {
						candidate := p.ID
						if candidate == "" {
							candidate = p.TunnelID
						}
						if candidate != "" && candidate != "pending" {
							tunnelID = candidate
							break
						}
					}
				}
			}
		}
		if tunnelID == "" {
			return "", fmt.Errorf("no tunnel_id provided and no active tunnel profile found")
		}

		// 3. Check for existing DNS records for this hostname (A, AAAA, or CNAME)
		cnameContent := fmt.Sprintf("%s.cfargotunnel.com", tunnelID)
		payload := map[string]any{
			"type":    "CNAME",
			"name":    hostname,
			"content": cnameContent,
			"proxied": true,
			"ttl":     1,
		}

		existingData, eCode, eErr := client.get(ctx, "/api/v1/cloudflare/domains/"+targetZoneID+"/dns")
		if eErr == nil && eCode < 400 {
			var resp struct {
				Items []struct {
					ID      string `json:"id"`
					Type    string `json:"type"`
					Name    string `json:"name"`
					Content string `json:"content"`
				} `json:"items"`
			}
			if json.Unmarshal(existingData, &resp) == nil {
				for _, it := range resp.Items {
					if strings.EqualFold(it.Name, hostname) {
						if it.Type == "CNAME" && it.Content == cnameContent {
							return jsonResponseText(map[string]any{
								"ok":      true,
								"status":  "already_configured",
								"message": fmt.Sprintf("Hostname %s is already pointing to tunnel %s", hostname, tunnelID),
							})
						}
						// Update existing record (convert A/AAAA/old CNAME to new CNAME)
						data, putCode, putErr := client.put(ctx, fmt.Sprintf("/api/v1/cloudflare/domains/%s/dns/%s", targetZoneID, it.ID), payload)
						return apiResult(data, putCode, putErr)
					}
				}
			}
		}

		// 4. Create new CNAME record if none existed
		data, cCode, cErr := client.post(ctx, "/api/v1/cloudflare/domains/"+targetZoneID+"/dns", payload)
		return apiResult(data, cCode, cErr)
	})

	s.Register(Tool{
		Name:        "cloudflare_create_tunnel_route",
		Description: "Create a Cloudflare Tunnel ingress route and automatically configure DNS CNAME in Cloudflare. Connects a subdomain to an internal port (e.g. test.aknalre.my.id -> http://localhost:8891).",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"name":        {Type: "string", Description: "Human-readable label for this route (e.g. 'Hello Static Page')."},
				"hostname":    {Type: "string", Description: "Full hostname (e.g. 'test.aknalre.my.id')."},
				"target_port": {Type: "string", Description: "Internal port number (e.g. '8891' or '8080')."},
				"target_ip":   {Type: "string", Description: "Optional target host (defaults to 'localhost').", Default: "localhost"},
				"protocol":    {Type: "string", Description: "Optional protocol (defaults to 'http').", Default: "http"},
				"tunnel_id":   {Type: "string", Description: "Optional Cloudflare tunnel profile ID. Defaults to active profile."},
			},
			Required: []string{"hostname", "target_port"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		hostname := strings.TrimSpace(stringArg(args, "hostname", ""))
		targetPort := strings.TrimSpace(stringArg(args, "target_port", ""))
		if hostname == "" || targetPort == "" {
			return "", fmt.Errorf("hostname and target_port are required")
		}
		name := strings.TrimSpace(stringArg(args, "name", hostname))
		targetIP := strings.TrimSpace(stringArg(args, "target_ip", "localhost"))
		protocol := strings.TrimSpace(stringArg(args, "protocol", "http"))
		tunnelID := strings.TrimSpace(stringArg(args, "tunnel_id", ""))

		// Parse domain and subdomain
		parts := strings.Split(hostname, ".")
		if len(parts) < 2 {
			return "", fmt.Errorf("invalid hostname format: %s", hostname)
		}

		// Find best matching root domain from zones
		zonesData, code, err := client.get(ctx, "/api/v1/cloudflare/domains")
		if err != nil || code >= 400 {
			return "", fmt.Errorf("failed to fetch Cloudflare zones: %s", string(zonesData))
		}
		var zones []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		_ = json.Unmarshal(zonesData, &zones)

		var targetZoneID string
		var rootDomain string
		var subdomain string

		for _, z := range zones {
			if strings.EqualFold(hostname, z.Name) {
				targetZoneID = z.ID
				rootDomain = z.Name
				subdomain = "@"
				break
			} else if strings.HasSuffix(strings.ToLower(hostname), "."+strings.ToLower(z.Name)) {
				targetZoneID = z.ID
				rootDomain = z.Name
				subdomain = strings.TrimSuffix(strings.ToLower(hostname), "."+strings.ToLower(z.Name))
				break
			}
		}

		if rootDomain == "" {
			if len(parts) >= 3 {
				subdomain = parts[0]
				rootDomain = strings.Join(parts[1:], ".")
			} else {
				subdomain = "@"
				rootDomain = hostname
			}
		}

		payload := map[string]any{
			"name":      name,
			"domain":    rootDomain,
			"subdomain": subdomain,
			"protocol":  protocol,
			"ip":        targetIP,
			"port":      targetPort,
			"zoneId":    targetZoneID,
			"profileId": tunnelID,
		}

		data, pCode, pErr := client.post(ctx, "/api/v1/tunnels", payload)
		return apiResult(data, pCode, pErr)
	})
}
