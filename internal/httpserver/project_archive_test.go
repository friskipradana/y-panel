package httpserver

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTarGz(t *testing.T, gzipped bool, entries []tar.Header, bodies map[string]string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "build.tar.gz")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	var tw *tar.Writer
	var zw *gzip.Writer
	if gzipped {
		zw = gzip.NewWriter(f)
		tw = tar.NewWriter(zw)
	} else {
		tw = tar.NewWriter(f)
	}
	for _, header := range entries {
		header := header
		body := bodies[header.Name]
		if header.Typeflag == tar.TypeReg {
			header.Size = int64(len(body))
		}
		if err := tw.WriteHeader(&header); err != nil {
			t.Fatal(err)
		}
		if header.Typeflag == tar.TypeReg {
			_, _ = tw.Write([]byte(body))
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if zw != nil {
		if err := zw.Close(); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestExtractProjectArchiveReadsTarGzAndSkipsLinks(t *testing.T) {
	path := writeTarGz(t, true, []tar.Header{
		{Name: "dist/", Typeflag: tar.TypeDir, Mode: 0o755},
		{Name: "dist/index.html", Typeflag: tar.TypeReg, Mode: 0o644},
		{Name: "dist/link", Typeflag: tar.TypeSymlink, Linkname: "/etc/passwd"},
	}, map[string]string{"dist/index.html": "<h1>hi</h1>"})
	dest := t.TempDir()
	if err := extractProjectArchive(path, dest); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(filepath.Join(dest, "dist", "index.html")); string(data) != "<h1>hi</h1>" {
		t.Fatalf("got %q", data)
	}
	if _, err := os.Lstat(filepath.Join(dest, "dist", "link")); err == nil {
		t.Fatal("a link in an archive is left out")
	}
}

func TestExtractProjectArchiveReadsPlainTarAndRefusesEscapes(t *testing.T) {
	plain := writeTarGz(t, false, []tar.Header{{Name: "index.html", Typeflag: tar.TypeReg, Mode: 0o644}}, map[string]string{"index.html": "x"})
	dest := t.TempDir()
	if err := extractProjectArchive(plain, dest); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dest, "index.html")); err != nil {
		t.Fatal("a plain tar is read")
	}
	evil := writeTarGz(t, true, []tar.Header{{Name: "../evil.txt", Typeflag: tar.TypeReg, Mode: 0o644}}, map[string]string{"../evil.txt": "x"})
	if err := extractProjectArchive(evil, t.TempDir()); err == nil {
		t.Fatal("a path that leaves the folder must be refused")
	}
}

// a RAR5 archive made with rar: dist/index.html and dist/assets/app.js
func TestExtractProjectArchiveReadsRar(t *testing.T) {
	dest := t.TempDir()
	if err := extractProjectArchive(filepath.Join("testdata", "site5.rar"), dest); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(filepath.Join(dest, "dist", "index.html")); !strings.Contains(string(data), "hello") {
		t.Fatalf("index.html of the rar: %q", data)
	}
	if data, _ := os.ReadFile(filepath.Join(dest, "dist", "assets", "app.js")); string(data) != "console.log(1)" {
		t.Fatalf("app.js of the rar: %q", data)
	}
}

func TestExtractProjectArchiveRefusesAPasswordedRarAndUnknownFiles(t *testing.T) {
	err := extractProjectArchive(filepath.Join("testdata", "locked.rar"), t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "kata sandi") {
		t.Fatalf("a rar with a password is refused with a clear message: %v", err)
	}
	notArchive := filepath.Join(t.TempDir(), "x.rar")
	if werr := os.WriteFile(notArchive, []byte("this is plain text, not an archive"), 0o644); werr != nil {
		t.Fatal(werr)
	}
	if err := extractProjectArchive(notArchive, t.TempDir()); err == nil || !strings.Contains(err.Error(), "tidak dikenali") {
		t.Fatalf("a renamed file is not trusted: %v", err)
	}
}

func TestIsArchiveName(t *testing.T) {
	for name, want := range map[string]bool{"Dist.ZIP": true, "build.rar": true, "a.tar.gz": true, "a.tgz": true, "a.tar": true, "a.7z": false, "a.exe": false, "zip": false} {
		if isArchiveName(name) != want {
			t.Errorf("%s: want %v", name, want)
		}
	}
}
