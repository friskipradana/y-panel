package httpserver

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
)

func newSiteTestServer(t *testing.T, cfg config.Config) *Server {
	t.Helper()
	cfg.StateDir = t.TempDir()
	return &Server{cfg: cfg}
}

func TestSiteSettingsDefaults(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	got := s.loadSiteSettings()
	if !got.LandingEnabled || !got.IndexingEnabled || got.HostingEnabled {
		t.Fatalf("fresh install: public site on, hosting off, got %+v", got)
	}
}

func TestSiteSettingsKeepARunningDemoOnUpgrade(t *testing.T) {
	s := newSiteTestServer(t, config.Config{DemoPassword: "from-env-pass", DemoUsername: "demo"})
	if !s.loadSiteSettings().HostingEnabled {
		t.Fatal("a demo that was already on must keep hosting mode on after an upgrade")
	}
	if s.demoUsername() != "demo" {
		t.Fatalf("the demo must keep working, got %q", s.demoUsername())
	}
}

func TestHostingOffMeansNoDemo(t *testing.T) {
	s := newSiteTestServer(t, config.Config{DemoPassword: "from-env-pass", DemoUsername: "demo"})
	if err := s.saveSiteSettings(siteSettings{LandingEnabled: true, IndexingEnabled: true, HostingEnabled: false}); err != nil {
		t.Fatal(err)
	}
	if s.demoUsername() != "" {
		t.Fatalf("hosting off: the demo must be off, got %q", s.demoUsername())
	}
	if s.demoSettingsView().Enabled {
		t.Fatal("hosting off: the settings view must report the demo as off")
	}
}

func TestSiteSettingsPersist(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	if err := s.saveSiteSettings(siteSettings{LandingEnabled: false, IndexingEnabled: true, HostingEnabled: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(s.cfg.StateDir, siteSettingsFile)); err != nil {
		t.Fatalf("settings file missing: %v", err)
	}
	if got := s.loadSiteSettings(); got.LandingEnabled || !got.HostingEnabled {
		t.Fatalf("saved values not read back: %+v", got)
	}
	// indexing needs the public pages: with the landing off nothing is indexable
	if s.indexingAllowed() {
		t.Fatal("landing off: indexing must not be allowed")
	}
}

func TestLandingOffHidesPublicPages(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	if err := s.saveSiteSettings(siteSettings{LandingEnabled: false, IndexingEnabled: true}); err != nil {
		t.Fatal(err)
	}
	reached := false
	handler := s.requireHTMLAuthV2(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached = true }))
	get := func(path string) *httptest.ResponseRecorder {
		reached = false
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Accept", "text/html")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	if rec := get("/"); rec.Code != http.StatusFound || rec.Header().Get("Location") != "/login" {
		t.Fatalf("/ must lead to the login form, got %d %q", rec.Code, rec.Header().Get("Location"))
	}
	for _, path := range []string{"/articles", "/articles/hello", "/install", "/terms", "/privacy", "/docs/mcp", "/sitemap.xml", "/llms.txt"} {
		if rec := get(path); rec.Code != http.StatusNotFound || reached {
			t.Fatalf("%s must not exist while the public site is off, got %d (reached=%v)", path, rec.Code, reached)
		}
	}
	for _, path := range []string{"/login", "/robots.txt"} {
		if get(path); !reached {
			t.Fatalf("%s must stay reachable", path)
		}
	}
}

func TestIndexingOffClosesCrawlers(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	if err := s.saveSiteSettings(siteSettings{LandingEnabled: true, IndexingEnabled: false}); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html><head><title>x</title></head><body></body></html>"), 0o600); err != nil {
		t.Fatal(err)
	}
	handler := s.seoFrontend(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }), dir)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/robots.txt", nil))
	if !strings.Contains(rec.Body.String(), "Disallow: /") || strings.Contains(rec.Body.String(), "Allow: /") {
		t.Fatalf("robots.txt must close the site: %q", rec.Body.String())
	}
	for _, path := range []string{"/sitemap.xml", "/llms.txt"} {
		rec = httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s must be gone while indexing is off, got %d", path, rec.Code)
		}
	}
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Header().Get("X-Robots-Tag") != "noindex, nofollow" {
		t.Fatalf("pages must carry noindex while indexing is off, got %q", rec.Header().Get("X-Robots-Tag"))
	}

	// back on: the normal rules return
	if err := s.saveSiteSettings(siteSettings{LandingEnabled: true, IndexingEnabled: true}); err != nil {
		t.Fatal(err)
	}
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/robots.txt", nil))
	if !strings.Contains(rec.Body.String(), "Allow: /") {
		t.Fatalf("indexing on: robots.txt must allow the public pages: %q", rec.Body.String())
	}
}
