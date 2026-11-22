package httpserver

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFrontendFilesAreGzippedWhenAccepted(t *testing.T) {
	dir := t.TempDir()
	body := strings.Repeat("function reneo(){return 1}\n", 200)
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "app-abc.js"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	handler := newFrontendHandler(dir)

	req := httptest.NewRequest(http.MethodGet, "/assets/app-abc.js", nil)
	req.Header.Set("Accept-Encoding", "gzip, br")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Header().Get("Content-Encoding") != "gzip" || !strings.Contains(rec.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("expected a gzipped, immutable asset: %v", rec.Header())
	}
	zr, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(zr)
	if string(got) != body || rec.Body.Len() >= len(body) {
		t.Fatalf("the compressed body must decode to the file and be smaller")
	}

	plain := httptest.NewRecorder()
	handler.ServeHTTP(plain, httptest.NewRequest(http.MethodGet, "/assets/app-abc.js", nil))
	if plain.Header().Get("Content-Encoding") != "" || plain.Body.String() != body {
		t.Fatalf("without Accept-Encoding the file is sent as it is")
	}
}
