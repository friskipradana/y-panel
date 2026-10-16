package httpserver

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSpeedtestDownloadSizeAndCap(t *testing.T) {
	s := &Server{}
	cases := []struct {
		query string
		want  int
	}{
		{"?bytes=1000", 1000},
		{"?bytes=0", 0},
		{"?bytes=999999999999", speedMaxBytes},
	}
	for _, tc := range cases {
		rec := httptest.NewRecorder()
		s.handleSpeedtestDownload(rec, httptest.NewRequest(http.MethodGet, "/api/v1/speedtest/download"+tc.query, nil))
		if rec.Code != http.StatusOK || rec.Body.Len() != tc.want {
			t.Fatalf("%s: status=%d bytes=%d want=%d", tc.query, rec.Code, rec.Body.Len(), tc.want)
		}
	}
	rec := httptest.NewRecorder()
	s.handleSpeedtestDownload(rec, httptest.NewRequest(http.MethodGet, "/api/v1/speedtest/download?bytes=-5", nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("negative size should be rejected, got %d", rec.Code)
	}
}

func TestSpeedtestUploadCountsAndLimits(t *testing.T) {
	s := &Server{}
	rec := httptest.NewRecorder()
	s.handleSpeedtestUpload(rec, httptest.NewRequest(http.MethodPost, "/api/v1/speedtest/upload", bytes.NewReader(make([]byte, 4096))))
	if rec.Code != http.StatusOK || !bytes.Contains(rec.Body.Bytes(), []byte(`"bytes":4096`)) {
		t.Fatalf("unexpected reply: %d %s", rec.Code, rec.Body.String())
	}
}

func TestSpeedtestPathsAreExemptFromLogs(t *testing.T) {
	if !isSpeedtestPath("/api/v1/speedtest/ping") || isSpeedtestPath("/api/v1/system/info") {
		t.Fatal("isSpeedtestPath misclassifies paths")
	}
}

func TestPickSpeedSourceSkipsRefusedHosts(t *testing.T) {
	refuse := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusForbidden) }))
	defer refuse.Close()
	serve := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(make([]byte, 8192))
	}))
	defer serve.Close()

	sources := []speedSource{{"refusing.example", refuse.URL}, {"serving.example", serve.URL}}
	picked, failures := pickSpeedSource(context.Background(), http.DefaultClient, sources)
	if picked == nil || picked.name != "serving.example" {
		t.Fatalf("expected the serving source, got %+v", picked)
	}
	if len(failures) != 1 || !strings.Contains(failures[0], "HTTP 403") {
		t.Fatalf("expected the 403 to be reported, got %v", failures)
	}

	none, failures := pickSpeedSource(context.Background(), http.DefaultClient, sources[:1])
	if none != nil || len(failures) != 1 {
		t.Fatalf("a refusing source must not be picked: %+v %v", none, failures)
	}
}

func TestMeasureSpeedDownloadReportsRefusal(t *testing.T) {
	refuse := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusForbidden) }))
	defer refuse.Close()
	mbps, note := measureSpeedDownload(context.Background(), http.DefaultClient, speedSource{"refusing.example", refuse.URL}, func(float64, float64) {})
	if mbps != 0 || !strings.Contains(note, "HTTP 403") {
		t.Fatalf("a refused download must report 0 and the status, got %v %q", mbps, note)
	}
}

func TestResolveSpeedServers(t *testing.T) {
	all, ok := resolveSpeedServers("")
	if !ok || len(all) < 2 || all[0].ID != "cloudflare" {
		t.Fatalf("auto must list every server, Cloudflare first: %v %v", ok, all)
	}
	one, ok := resolveSpeedServers("tele2")
	if !ok || len(one) != 1 || !one[0].canUpload() {
		t.Fatalf("tele2 must resolve alone and accept uploads: %v %+v", ok, one)
	}
	if _, ok := resolveSpeedServers("http://169.254.169.254/"); ok {
		t.Fatal("an arbitrary address must not resolve to a server")
	}
	for _, server := range speedCatalog() {
		if server.canUpload() == false && server.Host == "" {
			t.Fatalf("server %s has no host", server.ID)
		}
	}
}
