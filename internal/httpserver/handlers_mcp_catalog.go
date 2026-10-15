package httpserver

import (
	"net/http"
	"sort"
	"strings"
	"sync"

	"github.com/friskipradana/panel-desktop-ui/internal/mcp"
)

type mcpCatalogTool struct {
	Name   string `json:"name"`
	Group  string `json:"group"`
	Access string `json:"access"`
	Kind   string `json:"kind"`
	Desc   string `json:"desc"`
}

var (
	mcpCatalogOnce  sync.Once
	mcpCatalogCache map[string]any
)

// mcpToolGroup maps a tool name to the group shown on the MCP guide page.
func mcpToolGroup(name string) string {
	groups := []struct {
		id       string
		prefixes []string
	}{
		{"overview", []string{"server_overview", "whoami", "notification_", "api_token_"}},
		{"docker", []string{"docker_"}},
		{"files", []string{"file_"}},
		{"projects", []string{"project_", "quick_deploy", "tunnel_"}},
		{"cloudflare", []string{"cloudflare_"}},
		{"databases", []string{"db_"}},
		{"widgets", []string{"widget"}},
		{"users", []string{"user_", "docs_"}},
	}
	for _, g := range groups {
		for _, p := range g.prefixes {
			if strings.HasPrefix(name, p) {
				return g.id
			}
		}
	}
	return "system"
}

func firstSentence(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.Index(s, ". "); i > 0 {
		s = s[:i+1]
	}
	if len(s) > 170 {
		s = s[:167] + "..."
	}
	return s
}

func buildMCPCatalog(cfg mcp.Config) map[string]any {
	roles := map[string]map[string]mcp.Tool{}
	for role, token := range map[string]string{"anonymous": "", "user": "ypat_catalog", "superadmin": "ypat_catalog"} {
		srv := mcp.BuildServer(cfg, role, token)
		set := map[string]mcp.Tool{}
		for _, t := range srv.Tools() {
			set[t.Name] = t
		}
		roles[role] = set
	}

	anon, user, admin := roles["anonymous"], roles["user"], roles["superadmin"]
	tools := make([]mcpCatalogTool, 0, len(admin))
	for name, t := range admin {
		access := "admin"
		if _, ok := user[name]; ok {
			access = "user"
		}
		if _, ok := anon[name]; ok {
			access = "anonymous"
		}
		kind := "write"
		if t.Annotations != nil {
			switch {
			case t.Annotations.ReadOnlyHint:
				kind = "read"
			case t.Annotations.DestructiveHint:
				kind = "destroy"
			}
		}
		tools = append(tools, mcpCatalogTool{Name: name, Group: mcpToolGroup(name), Access: access, Kind: kind, Desc: firstSentence(t.Description)})
	}
	sort.Slice(tools, func(i, j int) bool { return tools[i].Name < tools[j].Name })

	return map[string]any{
		"tools":  tools,
		"counts": map[string]int{"anonymous": len(anon), "user": len(user), "admin": len(admin)},
	}
}

// handleMCPCatalog lists the tools the running agent really exposes per access level.
// It carries no secrets, so the public MCP guide can show the live catalog.
func (s *Server) handleMCPCatalog(w http.ResponseWriter, _ *http.Request) {
	mcpCatalogOnce.Do(func() {
		mcpCatalogCache = buildMCPCatalog(mcp.Config{PanelURL: "http://127.0.0.1:1", StateDir: s.cfg.StateDir, PortainerURL: s.cfg.PortainerURL})
	})
	w.Header().Set("Cache-Control", "public, max-age=300")
	s.writeJSON(w, http.StatusOK, mcpCatalogCache)
}
