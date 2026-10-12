package httpserver

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/mcp"
)

// handleMCP handles HTTP transport for the Model Context Protocol (MCP) server.
// It supports both Streamable HTTP POST (JSON-RPC 2.0) and SSE (Server-Sent Events) GET,
// compatible with Hermes Agent, OpenClaw, Claude, Cursor, and any MCP HTTP client.
// Authentication is accepted via query param (?key=... or ?token=...) or Bearer header.
func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	// ── CORS Headers ───────────────────────────────────────────────────────────
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// ── 1. Token Extraction (Query param ?key=... or ?token=... or Bearer) ───
	rawToken := ""
	if authHeader := strings.TrimSpace(r.Header.Get("Authorization")); strings.HasPrefix(authHeader, "Bearer ") {
		rawToken = strings.TrimPrefix(authHeader, "Bearer ")
	} else if qKey := strings.TrimSpace(r.URL.Query().Get("key")); qKey != "" {
		rawToken = qKey
	} else if qToken := strings.TrimSpace(r.URL.Query().Get("token")); qToken != "" {
		rawToken = qToken
	}

	// ── 2. Authenticate User & Determine RBAC Role ────────────────────────────
	userRole := "anonymous"
	username := ""
	if rawToken != "" {
		if !strings.HasPrefix(rawToken, "ypat_") {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{
				"error": "invalid API token format: must start with ypat_",
			})
			return
		}

		tokenHash := hashAPIToken(rawToken)
		u, _, ok := s.database.GetAPITokenUser(tokenHash)
		if !ok || u == nil {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{
				"error": "invalid or expired API token",
			})
			return
		}
		userRole = u.Role
		username = u.Username
	}

	// ── 3. Build MCP Server Runtime Instance ─────────────────────────────────
	internalURL := "http://127.0.0.1"
	if s.cfg.BindAddr != "" {
		if strings.HasPrefix(s.cfg.BindAddr, ":") {
			internalURL += s.cfg.BindAddr
		} else {
			internalURL = "http://" + s.cfg.BindAddr
		}
	} else {
		internalURL += ":8787"
	}

	mcpCfg := mcp.Config{
		PanelURL:     internalURL,
		SessionToken: rawToken,
		StateDir:     s.cfg.StateDir,
		PortainerURL: s.cfg.PortainerURL,
	}

	srv := mcp.BuildServer(mcpCfg, userRole, rawToken)

	// Determine client-facing base URL
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	host := r.Host
	if fwdHost := r.Header.Get("X-Forwarded-Host"); fwdHost != "" {
		host = fwdHost
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, host)
	mcpEndpointURL := fmt.Sprintf("%s/mcp", baseURL)
	if rawToken != "" {
		mcpEndpointURL = fmt.Sprintf("%s/mcp?key=%s", baseURL, rawToken)
	}

	// ── 4. Handle GET Method (SSE Stream or Discovery JSON) ───────────────────
	if r.Method == http.MethodGet {
		accept := r.Header.Get("Accept")
		if strings.Contains(accept, "text/event-stream") {
			// Server-Sent Events (SSE) Transport
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Connection", "keep-alive")

			flusher, ok := w.(http.Flusher)
			if !ok {
				http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
				return
			}

			// Send endpoint event for client POST redirection (standard MCP SSE pattern)
			postEndpoint := "/mcp"
			if rawToken != "" {
				postEndpoint = "/mcp?key=" + rawToken
			}
			fmt.Fprintf(w, "event: endpoint\r\ndata: %s\r\n\r\n", postEndpoint)
			flusher.Flush()

			// Keep alive until client closes connection
			ticker := time.NewTicker(25 * time.Second)
			defer ticker.Stop()

			for {
				select {
				case <-r.Context().Done():
					return
				case <-ticker.C:
					fmt.Fprintf(w, ": keepalive\r\n\r\n")
					flusher.Flush()
				}
			}
		}

		// Standard Discovery JSON (Browser / cURL inspection)
		hermesCLI := fmt.Sprintf("hermes mcp add YPANEL --url \"%s\"", mcpEndpointURL)
		openclawCLI := fmt.Sprintf("openclaw mcp add YPANEL --transport streamable-http --url \"%s\"", mcpEndpointURL)

		tools := srv.Tools()
		toolNames := make([]string, len(tools))
		for i, t := range tools {
			toolNames[i] = t.Name
		}

		s.writeJSON(w, http.StatusOK, jsonResponse{
			"service":          "YPanel Model Context Protocol (MCP) Server",
			"status":           "active",
			"protocol_version": mcp.MCPProtocolVersion,
			"authenticated":    userRole != "anonymous",
			"username":         username,
			"role":             userRole,
			"tools_count":      len(tools),
			"tools":            toolNames,
			"integrations": jsonResponse{
				"hermes_cli":   hermesCLI,
				"openclaw_cli": openclawCLI,
				"mcp_url":      mcpEndpointURL,
			},
			"transport": []string{"streamable-http", "sse", "stdio"},
		})
		return
	}

	// ── 5. Handle POST Method (JSON-RPC 2.0 Dispatcher) ──────────────────────
	if r.Method == http.MethodPost {
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4*1024*1024))
		if err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "failed to read request body"})
			return
		}

		// Support Batch Request (array of requests) or Single Request
		body = []byte(strings.TrimSpace(string(body)))
		if len(body) > 0 && body[0] == '[' {
			var batch []mcp.Request
			if err := json.Unmarshal(body, &batch); err != nil {
				s.writeJSON(w, http.StatusBadRequest, mcp.Response{
					JSONRPC: "2.0",
					Error:   &mcp.Error{Code: mcp.ErrCodeParseError, Message: "parse error"},
				})
				return
			}

			responses := make([]mcp.Response, 0, len(batch))
			for _, req := range batch {
				resp := srv.ProcessRequest(r.Context(), req)
				if resp != nil {
					responses = append(responses, *resp)
				}
			}
			s.writeJSON(w, http.StatusOK, responses)
			return
		}

		var req mcp.Request
		if err := json.Unmarshal(body, &req); err != nil {
			s.writeJSON(w, http.StatusBadRequest, mcp.Response{
				JSONRPC: "2.0",
				Error:   &mcp.Error{Code: mcp.ErrCodeParseError, Message: "parse error"},
			})
			return
		}

		resp := srv.ProcessRequest(r.Context(), req)
		if resp == nil {
			// Client notification (no response needed)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		s.writeJSON(w, http.StatusOK, resp)
		return
	}

	http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
}
