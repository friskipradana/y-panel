package backup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestArchiveAndExtractRoundTrip(t *testing.T) {
	src := t.TempDir()
	if err := os.MkdirAll(filepath.Join(src, "src"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(src, "node_modules", "pkg"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "src", "index.txt"), []byte("hello reneo"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "node_modules", "pkg", "skip.js"), []byte("ignored"), 0o644); err != nil {
		t.Fatal(err)
	}

	var buf bytes.Buffer
	if err := ArchiveDirectoryTarGz(src, &buf); err != nil {
		t.Fatalf("ArchiveDirectoryTarGz failed: %v", err)
	}

	dest := t.TempDir()
	if err := ExtractTarGzSafe(&buf, dest); err != nil {
		t.Fatalf("ExtractTarGzSafe failed: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dest, "src", "index.txt"))
	if err != nil || string(data) != "hello reneo" {
		t.Fatalf("unexpected restored file: %q err=%v", string(data), err)
	}
	if _, err := os.Stat(filepath.Join(dest, "node_modules")); !os.IsNotExist(err) {
		t.Fatalf("expected node_modules to be skipped")
	}
}

func TestExtractTarGzRejectsTraversal(t *testing.T) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	payload := []byte("evil")
	_ = tw.WriteHeader(&tar.Header{Name: "../escape.txt", Mode: 0o644, Size: int64(len(payload))})
	_, _ = tw.Write(payload)
	_ = tw.Close()
	_ = gz.Close()

	if err := ExtractTarGzSafe(&buf, t.TempDir()); err == nil {
		t.Fatal("expected traversal archive to fail")
	}
}

func TestS3SignRequestSigV4(t *testing.T) {
	client, err := NewS3Client(S3Config{
		Endpoint:       "https://12345.r2.cloudflarestorage.com",
		Region:         "auto",
		Bucket:         "reneo-backups",
		Prefix:         "prod",
		AccessKey:      "AKIAEXAMPLE",
		SecretKey:      "SECRETEXAMPLE",
		ForcePathStyle: true,
	})
	if err != nil {
		t.Fatalf("NewS3Client failed: %v", err)
	}
	if got := client.FullKey("db-1.sql.gz"); got != "prod/db-1.sql.gz" {
		t.Fatalf("unexpected FullKey: %q", got)
	}
	u, err := client.objectURL("prod/db-1.sql.gz", "")
	if err != nil {
		t.Fatalf("objectURL failed: %v", err)
	}
	if !strings.Contains(u, "/reneo-backups/prod/db-1.sql.gz") {
		t.Fatalf("unexpected path-style URL: %s", u)
	}
	req, _ := http.NewRequest(http.MethodPut, u, nil)
	client.SignRequest(req, sha256Hex(nil), time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC))
	auth := req.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/20261125/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=") {
		t.Fatalf("unexpected SigV4 Authorization header: %s", auth)
	}
}
