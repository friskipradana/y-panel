package httpserver

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	panelosuser "github.com/friskipradana/panel-desktop-ui/internal/osuser"
)

var deniedFileManagerPrefixes = []string{"/proc", "/sys", "/dev", "/boot", "/run", "/etc/shadow", "/root/.ssh"}

const fileRootAccessTTL = 15 * time.Minute

type fileRootAccessResponse struct {
	Enabled   bool   `json:"enabled"`
	ExpiresAt string `json:"expiresAt,omitempty"`
}

func (s *Server) fileRootAccessKey(r *http.Request) string {
	cookie, err := r.Cookie(sessionCookieName)
	if err == nil && strings.TrimSpace(cookie.Value) != "" {
		return cookie.Value
	}
	if u := userFromCtx(r); u != nil {
		return u.Username
	}
	return ""
}

func (s *Server) fileRootAccessStatus(r *http.Request) (bool, time.Time) {
	key := s.fileRootAccessKey(r)
	if key == "" {
		return false, time.Time{}
	}
	now := time.Now()
	s.fileRootAccessMu.Lock()
	defer s.fileRootAccessMu.Unlock()
	expiresAt, ok := s.fileRootAccess[key]
	if !ok {
		return false, time.Time{}
	}
	if now.After(expiresAt) {
		delete(s.fileRootAccess, key)
		return false, time.Time{}
	}
	return true, expiresAt
}

func (s *Server) grantFileRootAccess(r *http.Request) time.Time {
	key := s.fileRootAccessKey(r)
	expiresAt := time.Now().Add(fileRootAccessTTL)
	if key == "" {
		return time.Time{}
	}
	s.fileRootAccessMu.Lock()
	s.fileRootAccess[key] = expiresAt
	s.fileRootAccessMu.Unlock()
	return expiresAt
}

func (s *Server) revokeFileRootAccess(r *http.Request) {
	key := s.fileRootAccessKey(r)
	if key == "" {
		return
	}
	s.fileRootAccessMu.Lock()
	delete(s.fileRootAccess, key)
	s.fileRootAccessMu.Unlock()
}

func (s *Server) handleFileRootAccessStatus(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil || !auth.IsSuperAdmin(u.Role) {
		s.writeJSON(w, http.StatusOK, fileRootAccessResponse{Enabled: false})
		return
	}
	enabled, expiresAt := s.fileRootAccessStatus(r)
	resp := fileRootAccessResponse{Enabled: enabled}
	if enabled {
		resp.ExpiresAt = expiresAt.Format(time.RFC3339)
	}
	s.writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleFileRootAccessVerify(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil || !auth.IsSuperAdmin(u.Role) {
		s.writeError(w, http.StatusForbidden, errors.New("akses root hanya tersedia untuk superadmin"))
		return
	}
	var payload struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("format payload tidak valid"))
		return
	}
	if err := s.auth.VerifyPassword(u.ID, payload.Password); err != nil {
		s.auditFileAction(r, "file.root_access.verify", "failed", map[string]any{"reason": "invalid_password"})
		s.writeError(w, http.StatusUnauthorized, errors.New("password tidak valid"))
		return
	}
	expiresAt := s.grantFileRootAccess(r)
	s.auditFileAction(r, "file.root_access.grant", "success", map[string]any{"expiresAt": expiresAt.Format(time.RFC3339)})
	s.writeJSON(w, http.StatusOK, fileRootAccessResponse{Enabled: true, ExpiresAt: expiresAt.Format(time.RFC3339)})
}

func (s *Server) handleFileRootAccessRevoke(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil || !auth.IsSuperAdmin(u.Role) {
		s.writeError(w, http.StatusForbidden, errors.New("akses root hanya tersedia untuk superadmin"))
		return
	}
	s.revokeFileRootAccess(r)
	s.auditFileAction(r, "file.root_access.revoke", "success", nil)
	s.writeJSON(w, http.StatusOK, fileRootAccessResponse{Enabled: false})
}

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

func normalizePathForAccess(path string) string {
	clean := filepath.Clean(path)
	if clean == "." {
		return string(filepath.Separator)
	}
	return clean
}

