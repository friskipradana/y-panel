package httpserver

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
)

func TestAppCatalogSlugAndOpenPathNormalization(t *testing.T) {
	if got := sanitizeAppSlug("  Uptime Kuma (Prod)! "); got != "uptime-kuma-prod" {
		t.Fatalf("unexpected slug: %q", got)
	}
	if got := normalizeOpenPath(""); got != "/" {
		t.Fatalf("expected /, got %q", got)
	}
	if got := normalizeOpenPath("admin/login"); got != "/admin/login" {
		t.Fatalf("expected /admin/login, got %q", got)
	}
}

func TestValidateTargetURLForRoleSSRFGuard(t *testing.T) {
	// Non-superadmin proxying loopback or cloud metadata must be rejected
	for _, bad := range []string{
		"http://127.0.0.1:8787/admin",
		"http://localhost:3000",
		"http://169.254.169.254/latest/meta-data",
		"http://10.0.0.5:8080",
		"http://192.168.1.10:8080",
		"ftp://example.com/file",
	} {
		if _, err := validateTargetURLForRole(bad, auth.UserRole, true); err == nil {
			t.Fatalf("expected %q to be rejected for proxied non-superadmin", bad)
		}
	}

	// Non-proxied HTTPS URL is allowed cleanly for iframe embedding
	if got, err := validateTargetURLForRole("https://status.example.com/dashboard", auth.UserRole, false); err != nil || got != "https://status.example.com/dashboard" {
		t.Fatalf("expected direct https URL to succeed, got %q err=%v", got, err)
	}

	// Superadmin may proxy internal endpoints if desired
	if _, err := validateTargetURLForRole("http://127.0.0.1:9000", auth.SuperadminRole, true); err != nil {
		t.Fatalf("expected superadmin proxy to loopback to be allowed, got %v", err)
	}
}

func TestAppCatalogProxyRewrites(t *testing.T) {
	if got := stripPanelCookies("foo=1; reneo_session=secret-token; theme=dark"); got != "foo=1; theme=dark" {
		t.Fatalf("stripPanelCookies failed: %q", got)
	}
	if got := rewriteCookiePath("sid=abc; Path=/; HttpOnly", "/api/v1/app-catalog/proxy/7"); !strings.Contains(got, "Path=/api/v1/app-catalog/proxy/7/") {
		t.Fatalf("rewriteCookiePath failed: %q", got)
	}
	html := []byte(`<html><head><base href="/"><link rel="stylesheet" href="/assets/app.css"></head><body><script src="/app.js"></script><object data="/icon.svg"></object><a href="/">Home</a><img src="/logo.png" srcset="/a.png 1x, /b.png 2x"><img src="//cdn.example.com/logo.png"></body></html>`)
	out := string(rewriteProxyHTML(html, "/api/v1/app-catalog/proxy/7"))
	if !strings.Contains(out, `<base href="/">`) {
		t.Fatalf("expected <base href=\"/\"> preserved for SPA routers, got %s", out)
	}
	if !strings.Contains(out, `href="/api/v1/app-catalog/proxy/7/assets/app.css"`) {
		t.Fatalf("expected href rewritten, got %s", out)
	}
	if !strings.Contains(out, `src="/api/v1/app-catalog/proxy/7/app.js"`) {
		t.Fatalf("expected src rewritten, got %s", out)
	}
	if !strings.Contains(out, `data="/api/v1/app-catalog/proxy/7/icon.svg"`) {
		t.Fatalf("expected <object data> rewritten, got %s", out)
	}
	if !strings.Contains(out, `<a href="/api/v1/app-catalog/proxy/7/">`) {
		t.Fatalf("expected root <a href=\"/\"> rewritten, got %s", out)
	}
	if !strings.Contains(out, `srcset="/api/v1/app-catalog/proxy/7/a.png 1x, /api/v1/app-catalog/proxy/7/b.png 2x"`) {
		t.Fatalf("expected srcset rewritten, got %s", out)
	}
	if !strings.Contains(out, `src="//cdn.example.com/logo.png"`) {
		t.Fatalf("expected protocol-relative URL preserved, got %s", out)
	}
	if !strings.Contains(out, `history.replaceState`) || !strings.Contains(out, `window.WebSocket`) {
		t.Fatalf("expected SPA router and WebSocket shim injected, got %s", out)
	}

	css := []byte(`@font-face{src:url('/fonts/inter.woff2');background:url(/img/bg.png);image:url("//cdn.example.com/a.png")}`)
	cssOut := string(rewriteProxyCSS(css, "/api/v1/app-catalog/proxy/7"))
	if !strings.Contains(cssOut, `url('/api/v1/app-catalog/proxy/7/fonts/inter.woff2')`) {
		t.Fatalf("expected CSS font URL rewritten, got %s", cssOut)
	}
	if !strings.Contains(cssOut, `url(/api/v1/app-catalog/proxy/7/img/bg.png)`) {
		t.Fatalf("expected CSS background URL rewritten, got %s", cssOut)
	}
	if !strings.Contains(cssOut, `url("//cdn.example.com/a.png")`) {
		t.Fatalf("expected CSS protocol-relative URL preserved, got %s", cssOut)
	}

	target, _ := url.Parse("http://127.0.0.1:18001")
	if got := rewriteProxyLocation("http://127.0.0.1:18001/setup?x=1", target, "/api/v1/app-catalog/proxy/7", false); got != "/api/v1/app-catalog/proxy/7/setup?x=1" {
		t.Fatalf("expected loopback redirect rewritten, got %q", got)
	}
	if got := rewriteProxyLocation("http://localhost:18006/api/v1/app-catalog/proxy/6/login", &url.URL{Scheme: "http", Host: "127.0.0.1:18006"}, "/api/v1/app-catalog/proxy/6", true); got != "/api/v1/app-catalog/proxy/6/login" {
		t.Fatalf("expected keepPrefix redirect host stripped, got %q", got)
	}
}

