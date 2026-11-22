package httpserver

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"

	"github.com/friskipradana/panel-desktop-ui/internal/projects"
)

// The File Manager acts as root on folders their owners control, so a path is judged by where it really
// leads, not by how it is spelled: a symlink inside an allowed folder that points outside it is outside.

var errPathUnverifiable = errors.New("akses file ditolak: path tidak dapat diverifikasi")

// resolveForAccess returns the real path of target. With followFinal false the last component is
// the thing itself (a link to delete or rename), so only the folder that holds it is resolved.
func resolveForAccess(target string, followFinal bool) (string, error) {
	clean := normalizePathForAccess(target)
	if !followFinal {
		parent, err := projects.RealPath(filepath.Dir(clean))
		if err != nil {
			return "", errPathUnverifiable
		}
		return filepath.Join(parent, filepath.Base(clean)), nil
	}
	// a link that leads nowhere would be followed by a write into whatever it will name
	if info, err := os.Lstat(clean); err == nil && info.Mode()&os.ModeSymlink != 0 {
		if _, err := filepath.EvalSymlinks(clean); err != nil {
			return "", errors.New("akses file ditolak: symlink tidak mengarah ke mana pun")
		}
	}
	real, err := projects.RealPath(clean)
	if err != nil {
		return "", errPathUnverifiable
	}
	return real, nil
}

// pathAllowed says whether the real path of target lies inside one of the roots, and returns it.
func pathAllowed(roots []string, target string, elevated, followFinal bool) (string, error) {
	real, err := resolveForAccess(target, followFinal)
	if err != nil {
		return "", err
	}
	if !elevated && (pathBlockedByPolicy(normalizePathForAccess(target)) || pathBlockedByPolicy(real)) {
		return "", errors.New("akses file ditolak: path sistem sensitif diblokir")
	}
	for _, root := range roots {
		realRoot := normalizePathForAccess(root)
		if resolved, err := projects.RealPath(realRoot); err == nil {
			realRoot = resolved
		}
		if pathWithinRoot(real, realRoot) {
			return real, nil
		}
	}
	return "", errors.New("akses file ditolak: path di luar root yang diizinkan")
}

// fileManagerPath checks the path and returns the real one to act on.
func (s *Server) fileManagerPath(r *http.Request, target string) (string, error) {
	roots, err := s.allowedFileManagerRoots(r)
	if err != nil {
		return "", err
	}
	return pathAllowed(roots, target, s.hasElevatedFileRootAccess(r), true)
}

// fileManagerLinkPath is the same for something acted on as itself: a symlink is deleted or renamed, not followed.
func (s *Server) fileManagerLinkPath(r *http.Request, target string) (string, error) {
	roots, err := s.allowedFileManagerRoots(r)
	if err != nil {
		return "", err
	}
	return pathAllowed(roots, target, s.hasElevatedFileRootAccess(r), false)
}

// isFileManagerRoot says whether a path is one of the folders the account is confined to (these are never deleted or moved)
func (s *Server) isFileManagerRoot(r *http.Request, real string) bool {
	roots, err := s.allowedFileManagerRoots(r)
	if err != nil {
		return false
	}
	for _, root := range roots {
		resolved, err := projects.RealPath(normalizePathForAccess(root))
		if err != nil {
			resolved = normalizePathForAccess(root)
		}
		if real == resolved {
			return true
		}
	}
	return false
}
