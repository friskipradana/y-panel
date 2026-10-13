package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"sync"
)

// Server is the MCP stdio server.
type Server struct {
	tools    []Tool
	handlers map[string]ToolHandler
	mu       sync.Mutex
	out      *json.Encoder
	outMu    sync.Mutex
}

// ToolHandler is called when a tool is invoked.
type ToolHandler func(ctx context.Context, args map[string]any) (string, error)

// NewServer creates a new MCP server that reads from stdin and writes to stdout.
func NewServer() *Server {
	return &Server{
		tools:    make([]Tool, 0),
		handlers: make(map[string]ToolHandler),
		out:      json.NewEncoder(os.Stdout),
	}
}

// Register adds a tool and its handler to the server.
func (s *Server) Register(tool Tool, handler ToolHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.handlers[tool.Name]; exists {
		log.Printf("[mcp] duplicate tool %q ignored", tool.Name)
		return
	}
	if tool.Annotations == nil {
		tool.Annotations = inferAnnotations(tool.Name)
	}
	s.tools = append(s.tools, tool)
	s.handlers[tool.Name] = handler
}

// Serve reads JSON-RPC requests from r and writes responses to out.
func (s *Server) Serve(ctx context.Context, r io.Reader) error {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		if err := s.handleLine(ctx, line); err != nil {
			log.Printf("[mcp] handle error: %v", err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("mcp stdin scanner: %w", err)
	}
	return nil
}

func (s *Server) handleLine(ctx context.Context, raw []byte) error {
	var req Request
	if err := json.Unmarshal(raw, &req); err != nil {
		return s.sendError(nil, ErrCodeParseError, "parse error")
	}

	resp := s.ProcessRequest(ctx, req)
	if resp != nil {
		s.outMu.Lock()
		defer s.outMu.Unlock()
		return s.out.Encode(resp)
	}
	return nil
}

// ProcessRequest processes a single JSON-RPC request and returns the response object.
// Returns nil if the request is a notification (e.g. "initialized") which expects no response.
func (s *Server) ProcessRequest(ctx context.Context, req Request) *Response {
	switch req.Method {
	case "initialize":
		result := InitializeResult{
			ProtocolVersion: MCPProtocolVersion,
			ServerInfo: ServerInfo{
				Name:    "ypanel",
				Version: serverVersion(),
			},
			Capabilities: ServerCapability{
				Tools:     &ToolsCapability{},
				Resources: &ResourcesCapability{},
				Prompts:   &PromptsCapability{},
			},
		}
		return &Response{JSONRPC: "2.0", ID: req.ID, Result: result}

	case "initialized":
		return nil

	case "ping":
		return &Response{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{}}

	case "resources/list":
		resources := []Resource{
			{
				URI:         "system://status",
				Name:        "Host System Status & Hardware Resources",
				Description: "Realtime CPU, memory, uptime, disk usage, and Linux OS environment metrics.",
				MimeType:    "application/json",
			},
			{
				URI:         "docker://containers",
				Name:        "Docker Containers Snapshot",
				Description: "Live list of all Docker containers, health status, and listening ports.",
				MimeType:    "application/json",
			},
		}
		return &Response{JSONRPC: "2.0", ID: req.ID, Result: ListResourcesResult{Resources: resources}}

	case "resources/read":
		var params ReadResourceParams
		if req.Params != nil {
			if b, err := json.Marshal(req.Params); err == nil {
				_ = json.Unmarshal(b, &params)
			}
		}

		s.mu.Lock()
		sysHandler, hasSys := s.handlers["system_info"]
		dockerHandler, hasDocker := s.handlers["docker_list_containers"]
		s.mu.Unlock()

		var text string
		switch params.URI {
		case "system://status":
			if hasSys {
				text, _ = sysHandler(ctx, nil)
			}
		case "docker://containers":
			if hasDocker {
				text, _ = dockerHandler(ctx, nil)
			}
		default:
			return &Response{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   &Error{Code: ErrCodeInvalidParams, Message: fmt.Sprintf("resource not found: %s", params.URI)},
			}
		}

		return &Response{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: ReadResourceResult{
				Contents: []ResourceContent{
					{
						URI:      params.URI,
						MimeType: "application/json",
						Text:     text,
					},
				},
			},
		}

	case "prompts/list":
		prompts := []Prompt{
			{
				Name:        "diagnose-server",
				Description: "Thorough health check of VPS server: CPU, RAM, disk storage, and Docker containers.",
			},
			{
				Name:        "deploy-static-page",
				Description: "Guided automated deployment of an HTML page with public Cloudflare Tunnel ingress.",
				Arguments: []PromptArgument{
					{Name: "hostname", Description: "The public domain or subdomain (e.g. test.domain.com)", Required: true},
					{Name: "title", Description: "Page headline or title to display", Required: true},
				},
			},
			{
				Name:        "server-health-report",
				Description: "Concise status report: resources, Docker, projects needing attention, unread notifications and metric trends.",
			},
			{
				Name:        "troubleshoot-container",
				Description: "Find why a Docker container is failing: state, config, recent logs and likely cause.",
				Arguments: []PromptArgument{
					{Name: "container", Description: "Container ID or name", Required: true},
				},
			},
			{
				Name:        "monitor-host",
				Description: "Check reachability of a host and put a ping monitor widget on the desktop.",
				Arguments: []PromptArgument{
					{Name: "host", Description: "IP address or hostname", Required: true},
					{Name: "port", Description: "TCP port (omit for ICMP)", Required: false},
				},
			},
			{
				Name:        "audit-access",
				Description: "Review users, roles, quotas and API tokens and flag risky settings.",
			},
		}
		return &Response{JSONRPC: "2.0", ID: req.ID, Result: ListPromptsResult{Prompts: prompts}}

	case "prompts/get":
		var params GetPromptParams
		if req.Params != nil {
			if b, err := json.Marshal(req.Params); err == nil {
				_ = json.Unmarshal(b, &params)
			}
		}

		var desc string
		var msg string
		switch params.Name {
		case "diagnose-server":
			desc = "Perform full health check of the server"
			msg = "Run server_overview, then docker_list_containers and system_history. Report anything abnormal: high CPU/RAM/disk, stopped or unhealthy containers, projects needing attention."
		case "deploy-static-page":
			desc = "Deploy static HTML webpage"
			hostname := params.Arguments["hostname"]
			title := params.Arguments["title"]
			msg = fmt.Sprintf("Please use quick_deploy_static to deploy a clean HTML page for %s with title '%s'.", hostname, title)
		case "server-health-report":
			desc = "Server health report"
			msg = "Call server_overview and system_history. Write a short report: current CPU/RAM/disk and the trend over the last hour, Docker state, projects needing attention, unread notifications. End with a prioritized list of recommended actions. Do not change anything."
		case "troubleshoot-container":
			desc = "Troubleshoot a container"
			msg = fmt.Sprintf("Investigate container %q: docker_inspect_container for its config, docker_container_logs (tail 200) for errors, and docker_list_containers for its state. Explain the most likely cause and propose a fix. Ask before restarting or deleting anything.", params.Arguments["container"])
		case "monitor-host":
			desc = "Monitor a host"
			host := params.Arguments["host"]
			port := params.Arguments["port"]
			if port == "" {
				port = "0"
			}
			msg = fmt.Sprintf("Run ping_host for %s (port %s; 0 means ICMP). If it answers, add a ping widget with widget_add (type ping, config host=%s port=%s) and report the latency.", host, port, host, port)
		case "audit-access":
			desc = "Access audit"
			msg = "Use user_list, user_quota_get for each user, and api_token_list. Flag: superadmin/admin accounts that look unused, suspended users that still hold tokens, tokens without expiry, and quotas that are unlimited. Report only; do not modify accounts."
		default:
			return &Response{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   &Error{Code: ErrCodeInvalidParams, Message: fmt.Sprintf("prompt not found: %s", params.Name)},
			}
		}

		return &Response{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: GetPromptResult{
				Description: desc,
				Messages: []PromptMessage{
					{
						Role:    "user",
						Content: ContentItem{Type: "text", Text: msg},
					},
				},
			},
		}

	case "tools/list":
		s.mu.Lock()
		tools := make([]Tool, len(s.tools))
		copy(tools, s.tools)
		s.mu.Unlock()
		return &Response{JSONRPC: "2.0", ID: req.ID, Result: ListToolsResult{Tools: tools}}

	case "tools/call":
		var params CallToolParams
		if req.Params != nil {
			b, err := json.Marshal(req.Params)
			if err == nil {
				_ = json.Unmarshal(b, &params)
			}
		}

		// Normalize tool name by stripping MCP client prefixes (e.g. mcp__YPANEL__, ypanel__)
		cleanName := strings.TrimSpace(params.Name)
		if idx := strings.LastIndex(cleanName, "__"); idx != -1 {
			cleanName = cleanName[idx+2:]
		}
		cleanName = strings.TrimPrefix(cleanName, "ypanel_")
		cleanName = strings.TrimPrefix(cleanName, "ypanel__")

		s.mu.Lock()
		handler, ok := s.handlers[cleanName]
		s.mu.Unlock()

		if !ok {
			return &Response{
				JSONRPC: "2.0",
				ID:      req.ID,
				Result: CallToolResult{
					IsError: true,
					Content: []ContentItem{{Type: "text", Text: fmt.Sprintf("tool not found: %s", params.Name)}},
				},
			}
		}

		if params.Arguments == nil {
			params.Arguments = map[string]any{}
		}

		text, err := handler(ctx, params.Arguments)
		if err != nil {
			return &Response{
				JSONRPC: "2.0",
				ID:      req.ID,
				Result: CallToolResult{
					IsError: true,
					Content: []ContentItem{{Type: "text", Text: err.Error()}},
				},
			}
		}

		return &Response{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: CallToolResult{
				Content: []ContentItem{{Type: "text", Text: text}},
			},
		}

	default:
		return &Response{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &Error{Code: ErrCodeMethodNotFound, Message: fmt.Sprintf("method not found: %s", req.Method)},
		}
	}
}

// ToolCount returns the total number of registered tools.
func (s *Server) ToolCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.tools)
}

// Tools returns a snapshot slice of all registered tools.
func (s *Server) Tools() []Tool {
	s.mu.Lock()
	defer s.mu.Unlock()
	tools := make([]Tool, len(s.tools))
	copy(tools, s.tools)
	return tools
}

func (s *Server) sendResult(id any, result any) error {
	s.outMu.Lock()
	defer s.outMu.Unlock()
	return s.out.Encode(Response{
		JSONRPC: "2.0",
		ID:      id,
		Result:  result,
	})
}

func (s *Server) sendError(id any, code int, message string) error {
	s.outMu.Lock()
	defer s.outMu.Unlock()
	return s.out.Encode(Response{
		JSONRPC: "2.0",
		ID:      id,
		Error:   &Error{Code: code, Message: message},
	})
}