func pathWithinRoot(targetPath, rootPath string) bool {
	target := normalizePathForAccess(targetPath)
	root := normalizePathForAccess(rootPath)
	if target == root {
		return true
	}
	rootWithSep := root
	if !strings.HasSuffix(rootWithSep, string(filepath.Separator)) {
		rootWithSep += string(filepath.Separator)
	}
	return strings.HasPrefix(target, rootWithSep)
}

func pathBlockedByPolicy(targetPath string) bool {
	cleanTarget := normalizePathForAccess(targetPath)
	for _, blocked := range deniedFileManagerPrefixes {
		if pathWithinRoot(cleanTarget, blocked) {
			return true
		}
	}
	return false
}

func (s *Server) allowedFileManagerRoots(r *http.Request) ([]string, error) {
	u := userFromCtx(r)
	if u == nil {
		return nil, errors.New("unauthorized")
	}
	roots := make([]string, 0, 8)
	seen := map[string]struct{}{}
	appendRoot := func(path string) {
		wd := strings.TrimSpace(path)
		if wd == "" {
			return
		}
		clean := normalizePathForAccess(wd)
		if _, ok := seen[clean]; ok {
			return
		}
		seen[clean] = struct{}{}
		roots = append(roots, clean)
	}

	appendRoot(panelosuser.ResolveHomeDir(u.Username))
	appendRoot(s.cfg.StateDir)

	projects, err := s.database.ListProjects(u.ID)
	if err != nil {
		return nil, err
	}
	for _, p := range projects {
		appendRoot(p.WorkingDir)
	}

	if auth.IsAdmin(u.Role) {
		allProjects, _, err := s.database.ListAllProjects(1000, 0)
		if err == nil {
			for _, p := range allProjects {
				appendRoot(p.WorkingDir)
			}
		}
		if auth.IsSuperAdmin(u.Role) {
			if elevated, _ := s.fileRootAccessStatus(r); elevated {
				appendRoot(string(filepath.Separator))
			}
		}
	}
	if len(roots) == 0 {
		return nil, errors.New("anda belum memiliki project atau home directory yang dapat diakses")
	}
	return roots, nil
}

func (s *Server) hasElevatedFileRootAccess(r *http.Request) bool {
	u := userFromCtx(r)
	if u == nil || !auth.IsSuperAdmin(u.Role) {
		return false
	}
	elevated, _ := s.fileRootAccessStatus(r)
	return elevated
}

func (s *Server) ensureFileManagerAccess(r *http.Request, targetPath string) error {
	roots, err := s.allowedFileManagerRoots(r)
	if err != nil {
		return err
	}
	cleanTarget := normalizePathForAccess(targetPath)
	if pathBlockedByPolicy(cleanTarget) && !s.hasElevatedFileRootAccess(r) {
		return errors.New("akses file ditolak: path sistem sensitif diblokir")
	}
	for _, root := range roots {
		if pathWithinRoot(cleanTarget, root) {
			return nil
		}
	}
	return errors.New("akses file ditolak: path di luar root yang diizinkan")
}

