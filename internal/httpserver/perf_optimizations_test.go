package httpserver

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/docker"
	socketlist "github.com/friskipradana/panel-desktop-ui/internal/listening"
)

func TestRateLimitSweepAndOriginFastPath(t *testing.T) {
	srv := &Server{
		cfg: config.Config{
			AllowedOrigins: []string{"https://panel.example.com"},
		},
		rateLimits: map[string]*rateLimitEntry{
			"stale": {Count: 1, ResetAt: time.Now().Add(-time.Minute), LastSeenAt: time.Now().Add(-15 * time.Minute)},
		},
	}

	ok, _ := srv.allowRateLimit("fresh", rateLimitRule{Window: time.Minute, Limit: 10})
	if !ok {
		t.Fatal("expected first request under rate limit to pass")
	}
	srv.rateLimitMu.Lock()
	_, staleExists := srv.rateLimits["stale"]
	srv.rateLimitMu.Unlock()
	if staleExists {
		t.Fatal("expected stale rate limit entry to be swept on initial pass")
	}

	if !srv.isOriginAllowed("https://panel.example.com") {
		t.Fatal("expected configured allowed origin to pass")
	}
	if !srv.isOriginAllowed("http://127.0.0.1:5173") {
		t.Fatal("expected loopback origin to pass")
	}
	if srv.isOriginAllowed("https://evil.invalid") {
		t.Fatal("expected unknown origin to be rejected when database is nil")
	}
}

func TestContainerStatesByNameAndProtectedPortsFromListeners(t *testing.T) {
	states := containerStatesByName([]docker.Container{
		{Names: []string{"/reneo-db-1"}, State: "running"},
		{Names: []string{"reneo-db-2"}, State: "exited"},
	})
	if states["reneo-db-1"] != "running" || states["reneo-db-2"] != "exited" {
		t.Fatalf("unexpected state map: %+v", states)
	}

	srv := &Server{cfg: config.Config{BindAddr: ":8787"}}
	protected := srv.protectedPortsFromListeners([]socketlist.Listener{
		{Proto: "tcp", Process: "sshd", Port: 2222},
		{Proto: "tcp", Process: "panel", Port: 8787},
	})
	if len(protected) != 2 || protected[0].Port != 2222 || protected[1].Port != 8787 {
		t.Fatalf("unexpected protected ports: %+v", protected)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return fn(r)
}

func TestCachedCloudflareZonesAndRevisionCache(t *testing.T) {
	var hits atomic.Int32
	fakeClient := &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			rec := httptest.NewRecorder()
			if r.URL.Path == "/zones" {
				hits.Add(1)
				rec.Header().Set("Content-Type", "application/json")
				_, _ = rec.WriteString(`{"success":true,"errors":[],"result":[{"id":"z1","name":"example.com","status":"active"}]}`)
			} else {
				http.NotFound(rec, r)
			}
			return rec.Result(), nil
		}),
	}

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>ok</html>"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PANEL_VERSION", "v1.88.99")

	srv := &Server{cfg: config.Config{FrontendDir: dir}}
	client := cloudflareapi.NewClient("tok", "acct", "").
		WithBaseURL("http://cloudflare.test").
		WithHTTPClient(fakeClient)

	z1, err := srv.cachedCloudflareZones(1, client)
	if err != nil || len(z1) != 1 || z1[0].ID != "z1" {
		t.Fatalf("unexpected initial zones: %+v err=%v", z1, err)
	}
	z1[0].Name = "mutated"
	z2, err := srv.cachedCloudflareZones(1, client)
	if err != nil || len(z2) != 1 || z2[0].Name != "example.com" {
		t.Fatalf("expected isolated cached copy, got %+v err=%v", z2, err)
	}
	if hits.Load() != 1 {
		t.Fatalf("expected 1 upstream /zones hit while cached, got %d", hits.Load())
	}

	srv.invalidateCloudflareZonesCache(1)
	if _, err := srv.cachedCloudflareZones(1, client); err != nil {
		t.Fatal(err)
	}
	if hits.Load() != 2 {
		t.Fatalf("expected 2 upstream /zones hits after invalidation, got %d", hits.Load())
	}

	rev, ver := srv.frontendRevision(), srv.appVersion()
	if rev == "unknown" || rev == "" || ver != "v1.88.99" {
		t.Fatalf("unexpected revision=%q version=%q", rev, ver)
	}
}
