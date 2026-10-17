package httpserver

import (
	"archive/tar"
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Extraction runs as root into folders their owners control, so it never follows a link that
// is already there, never creates one, and never copies setuid bits from the archive.

const (
	maxArchiveFiles = 200000
	maxArchiveBytes = int64(10) << 30
)

// archiveBudget counts what an extraction has written, so a small archive that unpacks into a huge one stops.
type archiveBudget struct {
	files int
	bytes int64
}

func (b *archiveBudget) addFile() error {
	b.files++
	if b.files > maxArchiveFiles {
		return fmt.Errorf("arsip berisi lebih dari %d berkas", maxArchiveFiles)
	}
	return nil
}

// archiveTarget joins an entry name to the destination and refuses a path that leaves it or passes through a symlink.
func archiveTarget(dest, name string) (string, error) {
	base := filepath.Clean(dest)
	target := filepath.Join(base, filepath.FromSlash(name))
	if target != base && !strings.HasPrefix(target, base+string(os.PathSeparator)) {
		return "", errors.New("arsip mengandung path tidak aman")
	}
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return "", err
	}
	current := base
	for _, part := range strings.Split(rel, string(os.PathSeparator)) {
		if part == "." || part == "" {
			continue
		}
		current = filepath.Join(current, part)
		if info, err := os.Lstat(current); err == nil && info.Mode()&os.ModeSymlink != 0 {
			return "", errors.New("arsip akan menulis melalui symlink")
		}
	}
	return target, nil
}

func archiveFileMode(mode os.FileMode) os.FileMode {
	if mode&0o111 != 0 {
		return 0o755
	}
	return 0o644
}

// writeArchiveFile puts one regular file in place: what is there (a file, a link) is removed first and the new one is created exclusively.
func writeArchiveFile(target string, src io.Reader, mode os.FileMode, budget *archiveBudget) error {
	if err := budget.addFile(); err != nil {
		return err
	}
	if err := mkdirAllOwned(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	if info, err := os.Lstat(target); err == nil {
		if info.IsDir() {
			return fmt.Errorf("%s adalah folder, bukan berkas", filepath.Base(target))
		}
		if err := os.Remove(target); err != nil {
			return err
		}
	}
	dst, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, archiveFileMode(mode))
	if err != nil {
		return err
	}
	n, copyErr := io.Copy(dst, io.LimitReader(src, maxArchiveBytes-budget.bytes+1))
	closeErr := dst.Close()
	budget.bytes += n
	if budget.bytes > maxArchiveBytes {
		return fmt.Errorf("isi arsip melebihi %d GB setelah diekstrak", maxArchiveBytes>>30)
	}
	if copyErr != nil {
		return copyErr
	}
	if closeErr == nil {
		chownLikeParent(target)
	}
	return closeErr
}

func extractZip(sourcePath, destPath string) error {
	reader, err := zip.OpenReader(sourcePath)
	if err != nil {
		return err
	}
	defer reader.Close()
	if len(reader.File) > maxArchiveFiles {
		return fmt.Errorf("arsip berisi lebih dari %d berkas", maxArchiveFiles)
	}

	budget := &archiveBudget{}
	for _, file := range reader.File {
		target, err := archiveTarget(destPath, file.Name)
		if err != nil {
			return err
		}
		if file.FileInfo().IsDir() {
			if err := mkdirAllOwned(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if !file.Mode().IsRegular() {
			continue
		}
		src, err := file.Open()
		if err != nil {
			return err
		}
		err = writeArchiveFile(target, src, file.Mode(), budget)
		src.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func extractTarArchive(tr *tar.Reader, destPath string) error {
	budget := &archiveBudget{}
	for {
		header, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		target, err := archiveTarget(destPath, header.Name)
		if err != nil {
			return err
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := mkdirAllOwned(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := writeArchiveFile(target, tr, os.FileMode(header.Mode), budget); err != nil {
				return err
			}
		}
	}
}