func (s *Server) ensureFileManagerPathPairAccess(r *http.Request, paths ...string) error {
	for _, p := range paths {
		if err := s.ensureFileManagerAccess(r, p); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) handleFileManagerList(w http.ResponseWriter, r *http.Request) {
	roots, rootsErr := s.allowedFileManagerRoots(r)
	qPath := r.URL.Query().Get("path")
	if qPath == "" || qPath == "/" {
		if qPath == "/" && s.hasElevatedFileRootAccess(r) {
			qPath = "/"
		} else if rootsErr == nil && len(roots) > 0 {
			qPath = roots[0]
		} else if qPath == "" {
			qPath = "/"
		}
	}

	cleanPath := filepath.Clean(qPath)
	if err := s.ensureFileManagerAccess(r, cleanPath); err != nil {
		if rootsErr == nil && len(roots) > 0 && !(cleanPath == "/" && s.hasElevatedFileRootAccess(r)) {
			cleanPath = roots[0]
		} else {
			s.writeError(w, http.StatusForbidden, err)
			return
		}
	}
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
	if err := s.ensureFileManagerAccess(r, cleanPath); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
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
	if err := s.ensureFileManagerAccess(r, cleanPath); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	info, err := os.Stat(cleanPath)
	if err == nil && info.IsDir() {
		s.writeError(w, http.StatusBadRequest, errors.New("Tidak dapat menimpa direktori"))
		return
	}

	if err := os.WriteFile(cleanPath, []byte(payload.Content), 0644); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menyimpan file: "+err.Error()))
		return
	}

	s.auditFileAction(r, "file.write", "success", map[string]any{"path": cleanPath, "bytes": len(payload.Content)})
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
	if err := s.ensureFileManagerAccess(r, cleanPath); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if cleanPath == "/" {
		s.writeError(w, http.StatusBadRequest, errors.New("Tidak dapat menghapus root"))
		return
	}
	if err := os.RemoveAll(cleanPath); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menghapus: "+err.Error()))
		return
	}
	s.auditFileAction(r, "file.delete", "success", map[string]any{"path": cleanPath})
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
	if err := s.ensureFileManagerPathPairAccess(r, oldC, newC); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if oldC == "/" || newC == "/" {
		s.writeError(w, http.StatusBadRequest, errors.New("Path root tidak dapat dimodifikasi"))
		return
	}
	if err := os.Rename(oldC, newC); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengubah nama: "+err.Error()))
		return
	}
	s.auditFileAction(r, "file.rename", "success", map[string]any{"oldPath": oldC, "newPath": newC})
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
	if err := s.ensureFileManagerAccess(r, cleanPath); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if err := os.MkdirAll(cleanPath, 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuat direktori: "+err.Error()))
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleFileManagerMove(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		OldPath string `json:"oldPath"`
		NewPath string `json:"newPath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}

	oldPath := filepath.Clean(payload.OldPath)
	newPath := filepath.Clean(payload.NewPath)
	if err := s.ensureFileManagerPathPairAccess(r, oldPath, newPath); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if oldPath == "/" || newPath == "/" {
		s.writeError(w, http.StatusBadRequest, errors.New("Path root tidak dapat dipindahkan"))
		return
	}

	oldInfo, err := os.Stat(oldPath)
	if err != nil {
		s.writeError(w, http.StatusNotFound, errors.New("Sumber tidak ditemukan"))
		return
	}

	if _, err := os.Stat(newPath); err == nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Tujuan sudah ada"))
		return
	}

	if oldInfo.IsDir() {
		prefix := oldPath + string(os.PathSeparator)
		if strings.HasPrefix(newPath+string(os.PathSeparator), prefix) {
			s.writeError(w, http.StatusBadRequest, errors.New("Folder tidak dapat dipindahkan ke dalam dirinya sendiri"))
			return
		}
	}

	if err := os.MkdirAll(filepath.Dir(newPath), 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menyiapkan folder tujuan: "+err.Error()))
		return
	}

	if err := os.Rename(oldPath, newPath); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal memindahkan item: "+err.Error()))
		return
	}

	s.auditFileAction(r, "file.move", "success", map[string]any{"oldPath": oldPath, "newPath": newPath})
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func copyFileContents(sourcePath, destPath string, mode os.FileMode) error {
	src, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer dst.Close()

	_, err = io.Copy(dst, src)
	return err
}

func copyPathRecursive(sourcePath, destPath string) error {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return err
	}

	if info.IsDir() {
		if err := os.MkdirAll(destPath, info.Mode()); err != nil {
			return err
		}

		entries, err := os.ReadDir(sourcePath)
		if err != nil {
			return err
		}

		for _, entry := range entries {
			childSource := filepath.Join(sourcePath, entry.Name())
			childDest := filepath.Join(destPath, entry.Name())
			if err := copyPathRecursive(childSource, childDest); err != nil {
				return err
			}
		}
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return err
	}

	return copyFileContents(sourcePath, destPath, info.Mode())
}

func (s *Server) handleFileManagerCopy(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		OldPath string `json:"oldPath"`
		NewPath string `json:"newPath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Format payload tidak valid"))
		return
	}

	sourcePath := filepath.Clean(payload.OldPath)
	destPath := filepath.Clean(payload.NewPath)
	if err := s.ensureFileManagerPathPairAccess(r, sourcePath, destPath); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if sourcePath == "/" || destPath == "/" {
		s.writeError(w, http.StatusBadRequest, errors.New("Path root tidak dapat disalin"))
		return
	}

	info, err := os.Stat(sourcePath)
	if err != nil {
		s.writeError(w, http.StatusNotFound, errors.New("Sumber tidak ditemukan"))
		return
	}

	if _, err := os.Stat(destPath); err == nil {
		s.writeError(w, http.StatusBadRequest, errors.New("Tujuan sudah ada"))
		return
	}

	if info.IsDir() {
		prefix := sourcePath + string(os.PathSeparator)
		if strings.HasPrefix(destPath+string(os.PathSeparator), prefix) {
			s.writeError(w, http.StatusBadRequest, errors.New("Folder tidak dapat disalin ke dalam dirinya sendiri"))
			return
		}
	}

	if err := copyPathRecursive(sourcePath, destPath); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menyalin item: "+err.Error()))
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
	if err := s.ensureFileManagerAccess(r, cleanPath); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
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
	if err := s.ensureFileManagerAccess(r, cleanPath); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}

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
	s.auditFileAction(r, "file.chmod", "success", map[string]any{"path": cleanPath, "mode": payload.Mode, "recursive": payload.Recursive})
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func addPathToZip(zipWriter *zip.Writer, baseParent, sourcePath string) error {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return filepath.Walk(sourcePath, func(path string, walkInfo os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}

			relPath, err := filepath.Rel(baseParent, path)
			if err != nil {
				return err
			}
			zipPath := filepath.ToSlash(relPath)

			header, err := zip.FileInfoHeader(walkInfo)
			if err != nil {
				return err
			}
			header.Name = zipPath
			if walkInfo.IsDir() {
				header.Name += "/"
				_, err = zipWriter.CreateHeader(header)
				return err
			}

			header.Method = zip.Deflate
			writer, err := zipWriter.CreateHeader(header)
			if err != nil {
				return err
			}

			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()

			_, err = io.Copy(writer, file)
			return err
		})
	}

	relPath, err := filepath.Rel(baseParent, sourcePath)
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = filepath.ToSlash(relPath)
	header.Method = zip.Deflate

	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return err
	}

	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(writer, file)
	return err
}

