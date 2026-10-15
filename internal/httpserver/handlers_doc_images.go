package httpserver

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"

	"github.com/friskipradana/panel-desktop-ui/internal/runtimepath"
)

// Images inserted into articles. Stored by content hash under the state directory, validated by
// sniffing the bytes (never the client-declared type), and served read-only with the detected type.

const maxDocImageBytes = 5 << 20

var docImageNameRe = regexp.MustCompile(`^[a-f0-9]{40}\.(png|jpg|gif|webp)$`)

var docImageTypes = map[string]string{
	"image/png":  "png",
	"image/jpeg": "jpg",
	"image/gif":  "gif",
	"image/webp": "webp",
}

func docImageDir() string {
	return filepath.Join(runtimepath.StateDir(), "doc-images")
}

func (s *Server) handleUploadDocImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxDocImageBytes+(64<<10))
	file, _, err := r.FormFile("file")
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "image file is required (max 5 MB)"})
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxDocImageBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxDocImageBytes {
		s.writeJSON(w, http.StatusRequestEntityTooLarge, jsonResponse{"error": "image must be between 1 byte and 5 MB"})
		return
	}
	ext, ok := docImageTypes[http.DetectContentType(data)]
	if !ok {
		s.writeJSON(w, http.StatusUnsupportedMediaType, jsonResponse{"error": "only PNG, JPEG, GIF and WebP images are accepted"})
		return
	}
	sum := sha256.Sum256(data)
	name := hex.EncodeToString(sum[:])[:40] + "." + ext
	if err := os.MkdirAll(docImageDir(), 0o755); err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "could not prepare image storage"})
		return
	}
	if err := os.WriteFile(filepath.Join(docImageDir(), name), data, 0o644); err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "could not store image"})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"url": "/api/v1/public/doc-images/" + name, "name": name})
}

func (s *Server) handlePublicDocImage(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !docImageNameRe.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	data, err := os.ReadFile(filepath.Join(docImageDir(), name))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", http.DetectContentType(data))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	_, _ = w.Write(data)
}
