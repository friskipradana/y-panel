package mcp

import (
	"github.com/friskipradana/panel-desktop-ui/internal/runtimepath"
	"context"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// Declarative REST tools: one apiSpec describes a panel API call and is turned into
// an MCP tool (schema + handler). Calls go through the panel API with the caller's
// own token, so ownership, quotas and role checks stay enforced server-side.

type paramIn int

const (
	inBody paramIn = iota
	inPath
	inQuery
)

type apiParam struct {
	Name     string
	In       paramIn
	Type     string // string | integer | boolean | array | object
	Desc     string
	Required bool
	Enum     []string
	Default  any
	Items    *Property
	// Key is the JSON/query key sent to the API when it differs from Name
	Key string
	// Flatten merges an object argument into the body instead of nesting it under Key
	Flatten bool
	// Convert adapts the raw argument before it is sent (e.g. octal mode strings)
	Convert func(v any) (any, error)
}

type apiSpec struct {
	Name      string
	Title     string
	Desc      string
	Method    string
	Path      string // may contain {param} placeholders matching path params
	Params    []apiParam
	AdminOnly bool
	// SuperOnly tools act on the host or the panel itself: superadmin only
	SuperOnly bool
	// Hint: "read" (default for GET), "write", or "destroy"
	Hint string
}

func (p apiParam) key() string {
	if p.Key != "" {
		return p.Key
	}
	return p.Name
}

func (sp apiSpec) tool() Tool {
	props := map[string]Property{}
	required := []string{}
	for _, p := range sp.Params {
		props[p.Name] = Property{Type: p.Type, Description: p.Desc, Enum: p.Enum, Default: p.Default, Items: p.Items}
		if p.Required {
			required = append(required, p.Name)
		}
	}

	hint := sp.Hint
	if hint == "" {
		if sp.Method == "GET" {
			hint = "read"
		} else if sp.Method == "DELETE" {
			hint = "destroy"
		} else {
			hint = "write"
		}
	}
	ann := &ToolAnnotations{
		Title:           sp.Title,
		ReadOnlyHint:    hint == "read",
		DestructiveHint: hint == "destroy",
		IdempotentHint:  hint == "read" || sp.Method == "PUT" || sp.Method == "DELETE",
		OpenWorldHint:   false,
	}

	return Tool{
		Name:        sp.Name,
		Description: sp.Desc,
		InputSchema: InputSchema{Type: "object", Properties: props, Required: required},
		Annotations: ann,
	}
}

func coerce(p apiParam, raw any) (any, error) {
	if p.Convert != nil {
		return p.Convert(raw)
	}
	switch p.Type {
	case "integer":
		switch v := raw.(type) {
		case float64:
			return int64(v), nil
		case int:
			return int64(v), nil
		case string:
			n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
			if err != nil {
				return nil, fmt.Errorf("parameter %q must be an integer", p.Name)
			}
			return n, nil
		}
		return nil, fmt.Errorf("parameter %q must be an integer", p.Name)
	case "boolean":
		switch v := raw.(type) {
		case bool:
			return v, nil
		case string:
			switch strings.ToLower(strings.TrimSpace(v)) {
			case "true", "1", "yes":
				return true, nil
			case "false", "0", "no":
				return false, nil
			}
		}
		return nil, fmt.Errorf("parameter %q must be true or false", p.Name)
	case "string":
		if s, ok := raw.(string); ok {
			return strings.TrimSpace(s), nil
		}
		return fmt.Sprint(raw), nil
	}
	return raw, nil
}

// buildRequest resolves path placeholders, query string and JSON body from tool args.
func (sp apiSpec) buildRequest(args map[string]any) (path string, body map[string]any, err error) {
	path = sp.Path
	query := url.Values{}
	body = map[string]any{}

	for _, p := range sp.Params {
		raw, present := args[p.Name]
		if present {
			if s, ok := raw.(string); ok && strings.TrimSpace(s) == "" {
				present = false
			}
		}
		if !present {
			if p.Required {
				return "", nil, fmt.Errorf("parameter %q is required", p.Name)
			}
			continue
		}
		value, cerr := coerce(p, raw)
		if cerr != nil {
			return "", nil, cerr
		}
		switch p.In {
		case inPath:
			path = strings.ReplaceAll(path, "{"+p.key()+"}", url.PathEscape(fmt.Sprint(value)))
		case inQuery:
			query.Set(p.key(), fmt.Sprint(value))
		default:
			if obj, ok := value.(map[string]any); ok && p.Flatten {
				for k, v := range obj {
					body[k] = v
				}
				continue
			}
			body[p.key()] = value
		}
	}

	if strings.Contains(path, "{") {
		return "", nil, fmt.Errorf("unresolved path parameter in %s", path)
	}
	if enc := query.Encode(); enc != "" {
		path += "?" + enc
	}
	return path, body, nil
}

func (sp apiSpec) handler(client *apiClient) ToolHandler {
	return func(ctx context.Context, args map[string]any) (string, error) {
		path, body, err := sp.buildRequest(args)
		if err != nil {
			return "", err
		}
		var payload any
		if sp.Method != "GET" && sp.Method != "DELETE" {
			payload = body // always send an object, even when empty
		}
		data, code, derr := client.do(ctx, sp.Method, path, payload)
		return apiResult(data, code, derr)
	}
}

func registerSpecs(s *Server, client *apiClient, isAdmin bool, specs []apiSpec) {
	for _, sp := range specs {
		if sp.AdminOnly && !isAdmin {
			continue
		}
		if sp.SuperOnly && !s.superadmin {
			continue
		}
		s.Register(sp.tool(), sp.handler(client))
	}
}

// inferAnnotations gives hand-written tools sensible behavior hints from their name.
func inferAnnotations(name string) *ToolAnnotations {
	has := func(words ...string) bool {
		for _, w := range words {
			if strings.Contains(name, w) {
				return true
			}
		}
		return false
	}
	switch {
	case has("_delete", "_remove", "_revoke", "_prune", "terminal_exec", "_kill"):
		return &ToolAnnotations{DestructiveHint: true}
	case has("_list", "_get", "_read", "_logs", "_info", "_status", "_history", "_ping", "_summary", "_overview", "whoami", "_inspect"):
		return &ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true}
	}
	return &ToolAnnotations{}
}

// serverVersion reports the installed panel version (written by the installer).
func serverVersion() string {
	if v := strings.TrimSpace(os.Getenv("PANEL_VERSION")); v != "" {
		return v
	}
	for _, path := range []string{runtimepath.VersionFile(), "VERSION"} {
		if b, err := os.ReadFile(path); err == nil {
			if v := strings.TrimSpace(string(b)); v != "" {
				return v
			}
		}
	}
	return "dev"
}

// helpers to build params tersely
func pathParam(name, desc string) apiParam {
	return apiParam{Name: name, In: inPath, Type: "string", Desc: desc, Required: true}
}

func strParam(name, desc string, required bool) apiParam {
	return apiParam{Name: name, In: inBody, Type: "string", Desc: desc, Required: required}
}

func intParam(name, desc string, required bool) apiParam {
	return apiParam{Name: name, In: inBody, Type: "integer", Desc: desc, Required: required}
}

func boolParam(name, desc string) apiParam {
	return apiParam{Name: name, In: inBody, Type: "boolean", Desc: desc}
}

func queryParam(name, typ, desc string) apiParam {
	return apiParam{Name: name, In: inQuery, Type: typ, Desc: desc}
}
