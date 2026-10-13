package httpserver

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
)

const maxWidgetsPayload = 512 << 10

// handleSystemHistory returns the recorded host metric series. ?since=<epoch ms>
// restricts the response to newer points so clients can poll incrementally.
func (s *Server) handleSystemHistory(w http.ResponseWriter, r *http.Request) {
	if s.metrics == nil {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "metrics recorder unavailable"})
		return
	}
	var since int64
	if raw := r.URL.Query().Get("since"); raw != "" {
		if v, err := strconv.ParseInt(raw, 10, 64); err == nil && v > 0 {
			since = v
		}
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"series": s.metrics.Since(since)})
}

// handleGetMyWidgets returns the signed-in user's own desktop widget layout.
// There is intentionally no fallback user: layouts are never shared across accounts.
func (s *Server) handleGetMyWidgets(w http.ResponseWriter, r *http.Request) {
	user := s.currentUserRecord(r)
	if user == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	raw, updatedAt, err := s.database.GetWidgets(user.ID)
	if err != nil {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": err.Error()})
		return
	}
	if raw == "" {
		s.writeJSON(w, http.StatusOK, jsonResponse{"data": nil, "updatedAt": nil})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"data": json.RawMessage(raw), "updatedAt": updatedAt})
}

func (s *Server) handlePutMyWidgets(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	user := s.currentUserRecord(r)
	if user == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxWidgetsPayload))
	if err != nil {
		s.writeJSON(w, http.StatusRequestEntityTooLarge, jsonResponse{"error": "payload too large"})
		return
	}
	var req struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &req); err != nil || len(req.Data) == 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}
	// The layout must be a JSON object; its inner shape is owned by the frontend.
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(req.Data, &probe); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "data must be an object"})
		return
	}

	if err := s.database.SetWidgets(user.ID, string(req.Data)); err != nil {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}
