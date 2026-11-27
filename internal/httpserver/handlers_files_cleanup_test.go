package httpserver

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanCleanupDirDetectsJunkCategories(t *testing.T) {
	dir := t.TempDir()

	// Create cache directory, temp file, rotated log, empty dir, and normal source file
	cacheDir := filepath.Join(dir, "__pycache__")
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cacheDir, "app.cpython-312.pyc"), make([]byte, 2048), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "backup.bak"), make([]byte, 1024), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "nginx.log.1"), make([]byte, 4096), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "unused_empty"), 0o755); err != nil {
		t.Fatal(err)
	}
	// Normal non-junk file should not be flagged
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>hello</h1>"), 0o644); err != nil {
		t.Fatal(err)
	}

	var items []cleanupItem
	visited := 0
	truncated := false
	scanCleanupDir(dir, &visited, &truncated, &items)

	cats := map[string]bool{}
	for _, it := range items {
		cats[it.Category] = true
		if it.Name == "index.html" {
			t.Fatalf("did not expect normal file index.html to be flagged as junk")
		}
	}
	for _, expected := range []string{"cache", "temp", "logs", "empty"} {
		if !cats[expected] {
			t.Fatalf("expected category %q to be detected, got %+v", expected, items)
		}
	}
}
