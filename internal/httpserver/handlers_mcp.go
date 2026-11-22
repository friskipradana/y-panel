package httpserver

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
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

	// ── 1. Token Extraction & Authentication ─────────────────────────────────
	// Check Authorization header and query params (?key=, ?token=).
	// If multiple candidates are provided (e.g. stale Bearer in .env but active key in query),
	// validate candidates and use the first active valid token.
	candidates := make([]string, 0, 3)
	if authHeader := strings.TrimSpace(r.Header.Get("Authorization")); strings.HasPrefix(authHeader, "Bearer ") {
		candidates = append(candidates, strings.TrimPrefix(authHeader, "Bearer "))
	}
	if qKey := strings.TrimSpace(r.URL.Query().Get("key")); qKey != "" {
		candidates = append(candidates, qKey)
	}
	if qToken := strings.TrimSpace(r.URL.Query().Get("token")); qToken != "" {
		candidates = append(candidates, qToken)
	}

	rawToken := ""
	userRole := "anonymous"
	username := ""

	for _, token := range candidates {
		token = strings.TrimSpace(token)
		if !strings.HasPrefix(token, "ypat_") {
			continue
		}
		tokenHash := hashAPIToken(token)
		u, _, ok := s.database.GetAPITokenUser(tokenHash)
		if ok && u != nil {
			rawToken = token
			userRole = u.Role
			username = u.Username
			break
		}
	}

	if len(candidates) > 0 && rawToken == "" {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{
			"error": "invalid or expired API token",
		})
		return
	}

	// ── 3. Build MCP Server Runtime Instance ─────────────────────────────────
	port := "8787"
	if s.cfg.BindAddr != "" {
		if _, p, err := net.SplitHostPort(s.cfg.BindAddr); err == nil && p != "" {
			port = p
		} else if idx := strings.LastIndex(s.cfg.BindAddr, ":"); idx != -1 {
			port = s.cfg.BindAddr[idx+1:]
		}
	}
	internalURL := fmt.Sprintf("http://127.0.0.1:%s", port)

	mcpCfg := mcp.Config{
		PanelURL:     internalURL,
		SessionToken: rawToken,
		StateDir:     s.cfg.StateDir,
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
		hermesCLI := fmt.Sprintf("hermes mcp add RENEO --url \"%s\"", mcpEndpointURL)
		openclawCLI := fmt.Sprintf("openclaw mcp add RENEO --transport streamable-http --url \"%s\"", mcpEndpointURL)

		tools := srv.Tools()
		toolNames := make([]string, len(tools))
		for i, t := range tools {
			toolNames[i] = t.Name
		}

		s.writeJSON(w, http.StatusOK, jsonResponse{
			"service":          "Reneo Model Context Protocol (MCP) Server",
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
