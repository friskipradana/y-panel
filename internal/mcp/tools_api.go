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
		Description: "List all YPanel projects (web/app projects managed by the panel) with their status.",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		data, code, err := client.get(ctx, "/api/v1/projects")
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "project_get",
		Description: "Get detailed information about a specific YPanel project.",
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
		Description: "Start a YPanel project.",
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
		Description: "Stop a running YPanel project.",
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
		Description: "List all YPanel users with their roles, status, and quota info.",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		data, code, err := client.get(ctx, "/api/v1/users")
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "user_get",
		Description: "Get a single YPanel user by ID.",
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
		Description: "Suspend a YPanel user account (prevent login).",
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
		Description: "Activate a suspended YPanel user account.",
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
		Description: "List all Cloudflare domains (zones) connected to YPanel.",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		data, code, err := client.get(ctx, "/api/v1/cloudflare/domains")
		return apiResult(data, code, err)
	})

	s.Register(Tool{
		Name:        "cloudflare_list_dns",
		Description: "List DNS records for a Cloudflare zone managed by YPanel.",
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
		Description: "List all Cloudflare tunnel profiles configured in YPanel.",
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
		Description: "Create a DNS record (CNAME, A, AAAA, TXT) in Cloudflare for a domain/zone managed by YPanel.",
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
		Name:        "cloudflare_ensure_dns_cname",
		Description: "Automatically create or update a Cloudflare DNS CNAME pointing an ingress hostname (e.g. antrian.aknalre.my.id) to a Cloudflare tunnel.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"hostname":  {Type: "string", Description: "The public ingress hostname to point (e.g. antrian.aknalre.my.id)."},
				"tunnel_id": {Type: "string", Description: "Optional: Cloudflare tunnel ID. If omitted, automatically uses the active tunnel in YPanel."},
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
			return "", fmt.Errorf("no active Cloudflare domains found in YPanel")
		}

		// Find best matching zone for hostname (e.g. aknalre.my.id matches antrian.aknalre.my.id)
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
					TunnelID string `json:"tunnelId"`
				}
				if json.Unmarshal(profData, &profiles) == nil && len(profiles) > 0 {
					tunnelID = profiles[0].TunnelID
				}
			}
		}
		if tunnelID == "" {
			return "", fmt.Errorf("no tunnel_id provided and no active tunnel profile found")
		}

		// 3. Create or update CNAME
		cnameContent := fmt.Sprintf("%s.cfargotunnel.com", tunnelID)
		payload := map[string]any{
			"type":    "CNAME",
			"name":    hostname,
			"content": cnameContent,
			"proxied": true,
			"ttl":     1,
		}
		data, cCode, cErr := client.post(ctx, "/api/v1/cloudflare/domains/"+targetZoneID+"/dns", payload)
		return apiResult(data, cCode, cErr)
	})
}
