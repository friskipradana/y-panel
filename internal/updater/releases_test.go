package updater

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestReleasesParsesCachesAndSkipsDrafts(t *testing.T) {
	hits := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		_, _ = w.Write([]byte(`[
			{"tag_name":"v4.3.0","name":"v4.3.0","html_url":"https://example.test/r/4.3.0","body":"## Ringkasan\n- fitur baru\n","published_at":"2026-10-15T10:00:00Z"},
			{"tag_name":"v4.3.1-rc","name":"","html_url":"x","body":"draft","draft":true},
			{"tag_name":"v4.2.0","name":"","html_url":"https://example.test/r/4.2.0","body":"","published_at":"2026-10-10T10:00:00Z","prerelease":true}
		]`))
	}))
	defer server.Close()

	c := New()
	c.releasesURL = server.URL
	c.client = server.Client()

	items, err := c.Releases(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("want 2 items (draft skipped), got %d", len(items))
	}
	if items[0].Version != "4.3.0" || items[0].Summary != "Ringkasan" {
		t.Fatalf("unexpected first item: %+v", items[0])
	}
	if items[1].Title != "v4.2.0" || !items[1].Prerelease {
		t.Fatalf("empty name must fall back to the tag: %+v", items[1])
	}

	if _, err := c.Releases(context.Background(), false); err != nil || hits != 1 {
		t.Fatalf("second call must come from cache (hits=%d err=%v)", hits, err)
	}
	if _, err := c.Releases(context.Background(), true); err != nil || hits != 2 {
		t.Fatalf("force must refetch (hits=%d err=%v)", hits, err)
	}
}

func TestReleasesKeepsOldListWhenRefreshFails(t *testing.T) {
	ok := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !ok {
			http.Error(w, "rate limited", http.StatusForbidden)
			return
		}
		_, _ = w.Write([]byte(`[{"tag_name":"v1.0.0","name":"One","html_url":"u","body":"b","published_at":"2026-01-01T00:00:00Z"}]`))
	}))
	defer server.Close()

	c := New()
	c.releasesURL = server.URL
	c.client = server.Client()
	if _, err := c.Releases(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	ok = false
	c.mu.Lock()
	c.releases.at = time.Now().Add(-2 * time.Hour)
	c.mu.Unlock()

	items, err := c.Releases(context.Background(), false)
	if err == nil || len(items) != 1 {
		t.Fatalf("want stale list plus error, got %d items err=%v", len(items), err)
	}
	if !strings.Contains(err.Error(), "403") {
		t.Fatalf("error should name the status: %v", err)
	}
}
