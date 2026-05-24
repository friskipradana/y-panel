package httpserver

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/system"
	"github.com/friskipradana/panel-desktop-ui/internal/users"
)

// ─── System / Settings Handlers ─────────────────────────────────────────────

type updateSettingsRequest struct {
	Hostname    string   `json:"hostname"`
	Timezone    string   `json:"timezone"`
	Nameservers []string `json:"nameservers"`
}

type updatePanelPortRequest struct {
	Port int `json:"port"`
}

type updatePanelOriginsRequest struct {
	OriginsRaw string `json:"originsRaw"`
}

type resetDatabasePasswordResponse struct {
	OK       bool   `json:"ok"`
	Password string `json:"password"`
	Message  string `json:"message"`
}

type resetPrimaryPanelPasswordRequest struct {
	NewPassword     string `json:"newPassword"`
	ConfirmPassword string `json:"confirmPassword"`
}

type resetPrimaryPanelPasswordResponse struct {
	OK       bool   `json:"ok"`
	Message  string `json:"message"`
	Username string `json:"username"`
}

type systemLogResponse struct {
	Service string            `json:"service"`
	Limit   int               `json:"limit"`
	Lines   []system.LogEntry `json:"lines"`
}

type changelogResponse struct {
	Items []database.ChangelogEntry `json:"items"`
}

type databaseStatusResponse struct {
	Status        database.Status               `json:"status"`
	RuntimeLogs   []database.RuntimeLog         `json:"runtimeLogs"`
	SettingsAudit []database.SettingsAuditEntry `json:"settingsAudit"`
}

type truncateDataRequest struct {
	Target string `json:"target"`
	Days   int    `json:"days"`
}

func (s *Server) handleSystemSummary(w http.ResponseWriter, _ *http.Request) {
	summary := system.Inspect(s.cfg.PortainerURL, s.cfg.StateDir)
	dbStatus := s.database.Status()

	projectSummary := map[string]any{
		"total":          0,
		"active":         0,
		"degraded":       0,
		"drift":          0,
		"attention":      0,
		"reconcileFresh": false,
	}
	if s.database != nil && s.database.IsConnected() {
		var (
			projectList []database.Project
			total       int64
		)
		var err error
		projectList, total, err = s.database.ListAllProjects(250, 0)
		if err != nil {
			log.Printf("[system] failed to summarize projects: %v", err)
		} else {
			activeCount := 0
			degradedCount := 0
			driftCount := 0
			attentionCount := 0
			for _, project := range projectList {
				snapshot := s.projectManager.SnapshotProject(project)
				if strings.EqualFold(strings.TrimSpace(project.Status), "active") || snapshot.Running {
					activeCount++
				}
				isDegraded := strings.EqualFold(strings.TrimSpace(project.Status), "degraded")
				if isDegraded {
					degradedCount++
				}
				if snapshot.Drift {
					driftCount++
				}
				if isDegraded || snapshot.Drift {
					attentionCount++
				}
			}
			projectSummary = map[string]any{
				"total":          total,
				"active":         activeCount,
				"degraded":       degradedCount,
				"drift":          driftCount,
				"attention":      attentionCount,
				"reconcileFresh": true,
			}
		}
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"hostname":           summary.Hostname,
		"osName":             summary.OSName,
		"kernel":             summary.Kernel,
		"uptimeSeconds":      summary.UptimeSeconds,
		"cpuUsagePercent":    summary.CPUUsagePercent,
		"cpuTemp":            summary.CPUTemp,
		"memory":             summary.Memory,
		"storage":            summary.Storage,
		"dockerInstalled":    summary.DockerInstalled,
		"dockerReachable":    summary.DockerReachable,
		"dockerStatus":       summary.DockerStatus,
		"portainerReachable": summary.PortainerReachable,
		"portainerUrl":       s.cfg.PortainerURL,
		"stateDir":           s.cfg.StateDir,
		"database":           dbStatus,
		"projects":           projectSummary,
	})
}