func compressToZip(sourcePath, destPath string) error {
	archiveFile, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer archiveFile.Close()

	zipWriter := zip.NewWriter(archiveFile)
	defer zipWriter.Close()

	return addPathToZip(zipWriter, filepath.Dir(sourcePath), sourcePath)
}

func addPathToTar(tw *tar.Writer, baseParent, sourcePath string) error {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return filepath.Walk(sourcePath, func(path string, walkInfo os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}

			relPath, err := filepath.Rel(baseParent, path)
			if err != nil {
				return err
			}
			tarPath := filepath.ToSlash(relPath)

			header, err := tar.FileInfoHeader(walkInfo, "")
			if err != nil {
				return err
			}
			header.Name = tarPath
			if walkInfo.IsDir() && !strings.HasSuffix(header.Name, "/") {
				header.Name += "/"
			}

			if err := tw.WriteHeader(header); err != nil {
				return err
			}
			if walkInfo.IsDir() {
				return nil
			}

			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()

			_, err = io.Copy(tw, file)
			return err
		})
	}

	relPath, err := filepath.Rel(baseParent, sourcePath)
	if err != nil {
		return err
	}

	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	header.Name = filepath.ToSlash(relPath)

	if err := tw.WriteHeader(header); err != nil {
		return err
	}

	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(tw, file)
	return err
}

func compressToTarGz(sourcePath, destPath string) error {
	archiveFile, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer archiveFile.Close()

	gzipWriter := gzip.NewWriter(archiveFile)
	defer gzipWriter.Close()

	tarWriter := tar.NewWriter(gzipWriter)
	defer tarWriter.Close()

	return addPathToTar(tarWriter, filepath.Dir(sourcePath), sourcePath)
}

