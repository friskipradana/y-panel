package httpserver

import (
	"encoding/json"
	"net/http"
	"runtime"
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/hostops"
)

func (s *Server) handleHostOpsOverview(w http.ResponseWriter, r *http.Request) {
	services, sysAvail, sysErr := hostops.ListSystemdServices(r.Context())
	cronJobs, cronAvail, cronErr := hostops.ListCronJobs(r.Context())
	resp := jsonResponse{
		"os":               runtime.GOOS,
		"systemdAvailable": sysAvail,
		"cronAvailable":    cronAvail,
		"services":         services,
		"cronJobs":         cronJobs,
	}
	if sysErr != nil {
		resp["systemdError"] = sysErr.Error()
	}
	if cronErr != nil {
		resp["cronError"] = cronErr.Error()
	}
	s.writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleSystemdControl(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	unit := r.PathValue("unit")
	action := r.PathValue("action")
	if err := hostops.ControlSystemdService(r.Context(), unit, action); err != nil {
		s.auditSensitiveAction(r, u, "hostops.systemd."+action, "error", map[string]any{"unit": unit, "error": err.Error()})
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "hostops.systemd."+action, "ok", map[string]any{"unit": unit})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleSystemdLogs(w http.ResponseWriter, r *http.Request) {
	unit := r.PathValue("unit")
	lines, _ := strconv.Atoi(r.URL.Query().Get("lines"))
	out, err := hostops.SystemdServiceLogs(r.Context(), unit, lines)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"logs": out})
}

func (s *Server) handleUpsertCronJob(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	defer r.Body.Close()
	var req hostops.CronJob
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	saved, err := hostops.UpsertCronJob(r.Context(), req)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "hostops.cron.save", "ok", map[string]any{"id": saved.ID, "name": saved.Name, "schedule": saved.Schedule})
	s.writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleDeleteCronJob(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := strings.TrimSpace(r.PathValue("id"))
	if err := hostops.DeleteCronJob(r.Context(), id); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "hostops.cron.delete", "ok", map[string]any{"id": id})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleRunCronJobNow(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := strings.TrimSpace(r.PathValue("id"))
	jobs, _, err := hostops.ListCronJobs(r.Context())
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	var target *hostops.CronJob
	for i := range jobs {
		if jobs[i].ID == id {
			target = &jobs[i]
			break
		}
	}
	if target == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "cron job tidak ditemukan"})
		return
	}
	out, runErr := hostops.RunCronCommandNow(r.Context(), target.Command)
	if runErr != nil {
		s.auditSensitiveAction(r, u, "hostops.cron.run", "error", map[string]any{"id": id, "error": runErr.Error()})
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": false, "error": runErr.Error(), "output": out})
		return
	}
	s.auditSensitiveAction(r, u, "hostops.cron.run", "ok", map[string]any{"id": id})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "output": out})
}
