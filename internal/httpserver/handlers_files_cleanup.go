package httpserver

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
)

type cleanupItem struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	IsDir    bool   `json:"isDir"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
	Category string `json:"category"` // cache | temp | logs | build | empty | large
	Safety   string `json:"safety"`   // safe | caution
	Reason   string `json:"reason"`
}

type cleanupScanResponse struct {
	Root         string        `json:"root"`
	Scope        string        `json:"scope"`
	ScannedFiles int           `json:"scannedFiles"`
	TotalBytes   int64         `json:"totalBytes"`
	SafeBytes    int64         `json:"safeBytes"`
	Truncated    bool          `json:"truncated"`
	Items        []cleanupItem `json:"items"`
}

var (
	junkCacheDirNames = map[string]string{
		".cache":        "Direktori cache aplikasi",
		"__pycache__":   "Cache bytecode Python",
		".pytest_cache": "Cache pytest",
		".mypy_cache":   "Cache mypy",
		".ruff_cache":   "Cache ruff",
		".vite":         "Cache bundler Vite",
		".turbo":        "Cache build Turborepo",
		".parcel-cache": "Cache Parcel",
		"_cacache":      "Cache paket npm",
		".sass-cache":   "Cache SASS",
	}
	junkTempFileNames = map[string]string{
		".ds_store":   "Metadata macOS tidak terpakai",
		"thumbs.db":   "Cache thumbnail Windows",
		"desktop.ini": "File konfigurasi desktop Windows",
	}
	junkTempExts = map[string]string{
		".tmp":        "Berkas sementara (.tmp)",
		".temp":       "Berkas sementara (.temp)",
		".bak":        "Salinan cadangan lama (.bak)",
		".old":        "Berkas versi lama (.old)",
		".orig":       "Berkas sisa merge (.orig)",
		".swp":        "Swap file editor (.swp)",
		".swo":        "Swap file editor (.swo)",
		".part":       "Unduhan tidak selesai (.part)",
		".crdownload": "Unduhan tidak selesai (.crdownload)",
		".pyc":        "Bytecode Python (.pyc)",
		".pyo":        "Bytecode Python (.pyo)",
	}
	skipScanDirs = map[string]bool{
		".git": true, ".reneo": true, ".bun": true, ".nvm": true,
		".rustup": true, ".cargo": true, ".venv": true, "venv": true,
	}
	protectedCleanupDirs = map[string]bool{
		"/": true, "/bin": true, "/boot": true, "/dev": true, "/etc": true,
		"/home": true, "/lib": true, "/lib64": true, "/opt": true, "/proc": true,
		"/root": true, "/run": true, "/sbin": true, "/srv": true, "/sys": true,
		"/tmp": true, "/usr": true, "/var": true, "/var/log": true, "/var/cache": true,
	}
)

const (
	cleanupMaxVisited   = 6000
	cleanupMaxDepth     = 6
	cleanupMaxItems     = 300
	cleanupLargeMinSize = 50 * 1024 * 1024 // 50 MB
	cleanupLogWarnSize  = 5 * 1024 * 1024  // 5 MB
)

func dirTotalSize(root string, maxEntries int) int64 {
	var total int64
	seen := 0
	_ = filepath.WalkDir(root, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		seen++
		if seen > maxEntries {
			return fs.SkipAll
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if !d.IsDir() {
			if info, iErr := d.Info(); iErr == nil {
				total += info.Size()
			}
		}
		return nil
	})
	return total
}

func isRotatedLog(lower string) bool {
	if strings.HasSuffix(lower, ".log.gz") || strings.HasSuffix(lower, ".log.bz2") || strings.HasSuffix(lower, ".log.xz") || strings.HasSuffix(lower, ".log.old") {
		return true
	}
	idx := strings.Index(lower, ".log.")
	if idx > 0 && idx+5 < len(lower) {
		suffix := lower[idx+5:]
		allDigits := true
		for _, ch := range suffix {
			if ch < '0' || ch > '9' {
				allDigits = false
				break
			}
		}
		if allDigits {
			return true
		}
	}
	return false
}

func scanCleanupDir(root string, visited *int, truncated *bool, items *[]cleanupItem) {
	cleanRoot := filepath.Clean(root)
	baseDepth := strings.Count(cleanRoot, string(filepath.Separator))

	_ = filepath.WalkDir(cleanRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if p == cleanRoot {
			return nil
		}
		if *visited >= cleanupMaxVisited || len(*items) >= cleanupMaxItems {
			*truncated = true
			return fs.SkipAll
		}
		*visited++

		// Never follow symlinks or enter sensitive system dirs / .git
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		name := d.Name()
		lower := strings.ToLower(name)
		if d.IsDir() && (skipScanDirs[lower] || (name == "proc" && p == "/proc") || pathBlockedByPolicy(p)) {
			return filepath.SkipDir
		}

		depth := strings.Count(filepath.Clean(p), string(filepath.Separator)) - baseDepth
		if d.IsDir() && depth > cleanupMaxDepth {
			return filepath.SkipDir
		}

		info, infoErr := d.Info()
		if infoErr != nil {
			return nil
		}
		mod := info.ModTime().Format(time.RFC3339)

		if d.IsDir() {
			if reason, ok := junkCacheDirNames[lower]; ok {
				sz := dirTotalSize(p, 1500)
				*items = append(*items, cleanupItem{
					Path: p, Name: name, IsDir: true, Size: sz, Modified: mod,
					Category: "cache", Safety: "safe", Reason: reason,
				})
				return filepath.SkipDir
			}
			// Check node_modules/.cache or .next/cache
			normSlash := filepath.ToSlash(strings.ToLower(p))
			if strings.HasSuffix(normSlash, "/.next/cache") || strings.HasSuffix(normSlash, "/node_modules/.cache") {
				sz := dirTotalSize(p, 1500)
				*items = append(*items, cleanupItem{
					Path: p, Name: filepath.Base(filepath.Dir(p)) + "/" + name, IsDir: true, Size: sz, Modified: mod,
					Category: "build", Safety: "safe", Reason: "Cache build yang dapat dibuat ulang",
				})
				return filepath.SkipDir
			}
			// Detect empty leaf directories (ignore top-level hidden config dirs)
			if !strings.HasPrefix(name, ".") {
				if entries, rErr := os.ReadDir(p); rErr == nil && len(entries) == 0 {
					*items = append(*items, cleanupItem{
						Path: p, Name: name, IsDir: true, Size: 0, Modified: mod,
						Category: "empty", Safety: "safe", Reason: "Folder kosong",
					})
					return filepath.SkipDir
				}
			}
			// Avoid walking deep inside node_modules other than its .cache
			if lower == "node_modules" {
				cacheSub := filepath.Join(p, ".cache")
				if st, sErr := os.Stat(cacheSub); sErr == nil && st.IsDir() {
					sz := dirTotalSize(cacheSub, 1500)
					*items = append(*items, cleanupItem{
						Path: cacheSub, Name: "node_modules/.cache", IsDir: true, Size: sz, Modified: st.ModTime().Format(time.RFC3339),
						Category: "build", Safety: "safe", Reason: "Cache bundler di node_modules",
					})
				}
				return filepath.SkipDir
			}
			return nil
		}

		// File classification
		size := info.Size()
		ext := strings.ToLower(filepath.Ext(name))
		if reason, ok := junkTempFileNames[lower]; ok {
			*items = append(*items, cleanupItem{
				Path: p, Name: name, IsDir: false, Size: size, Modified: mod,
				Category: "temp", Safety: "safe", Reason: reason,
			})
			return nil
		}
		if strings.HasSuffix(name, "~") || strings.HasPrefix(lower, "core.") {
			*items = append(*items, cleanupItem{
				Path: p, Name: name, IsDir: false, Size: size, Modified: mod,
				Category: "temp", Safety: "safe", Reason: "Berkas cadangan editor / core dump",
			})
			return nil
		}
		if reason, ok := junkTempExts[ext]; ok {
			cat := "temp"
			if ext == ".pyc" || ext == ".pyo" {
				cat = "cache"
			}
			*items = append(*items, cleanupItem{
				Path: p, Name: name, IsDir: false, Size: size, Modified: mod,
				Category: cat, Safety: "safe", Reason: reason,
			})
			return nil
		}
		if isRotatedLog(lower) {
			*items = append(*items, cleanupItem{
				Path: p, Name: name, IsDir: false, Size: size, Modified: mod,
				Category: "logs", Safety: "safe", Reason: "Arsip log rotasi lama",
			})
			return nil
		}
		if (ext == ".log" || ext == ".out") && size >= cleanupLogWarnSize {
			*items = append(*items, cleanupItem{
				Path: p, Name: name, IsDir: false, Size: size, Modified: mod,
				Category: "logs", Safety: "caution", Reason: "Berkas log berukuran besar",
			})
			return nil
		}
		if ext == ".map" && size >= 512*1024 {
			*items = append(*items, cleanupItem{
				Path: p, Name: name, IsDir: false, Size: size, Modified: mod,
				Category: "build", Safety: "caution", Reason: "Source map build berukuran besar",
			})
			return nil
		}
		if size >= cleanupLargeMinSize {
			*items = append(*items, cleanupItem{
				Path: p, Name: name, IsDir: false, Size: size, Modified: mod,
				Category: "large", Safety: "caution", Reason: "Berkas berukuran besar (>= 50 MB)",
			})
			return nil
		}
		if size == 0 && !strings.HasPrefix(name, ".") && name != "__init__.py" && !strings.HasSuffix(lower, ".keep") {
			*items = append(*items, cleanupItem{
				Path: p, Name: name, IsDir: false, Size: 0, Modified: mod,
				Category: "empty", Safety: "caution", Reason: "Berkas kosong (0 byte)",
			})
		}
		return nil
	})
}

func (s *Server) handleFileCleanupScan(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if u == nil {
		s.writeError(w, http.StatusUnauthorized, errors.New("unauthorized"))
		return
	}
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	if scope != "system" {
		scope = "folder"
	}
	rawPath := strings.TrimSpace(r.URL.Query().Get("path"))
	if rawPath == "" {
		rawPath = "/"
	}

	var scanRoots []string
	displayRoot := rawPath
	if scope == "system" {
		if !auth.IsSuperAdmin(u.Role) {
			s.writeError(w, http.StatusForbidden, errors.New("pemindaian sistem hanya tersedia untuk superadmin"))
			return
		}
		displayRoot = "Sistem (/tmp, /var/tmp, /var/cache, /var/log)"
		for _, cand := range []string{"/tmp", "/var/tmp", "/var/cache", "/var/log"} {
			if st, err := os.Stat(cand); err == nil && st.IsDir() {
				scanRoots = append(scanRoots, cand)
			}
		}
	} else {
		realPath, err := s.fileManagerPath(r, rawPath)
		if err != nil {
			s.writeError(w, http.StatusForbidden, err)
			return
		}
		st, err := os.Stat(realPath)
		if err != nil || !st.IsDir() {
			s.writeError(w, http.StatusBadRequest, errors.New("folder target tidak ditemukan"))
			return
		}
		displayRoot = realPath
		scanRoots = []string{realPath}
	}

	items := []cleanupItem{}
	visited := 0
	truncated := false
	for _, root := range scanRoots {
		scanCleanupDir(root, &visited, &truncated, &items)
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Size != items[j].Size {
			return items[i].Size > items[j].Size
		}
		return items[i].Path < items[j].Path
	})

	var totalBytes, safeBytes int64
	for _, it := range items {
		totalBytes += it.Size
		if it.Safety == "safe" {
			safeBytes += it.Size
		}
	}

	s.writeJSON(w, http.StatusOK, cleanupScanResponse{
		Root:         displayRoot,
		Scope:        scope,
		ScannedFiles: visited,
		TotalBytes:   totalBytes,
		SafeBytes:    safeBytes,
		Truncated:    truncated,
		Items:        items,
	})
}

func (s *Server) handleFileCleanupDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Paths []string `json:"paths"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("payload tidak valid"))
		return
	}
	if len(req.Paths) == 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("pilih minimal satu berkas untuk dihapus"))
		return
	}
	if len(req.Paths) > 500 {
		s.writeError(w, http.StatusBadRequest, errors.New("maksimal 500 item per penghapusan"))
		return
	}

	u := s.currentUserRecord(r)
	isSuper := u != nil && auth.IsSuperAdmin(u.Role)

	type failedItem struct {
		Path  string `json:"path"`
		Error string `json:"error"`
	}
	deleted := 0
	var freedBytes int64
	failed := []failedItem{}

	seen := map[string]bool{}
	for _, raw := range req.Paths {
		p := strings.TrimSpace(raw)
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true

		cleanP := normalizePathForAccess(p)
		if protectedCleanupDirs[cleanP] {
			failed = append(failed, failedItem{Path: p, Error: "direktori sistem dilindungi"})
			continue
		}

		// Allow superadmin cleanup inside standard system temp/cache/log folders directly,
		// otherwise validate strictly through File Manager root access rules.
		var real string
		var err error
		if isSuper && (pathWithinRoot(cleanP, "/tmp") || pathWithinRoot(cleanP, "/var/tmp") || pathWithinRoot(cleanP, "/var/cache") || pathWithinRoot(cleanP, "/var/log")) {
			real, err = resolveForAccess(cleanP, false)
		} else {
			real, err = s.fileManagerLinkPath(r, cleanP)
		}
		if err != nil {
			failed = append(failed, failedItem{Path: p, Error: err.Error()})
			continue
		}
		if s.isFileManagerRoot(r, real) || protectedCleanupDirs[normalizePathForAccess(real)] {
			failed = append(failed, failedItem{Path: p, Error: "folder root tidak dapat dihapus"})
			continue
		}

		var itemSize int64
		if info, sErr := os.Lstat(real); sErr == nil {
			if info.IsDir() && info.Mode()&os.ModeSymlink == 0 {
				itemSize = dirTotalSize(real, 1500)
			} else {
				itemSize = info.Size()
			}
		}

		if rErr := os.RemoveAll(real); rErr != nil {
			failed = append(failed, failedItem{Path: p, Error: rErr.Error()})
			continue
		}
		deleted++
		freedBytes += itemSize
	}

	s.auditFileAction(r, "file.cleanup.delete", "success", map[string]any{
		"deleted":    deleted,
		"failed":     len(failed),
		"freedBytes": freedBytes,
	})
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":         true,
		"deleted":    deleted,
		"freedBytes": freedBytes,
		"failed":     failed,
	})
}
