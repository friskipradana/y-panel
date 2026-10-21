package httpserver

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Uploading files into the folder that is open in the file manager. The files are written as they arrive (nothing is held in
// memory), each one beside its destination first and then put in place by a rename, so a link planted at the destination is
// replaced and never followed, and a half-written file is never seen under its real name.

const maxFileUploadBytes = int64(2) << 30

type uploadResult struct {
	Name   string `json:"name"`
	Size   int64  `json:"size,omitempty"`
	Reason string `json:"reason,omitempty"`
}

// validUploadName accepts a plain file name: no folders, no control characters, not . or ..
func validUploadName(name string) bool {
	if name == "" || name == "." || name == ".." || len(name) > 255 || name != filepath.Base(name) {
		return false
	}
	if strings.ContainsAny(name, "/\\\x00") {
		return false
	}
	for _, r := range name {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}

// saveUploadedFile writes one file into dir. reason is "exists" when the name is taken and overwrite is off, or "folder" when a
// folder has that name; a failure is an error. limit caps what is written.
func saveUploadedFile(dir, name string, src io.Reader, overwrite bool, limit int64) (written int64, reason string, err error) {
	target := filepath.Join(dir, name)
	existing, statErr := os.Lstat(target)
	if statErr == nil {
		if existing.IsDir() {
			return 0, "folder", nil
		}
		if !overwrite {
			return 0, "exists", nil
		}
	}
	temp, err := os.CreateTemp(dir, ".reneo-upload-*")
	if err != nil {
		return 0, "", err
	}
	tempPath := temp.Name()
	defer func() {
		if err != nil || reason != "" {
			_ = os.Remove(tempPath)
		}
	}()
	written, err = io.Copy(temp, io.LimitReader(src, limit+1))
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return 0, "", err
	}
	if written > limit {
		return 0, "", errors.New("berkas terlalu besar")
	}
	if err = os.Chmod(tempPath, 0o644); err != nil {
		return 0, "", err
	}
	// the name may have been taken while the file was arriving
	if again, lerr := os.Lstat(target); lerr == nil && again.IsDir() {
		return 0, "folder", nil
	} else if lerr == nil && !overwrite {
		return 0, "exists", nil
	}
	if err = os.Rename(tempPath, target); err != nil {
		return 0, "", err
	}
	chownLikeParent(target)
	return written, "", nil
}

// handleFileManagerUpload takes a multipart form: dir (the folder), overwrite (true or false), then the files. The fields come
// first so the folder is known when the first file arrives.
func (s *Server) handleFileManagerUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxFileUploadBytes)
	reader, err := r.MultipartReader()
	if err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format unggahan tidak valid"))
		return
	}
	var dirParam, dir string
	overwrite := false
	uploaded := []uploadResult{}
	skipped := []uploadResult{}
	var total int64
	remaining := maxFileUploadBytes
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			s.writeError(w, http.StatusBadRequest, fmt.Errorf("Unggahan terputus atau terlalu besar: %w", err))
			return
		}
		switch part.FormName() {
		case "dir":
			value, _ := io.ReadAll(io.LimitReader(part, 4096))
			dirParam = strings.TrimSpace(string(value))
		case "overwrite":
			value, _ := io.ReadAll(io.LimitReader(part, 16))
			overwrite = strings.EqualFold(strings.TrimSpace(string(value)), "true")
		case "file":
			if dir == "" {
				if dirParam == "" {
					s.writeError(w, http.StatusBadRequest, errors.New("Folder tujuan harus dikirim sebelum berkas"))
					return
				}
				clean, err := s.fileManagerPath(r, filepath.Clean(dirParam))
				if err != nil {
					s.writeError(w, http.StatusForbidden, err)
					return
				}
				info, err := os.Stat(clean)
				if err != nil || !info.IsDir() {
					s.writeError(w, http.StatusBadRequest, errors.New("Folder tujuan tidak ditemukan"))
					return
				}
				dir = clean
			}
			name := part.FileName()
			if !validUploadName(name) {
				skipped = append(skipped, uploadResult{Name: name, Reason: "name"})
				_, _ = io.Copy(io.Discard, part)
				continue
			}
			written, reason, err := saveUploadedFile(dir, name, part, overwrite, remaining)
			if err != nil {
				s.auditFileAction(r, "file.upload", "failed", map[string]any{"dir": dir, "file": name})
				s.writeError(w, http.StatusInternalServerError, fmt.Errorf("Gagal menyimpan %s: %w", name, err))
				return
			}
			if reason != "" {
				skipped = append(skipped, uploadResult{Name: name, Reason: reason})
				_, _ = io.Copy(io.Discard, part)
				continue
			}
			remaining -= written
			total += written
			uploaded = append(uploaded, uploadResult{Name: name, Size: written})
		}
	}
	if dir != "" {
		s.auditFileAction(r, "file.upload", "success", map[string]any{"dir": dir, "files": len(uploaded), "bytes": total, "skipped": len(skipped)})
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"ok": true, "uploaded": uploaded, "skipped": skipped})
}