func extractZip(sourcePath, destPath string) error {
	reader, err := zip.OpenReader(sourcePath)
	if err != nil {
		return err
	}
	defer reader.Close()

	for _, file := range reader.File {
		targetPath := filepath.Join(destPath, filepath.Clean(file.Name))
		if !strings.HasPrefix(targetPath, filepath.Clean(destPath)+string(os.PathSeparator)) && filepath.Clean(targetPath) != filepath.Clean(destPath) {
			return errors.New("arsip ZIP mengandung path tidak aman")
		}

		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, file.Mode()); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}

		src, err := file.Open()
		if err != nil {
			return err
		}

		dst, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, file.Mode())
		if err != nil {
			src.Close()
			return err
		}

		_, copyErr := io.Copy(dst, src)
		src.Close()
		dst.Close()
		if copyErr != nil {
			return copyErr
		}
	}

	return nil
}

func extractTarArchive(tr *tar.Reader, destPath string) error {
	for {
		header, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}

		targetPath := filepath.Join(destPath, filepath.Clean(header.Name))
		if !strings.HasPrefix(targetPath, filepath.Clean(destPath)+string(os.PathSeparator)) && filepath.Clean(targetPath) != filepath.Clean(destPath) {
			return errors.New("arsip TAR mengandung path tidak aman")
		}

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, os.FileMode(header.Mode)); err != nil {
				return err
			}
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
				return err
			}
			file, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(file, tr)
			file.Close()
			if copyErr != nil {
				return copyErr
			}
		}
	}
}

func extractTarGz(sourcePath, destPath string) error {
	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()

	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzipReader.Close()

	return extractTarArchive(tar.NewReader(gzipReader), destPath)
}

func extractTarFile(sourcePath, destPath string) error {
	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()

	return extractTarArchive(tar.NewReader(file), destPath)
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
	if err := s.ensureFileManagerPathPairAccess(r, cleanTarget, cleanDest); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}

	if _, err := os.Stat(cleanTarget); os.IsNotExist(err) {
		s.writeError(w, http.StatusNotFound, errors.New("Target tidak ditemukan"))
		return
	}

	if err := os.MkdirAll(filepath.Dir(cleanDest), 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menyiapkan folder arsip: "+err.Error()))
		return
	}

	var err error
	lowerDest := strings.ToLower(cleanDest)
	if strings.HasSuffix(lowerDest, ".zip") {
		err = compressToZip(cleanTarget, cleanDest)
	} else if strings.HasSuffix(lowerDest, ".tar.gz") || strings.HasSuffix(lowerDest, ".tgz") {
		err = compressToTarGz(cleanTarget, cleanDest)
	} else {
		s.writeError(w, http.StatusBadRequest, errors.New("Format kompresi tidak didukung. Gunakan .zip atau .tar.gz"))
		return
	}

	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Eksekusi kompresi gagal: "+err.Error()))
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
	if err := s.ensureFileManagerPathPairAccess(r, cleanSource, cleanDest); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}

	if err := os.MkdirAll(cleanDest, 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuat direktori tujuan ekstraksi: "+err.Error()))
		return
	}

	var err error
	lowerSource := strings.ToLower(cleanSource)
	if strings.HasSuffix(lowerSource, ".zip") {
		err = extractZip(cleanSource, cleanDest)
	} else if strings.HasSuffix(lowerSource, ".tar.gz") || strings.HasSuffix(lowerSource, ".tgz") {
		err = extractTarGz(cleanSource, cleanDest)
	} else if strings.HasSuffix(lowerSource, ".tar") {
		err = extractTarFile(cleanSource, cleanDest)
	} else {
		s.writeError(w, http.StatusBadRequest, errors.New("Format arsip tidak didukung."))
		return
	}

	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengekstrak arsip: "+err.Error()))
		return
	}

	s.auditFileAction(r, "file.extract", "success", map[string]any{"source": cleanSource, "dest": cleanDest})
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
