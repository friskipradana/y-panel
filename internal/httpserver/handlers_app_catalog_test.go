package httpserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/config"
)

func TestAppCatalogSlugAndOpenPathNormalization(t *testing.T) {
	if got := sanitizeAppSlug("  Uptime Kuma (Prod)! "); got != "uptime-kuma-prod" {
		t.Fatalf("unexpected slug: %q", got)
	}
	for _, tc := range []struct {
		input string
		slugs []string
		want  string
	}{
		{"", nil, "/"},
		{"admin/login", nil, "/admin/login"},
		{"/app/grafana", []string{"grafana"}, "/"},
		{"/app/grafana/", []string{"grafana"}, "/"},
		{"/app/grafana/d/dashboard", []string{"grafana"}, "/d/dashboard"},
		{"/api/v1/app-catalog/proxy/6/app/grafana/", []string{"grafana"}, "/"},
		{"/api/v1/app-catalog/proxy/6/d/dashboard", []string{"grafana"}, "/d/dashboard"},
		{"/grafana", []string{"grafana"}, "/"},
	} {
		if got := normalizeOpenPath(tc.input, tc.slugs...); got != tc.want {
			t.Fatalf("normalizeOpenPath(%q, %v) = %q, want %q", tc.input, tc.slugs, got, tc.want)
		}
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
	if got := rewriteCookiePath("sid=abc; Domain=127.0.0.1; Path=/; Secure; HttpOnly", "/app/crm", false); strings.Contains(strings.ToLower(got), "domain=") || strings.Contains(strings.ToLower(got), "; secure") || !strings.Contains(got, "Path=/app/crm/") {
		t.Fatalf("expected Domain= and HTTP Secure stripped, got %q", got)
	}
	if got := rewriteCookiePath("sid=abc; Domain=panel.reneo.my.id; Path=/; Secure; HttpOnly", "/app/crm", true); strings.Contains(strings.ToLower(got), "domain=") || !strings.Contains(strings.ToLower(got), "secure") {
		t.Fatalf("expected Domain= stripped and HTTPS Secure kept, got %q", got)
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
	if !strings.Contains(out, `history.replaceState`) || !strings.Contains(out, `window.WebSocket`) || !strings.Contains(out, `isURLObj`) {
		t.Fatalf("expected SPA router, WebSocket shim and URL-object handling injected, got %s", out)
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
	if got := rewriteProxyLocation("grafana/", nil, "/app/grafana", true); got != "/app/grafana/" {
		t.Fatalf("expected relative self-redirect resolved cleanly, got %q", got)
	}
	if got := rewriteProxyLocation("/api/v1/app-catalog/proxy/6/login", nil, "/app/grafana", true); got != "/app/grafana/login" {
		t.Fatalf("expected keepPrefix translated to gateway slug, got %q", got)
	}
	if got := rewriteProxyLocation("/app/grafana/app/grafana/", nil, "/app/grafana", true); got != "/app/grafana/" {
		t.Fatalf("expected duplicate slug stripped, got %q", got)
	}
	if got := rewriteProxyLocation("https://panel.reneo.my.id/dashboard", target, "/app/crm", false, "panel.reneo.my.id"); got != "/app/crm/dashboard" {
		t.Fatalf("expected echoed external host redirect kept under /app/crm, got %q", got)
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

func TestSanitizeExistingAppCompose(t *testing.T) {
	raw := "services:\n  reneo-app-1-fb:\n    image: \"filebrowser/filebrowser:latest\"\n    container_name: \"reneo-app-1-fb-reneo-app-1-fb\"\n    environment:\n      FB_BASEURL: \"/api/v1/app-catalog/proxy/3\"\n    deploy:\n      resources:\n        limits:\n          cpus: \"1.00\"\n          memory: \"0M\"\n"
	cleaned, changed := sanitizeExistingAppCompose(raw, "reneo-app-1-fb", "filebrowser")
	if !changed {
		t.Fatal("expected compose to be sanitized")
	}
	if strings.Contains(cleaned, "reneo-app-1-fb-reneo-app-1-fb") {
		t.Fatalf("expected doubled container_name fixed:\n%s", cleaned)
	}
	if strings.Contains(cleaned, `memory: "0M"`) {
		t.Fatalf("expected zero memory limit stripped:\n%s", cleaned)
	}
	if !strings.Contains(cleaned, `FB_DATABASE: "/database/filebrowser.db"`) {
		t.Fatalf("expected FB_DATABASE injected:\n%s", cleaned)
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

func TestAppGatewaySplitPath(t *testing.T) {
	slug, rest, hasSlash := appGatewaySplitPath("/app/uptime-kuma/setup")
	if slug != "uptime-kuma" || rest != "setup" || !hasSlash {
		t.Fatalf("unexpected split: slug=%q rest=%q hasSlash=%v", slug, rest, hasSlash)
	}

	slug, rest, hasSlash = appGatewaySplitPath("/app/grafana/")
	if slug != "grafana" || rest != "" || !hasSlash {
		t.Fatalf("unexpected split trailing slash: slug=%q rest=%q hasSlash=%v", slug, rest, hasSlash)
	}

	slug, rest, hasSlash = appGatewaySplitPath("/app/grafana")
	if slug != "grafana" || rest != "" || hasSlash {
		t.Fatalf("unexpected split without slash: slug=%q rest=%q hasSlash=%v", slug, rest, hasSlash)
	}
}

func TestProxyShimTemplateDoesNotStripHistory(t *testing.T) {
	if strings.Contains(proxyShimTemplate, "normRest(cur)") {
		t.Fatal("proxyShimTemplate must not strip history prefix, which causes 404 on refresh")
	}
	if !strings.Contains(proxyShimTemplate, "window.history.pushState") {
		t.Fatal("proxyShimTemplate must hook pushState to preserve gateway prefix")
	}
	if strings.Contains(proxyShimTemplate, ":///") {
		t.Fatal("proxyShimTemplate must not contain unescaped regex slashes :///")
	}
	if !strings.Contains(proxyShimTemplate, `:\/\//`) {
		t.Fatal("proxyShimTemplate must escape regex slashes as :\\/\\/")
	}
	// Check balanced parentheses, braces, brackets in the JS body
	body := strings.TrimPrefix(proxyShimTemplate, "<script>")
	body = strings.TrimSuffix(body, "</script>")
	paren, brace, bracket := 0, 0, 0
	for _, ch := range body {
		switch ch {
		case '(':
			paren++
		case ')':
			paren--
		case '{':
			brace++
		case '}':
			brace--
		case '[':
			bracket++
		case ']':
			bracket--
		}
		if paren < 0 || brace < 0 || bracket < 0 {
			t.Fatalf("unbalanced bracket in proxyShimTemplate: paren=%d brace=%d bracket=%d", paren, brace, bracket)
		}
	}
	if paren != 0 || brace != 0 || bracket != 0 {
		t.Fatalf("unclosed bracket in proxyShimTemplate: paren=%d brace=%d bracket=%d", paren, brace, bracket)
	}
}

func TestAppCatalogLicenseEndpoint(t *testing.T) {
	srv := &Server{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/app-catalog/license/reneo-crm", nil)
	w := httptest.NewRecorder()

	srv.handleAppCatalogLicense(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, `"reneo-crm"`) {
		t.Fatalf("expected response to contain catalog ID reneo-crm, got %s", body)
	}
	if !strings.Contains(body, `"status":"UNLICENSED"`) {
		t.Fatalf("expected unlicensed status, got %s", body)
	}
}

func TestAppLicensePlansAndOrderEndpoints(t *testing.T) {
	srv := &Server{}

	// Test GET plans
	reqPlans := httptest.NewRequest(http.MethodGet, "/api/v1/app-catalog/plans/reneo-crm", nil)
	wPlans := httptest.NewRecorder()
	srv.handleAppLicensePlans(wPlans, reqPlans)

	if wPlans.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for plans, got %d", wPlans.Code)
	}
	plansBody := wPlans.Body.String()
	if !strings.Contains(plansBody, "Growth Pro Bulanan") {
		t.Fatalf("expected plans response to contain Growth Pro Bulanan, got %s", plansBody)
	}

	// Test POST order
	orderPayload := `{"catalogId":"reneo-crm","planSlug":"pro-monthly","buyerName":"Budi Santoso","paymentMethod":"qris"}`
	reqOrder := httptest.NewRequest(http.MethodPost, "/api/v1/app-catalog/order", strings.NewReader(orderPayload))
	wOrder := httptest.NewRecorder()
	srv.handleAppLicenseCreateOrder(wOrder, reqOrder)

	if wOrder.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for order, got %d", wOrder.Code)
	}
	orderBody := wOrder.Body.String()
	if !strings.Contains(orderBody, "INV-") {
		t.Fatalf("expected order response to contain invoice number INV-, got %s", orderBody)
	}

	// Test POST order with multi-qty duration
	multiPayload := `{"catalogId":"reneo-crm","planSlug":"pro-monthly","quantity":3,"buyerName":"Budi Santoso","paymentMethod":"transfer"}`
	reqMulti := httptest.NewRequest(http.MethodPost, "/api/v1/app-catalog/order", strings.NewReader(multiPayload))
	wMulti := httptest.NewRecorder()
	srv.handleAppLicenseCreateOrder(wMulti, reqMulti)
	if wMulti.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for multi-qty order, got %d", wMulti.Code)
	}
	multiBody := wMulti.Body.String()
	if !strings.Contains(multiBody, `"months":3`) || !strings.Contains(multiBody, `"amountList":537000`) {
		t.Fatalf("expected 3 months & 537000 amountList in multi-qty order, got %s", multiBody)
	}
}

func TestAppGatewayPublicReneoCrmPaths(t *testing.T) {
	publicURLs := []string{
		"/app/reneo-crm/",
		"/app/reneo-crm/landing",
		"/app/reneo-crm/robots.txt",
		"/app/reneo-crm/sitemap.xml",
		"/app/reneo-crm/llms.txt",
		"/app/reneo-crm/llms-full.txt",
		"/app/reneo-crm/assets/index-xYEAWOux.css",
		"/app/reneo-crm/assets/index-abc123.js",
		"/app/reneo-crm/api/auth/status",
		"/app/reneo-crm/logo.svg",
		"/app/reneo-crm/csat/token123",
		"/app/reneo-crm/connect-channel/token123",
	}
	for _, raw := range publicURLs {
		slug, rest, hasSlash := appGatewaySplitPath(raw)
		if slug != "reneo-crm" || !hasSlash {
			t.Fatalf("unexpected split for %q: slug=%q hasSlash=%v", raw, slug, hasSlash)
		}
		if !isPublicReneoCrmPath(rest) {
			t.Errorf("expected %q (rest=%q) to be public", raw, rest)
		}
	}

	_, privateRest, _ := appGatewaySplitPath("/app/reneo-crm/internal-secret")
	if isPublicReneoCrmPath(privateRest) {
		t.Errorf("expected /app/reneo-crm/internal-secret not to be public")
	}
}

func TestAppTokenSigningAndActorResolution(t *testing.T) {
	s := &Server{
		cfg: config.Config{
			SessionSecret: "test-session-secret-0123456789",
		},
	}

	tok := s.signAppToken(42, "reneo-crm", 7)
	if tok == "" {
		t.Fatalf("expected non-empty signed app token")
	}

	uid, cid, appID, ok := s.parseAppToken(tok)
	if !ok || uid != 42 || cid != "reneo-crm" || appID != 7 {
		t.Fatalf("unexpected parsed token: uid=%d cid=%q appID=%d ok=%v", uid, cid, appID, ok)
	}

	tampered := tok[:len(tok)-1] + "a"
	if strings.HasSuffix(tok, "a") {
		tampered = tok[:len(tok)-1] + "b"
	}
	if _, _, _, ok := s.parseAppToken(tampered); ok {
		t.Fatalf("expected tampered token to be rejected")
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/app-catalog/license?catalog_id=reneo-crm", nil)
	req.Header.Set("X-Reneo-App-Token", tok)

	gotUID, gotAppID, authed := s.resolveLicenseAppActor(req, "reneo-crm")
	if !authed || gotUID != 42 || gotAppID != 7 {
		t.Fatalf("expected actor (42, 7, true), got (%d, %d, %v)", gotUID, gotAppID, authed)
	}

	if _, _, crossAuthed := s.resolveLicenseAppActor(req, "other-catalog"); crossAuthed {
		t.Fatalf("expected cross-catalog app token to be rejected")
	}

	unauthedReq := httptest.NewRequest(http.MethodGet, "/api/v1/app-catalog/license?catalog_id=reneo-crm", nil)
	if _, _, unauthed := s.resolveLicenseAppActor(unauthedReq, "reneo-crm"); unauthed {
		t.Fatalf("expected unauthenticated license request to be rejected")
	}
}

func TestAppLicensePayOrderRequiresAuth(t *testing.T) {
	s := &Server{
		cfg: config.Config{
			SessionSecret: "test-session-secret-0123456789",
		},
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/app-catalog/orders/ord-123/pay", nil)
	rec := httptest.NewRecorder()
	s.handleAppLicensePayOrder(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized when paying order without session, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestUpsertAndSelfHealComposeEnvVar(t *testing.T) {
	// 1. Mapping-style environment (generated by DeployFromImage) must insert KEY: "val", never "- KEY=val"
	mappingCompose := "services:\n  reneo-app-1-reneo-crm:\n    image: \"ghcr.io/aknalre/crm-services:1.3.3\"\n    environment:\n      DATABASE_URL: \"postgres://u:p@host:5432/db\"\n      RENEO_PANEL_URL: \"http://host.docker.internal:8000\"\n    ports:\n      - \"18011:80\"\n"
	out := upsertComposeEnvVar(mappingCompose, "RENEO_APP_TOKEN", "jwt.tok.123")
	if strings.Contains(out, "- RENEO_APP_TOKEN=") {
		t.Fatalf("mapping environment block must not receive list item syntax:\n%s", out)
	}
	if !strings.Contains(out, "      RENEO_APP_TOKEN: \"jwt.tok.123\"\n") {
		t.Fatalf("expected mapped RENEO_APP_TOKEN line, got:\n%s", out)
	}

	// 2. Updating existing mapped key quotes the value properly
	out2 := upsertComposeEnvVar(out, "RENEO_APP_TOKEN", "jwt.tok.456")
	if strings.Count(out2, "RENEO_APP_TOKEN") != 1 || !strings.Contains(out2, "      RENEO_APP_TOKEN: \"jwt.tok.456\"\n") {
		t.Fatalf("expected single updated mapped RENEO_APP_TOKEN, got:\n%s", out2)
	}

	// 3. Previously corrupted mixed mapping + list compose.yml from v1.85.11 must self-heal
	corrupted := "services:\n  reneo-app-1-reneo-crm:\n    image: \"ghcr.io/aknalre/crm-services:latest\"\n    environment:\n      DATABASE_URL: \"postgres://u:p@host:5432/db\"\n      - RENEO_APP_TOKEN=broken.old.tok\n    ports:\n      - \"18011:80\"\n"
	sanitized, changed := sanitizeExistingAppCompose(corrupted, "reneo-app-1-reneo-crm", "reneo-crm")
	if !changed || strings.Contains(sanitized, "- RENEO_APP_TOKEN=") {
		t.Fatalf("expected sanitizeExistingAppCompose to heal mixed env line, changed=%v:\n%s", changed, sanitized)
	}
	healed := upsertComposeEnvVar(corrupted, "RENEO_APP_TOKEN", "healed.new.tok")
	if strings.Contains(healed, "- RENEO_APP_TOKEN=") || !strings.Contains(healed, "      RENEO_APP_TOKEN: \"healed.new.tok\"\n") {
		t.Fatalf("expected corrupted compose to self-heal on upsert, got:\n%s", healed)
	}

	// 4. Sequence/list-style environment preserves "- KEY=val" format
	listCompose := "services:\n  crm:\n    image: \"ghcr.io/aknalre/crm-services:latest\"\n    environment:\n      - DATABASE_URL=postgres://u:p@host:5432/db\n    ports:\n      - \"18011:80\"\n"
	listOut := upsertComposeEnvVar(listCompose, "RENEO_APP_TOKEN", "list.tok.1")
	if !strings.Contains(listOut, "      - RENEO_APP_TOKEN=list.tok.1\n") {
		t.Fatalf("expected list-style RENEO_APP_TOKEN entry, got:\n%s", listOut)
	}
	listUpdated := upsertComposeEnvVar(listOut, "RENEO_APP_TOKEN", "list.tok.2")
	if strings.Count(listUpdated, "RENEO_APP_TOKEN") != 1 || !strings.Contains(listUpdated, "      - RENEO_APP_TOKEN=list.tok.2\n") {
		t.Fatalf("expected updated list-style RENEO_APP_TOKEN entry, got:\n%s", listUpdated)
	}

	// 5. Missing environment section injects mapping environment right under image
	noEnv := "services:\n  crm:\n    image: \"ghcr.io/aknalre/crm-services:latest\"\n    ports:\n      - \"18011:80\"\n"
	noEnvOut := upsertComposeEnvVar(noEnv, "RENEO_APP_TOKEN", "new.tok")
	if !strings.Contains(noEnvOut, "    environment:\n      RENEO_APP_TOKEN: \"new.tok\"\n") {
		t.Fatalf("expected injected environment section, got:\n%s", noEnvOut)
	}

	// 6. Inline empty braces/brackets expand cleanly
	emptyMapOut := upsertComposeEnvVar("services:\n  crm:\n    image: \"img:1\"\n    environment: {}\n", "RENEO_APP_TOKEN", "tok")
	if strings.Contains(emptyMapOut, "{}") || !strings.Contains(emptyMapOut, "    environment:\n      RENEO_APP_TOKEN: \"tok\"") {
		t.Fatalf("expected empty mapping env to expand, got:\n%s", emptyMapOut)
	}
	emptyListOut := upsertComposeEnvVar("services:\n  crm:\n    image: \"img:1\"\n    environment: []\n", "RENEO_APP_TOKEN", "tok")
	if strings.Contains(emptyListOut, "[]") || !strings.Contains(emptyListOut, "    environment:\n      - RENEO_APP_TOKEN=tok") {
		t.Fatalf("expected empty list env to expand, got:\n%s", emptyListOut)
	}
}

func TestCompareVersionsDesc(t *testing.T) {
	cases := []struct {
		a    string
		b    string
		want bool
	}{
		{"1.6.26", "1.6.25", true},
		{"1.6.25", "1.6.26", false},
		{"1.6.26", "1.6.26", false},
		{"1.10.0", "1.9.9", true},
		{"v2.0.0", "1.99.99", true},
		{"1.6.10", "1.6.2", true},
		{"1.6.2", "1.6.10", false},
		{"1.6.39", "1.6.39-rc.1", true},
		{"1.6.39-rc.1", "1.6.39", false},
		{"2", "2-slim", true},
		{"1.6.39", "20250101", true},
	}
	for _, tc := range cases {
		if got := compareVersionsDesc(tc.a, tc.b); got != tc.want {
			t.Fatalf("compareVersionsDesc(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestOrderImageTagsAndPickers(t *testing.T) {
	raw := []string{
		"latest",
		"main",
		"sha-abc1234",
		"1.6.38",
		"1.6.39.sig",
		"1.6.39",
		"1.6.40-rc.1",
		"1.6.39-amd64",
		"1.6",
		"rootless",
	}
	ordered := orderImageTags(raw)
	if len(ordered) < 2 {
		t.Fatalf("expected ordered tags, got %v", ordered)
	}
	for _, tag := range ordered {
		if strings.HasPrefix(tag, "sha-") || strings.HasSuffix(tag, ".sig") {
			t.Fatalf("unexpected non-release artifact tag in ordered result: %q (%v)", tag, ordered)
		}
	}
	// Release versions must precede floating tags like latest and main
	idxLatest := -1
	idx1639 := -1
	idxMain := -1
	for i, tag := range ordered {
		switch tag {
		case "latest":
			idxLatest = i
		case "1.6.39":
			idx1639 = i
		case "main":
			idxMain = i
		}
	}
	if idx1639 < 0 || idxLatest < 0 || idx1639 >= idxLatest {
		t.Fatalf("expected concrete release 1.6.39 before latest, got %v", ordered)
	}
	if idxMain >= 0 && idxLatest >= idxMain {
		t.Fatalf("expected latest before other floating tags, got %v", ordered)
	}

	if got := pickLatestReleaseTag(ordered); got != "1.6.39" {
		t.Fatalf("pickLatestReleaseTag(%v) = %q, want 1.6.39", ordered, got)
	}
	if got := pickPreferredReleaseTag(ordered); got != "1.6.39" {
		t.Fatalf("pickPreferredReleaseTag(%v) = %q, want 1.6.39", ordered, got)
	}

	// Non-dotted variant lists (like nextcloud: ["latest", "apache", "30"]) keep floating default
	if got := pickPreferredReleaseTag([]string{"30", "apache", "latest"}); got != "" {
		t.Fatalf("expected empty auto-preferred dotted semver for variant list, got %q", got)
	}
}

func TestEvaluateAppUpdateStatus(t *testing.T) {
	tags := []string{"1.6.39", "1.6.38", "1.6", "latest"}
	digest1639 := "sha256:16391639163916391639163916391639"
	digest1638 := "sha256:16381638163816381638163816381638"
	digestMain := "sha256:0000aaaa1111bbbb2222cccc3333dddd"

	// 1. Pinned 1.6.39 must NOT falsely report HasUpdate even if catalog spec image is :latest
	resPinnedLatest := evaluateAppUpdateStatus(appUpdateEvalInput{
		InstalledImage:         "ghcr.io/aknalre/crm-services:1.6.39",
		CatalogSpecImage:       "ghcr.io/aknalre/crm-services:latest",
		LocalDigests:           []string{"ghcr.io/aknalre/crm-services@" + digest1639},
		RemoteTags:             tags,
		RemoteInstalledDigests: []string{digest1639},
		RemoteLatestDigests:    []string{digest1639},
	})
	if resPinnedLatest.HasUpdate {
		t.Fatalf("expected HasUpdate=false when pinned to latest release 1.6.39, got %+v", resPinnedLatest)
	}
	if resPinnedLatest.IsFloatingTag || resPinnedLatest.ResolvedVersion != "1.6.39" || resPinnedLatest.LatestVersion != "1.6.39" {
		t.Fatalf("unexpected metadata for pinned latest: %+v", resPinnedLatest)
	}
	if resPinnedLatest.TargetImage != "ghcr.io/aknalre/crm-services:1.6.39" {
		t.Fatalf("expected target image 1.6.39, got %q", resPinnedLatest.TargetImage)
	}

	// 2. Pinned 1.6.38 behind 1.6.39 must report HasUpdate=true
	resPinnedOld := evaluateAppUpdateStatus(appUpdateEvalInput{
		InstalledImage:         "ghcr.io/aknalre/crm-services:1.6.38",
		CatalogSpecImage:       "ghcr.io/aknalre/crm-services:latest",
		LocalDigests:           []string{"ghcr.io/aknalre/crm-services@" + digest1638},
		RemoteTags:             tags,
		RemoteInstalledDigests: []string{digest1638},
		RemoteLatestDigests:    []string{digest1639},
	})
	if !resPinnedOld.HasUpdate || resPinnedOld.LatestVersion != "1.6.39" {
		t.Fatalf("expected HasUpdate=true for 1.6.38 -> 1.6.39, got %+v", resPinnedOld)
	}

	// 3. Old :latest with OCI label 1.6.38 resolves actual version and reports update to 1.6.39
	resFloatingLabeled := evaluateAppUpdateStatus(appUpdateEvalInput{
		InstalledImage:         "ghcr.io/aknalre/crm-services:latest",
		CatalogSpecImage:       "ghcr.io/aknalre/crm-services:latest",
		LocalDigests:           []string{"ghcr.io/aknalre/crm-services@" + digest1638},
		ContainerLabels:        map[string]string{"org.opencontainers.image.version": "1.6.38"},
		RemoteTags:             tags,
		RemoteInstalledDigests: []string{digest1639},
		RemoteLatestDigests:    []string{digest1639},
	})
	if !resFloatingLabeled.HasUpdate || !resFloatingLabeled.IsFloatingTag || resFloatingLabeled.ResolvedVersion != "1.6.38" {
		t.Fatalf("expected floating :latest at 1.6.38 to resolve version and require update, got %+v", resFloatingLabeled)
	}

	// 4. Old :latest pointing to stale "main" build (even if remote :latest was temporarily overwritten with main!) still flags mismatch vs 1.6.39
	resFloatingMain := evaluateAppUpdateStatus(appUpdateEvalInput{
		InstalledImage:         "ghcr.io/aknalre/crm-services:latest",
		CatalogSpecImage:       "ghcr.io/aknalre/crm-services:latest",
		LocalDigests:           []string{"ghcr.io/aknalre/crm-services@" + digestMain},
		ContainerLabels:        map[string]string{"org.opencontainers.image.version": "main"},
		RemoteTags:             tags,
		RemoteInstalledDigests: []string{digestMain},
		RemoteLatestDigests:    []string{digest1639},
	})
	if !resFloatingMain.HasUpdate || resFloatingMain.ResolvedVersion != "" || resFloatingMain.LatestVersion != "1.6.39" {
		t.Fatalf("expected stale :latest (main) to flag update to 1.6.39 without trusting 'main' as version, got %+v", resFloatingMain)
	}

	// 5. :latest matching multi-arch child manifest digest of 1.6.39 resolves version cleanly and stays green
	platformDigest1639 := "sha256:99998888777766665555444433332222"
	resFloatingUpToDate := evaluateAppUpdateStatus(appUpdateEvalInput{
		InstalledImage:         "ghcr.io/aknalre/crm-services:latest",
		CatalogSpecImage:       "ghcr.io/aknalre/crm-services:latest",
		LocalDigests:           []string{"ghcr.io/aknalre/crm-services@" + platformDigest1639},
		ContainerImageID:       "sha256:container1",
		TagImageID:             "sha256:container1",
		RemoteTags:             tags,
		RemoteInstalledDigests: []string{digest1639, platformDigest1639},
		RemoteLatestDigests:    []string{digest1639, platformDigest1639},
	})
	if resFloatingUpToDate.HasUpdate || resFloatingUpToDate.ResolvedVersion != "1.6.39" {
		t.Fatalf("expected up-to-date multi-arch :latest to resolve 1.6.39 with HasUpdate=false, got %+v", resFloatingUpToDate)
	}

	// 6. Running container using stale ImageID vs pulled local tag must report HasUpdate=true
	resStaleContainer := evaluateAppUpdateStatus(appUpdateEvalInput{
		InstalledImage:         "ghcr.io/aknalre/crm-services:latest",
		CatalogSpecImage:       "ghcr.io/aknalre/crm-services:latest",
		LocalDigests:           []string{"ghcr.io/aknalre/crm-services@" + digest1638},
		ContainerImageID:       "sha256:oldcontainer",
		TagImageID:             "sha256:newpulledtag",
		RemoteTags:             tags,
		RemoteInstalledDigests: []string{digest1639},
		RemoteLatestDigests:    []string{digest1639},
	})
	if !resStaleContainer.HasUpdate {
		t.Fatalf("expected stale container ImageID vs tag ImageID to report HasUpdate=true, got %+v", resStaleContainer)
	}

	// 7. Rolling-only image compares digests directly
	resRollingOnly := evaluateAppUpdateStatus(appUpdateEvalInput{
		InstalledImage:         "adguard/adguardhome:latest",
		CatalogSpecImage:       "adguard/adguardhome:latest",
		LocalDigests:           []string{"adguard/adguardhome@" + digestMain},
		RemoteTags:             []string{"latest"},
		RemoteInstalledDigests: []string{digest1639},
	})
	if !resRollingOnly.HasUpdate || !resRollingOnly.IsFloatingTag {
		t.Fatalf("expected rolling-only digest mismatch to flag update, got %+v", resRollingOnly)
	}
}

func TestParseNextRegistryLink(t *testing.T) {
	if got := parseNextRegistryLink(`</v2/aknalre/crm-services/tags/list?last=1.5.0&n=1000>; rel="next"`, "ghcr.io"); got != "https://ghcr.io/v2/aknalre/crm-services/tags/list?last=1.5.0&n=1000" {
		t.Fatalf("unexpected relative Link parse: %q", got)
	}
	if got := parseNextRegistryLink(`</v2/repo/tags/list>; rel="prev"`, "ghcr.io"); got != "" {
		t.Fatalf("expected empty when rel!=next, got %q", got)
	}
}

func TestCollectAllowedAppHostsAndLicenseAuthFlags(t *testing.T) {
	t.Setenv("PUBLIC_URL", "https://panel.reneo.my.id")
	srv := &Server{
		cfg: config.Config{
			SessionSecret:  "test-session-secret-0123456789",
			BaseDomain:     "reneo.my.id",
			AllowedHosts:   []string{"panel.reneo.my.id", "admin.toko.id"},
			AllowedOrigins: []string{"https://crm.klien.id"},
		},
	}

	csv := srv.mergeAllowedAppHostCSV("*,custom.crm.id:8443", 42, "reneo-crm", 7, "extra.host:8080")
	for _, want := range []string{"panel.reneo.my.id", "admin.toko.id", "crm.klien.id", "*.reneo.my.id", "custom.crm.id", "extra.host"} {
		if !strings.Contains(csv, want) {
			t.Fatalf("expected allowed host CSV to contain %q, got %q", want, csv)
		}
	}
	if strings.Contains(csv, "*,") || strings.HasSuffix(csv, ",*") || csv == "*" {
		t.Fatalf("wildcard '*' must never enter allowed host CSV: %q", csv)
	}

	// Unauthenticated license request reports authenticated=false, reneoVerified=false
	unauthReq := httptest.NewRequest(http.MethodGet, "/api/v1/app-catalog/license/reneo-crm", nil)
	unauthRec := httptest.NewRecorder()
	srv.handleAppCatalogLicense(unauthRec, unauthReq)
	var unauthBody map[string]any
	if err := json.Unmarshal(unauthRec.Body.Bytes(), &unauthBody); err != nil {
		t.Fatalf("unmarshal unauthenticated response: %v", err)
	}
	if authed, _ := unauthBody["authenticated"].(bool); authed {
		t.Fatalf("expected authenticated=false without X-Reneo-App-Token")
	}
	if verified, _ := unauthBody["reneoVerified"].(bool); verified {
		t.Fatalf("expected reneoVerified=false without X-Reneo-App-Token")
	}

	// Authenticated app token reports authenticated=true, reneoVerified=true, and allowedHosts even when unlicensed
	tok := srv.signAppToken(42, "reneo-crm", 7)
	authReq := httptest.NewRequest(http.MethodGet, "/api/v1/app-catalog/license/reneo-crm", nil)
	authReq.Host = "panel.reneo.my.id"
	authReq.Header.Set("X-Reneo-App-Token", tok)
	authRec := httptest.NewRecorder()
	srv.handleAppCatalogLicense(authRec, authReq)
	var authBody map[string]any
	if err := json.Unmarshal(authRec.Body.Bytes(), &authBody); err != nil {
		t.Fatalf("unmarshal authenticated response: %v", err)
	}
	if authed, _ := authBody["authenticated"].(bool); !authed {
		t.Fatalf("expected authenticated=true with valid X-Reneo-App-Token")
	}
	if verified, _ := authBody["reneoVerified"].(bool); !verified {
		t.Fatalf("expected reneoVerified=true with valid X-Reneo-App-Token")
	}
	hostsRaw, ok := authBody["allowedHosts"].([]any)
	if !ok || len(hostsRaw) == 0 {
		t.Fatalf("expected allowedHosts array in verified response, got %#v", authBody["allowedHosts"])
	}
}





