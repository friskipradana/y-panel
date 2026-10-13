package httpserver

import (
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/mcp"
)

func TestBuildMCPCatalogCoversRoles(t *testing.T) {
	cat := buildMCPCatalog(mcp.Config{PanelURL: "http://127.0.0.1:1"})
	counts := cat["counts"].(map[string]int)
	if counts["admin"] <= counts["user"] || counts["user"] <= counts["anonymous"] || counts["anonymous"] == 0 {
		t.Fatalf("unexpected counts %+v", counts)
	}
	tools := cat["tools"].([]mcpCatalogTool)
	if len(tools) != counts["admin"] {
		t.Fatalf("tools %d != admin count %d", len(tools), counts["admin"])
	}
	seen := map[string]mcpCatalogTool{}
	for _, tl := range tools {
		seen[tl.Name] = tl
		if tl.Group == "" || tl.Desc == "" {
			t.Errorf("%s missing group/description", tl.Name)
		}
	}
	if seen["terminal_exec"].Access != "admin" || seen["system_info"].Access != "anonymous" {
		t.Errorf("access levels wrong: terminal_exec=%s system_info=%s", seen["terminal_exec"].Access, seen["system_info"].Access)
	}
	if seen["disk_cleanup"].Kind != "destroy" || seen["firewall_status"].Kind != "read" {
		t.Errorf("kinds wrong: %+v %+v", seen["disk_cleanup"], seen["firewall_status"])
	}
}
