package httpserver

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// The panel is often reached without anything in front of it that compresses (a public IP with no CDN), so the text files of
// the frontend are sent gzipped when the browser accepts it. A compressed copy is made once per file version and kept in memory.

type gzipEntry struct {
	modTime time.Time
	size    int64
	data    []byte
}

var (
	gzipCache sync.Mutex
	gzipFiles = map[string]gzipEntry{}
)

const gzipMaxFileSize = 4 << 20

var gzipTypes = map[string]bool{".js": true, ".css": true, ".svg": true, ".json": true, ".webmanifest": true, ".txt": true, ".html": true}

// serveGzipped answers with the compressed file and reports true, or reports false when the file is to be sent as it is
func serveGzipped(w http.ResponseWriter, r *http.Request, target string, info os.FileInfo) bool {
	ext := strings.ToLower(filepath.Ext(target))
	if !gzipTypes[ext] || info.Size() < 1024 || info.Size() > gzipMaxFileSize {
		return false
	}
	if r.Header.Get("Range") != "" || !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		return false
	}

	gzipCache.Lock()
	entry, ok := gzipFiles[target]
	gzipCache.Unlock()
	if !ok || !entry.modTime.Equal(info.ModTime()) || entry.size != info.Size() {
		raw, err := os.ReadFile(target)
		if err != nil {
			return false
		}
		var buf bytes.Buffer
		zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
		if _, err := zw.Write(raw); err != nil || zw.Close() != nil {
			return false
		}
		entry = gzipEntry{modTime: info.ModTime(), size: info.Size(), data: buf.Bytes()}
		gzipCache.Lock()
		gzipFiles[target] = entry
		gzipCache.Unlock()
	}

	w.Header().Set("Content-Encoding", "gzip")
	w.Header().Add("Vary", "Accept-Encoding")
	http.ServeContent(w, r, filepath.Base(target), info.ModTime(), bytes.NewReader(entry.data))
	return true
}

// writeMaybeGzipped writes a page made per request (the shell with its text and first data) compressed when the browser accepts it
func writeMaybeGzipped(w http.ResponseWriter, r *http.Request, body []byte) {
	w.Header().Add("Vary", "Accept-Encoding")
	if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		w.Header().Set("Content-Encoding", "gzip")
		zw := gzip.NewWriter(w)
		_, _ = zw.Write(body)
		_ = zw.Close()
		return
	}
	_, _ = w.Write(body)
}
