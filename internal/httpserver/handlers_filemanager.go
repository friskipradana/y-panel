package httpserver

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type FileInfoNode struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	IsDir    bool   `json:"isDir"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
	Mode     string `json:"mode"`
}

type DirectoryListResponse struct {
	Path     string         `json:"path"`
	Parent   string         `json:"parent,omitempty"`
	Contents []FileInfoNode `json:"contents"`
}

func (s *Server) handleFileManagerList(w http.ResponseWriter, r *http.Request) {
	qPath := r.URL.Query().Get("path")
	if qPath == "" {
		qPath = "/"
	}

	cleanPath := filepath.Clean(qPath)
	info, err := os.Stat(cleanPath)
	if err != nil {
		s.writeError(w, http.StatusNotFound, errors.New("Path tidak ditemukan"))
		return
	}

	if !info.IsDir() {
		s.writeError(w, http.StatusBadRequest, errors.New("Bukan direktori"))
		return
	}

	entries, err := os.ReadDir(cleanPath)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membaca direktori"))
		return
	}

	var contents []FileInfoNode
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		contents = append(contents, FileInfoNode{
			Name:     entry.Name(),
			Path:     filepath.Join(cleanPath, entry.Name()),
			IsDir:    entry.IsDir(),
			Size:     info.Size(),
			Modified: info.ModTime().Format(time.RFC3339),
			Mode:     info.Mode().String(),
		})
	}

	// Sort: dirs first, then alphabetical
	sort.Slice(contents, func(i, j int) bool {
		if contents[i].IsDir != contents[j].IsDir {
			return contents[i].IsDir
		}
		return contents[i].Name < contents[j].Name
	})

	parent := filepath.Dir(cleanPath)
	if cleanPath == "/" {
		parent = ""
	}

	resp := DirectoryListResponse{
		Path:     cleanPath,
		Parent:   parent,
		Contents: contents,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleFileManagerRead(w http.ResponseWriter, r *http.Request) {
	qPath := r.URL.Query().Get("path")
	if qPath == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("Path file harus diisi"))
		return
	}

	cleanPath := filepath.Clean(qPath)
	info, err := os.Stat(cleanPath)
	if err != nil {
		s.writeError(w, http.StatusNotFound, errors.New("File tidak ditemukan"))
		return
	}

	if info.IsDir() {
		s.writeError(w, http.StatusBadRequest, errors.New("Tidak dapat membaca direktori"))
		return
	}

	file, err := os.Open(cleanPath)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuka file"))
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+info.Name()+"\"")
	io.Copy(w, file)
}

type FileWritePayload struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func (s *Server) handleFileManagerWrite(w http.ResponseWriter, r *http.Request) {
	var payload FileWritePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}

	if payload.Path == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("Path file harus diisi"))
		return
	}

	cleanPath := filepath.Clean(payload.Path)
	info, err := os.Stat(cleanPath)
	if err == nil && info.IsDir() {
		s.writeError(w, http.StatusBadRequest, errors.New("Tidak dapat menimpa direktori"))
		return
	}

	if err := os.WriteFile(cleanPath, []byte(payload.Content), 0644); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menyimpan file: "+err.Error()))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":      true,
		"message": "File berhasil disimpan",
	})
}

func (s *Server) handleFileManagerDelete(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanPath := filepath.Clean(payload.Path)
	if cleanPath == "/" {
		s.writeError(w, http.StatusBadRequest, errors.New("Tidak dapat menghapus root"))
		return
	}
	if err := os.RemoveAll(cleanPath); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menghapus: "+err.Error()))
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerRename(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		OldPath string `json:"oldPath"`
		NewPath string `json:"newPath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	oldC := filepath.Clean(payload.OldPath)
	newC := filepath.Clean(payload.NewPath)
	if oldC == "/" || newC == "/" {
		s.writeError(w, http.StatusBadRequest, errors.New("Path root tidak dapat dimodifikasi"))
		return
	}
	if err := os.Rename(oldC, newC); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengubah nama: "+err.Error()))
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerMkdir(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanPath := filepath.Clean(payload.Path)
	if err := os.MkdirAll(cleanPath, 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuat direktori: "+err.Error()))
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerTouch(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanPath := filepath.Clean(payload.Path)
	file, err := os.OpenFile(cleanPath, os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuat file: "+err.Error()))
		return
	}
	file.Close()
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerChmod(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Path      string `json:"path"`
		Mode      uint32 `json:"mode"`
		Recursive bool   `json:"recursive"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanPath := filepath.Clean(payload.Path)

	if payload.Recursive {
		err := filepath.Walk(cleanPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			return os.Chmod(path, os.FileMode(payload.Mode))
		})
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengubah permission rekursif: "+err.Error()))
			return
		}
	} else {
		if err := os.Chmod(cleanPath, os.FileMode(payload.Mode)); err != nil {
			s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengubah permission: "+err.Error()))
			return
		}
	}
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerCompress(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Target   string `json:"target"`
		DestName string `json:"destName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanTarget := filepath.Clean(payload.Target)
	cleanDest := filepath.Clean(payload.DestName)

	if _, err := os.Stat(cleanTarget); os.IsNotExist(err) {
		s.writeError(w, http.StatusNotFound, errors.New("Target tidak ditemukan"))
		return
	}

	var cmd *exec.Cmd
	if strings.HasSuffix(strings.ToLower(cleanDest), ".zip") {
		cmd = exec.Command("zip", "-r", cleanDest, filepath.Base(cleanTarget))
	} else if strings.HasSuffix(strings.ToLower(cleanDest), ".tar.gz") || strings.HasSuffix(strings.ToLower(cleanDest), ".tgz") {
		cmd = exec.Command("tar", "-czf", cleanDest, filepath.Base(cleanTarget))
	} else {
		s.writeError(w, http.StatusBadRequest, errors.New("Format kompresi tidak didukung. Gunakan .zip atau .tar.gz"))
		return
	}

	cmd.Dir = filepath.Dir(cleanTarget)
	if out, err := cmd.CombinedOutput(); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Eksekusi kompresi gagal: "+string(out)))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerExtract(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Source string `json:"source"`
		Dest   string `json:"dest"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}
	cleanSource := filepath.Clean(payload.Source)
	cleanDest := filepath.Clean(payload.Dest)

	if err := os.MkdirAll(cleanDest, 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuat direktori tujuan ekstraksi: "+err.Error()))
		return
	}

	var cmd *exec.Cmd
	if strings.HasSuffix(strings.ToLower(cleanSource), ".zip") {
		cmd = exec.Command("unzip", "-o", cleanSource, "-d", cleanDest)
	} else if strings.HasSuffix(strings.ToLower(cleanSource), ".tar.gz") || strings.HasSuffix(strings.ToLower(cleanSource), ".tgz") || strings.HasSuffix(strings.ToLower(cleanSource), ".tar") {
		cmd = exec.Command("tar", "-xf", cleanSource, "-C", cleanDest)
	} else {
		s.writeError(w, http.StatusBadRequest, errors.New("Format arsip tidak didukung."))
		return
	}

	if out, err := cmd.CombinedOutput(); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengekstrak arsip: "+string(out)))
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
