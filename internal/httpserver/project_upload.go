package httpserver

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	osuserpkg "os/user"

	"github.com/nwaples/rardecode/v2"
)

// The agent runs as root and writes into folders their owners control. Everything below treats a
// symlink in such a folder as hostile: it is replaced, never followed.

const (
	maxUploadFiles = 20000
	maxUploadBytes = int64(1) << 30
)

// archiveEntry is one item of an uploaded archive, whatever the format
type archiveEntry struct {
	name string
	mode os.FileMode
	dir  bool
	// link marks what is not a plain file or folder (links and special files): it is left out
	link bool
	open func() (io.ReadCloser, error)
}

// archiveFormat tells the format from the first bytes, not from the name, so a renamed file is not trusted
func archiveFormat(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	head := make([]byte, 512)
	n, _ := io.ReadFull(f, head)
	head = head[:n]
	switch {
	case bytes.HasPrefix(head, []byte("PK\x03\x04")), bytes.HasPrefix(head, []byte("PK\x05\x06")):
		return "zip", nil
	case bytes.HasPrefix(head, []byte("Rar!\x1a\x07")):
		return "rar", nil
	case bytes.HasPrefix(head, []byte{0x1f, 0x8b}):
		return "targz", nil
	case len(head) >= 262 && bytes.Equal(head[257:262], []byte("ustar")):
		return "tar", nil
	}
	return "", errors.New("format arsip tidak dikenali: gunakan .zip, .rar, .tar.gz, atau .tar")
}

// IsArchiveName says whether an uploaded name looks like an archive the agent unpacks
func isArchiveName(name string) bool {
	lower := strings.ToLower(name)
	for _, suffix := range []string{".zip", ".rar", ".tar.gz", ".tgz", ".tar"} {
		if strings.HasSuffix(lower, suffix) {
			return true
		}
	}
	return false
}

func eachZip(path string, fn func(archiveEntry) error) error {
	reader, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer reader.Close()
	if len(reader.File) > maxUploadFiles {
		return fmt.Errorf("arsip berisi lebih dari %d berkas", maxUploadFiles)
	}
	for _, file := range reader.File {
		file := file
		mode := file.Mode()
		if err := fn(archiveEntry{
			name: file.Name, mode: mode, dir: file.FileInfo().IsDir(), link: !file.FileInfo().IsDir() && !mode.IsRegular(),
			open: func() (io.ReadCloser, error) { return file.Open() },
		}); err != nil {
			return err
		}
	}
	return nil
}

func eachTar(path string, gzipped bool, fn func(archiveEntry) error) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	var in io.Reader = f
	if gzipped {
		zr, err := gzip.NewReader(f)
		if err != nil {
			return err
		}
		defer zr.Close()
		in = zr
	}
	reader := tar.NewReader(in)
	count := 0
	for {
		header, err := reader.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if count++; count > maxUploadFiles {
			return fmt.Errorf("arsip berisi lebih dari %d berkas", maxUploadFiles)
		}
		dir := header.Typeflag == tar.TypeDir
		regular := header.Typeflag == tar.TypeReg || header.Typeflag == tar.TypeRegA
		if err := fn(archiveEntry{
			name: header.Name, mode: os.FileMode(header.Mode).Perm(), dir: dir, link: !dir && !regular,
			open: func() (io.ReadCloser, error) { return io.NopCloser(reader), nil },
		}); err != nil {
			return err
		}
	}
}

func eachRar(path string, fn func(archiveEntry) error) error {
	reader, err := rardecode.OpenReader(path)
	if err != nil {
		return rarError(err)
	}
	defer reader.Close()
	count := 0
	for {
		header, err := reader.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return rarError(err)
		}
		if header.Encrypted || header.HeaderEncrypted {
			return errors.New("arsip RAR yang memakai kata sandi tidak didukung")
		}
		if count++; count > maxUploadFiles {
			return fmt.Errorf("arsip berisi lebih dari %d berkas", maxUploadFiles)
		}
		mode := header.Mode()
		if err := fn(archiveEntry{
			name: header.Name, mode: mode, dir: header.IsDir, link: header.LinkType != 0 || (!header.IsDir && !mode.IsRegular() && mode&os.ModeType != 0),
			open: func() (io.ReadCloser, error) { return io.NopCloser(reader), nil },
		}); err != nil {
			return err
		}
	}
}

func rarError(err error) error {
	if strings.Contains(strings.ToLower(err.Error()), "password") || strings.Contains(strings.ToLower(err.Error()), "encrypt") {
		return errors.New("arsip RAR yang memakai kata sandi tidak didukung")
	}
	return fmt.Errorf("arsip RAR tidak bisa dibaca: %w", err)
}

// extractProjectArchive unpacks an uploaded archive (zip, rar, tar.gz or tar) into an empty directory. Links and special
// files are left out, modes are reduced to plain file/executable, and the size is capped by what is really written, not by
// what the archive claims.
func extractProjectArchive(archivePath, dest string) error {
	format, err := archiveFormat(archivePath)
	if err != nil {
		return err
	}
	base := filepath.Clean(dest)
	var total int64
	extract := func(entry archiveEntry) error {
		name := strings.ReplaceAll(entry.name, "\\", "/")
		target := filepath.Join(base, filepath.FromSlash(name))
		if target != base && !strings.HasPrefix(target, base+string(os.PathSeparator)) {
			return errors.New("arsip mengandung path tidak aman")
		}
		if entry.dir {
			return os.MkdirAll(target, 0o755)
		}
		if entry.link {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		perm := os.FileMode(0o644)
		if entry.mode&0o111 != 0 {
			perm = 0o755
		}
		src, err := entry.open()
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
			return fmt.Errorf("isi arsip melebihi %d MB setelah diekstrak", maxUploadBytes>>20)
		}
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}
	switch format {
	case "zip":
		return eachZip(archivePath, extract)
	case "rar":
		return eachRar(archivePath, extract)
	case "targz":
		return eachTar(archivePath, true, extract)
	default:
		return eachTar(archivePath, false, extract)
	}
}

// extractProjectZip is kept for callers that only know zip archives
func extractProjectZip(zipPath, dest string) error { return extractProjectArchive(zipPath, dest) }

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