func (s *Server) handleSystemLogs(w http.ResponseWriter, r *http.Request) {
	service := strings.TrimSpace(r.URL.Query().Get("service"))
	if service == "" {
		service = "ypanel"
	}
	limit := 160
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		if parsed, err := strconv.Atoi(rawLimit); err == nil {
			limit = parsed
		}
	}

	lines, err := system.ReadServiceLogs(service, limit)
	if err != nil {
		log.Printf("[system] logs failed service=%q remote=%s err=%v", service, remoteAddr(r), err)
		s.recordRuntimeLog("error", "system logs failed", map[string]any{"service": service, "remote": remoteAddr(r), "error": err.Error()})
		s.writeError(w, http.StatusBadGateway, err)
		return
	}

	log.Printf("[system] logs served service=%q lines=%d remote=%s", service, len(lines), remoteAddr(r))
	s.recordRuntimeLog("info", "system logs served", map[string]any{"service": service, "lines": len(lines), "remote": remoteAddr(r)})
	s.writeJSON(w, http.StatusOK, systemLogResponse{
		Service: service,
		Limit:   limit,
		Lines:   lines,
	})
}

func (s *Server) handleSystemChangelog(w http.ResponseWriter, _ *http.Request) {
	items, err := s.database.ListChangelog(24)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, changelogResponse{Items: items})
}

func (s *Server) handleDatabaseStatus(w http.ResponseWriter, _ *http.Request) {
	runtimeLogs, err := s.database.ListRuntimeLogs(80)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	settingsAudit, err := s.database.ListSettingsAudit(40)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, databaseStatusResponse{
		Status:        s.database.Status(),
		RuntimeLogs:   runtimeLogs,
		SettingsAudit: settingsAudit,
	})
}

func (s *Server) handleDatabaseTruncate(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	if !s.database.IsConnected() {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "database not connected"})
		return
	}

	var req truncateDataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	if req.Target == "" || req.Days < 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid target or days parameter"})
		return
	}

	affected, err := s.database.TruncateData(req.Target, req.Days)
	if err != nil {
		log.Printf("[database] truncate failed target=%q days=%d remote=%s err=%v", req.Target, req.Days, remoteAddr(r), err)
		s.recordRuntimeLog("error", "database truncate failed", map[string]any{"target": req.Target, "days": req.Days, "remote": remoteAddr(r), "error": err.Error()})
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	username, _ := s.currentUser(r)
	log.Printf("[database] truncate success target=%q days=%d affected=%d remote=%s user=%q", req.Target, req.Days, affected, remoteAddr(r), username)
	s.recordRuntimeLog("info", "database truncated", map[string]any{"target": req.Target, "days": req.Days, "affected": affected, "user": username, "remote": remoteAddr(r)})

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":       true,
		"affected": affected,
	})
}

