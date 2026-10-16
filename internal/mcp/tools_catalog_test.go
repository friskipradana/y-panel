package mcp

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

var toolNameRe = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
var placeholderRe = regexp.MustCompile(`\{(\w+)\}`)

func TestCatalogSpecsAreWellFormed(t *testing.T) {
	seen := map[string]bool{}
	for _, sp := range catalogSpecs() {
		if !toolNameRe.MatchString(sp.Name) {
			t.Errorf("%s: invalid tool name", sp.Name)
		}
		if seen[sp.Name] {
			t.Errorf("%s: duplicate tool name", sp.Name)
		}
		seen[sp.Name] = true
		if strings.TrimSpace(sp.Desc) == "" {
			t.Errorf("%s: missing description", sp.Name)
		}

		pathKeys := map[string]bool{}
		for _, p := range sp.Params {
			if p.In == inPath {
				pathKeys[p.key()] = true
			}
			if p.Type == "array" && p.Items == nil {
				t.Errorf("%s.%s: array without items", sp.Name, p.Name)
			}
		}
		for _, m := range placeholderRe.FindAllStringSubmatch(sp.Path, -1) {
			if !pathKeys[m[1]] {
				t.Errorf("%s: placeholder {%s} has no path param", sp.Name, m[1])
			}
		}
		tool := sp.tool()
		for _, req := range tool.InputSchema.Required {
			if _, ok := tool.InputSchema.Properties[req]; !ok {
				t.Errorf("%s: required %q missing from properties", sp.Name, req)
			}
		}
	}
	if len(seen) < 40 {
		t.Errorf("expected a large catalog, got %d tools", len(seen))
	}
}

func specByName(t *testing.T, name string) apiSpec {
	t.Helper()
	for _, sp := range catalogSpecs() {
		if sp.Name == name {
			return sp
		}
	}
	t.Fatalf("spec %s not found", name)
	return apiSpec{}
}

func TestBuildRequestMapsPathQueryAndBody(t *testing.T) {
	path, body, err := specByName(t, "cloudflare_update_dns").buildRequest(map[string]any{
		"zone_id": "z 1", "record_id": "r2", "type": "A", "name": "app", "content": "1.2.3.4", "ttl": float64(1), "proxied": true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if path != "/api/v1/cloudflare/domains/z%201/dns/r2" {
		t.Errorf("path = %s", path)
	}
	if body["zoneId"] != nil || body["proxied"] != true || body["ttl"] != int64(1) {
		t.Errorf("body = %+v", body)
	}

	path, _, err = specByName(t, "system_history").buildRequest(map[string]any{"since": float64(1700000000000)})
	if err != nil || path != "/api/v1/system/history?since=1700000000000" {
		t.Errorf("history path = %q err=%v", path, err)
	}
}

func TestBuildRequestValidation(t *testing.T) {
	if _, _, err := specByName(t, "ping_host").buildRequest(map[string]any{}); err == nil {
		t.Error("expected missing host error")
	}
	if _, _, err := specByName(t, "file_chmod").buildRequest(map[string]any{"path": "/a", "mode": "999"}); err == nil {
		t.Error("expected invalid octal error")
	}
	_, body, err := specByName(t, "file_chmod").buildRequest(map[string]any{"path": "/a", "mode": "755"})
	if err != nil || body["mode"] != uint64(0o755) {
		t.Errorf("mode body = %+v err=%v", body, err)
	}
	_, body, err = specByName(t, "user_update").buildRequest(map[string]any{"id": "4", "fields": map[string]any{"displayName": "Ana"}})
	if err != nil || body["displayName"] != "Ana" || body["fields"] != nil {
		t.Errorf("flatten body = %+v err=%v", body, err)
	}
}

func TestDeclarativeHandlerCallsPanelAPI(t *testing.T) {
	var gotMethod, gotPath, gotAuth string
	var gotBody map[string]any
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath, gotAuth = r.Method, r.URL.RequestURI(), r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	client := newAPIClient(ts.URL, "ypat_test")
	h := specByName(t, "ping_host").handler(client)
	out, err := h(context.Background(), map[string]any{"host": "1.1.1.1", "port": "443"})
	if err != nil || !strings.Contains(out, `"ok": true`) {
		t.Fatalf("out=%q err=%v", out, err)
	}
	if gotMethod != "POST" || gotPath != "/api/v1/tools/ping" || gotAuth != "Bearer ypat_test" {
		t.Errorf("request = %s %s auth=%s", gotMethod, gotPath, gotAuth)
	}
	if gotBody["host"] != "1.1.1.1" || gotBody["port"] != float64(443) {
		t.Errorf("body = %+v", gotBody)
	}
}

func TestAdminOnlyToolsHiddenFromUsers(t *testing.T) {
	user := NewServer()
	registerCatalogTools(user, newAPIClient("http://127.0.0.1:1", "ypat_x"), false)
	admin := NewServer()
	registerCatalogTools(admin, newAPIClient("http://127.0.0.1:1", "ypat_x"), true)

	has := func(s *Server, name string) bool {
		for _, tl := range s.Tools() {
			if tl.Name == name {
				return true
			}
		}
		return false
	}
	if has(user, "user_create") {
		t.Error("admin-only tools leaked to a normal user")
	}
	// probing is open to every account (the agent limits non-superadmins to public hosts)
	if !has(user, "ping_host") || !has(admin, "user_create") {
		t.Error("admin tools missing")
	}
	if !has(user, "docker_list_images") {
		t.Error("shared tool missing for user")
	}
}

func TestFullServerToolNamesUnique(t *testing.T) {
	srv := BuildServer(Config{PanelURL: "http://127.0.0.1:1"}, "superadmin", "ypat_x")
	names := map[string]bool{}
	for _, tl := range srv.Tools() {
		if names[tl.Name] {
			t.Errorf("duplicate tool %s", tl.Name)
		}
		names[tl.Name] = true
		if tl.Annotations == nil {
			t.Errorf("%s: missing annotations", tl.Name)
		}
	}
	if len(names) < 80 {
		t.Errorf("expected 80+ tools for superadmin, got %d", len(names))
	}
}