func TestResolveCatalogImageVersion(t *testing.T) {
	if got, err := resolveCatalogImage("louislam/uptime-kuma:1", ""); err != nil || got != "louislam/uptime-kuma:1" {
		t.Fatalf("empty version should keep default, got %q err=%v", got, err)
	}
	if got, err := resolveCatalogImage("docker.n8n.io/n8nio/n8n:latest", "1.88.0"); err != nil || got != "docker.n8n.io/n8nio/n8n:1.88.0" {
		t.Fatalf("expected custom tag applied, got %q err=%v", got, err)
	}
	if got, err := resolveCatalogImage("localhost:5000/myorg/app:1.0", "2.1-alpine"); err != nil || got != "localhost:5000/myorg/app:2.1-alpine" {
		t.Fatalf("expected registry port preserved, got %q err=%v", got, err)
	}
	for _, bad := range []string{"latest;rm", "foo/bar", "1.0@sha256:abc", ".hidden", "has space"} {
		if _, err := resolveCatalogImage("gitea/gitea:latest", bad); err == nil {
			t.Fatalf("expected invalid version tag %q to fail", bad)
		}
	}
}

func TestReplaceComposeImageLine(t *testing.T) {
	compose := "services:\n  app:\n    image: \"louislam/uptime-kuma:1\"\n    restart: unless-stopped\n"
	out, ok := replaceComposeImageLine(compose, "louislam/uptime-kuma:1-slim")
	if !ok {
		t.Fatal("expected image line to be replaced")
	}
	if !strings.Contains(out, `    image: "louislam/uptime-kuma:1-slim"`) {
		t.Fatalf("unexpected compose output:\n%s", out)
	}
}

func TestAppCatalogSplitPath(t *testing.T) {
	id, rest := appCatalogSplitPath("/api/v1/app-catalog/proxy/42/api/v1/status")
	if id != "42" || rest != "api/v1/status" {
		t.Fatalf("unexpected split: id=%q rest=%q", id, rest)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/app-catalog", nil)
	if rec.Code != http.StatusOK || req.Method != http.MethodGet {
		t.Fatal("sanity check")
	}
}