func (s *Server) handleGetSystemSettings(w http.ResponseWriter, r *http.Request) {
	snapshot, err := system.ReadEditableSettings()
	if err != nil {
		log.Printf("[settings] read failed remote=%s err=%v", remoteAddr(r), err)
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	log.Printf("[settings] read served hostname=%q timezone=%q remote=%s", snapshot.Hostname, snapshot.Timezone, remoteAddr(r))
	s.writeJSON(w, http.StatusOK, snapshot)
}

func (s *Server) handleUpdateSystemSettings(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req updateSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	snapshot, err := system.UpdateEditableSettings(system.SettingsUpdate{
		Hostname:    req.Hostname,
		Timezone:    req.Timezone,
		Nameservers: req.Nameservers,
	})
	if err != nil {
		log.Printf("[settings] update failed hostname=%q timezone=%q remote=%s err=%v", req.Hostname, req.Timezone, remoteAddr(r), err)
		s.recordRuntimeLog("error", "settings update failed", map[string]any{"hostname": req.Hostname, "timezone": req.Timezone, "remote": remoteAddr(r), "error": err.Error()})
		s.writeError(w, http.StatusBadGateway, err)
		return
	}

	username, _ := s.currentUser(r)
	currentUser := s.currentUserRecord(r)
	var auditUserID *int64
	if currentUser != nil {
		auditUserID = &currentUser.ID
	}
	s.database.RecordSettingsAudit(auditUserID, snapshot.Hostname, snapshot.Timezone, snapshot.Nameservers)
	log.Printf("[settings] update applied hostname=%q timezone=%q dns=%q remote=%s", snapshot.Hostname, snapshot.Timezone, strings.Join(snapshot.Nameservers, ","), remoteAddr(r))
	s.recordRuntimeLog("info", "settings update applied", map[string]any{"hostname": snapshot.Hostname, "timezone": snapshot.Timezone, "nameservers": snapshot.Nameservers, "remote": remoteAddr(r), "user": username})
	s.notifyCurrentServerUser(r, "System settings diperbarui ⚙️", fmt.Sprintf("Hostname '%s' dan timezone '%s' berhasil diperbarui.", snapshot.Hostname, snapshot.Timezone), "info")
	s.writeJSON(w, http.StatusOK, snapshot)
}

func (s *Server) handleUpdatePanelPort(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req updatePanelPortRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	snapshot, err := system.UpdatePanelPort(req.Port)
	if err != nil {
		log.Printf("[settings] panel port update failed port=%d remote=%s err=%v", req.Port, remoteAddr(r), err)
		s.recordRuntimeLog("error", "panel port update failed", map[string]any{"port": req.Port, "remote": remoteAddr(r), "error": err.Error()})
		s.writeError(w, http.StatusBadGateway, err)
		return
	}

	s.ReloadAccessConfig(snapshot.AllowedHosts, snapshot.AllowedOrigins)
	username, _ := s.currentUser(r)
	log.Printf("[settings] panel port updated bind=%q remote=%s", snapshot.BindAddr, remoteAddr(r))
	s.recordRuntimeLog("info", "panel port updated", map[string]any{"bindAddr": snapshot.BindAddr, "allowedOrigins": snapshot.AllowedOrigins, "remote": remoteAddr(r), "user": username})
	s.notifyCurrentServerUser(r, "Port panel diperbarui 🔌", fmt.Sprintf("Panel sekarang menggunakan bind address %s.", snapshot.BindAddr), "info")
	s.writeJSON(w, http.StatusOK, snapshot)
}

func (s *Server) handleUpdatePanelOrigins(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req updatePanelOriginsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	snapshot, err := system.UpdatePanelOrigins(req.OriginsRaw)
	if err != nil {
		log.Printf("[settings] panel origins update failed remote=%s err=%v", remoteAddr(r), err)
		s.recordRuntimeLog("error", "panel origins update failed", map[string]any{"originsRaw": req.OriginsRaw, "remote": remoteAddr(r), "error": err.Error()})
		s.writeError(w, http.StatusBadGateway, err)
		return
	}

	s.ReloadAccessConfig(snapshot.AllowedHosts, snapshot.AllowedOrigins)
	username, _ := s.currentUser(r)
	log.Printf("[settings] panel origins updated count=%d remote=%s", len(snapshot.AllowedOrigins), remoteAddr(r))
	s.recordRuntimeLog("info", "panel origins updated", map[string]any{"allowedOrigins": snapshot.AllowedOrigins, "originsRaw": snapshot.OriginsRaw, "remote": remoteAddr(r), "user": username})
	s.notifyCurrentServerUser(r, "Allowed origins diperbarui 🌍", fmt.Sprintf("Daftar origin panel berhasil diperbarui menjadi %d entri.", len(snapshot.AllowedOrigins)), "info")
	s.writeJSON(w, http.StatusOK, snapshot)
}

// ─── Wallpaper Handlers ────────────────────────────────────────────────────

func (s *Server) handleGetWallpaper(w http.ResponseWriter, r *http.Request) {
	currentUser := s.currentUserRecord(r)
	if currentUser == nil {
		currentUser, _ = s.database.GetUserByUsername("admin")
	}
	if currentUser == nil {
		s.writeJSON(w, http.StatusOK, jsonResponse{"data": ""})
		return
	}
	wallpaperData, err := s.database.GetWallpaper(currentUser.ID)
	if err != nil {
		s.writeJSON(w, http.StatusOK, jsonResponse{"data": ""})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"data": wallpaperData})
}

