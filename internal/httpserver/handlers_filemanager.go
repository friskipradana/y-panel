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
	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
	panelosuser "github.com/friskipradana/panel-desktop-ui/internal/osuser"
)

var deniedFileManagerPrefixes = []string{"/proc", "/sys", "/dev", "/boot", "/run", "/etc/shadow", "/root/.ssh"}

const fileRootAccessTTL = 15 * time.Minute

type fileRootAccessResponse struct {
	Enabled   bool   `json:"enabled"`
	ExpiresAt string `json:"expiresAt,omitempty"`
}

func (s *Server) fileRootAccessKey(r *http.Request) string {
	cookie, err := requestSessionCookie(r)
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

	modTime time.Time
}

type DirectoryListResponse struct {
	Path     string         `json:"path"`
	Parent   string         `json:"parent,omitempty"`
	Contents []FileInfoNode `json:"contents"`
	// Total passes the search and every filter; All is how many the folder holds; Facets say what each column can be narrowed to
	Total  int                       `json:"total"`
	All    int                       `json:"all"`
	Facets map[string]map[string]int `json:"facets"`
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
	// the panel state directory holds every account's credentials: superadmin only
	if auth.IsSuperAdmin(u.Role) {
		appendRoot(s.cfg.StateDir)
	}

	projects, err := s.database.ListProjects(u.ID)
	if err != nil {
		return nil, err
	}
	for _, p := range projects {
		appendRoot(p.WorkingDir)
	}

	scope := s.ownerScopeFor(u)
	if scope.all {
		allProjects, _, err := s.database.ListAllProjects(1000, 0)
		if err == nil {
			for _, p := range allProjects {
				appendRoot(p.WorkingDir)
			}
		}
		if elevated, _ := s.fileRootAccessStatus(r); elevated {
			appendRoot(string(filepath.Separator))
		}
	} else {
		// an admin also reaches the accounts created below it; nobody else
		for id := range scope.ids {
			if id == u.ID {
				continue
			}
			if owner, err := s.database.GetUserByID(id); err == nil && owner != nil {
				appendRoot(panelosuser.ResolveHomeDir(owner.Username))
			}
			if list, err := s.database.ListProjects(id); err == nil {
				for _, p := range list {
					appendRoot(p.WorkingDir)
				}
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

// ensureFileManagerAccess refuses a path whose real location is outside what the account may reach
func (s *Server) ensureFileManagerAccess(r *http.Request, targetPath string) error {
	_, err := s.fileManagerPath(r, targetPath)
	return err
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
	if real, err := s.fileManagerPath(r, cleanPath); err == nil {
		cleanPath = real
	} else if rootsErr == nil && len(roots) > 0 && !(cleanPath == "/" && s.hasElevatedFileRootAccess(r)) {
		cleanPath = roots[0]
		if real, err := s.fileManagerPath(r, cleanPath); err == nil {
			cleanPath = real
		}
	} else {
		s.writeError(w, http.StatusForbidden, err)
		return
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
			modTime:  info.ModTime(),
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

	spec := fileSpec(time.Now())
	narrowed := listquery.Apply(contents, spec, listquery.Parse(r.URL.Query(), spec.Keys()))
	if narrowed.Items == nil {
		narrowed.Items = []FileInfoNode{}
	}
	resp := DirectoryListResponse{
		Path:     cleanPath,
		Parent:   parent,
		Contents: narrowed.Items,
		Total:    narrowed.Total,
		All:      narrowed.All,
		Facets:   narrowed.Facets,
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

	cleanPath, err := s.fileManagerPath(r, filepath.Clean(qPath))
	if err != nil {
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

	cleanPath, err := s.fileManagerPath(r, filepath.Clean(payload.Path))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	info, err := os.Stat(cleanPath)
	if err == nil && info.IsDir() {
		s.writeError(w, http.StatusBadRequest, errors.New("Tidak dapat menimpa direktori"))
		return
	}
	existed := err == nil

	if err := os.WriteFile(cleanPath, []byte(payload.Content), 0644); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menyimpan file: "+err.Error()))
		return
	}
	if !existed {
		chownLikeParent(cleanPath)
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
	cleanPath, err := s.fileManagerLinkPath(r, filepath.Clean(payload.Path))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if cleanPath == "/" || s.isFileManagerRoot(r, cleanPath) {
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
	oldC, err := s.fileManagerLinkPath(r, filepath.Clean(payload.OldPath))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	newC, err := s.fileManagerLinkPath(r, filepath.Clean(payload.NewPath))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if oldC == "/" || newC == "/" || s.isFileManagerRoot(r, oldC) {
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
	cleanPath, err := s.fileManagerPath(r, filepath.Clean(payload.Path))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if err := mkdirAllOwned(cleanPath, 0755); err != nil {
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

	oldPath, err := s.fileManagerLinkPath(r, filepath.Clean(payload.OldPath))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	newPath, err := s.fileManagerLinkPath(r, filepath.Clean(payload.NewPath))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if oldPath == "/" || newPath == "/" || s.isFileManagerRoot(r, oldPath) {
		s.writeError(w, http.StatusBadRequest, errors.New("Path root tidak dapat dipindahkan"))
		return
	}

	oldInfo, err := os.Lstat(oldPath)
	if err != nil {
		s.writeError(w, http.StatusNotFound, errors.New("Sumber tidak ditemukan"))
		return
	}

	if _, err := os.Lstat(newPath); err == nil {
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

	if err := mkdirAllOwned(filepath.Dir(newPath), 0755); err != nil {
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

	// created exclusively: a link planted at the destination is refused, not written through
	dst, err := os.OpenFile(destPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, archiveFileMode(mode))
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		return err
	}
	if err := dst.Close(); err != nil {
		return err
	}
	chownLikeParent(destPath)
	return nil
}

func copyPathRecursive(sourcePath, destPath string) error {
	info, err := os.Lstat(sourcePath)
	if err != nil {
		return err
	}

	if info.Mode()&os.ModeSymlink != 0 {
		target, err := os.Readlink(sourcePath)
		if err != nil {
			return err
		}
		if err := os.Symlink(target, destPath); err != nil {
			return err
		}
		chownLikeParent(destPath)
		return nil
	}

	if info.IsDir() {
		if err := mkdirAllOwned(destPath, 0o755); err != nil {
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
	if !info.Mode().IsRegular() {
		return nil
	}

	if err := mkdirAllOwned(filepath.Dir(destPath), 0o755); err != nil {
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

	sourcePath, err := s.fileManagerLinkPath(r, filepath.Clean(payload.OldPath))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	destPath, err := s.fileManagerLinkPath(r, filepath.Clean(payload.NewPath))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if sourcePath == "/" || destPath == "/" {
		s.writeError(w, http.StatusBadRequest, errors.New("Path root tidak dapat disalin"))
		return
	}

	info, err := os.Lstat(sourcePath)
	if err != nil {
		s.writeError(w, http.StatusNotFound, errors.New("Sumber tidak ditemukan"))
		return
	}

	if _, err := os.Lstat(destPath); err == nil {
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
	cleanPath, err := s.fileManagerPath(r, filepath.Clean(payload.Path))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	file, err := os.OpenFile(cleanPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuat file: "+err.Error()))
		return
	}
	file.Close()
	chownLikeParent(cleanPath)
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
	cleanPath, err := s.fileManagerPath(r, filepath.Clean(payload.Path))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	// the agent runs as root: a setuid bit on a file an account controls would hand them root
	mode := os.FileMode(payload.Mode & 0o777)

	if payload.Recursive {
		err := filepath.Walk(cleanPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if info.Mode()&os.ModeSymlink != 0 {
				return nil
			}
			return os.Chmod(path, mode)
		})
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengubah permission rekursif: "+err.Error()))
			return
		}
	} else {
		if err := os.Chmod(cleanPath, mode); err != nil {
			s.writeError(w, http.StatusInternalServerError, errors.New("Gagal mengubah permission: "+err.Error()))
			return
		}
	}
	s.auditFileAction(r, "file.chmod", "success", map[string]any{"path": cleanPath, "mode": uint32(mode), "recursive": payload.Recursive})
	s.writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func addPathToZip(zipWriter *zip.Writer, baseParent, sourcePath string) error {
	info, err := os.Lstat(sourcePath)
	if err != nil {
		return err
	}
	if !info.IsDir() && !info.Mode().IsRegular() {
		return errors.New("hanya berkas dan folder biasa yang dapat dikompres")
	}

	if info.IsDir() {
		return filepath.Walk(sourcePath, func(path string, walkInfo os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			// a link would be read through to what it points at, perhaps outside the folder
			if !walkInfo.IsDir() && !walkInfo.Mode().IsRegular() {
				return nil
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

// createArchiveFile makes the archive file; a symlink standing at that name is removed, not written through
func createArchiveFile(destPath string) (*os.File, error) {
	if info, err := os.Lstat(destPath); err == nil && info.Mode()&os.ModeSymlink != 0 {
		if err := os.Remove(destPath); err != nil {
			return nil, err
		}
	}
	f, err := os.OpenFile(destPath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	chownLikeParent(destPath)
	return f, nil
}

func compressToZip(sourcePath, destPath string) error {
	archiveFile, err := createArchiveFile(destPath)
	if err != nil {
		return err
	}
	defer archiveFile.Close()

	zipWriter := zip.NewWriter(archiveFile)
	defer zipWriter.Close()

	return addPathToZip(zipWriter, filepath.Dir(sourcePath), sourcePath)
}

func addPathToTar(tw *tar.Writer, baseParent, sourcePath string) error {
	info, err := os.Lstat(sourcePath)
	if err != nil {
		return err
	}
	if !info.IsDir() && !info.Mode().IsRegular() {
		return errors.New("hanya berkas dan folder biasa yang dapat dikompres")
	}

	if info.IsDir() {
		return filepath.Walk(sourcePath, func(path string, walkInfo os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if !walkInfo.IsDir() && !walkInfo.Mode().IsRegular() {
				return nil
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
	archiveFile, err := createArchiveFile(destPath)
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
	cleanTarget, err := s.fileManagerPath(r, filepath.Clean(payload.Target))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	cleanDest, err := s.fileManagerLinkPath(r, filepath.Clean(payload.DestName))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}

	if _, err := os.Stat(cleanTarget); os.IsNotExist(err) {
		s.writeError(w, http.StatusNotFound, errors.New("Target tidak ditemukan"))
		return
	}

	if err := mkdirAllOwned(filepath.Dir(cleanDest), 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal menyiapkan folder arsip: "+err.Error()))
		return
	}

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
	cleanSource, err := s.fileManagerPath(r, filepath.Clean(payload.Source))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	cleanDest, err := s.fileManagerPath(r, filepath.Clean(payload.Dest))
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}

	if err := mkdirAllOwned(cleanDest, 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("Gagal membuat direktori tujuan ekstraksi: "+err.Error()))
		return
	}

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
