package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
)

// Config holds configuration for the MCP server runtime.
type Config struct {
	// PanelURL is the base URL of the YPanel agent HTTP server.
	// Defaults to http://localhost:8787 if empty.
	PanelURL string

	// SessionToken is a valid ypanel_session cookie value for API calls.
	// Required for API-backed tools (projects, users, cloudflare).
	SessionToken string

	// PortainerURL is passed through to the system inspection helper.
	PortainerURL string

	// StateDir is the panel's data directory for storage usage stats.
	StateDir string
}

// Run starts the MCP stdio server and blocks until ctx is cancelled or stdin closes.
func Run(ctx context.Context, cfg Config) error {
	if cfg.PanelURL == "" {
		cfg.PanelURL = "http://localhost:8787"
	}
	if cfg.StateDir == "" {
		cfg.StateDir = "/var/lib/ypanel"
	}

	userRole := "anonymous"
	username := ""

	if cfg.SessionToken != "" {
		client := newAPIClient(cfg.PanelURL, cfg.SessionToken)
		data, statusCode, err := client.get(ctx, "/api/v1/me")
		if err != nil {
			log.Printf("[mcp] WARNING: Unable to reach panel API at %s: %v", cfg.PanelURL, err)
			log.Println("[mcp] Running with unauthenticated local tools only")
		} else if statusCode != 200 {
			log.Printf("[mcp] WARNING: Token rejected by panel API (HTTP %d): %s", statusCode, string(data))
			log.Println("[mcp] Token is invalid or expired. Running in unauthenticated mode.")
		} else {
			var me struct {
				ID       int64  `json:"id"`
				Username string `json:"username"`
				Role     string `json:"role"`
			}
			if err := json.Unmarshal(data, &me); err == nil && me.Role != "" {
				userRole = me.Role
				username = me.Username
				log.Printf("[mcp] Authenticated as user %q (role: %s)", username, userRole)
			}
		}
	} else {
		log.Println("[mcp] PANEL_MCP_TOKEN not set — running in unauthenticated mode with restricted tools")
	}

	srv := BuildServer(cfg, userRole, cfg.SessionToken)

	totalTools := len(srv.tools)
	log.Printf("[mcp] YPanel MCP server started (stdio transport, %d tools registered, role: %s)", totalTools, userRole)
	if username != "" {
		fmt.Fprintf(os.Stderr, "YPanel MCP server ready — %d tools available (user: %s, role: %s)\n", totalTools, username, userRole)
	} else {
		fmt.Fprintf(os.Stderr, "YPanel MCP server ready — %d tools available (role: %s)\n", totalTools, userRole)
	}

	return srv.Serve(ctx, os.Stdin)
}

// BuildServer initializes an MCP Server instance and registers tools according to user role and configuration.
func BuildServer(cfg Config, userRole string, rawToken string) *Server {
	if cfg.PanelURL == "" {
		cfg.PanelURL = "http://localhost:8787"
	}
	if cfg.StateDir == "" {
		cfg.StateDir = "/var/lib/ypanel"
	}

	isAdmin := userRole == "superadmin" || userRole == "admin"
	isUser := userRole == "user"

	srv := NewServer()

	// 1. System tools
	registerSystemTools(srv, systemConfig{
		PortainerURL: cfg.PortainerURL,
		StateDir:     cfg.StateDir,
	})

	// 2. Docker tools (write/management only for admins; read-only for user/anon)
	registerDockerTools(srv, isAdmin)

	// 3. File tools (write only for admins; read-only for user/anon)
	registerFileTools(srv, isAdmin)

	// 4. Terminal tools (root/shell exec only for superadmin/admin)
	if isAdmin {
		registerTerminalTools(srv)
		registerOpsTools(srv)
	}

	// 5. API-backed tools (requires valid account token)
	effectiveToken := rawToken
	if effectiveToken == "" {
		effectiveToken = cfg.SessionToken
	}
	if effectiveToken != "" && (isAdmin || isUser) {
		client := newAPIClient(cfg.PanelURL, effectiveToken)
		registerProjectTools(srv, client)
		registerCloudflareTools(srv, client)
		if isAdmin {
			registerUserTools(srv, client)
			registerWorkflowTools(srv, client, cfg)
		}
		// Catalog of REST-backed tools (docker, files, tunnels, docs, notifications, ...)
		registerCatalogTools(srv, client, isAdmin)
		registerCustomTools(srv, client, isAdmin)
	}

	return srv
}
