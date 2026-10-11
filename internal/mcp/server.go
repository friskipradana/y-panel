package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
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

	switch req.Method {
	case "initialize":
		return s.handleInitialize(req)
	case "initialized":
		// Client notification — no response needed
		return nil
	case "ping":
		return s.sendResult(req.ID, map[string]any{})
	case "tools/list":
		return s.handleToolsList(req)
	case "tools/call":
		return s.handleToolsCall(ctx, req)
	default:
		return s.sendError(req.ID, ErrCodeMethodNotFound, fmt.Sprintf("method not found: %s", req.Method))
	}
}

func (s *Server) handleInitialize(req Request) error {
	result := InitializeResult{
		ProtocolVersion: MCPProtocolVersion,
		ServerInfo: ServerInfo{
			Name:    "ypanel",
			Version: "1.0.0",
		},
		Capabilities: ServerCapability{
			Tools: &ToolsCapability{},
		},
	}
	return s.sendResult(req.ID, result)
}

func (s *Server) handleToolsList(req Request) error {
	s.mu.Lock()
	tools := make([]Tool, len(s.tools))
	copy(tools, s.tools)
	s.mu.Unlock()

	return s.sendResult(req.ID, ListToolsResult{Tools: tools})
}

func (s *Server) handleToolsCall(ctx context.Context, req Request) error {
	var params CallToolParams
	if req.Params != nil {
		b, err := json.Marshal(req.Params)
		if err != nil {
			return s.sendError(req.ID, ErrCodeInvalidParams, "invalid params")
		}
		if err := json.Unmarshal(b, &params); err != nil {
			return s.sendError(req.ID, ErrCodeInvalidParams, "invalid params")
		}
	}

	s.mu.Lock()
	handler, ok := s.handlers[params.Name]
	s.mu.Unlock()

	if !ok {
		return s.sendResult(req.ID, CallToolResult{
			IsError: true,
			Content: []ContentItem{{Type: "text", Text: fmt.Sprintf("tool not found: %s", params.Name)}},
		})
	}

	if params.Arguments == nil {
		params.Arguments = map[string]any{}
	}

	text, err := handler(ctx, params.Arguments)
	if err != nil {
		return s.sendResult(req.ID, CallToolResult{
			IsError: true,
			Content: []ContentItem{{Type: "text", Text: err.Error()}},
		})
	}

	return s.sendResult(req.ID, CallToolResult{
		Content: []ContentItem{{Type: "text", Text: text}},
	})
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
