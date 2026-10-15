package httpserver

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/updater"
)

func (s *Server) currentVersion() string {
	if v := strings.TrimPrefix(s.appVersion(), "v"); v != "" {
		return v
	}
	return "dev"
}

// handleUpdateInfo reports the installed and the latest published version.
func (s *Server) handleUpdateInfo(w http.ResponseWriter, r *http.Request) {
	force := r.URL.Query().Get("refresh") == "1"
	ctx := r.Context()
	info := s.updates.Check(ctx, s.currentVersion(), force)
	s.writeJSON(w, http.StatusOK, info)
}

// handleUpdateStatus reports progress of an update started from the panel.
func (s *Server) handleUpdateStatus(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, updater.Settle(s.cfg.StateDir, s.currentVersion()))
}

type applyUpdateRequest struct {
	Version string `json:"version"`
	Confirm bool   `json:"confirm"`
}

// handleUpdateApply starts the installer for a newer release. Restricted to superadmin:
// it replaces the running binary and restarts the service.
func (s *Server) handleUpdateApply(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req applyUpdateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if !req.Confirm {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "confirm=true is required: the update restarts the panel service"})
		return
	}

	current := s.currentVersion()
	state, err := s.updates.Apply(r.Context(), current, req.Version, s.cfg.StateDir)
	if err != nil {
		log.Printf("[update] apply failed remote=%s err=%v", remoteAddr(r), err)
		s.recordRuntimeLog("error", "panel update failed to start", map[string]any{"remote": remoteAddr(r), "error": err.Error()})
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error(), "state": state})
		return
	}

	log.Printf("[update] started %s -> %s remote=%s", current, state.To, remoteAddr(r))
	s.recordRuntimeLog("warning", "panel update started", map[string]any{"from": current, "to": state.To, "remote": remoteAddr(r)})
	s.notifyCurrentServerUser(r, "Pembaruan Reneo dimulai", "Reneo diperbarui ke v"+state.To+". Panel akan terputus sebentar saat service direstart.", "info")
	s.writeJSON(w, http.StatusAccepted, jsonResponse{"ok": true, "state": state, "startedAt": time.Now().UTC()})
}
