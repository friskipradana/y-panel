package httpserver

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestValidUploadName(t *testing.T) {
	for name, want := range map[string]bool{
		"report.pdf": true, "my file (1).txt": true, "ünï.png": true, ".env": true,
		"": false, ".": false, "..": false, "a/b": false, `a\b`: false, "../x": false, "x\x00y": false, "tab\tname": false, strings.Repeat("a", 256): false,
	} {
		if validUploadName(name) != want {
			t.Errorf("%q: want %v", name, want)
		}
	}
}

func TestSaveUploadedFileWritesKeepsAndReplaces(t *testing.T) {
	dir := t.TempDir()
	written, reason, err := saveUploadedFile(dir, "a.txt", strings.NewReader("first"), false, 1<<20)
	if err != nil || reason != "" || written != 5 {
		t.Fatalf("a new file: %d %q %v", written, reason, err)
	}
	if _, reason, _ := saveUploadedFile(dir, "a.txt", strings.NewReader("second"), false, 1<<20); reason != "exists" {
		t.Fatalf("a taken name is kept: %q", reason)
	}
	if data, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(data) != "first" {
		t.Fatalf("the old file is untouched: %q", data)
	}
	if _, reason, err := saveUploadedFile(dir, "a.txt", strings.NewReader("second"), true, 1<<20); err != nil || reason != "" {
		t.Fatalf("overwrite: %q %v", reason, err)
	}
	if data, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(data) != "second" {
		t.Fatalf("replaced: %q", data)
	}
	_ = os.Mkdir(filepath.Join(dir, "folder"), 0o755)
	if _, reason, _ := saveUploadedFile(dir, "folder", strings.NewReader("x"), true, 1<<20); reason != "folder" {
		t.Fatalf("a folder is never replaced by a file: %q", reason)
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".reneo-upload-") {
			t.Fatalf("a temporary file was left: %s", e.Name())
		}
	}
}

func TestSaveUploadedFileRefusesTooBigAndLeavesNothing(t *testing.T) {
	dir := t.TempDir()
	if _, _, err := saveUploadedFile(dir, "big.bin", strings.NewReader(strings.Repeat("x", 100)), false, 10); err == nil {
		t.Fatal("more than the limit is refused")
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Fatalf("nothing is left behind: %v", entries)
	}
}

func TestSaveUploadedFileNeverWritesThroughALink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need privileges on windows")
	}
	dir := t.TempDir()
	outside := filepath.Join(t.TempDir(), "secret")
	_ = os.WriteFile(outside, []byte("keep"), 0o600)
	if err := os.Symlink(outside, filepath.Join(dir, "link.txt")); err != nil {
		t.Fatal(err)
	}
	if _, _, err := saveUploadedFile(dir, "link.txt", strings.NewReader("overwritten"), true, 1<<20); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(outside); string(data) != "keep" {
		t.Fatalf("the file behind the link must not change: %q", data)
	}
	if data, _ := os.ReadFile(filepath.Join(dir, "link.txt")); string(data) != "overwritten" {
		t.Fatalf("the name now holds the upload: %q", data)
	}
}
