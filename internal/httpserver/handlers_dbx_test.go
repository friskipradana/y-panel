package httpserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestDbxProtectedPagePaths(t *testing.T) {
	for _, p := range []string{"/dbx", "/dbx/", "/dbx/assets/app.js", "/adminer", "/adminer/", "/adminer/abc"} {
		if !isProtectedPagePath(p) {
			t.Errorf("expected %q to be protected page path", p)
		}
	}
}

func TestDbxProxyRedirectsSlashless(t *testing.T) {
	s := &Server{}
	handler := s.dbxProxy()

	req := httptest.NewRequest(http.MethodGet, "/dbx", nil)
	ctx := context.WithValue(req.Context(), ctxUser, &database.User{ID: 1, Username: "test"})
	req = req.WithContext(ctx)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusPermanentRedirect {
		t.Fatalf("expected redirect 308, got %d", rec.Code)
	}
	if loc := rec.Header().Get("Location"); loc != "/dbx/" {
		t.Fatalf("expected Location /dbx/, got %q", loc)
	}
}

func TestDbxProxyPreservesBasePath(t *testing.T) {
	var receivedPath string
	var receivedForwardedHost string

	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		receivedForwardedHost = r.Header.Get("X-Forwarded-Host")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer backend.Close()

	backendURL, err := url.Parse(backend.URL)
	if err != nil {
		t.Fatalf("parse backend url: %v", err)
	}

	proxy := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Scheme = backendURL.Scheme
			pr.Out.URL.Host = backendURL.Host
			pr.Out.Host = backendURL.Host
			pr.Out.URL.Path = pr.In.URL.Path
			pr.Out.URL.RawPath = pr.In.URL.RawPath
			pr.SetXForwarded()
			pr.Out.Header.Del("Authorization")
		},
	}

	req := httptest.NewRequest(http.MethodGet, "https://reneo.my.id/dbx/assets/bundle.js", nil)
	req.Host = "reneo.my.id"
	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if receivedPath != "/dbx/assets/bundle.js" {
		t.Fatalf("expected backend to receive /dbx/assets/bundle.js, got %q", receivedPath)
	}
	if receivedForwardedHost != "reneo.my.id" {
		t.Fatalf("expected X-Forwarded-Host reneo.my.id, got %q", receivedForwardedHost)
	}
}
