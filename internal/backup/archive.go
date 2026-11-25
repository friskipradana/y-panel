package backup

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var skipDirs = map[string]bool{
	"node_modules": true,
	".turbo":       true,
	".cache":       true,
}

// ArchiveDirectoryTarGz compresses srcDir into a tar.gz stream, skipping heavy cache/dependency folders and symlinks.
func ArchiveDirectoryTarGz(srcDir string, w io.Writer) error {
	cleanRoot, err := filepath.Abs(strings.TrimSpace(srcDir))
	if err != nil {
		return err
	}
	info, err := os.Stat(cleanRoot)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("folder sumber backup tidak ditemukan: %s", cleanRoot)
	}

	gz := gzip.NewWriter(w)
	tw := tar.NewWriter(gz)

	walkErr := filepath.Walk(cleanRoot, func(path string, fi os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(cleanRoot, path)
		if err != nil || rel == "." {
			return nil
		}
		if fi.IsDir() && skipDirs[fi.Name()] {
			return filepath.SkipDir
		}
		if fi.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		hdr, err := tar.FileInfoHeader(fi, "")
		if err != nil {
			return err
		}
		hdr.Name = filepath.ToSlash(rel)
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if !fi.Mode().IsRegular() {
			return nil
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(tw, f)
		_ = f.Close()
		return copyErr
	})

	closeTarErr := tw.Close()
	closeGzErr := gz.Close()
	if walkErr != nil {
		return walkErr
	}
	if closeTarErr != nil {
		return closeTarErr
	}
	return closeGzErr
}

// ExtractTarGzSafe unpacks a tar.gz stream into destDir while blocking path traversal and symlinks.
func ExtractTarGzSafe(src io.Reader, destDir string) error {
	cleanDest, err := filepath.Abs(strings.TrimSpace(destDir))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(cleanDest, 0o755); err != nil {
		return err
	}
	gz, err := gzip.NewReader(src)
	if err != nil {
		return fmt.Errorf("arsip gzip tidak valid: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	prefix := cleanDest + string(os.PathSeparator)

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("gagal membaca entri tar: %w", err)
		}
		if hdr.Typeflag == tar.TypeSymlink || hdr.Typeflag == tar.TypeLink {
			continue
		}
		cleanRel := filepath.Clean(filepath.FromSlash(hdr.Name))
		if cleanRel == "." || cleanRel == "" || filepath.IsAbs(cleanRel) || strings.HasPrefix(cleanRel, "..") {
			return errors.New("arsip mengandung path tidak aman (traversal ditolak)")
		}
		target := filepath.Join(cleanDest, cleanRel)
		if target != cleanDest && !strings.HasPrefix(target, prefix) {
			return errors.New("arsip mengandung path di luar folder tujuan")
		}
		if hdr.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		mode := hdr.FileInfo().Mode().Perm()
		if mode == 0 {
			mode = 0o644
		}
		outFile, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(outFile, io.LimitReader(tr, 2<<30))
		closeErr := outFile.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

// HashFile computes the file size and SHA-256 hex digest of path.
func HashFile(path string) (int64, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, "", err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return 0, "", err
	}
	return n, hex.EncodeToString(h.Sum(nil)), nil
}
