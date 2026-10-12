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
		return "", fmt.Errorf("API error %d: %s", statusCode, strings.TrimSpace(string(data)))
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
}
