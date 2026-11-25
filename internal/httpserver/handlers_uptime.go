package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/uptime"
)

func (s *Server) runUptimeMonitorLoop(interval time.Duration, stop <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			if s.database == nil || !s.database.IsConnected() {
				continue
			}
			due, err := s.database.ListDueUptimeMonitors(time.Now())
			if err != nil || len(due) == 0 {
				continue
			}
			sem := make(chan struct{}, 5)
			var wg sync.WaitGroup
			for _, m := range due {
				mon := m
				sem <- struct{}{}
				wg.Add(1)
				go func() {
					defer wg.Done()
					defer func() { <-sem }()
					ctx, cancel := context.WithTimeout(s.bgCtx, time.Duration(mon.TimeoutSeconds+5)*time.Second)
					defer cancel()
					s.executeUptimeCheck(ctx, &mon)
				}()
			}
			wg.Wait()
		}
	}
}

func (s *Server) executeUptimeCheck(ctx context.Context, mon *database.UptimeMonitor) uptime.ProbeResult {
	res := uptime.Probe(ctx, mon.Kind, mon.Target, mon.ExpectedStatus, mon.TimeoutSeconds)

	prevStatus := mon.LastStatus
	shouldSSLAlert := false
	if mon.NotifyEnabled && res.SSLDaysLeft != nil && *res.SSLDaysLeft <= 14 {
		if mon.LastSSLAlertAt == nil || time.Since(*mon.LastSSLAlertAt) >= 24*time.Hour {
			shouldSSLAlert = true
		}
	}

	_ = s.database.RecordUptimeCheck(
		mon.ID, mon.IntervalSeconds, res.Status, res.HTTPCode, res.LatencyMs,
		res.ErrorText, res.SSLExpiresAt, res.SSLDaysLeft, shouldSSLAlert,
	)

	if mon.NotifyEnabled {
		if res.Status == "down" && prevStatus != "down" {
			body := fmt.Sprintf("%s (%s) tidak merespons: %s", mon.Name, mon.Target, res.ErrorText)
			s.notifyUserAction(mon.OwnerUserID, fmt.Sprintf("Monitor DOWN: %s", mon.Name), body, "error")
		} else if res.Status == "up" && prevStatus == "down" {
			body := fmt.Sprintf("%s (%s) kembali normal (%dms)", mon.Name, mon.Target, res.LatencyMs)
			s.notifyUserAction(mon.OwnerUserID, fmt.Sprintf("Monitor PULIH: %s", mon.Name), body, "success")
		}
		if shouldSSLAlert && res.SSLDaysLeft != nil {
			body := fmt.Sprintf("Sertifikat SSL %s (%s) tersisa %d hari lagi.", mon.Name, mon.Target, *res.SSLDaysLeft)
			s.notifyUserAction(mon.OwnerUserID, fmt.Sprintf("SSL Segera Berakhir: %s", mon.Name), body, "warning")
		}
	}
	return res
}

func (s *Server) handleListUptimeMonitors(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "database panel belum terhubung"})
		return
	}
	items, err := s.database.ListUptimeMonitors(u.ID, u.Role == auth.SuperadminRole)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}

func (s *Server) handleCreateUptimeMonitor(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	defer r.Body.Close()
	var req struct {
		Name            string `json:"name"`
		Kind            string `json:"kind"`
		Target          string `json:"target"`
		ExpectedStatus  int    `json:"expectedStatus"`
		IntervalSeconds int    `json:"intervalSeconds"`
		TimeoutSeconds  int    `json:"timeoutSeconds"`
		Enabled         bool   `json:"enabled"`
		NotifyEnabled   bool   `json:"notifyEnabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Kind = strings.ToLower(strings.TrimSpace(req.Kind))
	if req.Kind == "" {
		req.Kind = "http"
	}
	target, err := uptime.ValidateTarget(req.Kind, req.Target)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if req.Name == "" {
		req.Name = target
	}
	if req.IntervalSeconds < 30 {
		req.IntervalSeconds = 60
	}
	if req.IntervalSeconds > 3600 {
		req.IntervalSeconds = 3600
	}
	if req.TimeoutSeconds <= 0 || req.TimeoutSeconds > 60 {
		req.TimeoutSeconds = 10
	}
	if req.Kind == "http" && req.ExpectedStatus <= 0 {
		req.ExpectedStatus = 200
	}

	created, err := s.database.CreateUptimeMonitor(database.UptimeMonitor{
		OwnerUserID:     u.ID,
		Name:            req.Name,
		Kind:            req.Kind,
		Target:          target,
		ExpectedStatus:  req.ExpectedStatus,
		IntervalSeconds: req.IntervalSeconds,
		TimeoutSeconds:  req.TimeoutSeconds,
		Enabled:         req.Enabled,
		NotifyEnabled:   req.NotifyEnabled,
	})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	// Run an immediate initial check in the background so UI gets real status quickly
	go func(m database.UptimeMonitor) {
		ctx, cancel := context.WithTimeout(s.bgCtx, 15*time.Second)
		defer cancel()
		s.executeUptimeCheck(ctx, &m)
	}(*created)
	s.auditSensitiveAction(r, u, "uptime.monitor.create", "ok", map[string]any{"name": created.Name, "target": created.Target})
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateUptimeMonitor(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID monitor tidak valid"})
		return
	}
	mon, err := s.database.GetUptimeMonitor(id)
	if err != nil || mon == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "monitor tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && mon.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	defer r.Body.Close()
	var req struct {
		Enabled       *bool `json:"enabled"`
		NotifyEnabled *bool `json:"notifyEnabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	en := mon.Enabled
	if req.Enabled != nil {
		en = *req.Enabled
	}
	nt := mon.NotifyEnabled
	if req.NotifyEnabled != nil {
		nt = *req.NotifyEnabled
	}
	updated, err := s.database.UpdateUptimeMonitorEnabled(id, en, nt)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteUptimeMonitor(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID monitor tidak valid"})
		return
	}
	mon, err := s.database.GetUptimeMonitor(id)
	if err != nil || mon == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "monitor tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && mon.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	if err := s.database.DeleteUptimeMonitor(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "uptime.monitor.delete", "ok", map[string]any{"name": mon.Name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleCheckUptimeMonitorNow(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID monitor tidak valid"})
		return
	}
	mon, err := s.database.GetUptimeMonitor(id)
	if err != nil || mon == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "monitor tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && mon.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	s.executeUptimeCheck(ctx, mon)
	updated, err := s.database.GetUptimeMonitor(id)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleUptimeMonitorHistory(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID monitor tidak valid"})
		return
	}
	mon, err := s.database.GetUptimeMonitor(id)
	if err != nil || mon == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "monitor tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && mon.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	items, err := s.database.ListUptimeChecks(id, 60)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}
