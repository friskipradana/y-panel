package httpserver

import (
	"context"
	"time"

	"net/http"

	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

// wahaUpdateTimeout covers the download of the image (over 3 GB) and the wait for WAHA to answer again
const wahaUpdateTimeout = 40 * time.Minute

// handleWahaUpdate downloads the newest image of the WhatsApp runtime and makes its container again from it. The sessions live in a
// volume, so nobody scans a code again. It answers like the update of any container: one JSON line per event.
func (s *Server) handleWahaUpdate(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	emit := startEventStream(w)
	ctx, cancel := context.WithTimeout(r.Context(), wahaUpdateTimeout)
	defer cancel()
	result := "ok"
	if err := docker.UpdateManaged(ctx, "reneo-waha", emit, s.notify.RecreateWaha); err != nil {
		result = "failed"
		emit(docker.UpdateEvent{Type: "error", Error: err.Error()})
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "notify.waha.update", result, nil)
	}
}
