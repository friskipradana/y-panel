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
				Version: "1.0.0",
			},
			Capabilities: ServerCapability{
				Tools: &ToolsCapability{},
			},
		}
		return &Response{JSONRPC: "2.0", ID: req.ID, Result: result}

	case "initialized":
		return nil

	case "ping":
		return &Response{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{}}

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

		s.mu.Lock()
		handler, ok := s.handlers[params.Name]
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
