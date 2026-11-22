package httpserver

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"testing"
)

func buildArchive(t *testing.T, files map[string]string, order []string) []byte {
	t.Helper()
	var raw bytes.Buffer
	gz := gzip.NewWriter(&raw)
	tw := tar.NewWriter(gz)
	for _, name := range order {
		body := files[name]
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o755, Size: int64(len(body)), Typeflag: tar.TypeReg}); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	_ = tw.Close()
	_ = gz.Close()
	return raw.Bytes()
}

func TestExtractOoklaBinaryTakesOnlyTheClient(t *testing.T) {
	archive := buildArchive(t, map[string]string{
		"../../etc/cron.d/evil": "bad",
		"speedtest.md":          "docs",
		"speedtest":             "BINARY",
	}, []string{"../../etc/cron.d/evil", "speedtest.md", "speedtest"})
	got, err := extractOoklaBinary(archive)
	if err != nil || string(got) != "BINARY" {
		t.Fatalf("got %q err=%v", got, err)
	}
}

func TestExtractOoklaBinaryNeedsTheClient(t *testing.T) {
	archive := buildArchive(t, map[string]string{"speedtest.5": "man"}, []string{"speedtest.5"})
	if _, err := extractOoklaBinary(archive); err == nil {
		t.Fatal("an archive without the client must be refused")
	}
	if _, err := extractOoklaBinary([]byte("not an archive")); err == nil {
		t.Fatal("garbage must be refused")
	}
}

func TestEveryArchiveHasAPinnedHash(t *testing.T) {
	for arch, archive := range ooklaArchives {
		if archive.Name == "" || len(archive.SHA256) != 64 {
			t.Errorf("%s: incomplete entry %+v", arch, archive)
		}
	}
}
