package httpserver

import (
	"bufio"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"sync"
)

// jsonResponse is the standard JSON response envelope.
type jsonResponse map[string]any

// writeJSON sends a JSON response with the given status code.
func (s *Server) writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// writeError sends a JSON error response. If err is nil, a generic message is used.
func (s *Server) writeError(w http.ResponseWriter, status int, err error) {
	message := "request failed"
	if err != nil {
		message = strings.TrimSpace(err.Error())
	}
	if errors.Is(err, http.ErrNoCookie) {
		message = "unauthorized"
	}
	s.writeJSON(w, status, jsonResponse{"error": message})
}

// statusRecorder wraps http.ResponseWriter to capture the response status code.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijacking")
	}
	return hijacker.Hijack()
}

func (r *statusRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (r *statusRecorder) Push(target string, opts *http.PushOptions) error {
	pusher, ok := r.ResponseWriter.(http.Pusher)
	if !ok {
		return http.ErrNotSupported
	}
	return pusher.Push(target, opts)
}

// syncWriter provides a simple mutex lock for concurrent WebSocket writes.
type syncWriter struct {
	mu sync.Mutex
}

func (s *syncWriter) Lock() {
	s.mu.Lock()
}

func (s *syncWriter) Unlock() {
	s.mu.Unlock()
}
