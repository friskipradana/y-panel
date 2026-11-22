package httpserver

import (
	"archive/zip"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/projects"
)

func writeZip(t *testing.T, entries map[string]string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "build.zip")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for name, body := range entries {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(body))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestExtractProjectZipRejectsEscapingPaths(t *testing.T) {
	zipPath := writeZip(t, map[string]string{"../evil.txt": "x"})
	if err := extractProjectZip(zipPath, t.TempDir()); err == nil {
		t.Fatal("a path that leaves the folder must be refused")
	}
}

func TestExtractProjectZipWritesPlainFiles(t *testing.T) {
	dest := t.TempDir()
	zipPath := writeZip(t, map[string]string{"index.html": "<h1>hi</h1>", "assets/app.js": "1"})
	if err := extractProjectZip(zipPath, dest); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(filepath.Join(dest, "assets", "app.js")); string(data) != "1" {
		t.Fatalf("got %q", data)
	}
}

func TestMergeTreeNeverWritesThroughASymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need privileges on windows")
	}
	outside := filepath.Join(t.TempDir(), "secret")
	if err := os.WriteFile(outside, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	project := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(project, "index.html")); err != nil {
		t.Fatal(err)
	}
	outsideDir := t.TempDir()
	if err := os.Symlink(outsideDir, filepath.Join(project, "assets")); err != nil {
		t.Fatal(err)
	}
	build := t.TempDir()
	if err := os.MkdirAll(filepath.Join(build, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(build, "index.html"), []byte("new"), 0o644)
	_ = os.WriteFile(filepath.Join(build, "assets", "a.js"), []byte("js"), 0o644)

	if err := mergeTree(build, project); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(outside); string(data) != "keep" {
		t.Fatalf("the file behind the symlink was overwritten: %q", data)
	}
	if entries, _ := os.ReadDir(outsideDir); len(entries) != 0 {
		t.Fatal("the folder behind the symlink received files")
	}
	if data, _ := os.ReadFile(filepath.Join(project, "index.html")); string(data) != "new" {
		t.Fatalf("index.html = %q", data)
	}
	if data, _ := os.ReadFile(filepath.Join(project, "assets", "a.js")); string(data) != "js" {
		t.Fatalf("assets/a.js = %q", data)
	}
}

func TestBuildingProjectIsReconciledByWhatItDoes(t *testing.T) {
	cases := []struct {
		name string
		snap projects.RuntimeSnapshot
		want string
	}{
		{"listening", projects.RuntimeSnapshot{Running: true, Listening: true}, "active"},
		{"still starting", projects.RuntimeSnapshot{Running: true}, "building"},
		{"ended", projects.RuntimeSnapshot{}, "error"},
	}
	for _, c := range cases {
		if got := deriveReconciledProjectStatus("building", c.snap); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestReplaceTreeSwapsEntriesAndDropsTheRest(t *testing.T) {
	project := t.TempDir()
	_ = os.WriteFile(filepath.Join(project, "old.html"), []byte("old"), 0o644)
	_ = os.WriteFile(filepath.Join(project, "index.html"), []byte("v1"), 0o644)
	build := t.TempDir()
	_ = os.WriteFile(filepath.Join(build, "index.html"), []byte("v2"), 0o644)
	if err := replaceTree(build, project); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(filepath.Join(project, "index.html")); string(data) != "v2" {
		t.Fatalf("index.html = %q", data)
	}
	if _, err := os.Stat(filepath.Join(project, "old.html")); !os.IsNotExist(err) {
		t.Fatal("an entry the new build lacks must be removed")
	}
}

func TestExtractZipRefusesToWriteThroughASymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need privileges on windows")
	}
	outside := t.TempDir()
	dest := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(dest, "link")); err != nil {
		t.Fatal(err)
	}
	zipPath := writeZip(t, map[string]string{"link/pwned.txt": "x"})
	if err := extractZip(zipPath, dest); err == nil {
		t.Fatal("an entry under a symlinked folder must be refused")
	}
	if entries, _ := os.ReadDir(outside); len(entries) != 0 {
		t.Fatal("a file was written behind the symlink")
	}
}
