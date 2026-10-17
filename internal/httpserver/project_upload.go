package httpserver

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	osuserpkg "os/user"
)

// The agent runs as root and writes into folders their owners control. Everything below treats a
// symlink in such a folder as hostile: it is replaced, never followed.

const (
	maxUploadFiles = 20000
	maxUploadBytes = int64(1) << 30
)

// extractProjectZip unpacks an uploaded build into an empty directory. Links and special files
// are left out, modes are reduced to plain file/executable, and the size is capped by what is
// really written, not by what the archive claims.
func extractProjectZip(zipPath, dest string) error {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer reader.Close()
	if len(reader.File) > maxUploadFiles {
		return fmt.Errorf("arsip ZIP berisi lebih dari %d berkas", maxUploadFiles)
	}

	base := filepath.Clean(dest)
	var total int64
	for _, file := range reader.File {
		target := filepath.Join(base, filepath.FromSlash(file.Name))
		if target != base && !strings.HasPrefix(target, base+string(os.PathSeparator)) {
			return errors.New("arsip ZIP mengandung path tidak aman")
		}
		mode := file.Mode()
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if !mode.IsRegular() {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		perm := os.FileMode(0o644)
		if mode&0o111 != 0 {
			perm = 0o755
		}
		src, err := file.Open()
		if err != nil {
			return err
		}
		dst, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, perm)
		if err != nil {
			src.Close()
			return err
		}
		n, copyErr := io.Copy(dst, io.LimitReader(src, maxUploadBytes-total+1))
		src.Close()
		closeErr := dst.Close()
		total += n
		if total > maxUploadBytes {
			return fmt.Errorf("isi arsip ZIP melebihi %d MB setelah diekstrak", maxUploadBytes>>20)
		}
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

// mergeTree copies the unpacked build over the project folder. Whatever sits at a destination
// path (a file, a folder of the wrong kind, a symlink) is removed first, and files are created
// with O_EXCL so a link planted in between is refused instead of followed.
func mergeTree(src, dst string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		from := filepath.Join(src, entry.Name())
		to := filepath.Join(dst, entry.Name())
		info, err := entry.Info()
		if err != nil {
			return err
		}
		existing, statErr := os.Lstat(to)
		if info.IsDir() {
			if statErr == nil && !existing.IsDir() {
				if err := os.Remove(to); err != nil {
					return err
				}
			}
			if err := os.MkdirAll(to, 0o755); err != nil {
				return err
			}
			if err := mergeTree(from, to); err != nil {
				return err
			}
			continue
		}
		if statErr == nil {
			if err := os.RemoveAll(to); err != nil {
				return err
			}
		}
		if err := copyNewFile(from, to, info.Mode().Perm()); err != nil {
			return err
		}
	}
	return nil
}

func copyNewFile(from, to string, perm os.FileMode) error {
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(to, os.O_CREATE|os.O_EXCL|os.O_WRONLY, perm)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// chownTreeNoFollow hands a folder to its owner. Links are given to the owner themselves; the
// file they point at is left alone.
func chownTreeNoFollow(root, osUsername string) error {
	if runtime.GOOS != "linux" || strings.TrimSpace(osUsername) == "" {
		return nil
	}
	account, err := osuserpkg.Lookup(osUsername)
	if err != nil {
		return nil
	}
	uid, err := strconv.Atoi(account.Uid)
	if err != nil {
		return nil
	}
	gid, err := strconv.Atoi(account.Gid)
	if err != nil {
		return nil
	}
	return filepath.WalkDir(root, func(path string, _ os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		return os.Lchown(path, uid, gid)
	})
}

// replaceTree makes dst hold exactly what src holds. Entries that are gone are removed and each
// new one is renamed into place, so a visitor sees the old site or the new one, not an empty folder.
func replaceTree(src, dst string) error {
	staged, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	keep := make(map[string]bool, len(staged))
	for _, entry := range staged {
		keep[entry.Name()] = true
	}
	existing, err := os.ReadDir(dst)
	if err != nil {
		return err
	}
	for _, entry := range existing {
		if !keep[entry.Name()] {
			if err := os.RemoveAll(filepath.Join(dst, entry.Name())); err != nil {
				return err
			}
		}
	}
	for _, entry := range staged {
		to := filepath.Join(dst, entry.Name())
		if err := os.RemoveAll(to); err != nil {
			return err
		}
		if err := os.Rename(filepath.Join(src, entry.Name()), to); err != nil {
			// another filesystem (the project folder is a mount): copy what is left instead
			return mergeTree(src, dst)
		}
	}
	return nil
}
