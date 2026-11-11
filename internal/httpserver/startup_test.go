package httpserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/performance"
)

func TestServerCloseNilSafe(t *testing.T) {
	srv := &Server{}
	if err := srv.Close(); err != nil {
		t.Fatalf("unexpected error closing zero-value server: %v", err)
	}
}

func TestServerStartupHealthzAndShutdown(t *testing.T) {
	srv := New(config.Config{
		StateDir:         t.TempDir(),
		FrontendDir:      t.TempDir(),
		DatabaseEnable:   false,
		SessionTTL:       time.Hour,
		EncryptionKey:    "test-encryption-key-0123456789abcdef",
		ProfilingEnabled: false,
	})
	srv.RestoreAsync()

	beforeReq := performance.DefaultRegistry.Snapshot().APIRequestsTotal

	// /healthz must answer immediately without blocking on startup recovery loops.
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected /healthz status 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	afterReq := performance.DefaultRegistry.Snapshot().APIRequestsTotal
	if afterReq <= beforeReq {
		t.Fatalf("expected request counter to increment across ServeHTTP (before=%d after=%d)", beforeReq, afterReq)
	}

	// Metrics and pprof endpoints must never leak without authentication; pprof must stay disabled by default.
	for _, tc := range []struct {
		path      string
		wantCodes []int
	}{
		{path: "/api/v1/system/metrics/app", wantCodes: []int{http.StatusUnauthorized, http.StatusForbidden}},
		{path: "/api/v1/system/metrics/prometheus", wantCodes: []int{http.StatusUnauthorized, http.StatusForbidden}},
		{path: "/debug/pprof/", wantCodes: []int{http.StatusNotFound, http.StatusUnauthorized, http.StatusForbidden}},
	} {
		r := httptest.NewRequest(http.MethodGet, tc.path, nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, r)
		matched := false
		for _, code := range tc.wantCodes {
			if w.Code == code {
				matched = true
				break
			}
		}
		if !matched {
			t.Fatalf("GET %s returned unexpected status %d (expected one of %v)", tc.path, w.Code, tc.wantCodes)
		}
		if w.Code == http.StatusOK {
			t.Fatalf("GET %s leaked status 200 without auth", tc.path)
		}
	}

	done := make(chan error, 1)
	go func() {
		done <- srv.Close()
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("unexpected Close error: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Server.Close() blocked beyond 5s")
	}
}

func TestServerProfilingEnabledStillRequiresSuperadminAuth(t *testing.T) {
	srv := New(config.Config{
		StateDir:         t.TempDir(),
		FrontendDir:      t.TempDir(),
		DatabaseEnable:   false,
		SessionTTL:       time.Hour,
		EncryptionKey:    "test-encryption-key-0123456789abcdef",
		ProfilingEnabled: true,
	})
	defer func() {
		_ = srv.Close()
	}()

	req := httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized && rec.Code != http.StatusForbidden {
		t.Fatalf("expected unauthenticated /debug/pprof/ to be rejected (401/403), got %d", rec.Code)
	}
}

func TestServerImmediateAndRepeatedCloseRaceSafe(t *testing.T) {
	for i := 0; i < 10; i++ {
		srv := New(config.Config{
			StateDir:         t.TempDir(),
			FrontendDir:      t.TempDir(),
			DatabaseEnable:   false,
			SessionTTL:       time.Hour,
			EncryptionKey:    "test-encryption-key-0123456789abcdef",
			ProfilingEnabled: false,
		})
		done := make(chan error, 1)
		go func() {
			err := srv.Close()
			if err != nil {
				done <- err
				return
			}
			// Closing a second time must remain idempotent and never panic or block.
			done <- srv.Close()
		}()
		select {
		case err := <-done:
			if err != nil {
				t.Fatalf("iteration %d close error: %v", i, err)
			}
		case <-time.After(3 * time.Second):
			t.Fatalf("iteration %d immediate Close() deadlocked", i)
		}
	}
}
