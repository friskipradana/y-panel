package httpserver

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Speed test. Two measurements:
//   - browser <-> panel: the browser pulls and pushes bytes through the endpoints below, so the
//     result is the link between the person and this server (what OpenSpeedTest measures)
//   - panel <-> internet: the server measures its own uplink against a public speed endpoint
//     (superadmin only), the figure a hosting provider sells

const (
	speedMaxBytes      = 64 << 20
	speedDefaultBytes  = 10 << 20
	speedChunk         = 64 << 10
	speedInternetHost  = "https://speed.cloudflare.com"
	speedInternetName  = "speed.cloudflare.com"
	speedDownloadFor   = 8 * time.Second
	speedUploadFor     = 6 * time.Second
	speedStreams       = 4
	speedDownloadBytes = 25 << 20
	speedUploadBytes   = 8 << 20
	speedPingSamples   = 6
)

var (
	speedPayload     []byte
	speedPayloadOnce sync.Once
	speedInternetMu  sync.Mutex
)

// An incompressible buffer, so a compressing proxy cannot inflate the result
func speedBuffer() []byte {
	speedPayloadOnce.Do(func() {
		speedPayload = make([]byte, speedChunk)
		_, _ = rand.Read(speedPayload)
	})
	return speedPayload
}

func isSpeedtestPath(path string) bool {
	return strings.HasPrefix(path, "/api/v1/speedtest/")
}

func (s *Server) handleSpeedtestDownload(w http.ResponseWriter, r *http.Request) {
	size := int64(speedDefaultBytes)
	if raw := r.URL.Query().Get("bytes"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed < 0 {
			s.writeError(w, http.StatusBadRequest, errors.New("bytes must be a positive number"))
			return
		}
		size = parsed
	}
	if size > speedMaxBytes {
		size = speedMaxBytes
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Encoding", "identity")
	buf := speedBuffer()
	for size > 0 {
		n := int64(len(buf))
		if size < n {
			n = size
		}
		if _, err := w.Write(buf[:n]); err != nil {
			return
		}
		size -= n
	}
}

func (s *Server) handleSpeedtestUpload(w http.ResponseWriter, r *http.Request) {
	n, err := io.Copy(io.Discard, io.LimitReader(r.Body, speedMaxBytes+1))
	if err != nil && !errors.Is(err, context.Canceled) {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	if n > speedMaxBytes {
		s.writeError(w, http.StatusRequestEntityTooLarge, fmt.Errorf("upload is limited to %d MB per request", speedMaxBytes>>20))
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	s.writeJSON(w, http.StatusOK, jsonResponse{"bytes": n})
}

func (s *Server) handleSpeedtestPing(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}
