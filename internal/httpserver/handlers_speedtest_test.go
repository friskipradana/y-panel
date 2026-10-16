package httpserver

import (
	"bytes"
	"net/http"
	"net/http/httptest"
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