func (s *Server) handleUpdateWallpaper(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req struct {
		Data string `json:"data"`
	}

	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<20)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body structure or payload too large"})
		return
	}

	currentUser := s.currentUserRecord(r)
	if currentUser == nil {
		currentUser, _ = s.database.GetUserByUsername("admin")
	}
	if currentUser == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	if err := s.database.SetWallpaper(currentUser.ID, req.Data); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	s.notifyCurrentServerUser(r, "Wallpaper diperbarui 🖼️", "Wallpaper desktop berhasil diperbarui.", "success")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// ─── Database Password Reset ────────────────────────────────────────────────

func (s *Server) handleResetDatabasePassword(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.DatabaseEnable {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "database runtime disabled"})
		return
	}

	password, err := generateSecretToken(24)
	if err != nil {
		log.Printf("[database] reset password token generation failed remote=%s err=%v", remoteAddr(r), err)
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	if err := rotateDatabasePassword(s.cfg, password); err != nil {
		log.Printf("[database] reset password failed remote=%s err=%v", remoteAddr(r), err)
		s.recordRuntimeLog("error", "database password reset failed", map[string]any{"remote": remoteAddr(r), "error": err.Error()})
		s.writeError(w, http.StatusBadGateway, err)
		return
	}

	username, _ := s.currentUser(r)
	message := "Password database berhasil dirotasi dan env runtime diperbarui. Restart service agent bila koneksi lama masih aktif."
	log.Printf("[database] password rotated user=%q remote=%s dsn=%s", username, remoteAddr(r), redactDSNPassword(s.cfg.DatabaseDSN))
	s.recordRuntimeLog("info", "database password rotated", map[string]any{"remote": remoteAddr(r), "user": username, "dsn": redactDSNPassword(s.cfg.DatabaseDSN)})
	s.notifyCurrentServerUser(r, "Password database dirotasi 🔐", "Password database berhasil dirotasi dan kredensial runtime diperbarui.", "warning")
	s.writeJSON(w, http.StatusOK, resetDatabasePasswordResponse{OK: true, Password: password, Message: message})
}

// ─── Primary Panel Password Reset ───────────────────────────────────────────

func (s *Server) handleResetPrimaryPanelPassword(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req resetPrimaryPanelPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid request body"})
		return
	}

	req.NewPassword = strings.TrimSpace(req.NewPassword)
	req.ConfirmPassword = strings.TrimSpace(req.ConfirmPassword)
	if req.NewPassword == "" || req.ConfirmPassword == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "password baru dan konfirmasi wajib diisi"})
		return
	}
	if req.NewPassword != req.ConfirmPassword {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "konfirmasi password tidak cocok"})
		return
	}
	if err := users.ValidatePassword(req.NewPassword); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	targetUser, err := s.database.GetPrimarySuperadmin()
	if err != nil || targetUser == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "akun utama YPanel tidak ditemukan"})
		return
	}

	if err := s.auth.ResetPassword(targetUser.ID, req.NewPassword); err != nil {
		log.Printf("[auth] reset primary YPanel password failed remote=%s err=%v", remoteAddr(r), err)
		s.recordRuntimeLog("error", "primary YPanel password reset failed", map[string]any{"remote": remoteAddr(r), "error": err.Error(), "targetUser": targetUser.Username})
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	actor, _ := s.currentUser(r)
	message := fmt.Sprintf("Password akun utama YPanel (%s) berhasil diperbarui.", targetUser.Username)
	log.Printf("[auth] primary YPanel password reset actor=%q target=%q remote=%s", actor, targetUser.Username, remoteAddr(r))
	s.recordRuntimeLog("warning", "primary YPanel password reset", map[string]any{"remote": remoteAddr(r), "actor": actor, "targetUser": targetUser.Username})
	s.notifyCurrentServerUser(r, "Password akun utama diperbarui 🔐", message, "warning")
	s.writeJSON(w, http.StatusOK, resetPrimaryPanelPasswordResponse{OK: true, Message: message, Username: targetUser.Username})
}
