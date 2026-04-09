package httpserver

import (
	"bufio"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/docker"
	"github.com/friskipradana/panel-desktop-ui/internal/system"
	"github.com/friskipradana/panel-desktop-ui/internal/terminal"
	"github.com/gorilla/websocket"
)

const sessionCookieName = "ui_panel_session"

type Server struct {
	cfg             config.Config
	auth            *auth.Manager
	mux             *http.ServeMux
	frontendFS      http.Handler
	authedFrontend  http.Handler
	terminalManager *terminal.Manager
	terminalUpgrader websocket.Upgrader
	database        *database.Manager
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type jsonResponse map[string]any

type terminalSocketMessage struct {
	Type    string `json:"type"`
	Data    string `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
	Closed  bool   `json:"closed,omitempty"`
	Session string `json:"sessionId,omitempty"`
	Cols    int    `json:"cols,omitempty"`
	Rows    int    `json:"rows,omitempty"`
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
	Status        database.Status              `json:"status"`
	RuntimeLogs   []database.RuntimeLog        `json:"runtimeLogs"`
	SettingsAudit []database.SettingsAuditEntry `json:"settingsAudit"`
}

type updateSettingsRequest struct {
	Hostname    string   `json:"hostname"`
	Timezone    string   `json:"timezone"`
	Nameservers []string `json:"nameservers"`
}

type updatePanelPortRequest struct {
	Port int `json:"port"`
}

type updatePanelOriginsRequest struct {
	Origins []string `json:"origins"`
}

type resetDatabasePasswordResponse struct {
	OK       bool   `json:"ok"`
	Password string `json:"password"`
	Message  string `json:"message"`
}


func New(cfg config.Config) *Server {
	s := &Server{
		cfg:             cfg,
		auth:            auth.NewManager(cfg.AdminUsername, cfg.AdminPassword, cfg.SessionTTL),
		mux:             http.NewServeMux(),
		frontendFS:      newFrontendHandler(cfg.FrontendDir),
		terminalManager: terminal.NewManager(),
		database: database.New(database.Config{
			Enabled:  cfg.DatabaseEnable,
			Host:     cfg.DatabaseHost,
			Port:     cfg.DatabasePort,
			User:     cfg.DatabaseUser,
			Password: cfg.DatabasePass,
			Name:     cfg.DatabaseName,
		}),
	}
	s.terminalUpgrader = websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin:     s.isWebSocketOriginAllowed,
	}
	s.authedFrontend = s.requireHTMLAuth(s.frontendFS)

	s.routes()
	return s
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)
	s.mux.HandleFunc("POST /api/v1/auth/login", s.handleLogin)
	s.mux.Handle("POST /api/v1/auth/logout", s.requireAuth(http.HandlerFunc(s.handleLogout)))
	s.mux.Handle("GET /api/v1/me", s.requireAuth(http.HandlerFunc(s.handleMe)))
	s.mux.Handle("GET /api/v1/frontend/revision", s.requireAuth(http.HandlerFunc(s.handleFrontendRevision)))
	s.mux.Handle("GET /api/v1/system/summary", s.requireAuth(http.HandlerFunc(s.handleSystemSummary)))
	s.mux.Handle("GET /api/v1/system/logs", s.requireAuth(http.HandlerFunc(s.handleSystemLogs)))
	s.mux.Handle("GET /api/v1/system/changelog", s.requireAuth(http.HandlerFunc(s.handleSystemChangelog)))
	s.mux.Handle("GET /api/v1/database/status", s.requireAuth(http.HandlerFunc(s.handleDatabaseStatus)))
	s.mux.Handle("GET /api/v1/settings/system", s.requireAuth(http.HandlerFunc(s.handleGetSystemSettings)))
	s.mux.Handle("POST /api/v1/settings/system", s.requireAuth(http.HandlerFunc(s.handleUpdateSystemSettings)))
	s.mux.Handle("POST /api/v1/settings/panel-port", s.requireAuth(http.HandlerFunc(s.handleUpdatePanelPort)))
	s.mux.Handle("POST /api/v1/settings/panel-origins", s.requireAuth(http.HandlerFunc(s.handleUpdatePanelOrigins)))
	s.mux.Handle("POST /api/v1/settings/database/reset-password", s.requireAuth(http.HandlerFunc(s.handleResetDatabasePassword)))
	s.mux.Handle("GET /api/v1/containers", s.requireAuth(http.HandlerFunc(s.handleContainersList)))
	s.mux.Handle("POST /api/v1/containers/{id}/start", s.requireAuth(http.HandlerFunc(s.handleContainerStart)))
	s.mux.Handle("POST /api/v1/containers/{id}/stop", s.requireAuth(http.HandlerFunc(s.handleContainerStop)))
	s.mux.Handle("POST /api/v1/terminal/sessions", s.requireAuth(http.HandlerFunc(s.handleTerminalSessionStart)))
	s.mux.Handle("GET /api/v1/terminal/sessions/{id}/ws", s.requireAuth(http.HandlerFunc(s.handleTerminalSessionWebSocket)))
	s.mux.Handle("DELETE /api/v1/terminal/sessions/{id}", s.requireAuth(http.HandlerFunc(s.handleTerminalSessionClose)))
	s.mux.Handle("/", s.authedFrontend)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.withAccessLog(s.withHostGuard(s.withCORS(s.mux))).ServeHTTP(w, r)
}

func (s *Server) Close() error {
	if s.database != nil {
		return s.database.Close()
	}
	return nil
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"status":  "ok",
		"service": "ui-panel-agent",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleFrontendRevision(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"revision": s.frontendRevision(),
	})
}

func (s *Server) frontendRevision() string {
	indexPath := filepath.Join(s.cfg.FrontendDir, "index.html")
	info, err := os.Stat(indexPath)
	if err != nil {
		return "unknown"
	}

	return fmt.Sprintf("%d-%d", info.ModTime().UTC().Unix(), info.Size())
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[auth] login decode failed remote=%s err=%v", remoteAddr(r), err)
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	username := strings.TrimSpace(req.Username)
	token, err := s.auth.Login(username, req.Password)
	if err != nil {
		log.Printf("[auth] login failed user=%q remote=%s", username, remoteAddr(r))
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "invalid credentials"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
		MaxAge:   int(s.cfg.SessionTTL.Seconds()),
	})

	log.Printf("[auth] login success user=%q remote=%s", username, remoteAddr(r))
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":       true,
		"username": s.cfg.AdminUsername,
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	username, _ := s.currentUser(r)
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"username": username,
		"role":     "admin",
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err == nil {
		s.auth.Logout(cookie.Value)
	}

	username, _ := s.currentUser(r)
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
		MaxAge:   -1,
	})

	log.Printf("[auth] logout user=%q remote=%s", username, remoteAddr(r))
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleSystemSummary(w http.ResponseWriter, _ *http.Request) {
	summary := system.Inspect(s.cfg.PortainerURL, s.cfg.StateDir)
	dbStatus := s.database.Status()
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"hostname":           summary.Hostname,
		"osName":             summary.OSName,
		"kernel":             summary.Kernel,
		"uptimeSeconds":      summary.UptimeSeconds,
		"cpuUsagePercent":    summary.CPUUsagePercent,
		"memory":             summary.Memory,
		"storage":            summary.Storage,
		"dockerInstalled":    summary.DockerInstalled,
		"dockerReachable":    summary.DockerReachable,
		"dockerStatus":       summary.DockerStatus,
		"portainerReachable": summary.PortainerReachable,
		"portainerUrl":       s.cfg.PortainerURL,
		"stateDir":           s.cfg.StateDir,
		"database":           dbStatus,
	})
}

func (s *Server) handleSystemLogs(w http.ResponseWriter, r *http.Request) {
	service := strings.TrimSpace(r.URL.Query().Get("service"))
	if service == "" {
		service = "ui-panel"
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
	s.database.RecordSettingsAudit(username, snapshot.Hostname, snapshot.Timezone, snapshot.Nameservers)
	log.Printf("[settings] update applied hostname=%q timezone=%q dns=%q remote=%s", snapshot.Hostname, snapshot.Timezone, strings.Join(snapshot.Nameservers, ","), remoteAddr(r))
	s.recordRuntimeLog("info", "settings update applied", map[string]any{"hostname": snapshot.Hostname, "timezone": snapshot.Timezone, "nameservers": snapshot.Nameservers, "remote": remoteAddr(r), "user": username})
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

	username, _ := s.currentUser(r)
	log.Printf("[settings] panel port updated bind=%q remote=%s", snapshot.BindAddr, remoteAddr(r))
	s.recordRuntimeLog("info", "panel port updated", map[string]any{"bindAddr": snapshot.BindAddr, "allowedOrigins": snapshot.AllowedOrigins, "remote": remoteAddr(r), "user": username})
	s.writeJSON(w, http.StatusOK, snapshot)
}

func (s *Server) handleUpdatePanelOrigins(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req updatePanelOriginsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	snapshot, err := system.UpdatePanelOrigins(req.Origins)
	if err != nil {
		log.Printf("[settings] panel origins update failed remote=%s err=%v", remoteAddr(r), err)
		s.recordRuntimeLog("error", "panel origins update failed", map[string]any{"origins": req.Origins, "remote": remoteAddr(r), "error": err.Error()})
		s.writeError(w, http.StatusBadGateway, err)
		return
	}

	username, _ := s.currentUser(r)
	log.Printf("[settings] panel origins updated count=%d remote=%s", len(snapshot.AllowedOrigins), remoteAddr(r))
	s.recordRuntimeLog("info", "panel origins updated", map[string]any{"allowedOrigins": snapshot.AllowedOrigins, "remote": remoteAddr(r), "user": username})
	s.writeJSON(w, http.StatusOK, snapshot)
}

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
	log.Printf("[database] password rotated user=%q remote=%s host=%s db=%s", username, remoteAddr(r), s.cfg.DatabaseHost, s.cfg.DatabaseName)
	s.recordRuntimeLog("info", "database password rotated", map[string]any{"remote": remoteAddr(r), "user": username, "host": s.cfg.DatabaseHost, "database": s.cfg.DatabaseName})
	s.writeJSON(w, http.StatusOK, resetDatabasePasswordResponse{OK: true, Password: password, Message: message})
}


func (s *Server) handleContainersList(w http.ResponseWriter, _ *http.Request) {
	containers, err := docker.ListContainers()
	if err != nil {
		s.writeJSON(w, http.StatusOK, []docker.Container{})
		return
	}
	if containers == nil {
		containers = []docker.Container{}
	}
	s.writeJSON(w, http.StatusOK, containers)
}

func (s *Server) handleContainerStart(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing container id"})
		return
	}
	if err := docker.StartContainer(id); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleContainerStop(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing container id"})
		return
	}
	if err := docker.StopContainer(id); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleTerminalSessionStart(w http.ResponseWriter, r *http.Request) {
	id, err := s.terminalManager.Start()
	if err != nil {
		log.Printf("[terminal] start failed remote=%s err=%v", remoteAddr(r), err)
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	username, _ := s.currentUser(r)
	log.Printf("[terminal] session started id=%s user=%q remote=%s", id, username, remoteAddr(r))
	s.writeJSON(w, http.StatusOK, jsonResponse{"sessionId": id})
}

func (s *Server) handleTerminalSessionWebSocket(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing session id"})
		return
	}

	username, _ := s.currentUser(r)
	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[terminal] ws upgrade failed id=%s user=%q remote=%s err=%v", id, username, remoteAddr(r), err)
		return
	}

	log.Printf("[terminal] ws attached id=%s user=%q remote=%s", id, username, remoteAddr(r))
	writeMu := syncWriter{}
	closed := make(chan struct{})

	safeWrite := func(payload terminalSocketMessage) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteJSON(payload)
	}

	if err := s.terminalManager.Attach(
		id,
		func(chunk string) {
			_ = safeWrite(terminalSocketMessage{Type: "output", Data: chunk, Session: id})
		},
		func() {
			log.Printf("[terminal] session closed id=%s user=%q", id, username)
			_ = safeWrite(terminalSocketMessage{Type: "closed", Closed: true, Session: id})
			closeChannel(closed)
		},
	); err != nil {
		log.Printf("[terminal] attach failed id=%s user=%q remote=%s err=%v", id, username, remoteAddr(r), err)
		_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
		_ = conn.Close()
		return
	}
	defer func() {
		log.Printf("[terminal] ws detached id=%s user=%q remote=%s", id, username, remoteAddr(r))
		_ = s.terminalManager.Detach(id)
		_ = conn.Close()
	}()

	_ = safeWrite(terminalSocketMessage{Type: "ready", Session: id})

	for {
		select {
		case <-closed:
			return
		default:
		}

		var msg terminalSocketMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return
		}

		switch msg.Type {
		case "input":
			if err := s.terminalManager.Write(id, msg.Data); err != nil {
				log.Printf("[terminal] input failed id=%s user=%q err=%v", id, username, err)
				_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
				return
			}
		case "resize":
			if err := s.terminalManager.Resize(id, msg.Cols, msg.Rows); err != nil {
				log.Printf("[terminal] resize failed id=%s user=%q cols=%d rows=%d err=%v", id, username, msg.Cols, msg.Rows, err)
				_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
				return
			}
		case "close":
			log.Printf("[terminal] close requested id=%s user=%q", id, username)
			_ = s.terminalManager.Close(id)
			return
		default:
			_ = safeWrite(terminalSocketMessage{Type: "error", Error: "unknown websocket message type", Session: id})
		}
	}
}

func (s *Server) handleTerminalSessionClose(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing session id"})
		return
	}

	if err := s.terminalManager.Close(id); err != nil {
		s.writeError(w, http.StatusNotFound, err)
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := s.currentUser(r); !ok {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) currentUser(r *http.Request) (string, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return "", false
	}
	return s.auth.Validate(cookie.Value)
}

func (s *Server) requireHTMLAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasPrefix(path, "/api/") || path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}

		if strings.HasPrefix(path, "/assets/") || path == "/favicon.ico" {
			next.ServeHTTP(w, r)
			return
		}

		_, authed := s.currentUser(r)
		if !authed && path != "/login" {
			if acceptsHTML(r) {
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if authed && path == "/login" {
			http.Redirect(w, r, "/", http.StatusFound)
			return
		}

		next.ServeHTTP(w, r)
	})
}

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

func (s *Server) writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" {
			origin := strings.TrimSpace(r.Header.Get("Origin"))
			if origin != "" {
				if !s.isOriginAllowed(origin) {
					http.Error(w, "origin not allowed", http.StatusForbidden)
					return
				}
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) withHostGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.isHostAllowed(r.Host) {
			http.Error(w, "host not allowed", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func acceptsHTML(r *http.Request) bool {
	accept := r.Header.Get("Accept")
	return accept == "" || strings.Contains(accept, "text/html") || strings.Contains(accept, "*/*")
}

func (s *Server) isHostAllowed(hostport string) bool {
	host := normalizeHost(hostport)
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}
	if host == "" {
		return false
	}
	if len(s.cfg.AllowedHosts) == 0 && len(s.cfg.AllowedOrigins) == 0 {
		return true
	}

	for _, candidate := range s.cfg.AllowedHosts {
		if strings.EqualFold(host, normalizeHost(candidate)) {
			return true
		}
	}
	for _, candidate := range s.cfg.AllowedOrigins {
		normalizedOrigin, ok := normalizeOrigin(candidate)
		if !ok {
			continue
		}
		parsed, err := url.Parse(normalizedOrigin)
		if err != nil {
			continue
		}
		if strings.EqualFold(host, normalizeHost(parsed.Host)) {
			return true
		}
	}
	return false
}

func (s *Server) isOriginAllowed(origin string) bool {
	if origin == "" {
		return true
	}
	if len(s.cfg.AllowedOrigins) == 0 {
		return true
	}

	normalizedOrigin, ok := normalizeOrigin(origin)
	if !ok {
		return false
	}
	for _, candidate := range s.cfg.AllowedOrigins {
		normalizedCandidate, candidateOK := normalizeOrigin(candidate)
		if !candidateOK {
			continue
		}
		if normalizedOrigin == normalizedCandidate {
			return true
		}
	}
	return false
}

func normalizeOrigin(origin string) (string, bool) {
	trimmed := strings.TrimSpace(strings.TrimRight(origin, "/"))
	if trimmed == "" {
		return "", false
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", false
	}

	scheme := strings.ToLower(parsed.Scheme)
	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return "", false
	}

	port := parsed.Port()
	switch {
	case port != "":
		return scheme + "://" + net.JoinHostPort(host, port), true
	case scheme == "http":
		return scheme + "://" + host + ":80", true
	case scheme == "https":
		return scheme + "://" + host + ":443", true
	default:
		return scheme + "://" + host, true
	}
}

func (s *Server) isWebSocketOriginAllowed(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if !s.isOriginAllowed(origin) {
		return false
	}
	if origin == "" {
		return s.isHostAllowed(r.Host)
	}
	parsed, err := url.Parse(strings.TrimSpace(origin))
	if err != nil {
		return false
	}
	return s.isHostAllowed(parsed.Host) && s.isHostAllowed(r.Host)
}

func normalizeHost(hostport string) string {
	host := strings.TrimSpace(hostport)
	if host == "" {
		return ""
	}
	if strings.Contains(host, ":") {
		if parsedHost, _, err := net.SplitHostPort(host); err == nil {
			host = parsedHost
		}
	}
	return strings.Trim(strings.ToLower(host), "[]")
}

func newFrontendHandler(frontendDir string) http.Handler {
	indexPath := filepath.Join(frontendDir, "index.html")
	fileServer := http.FileServer(http.Dir(frontendDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" {
			http.NotFound(w, r)
			return
		}

		cleanPath := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
		if cleanPath == "." || cleanPath == "" {
			http.ServeFile(w, r, indexPath)
			return
		}

		target := filepath.Join(frontendDir, cleanPath)
		if info, err := os.Stat(target); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		} else if err != nil && !errors.Is(err, fs.ErrNotExist) {
			http.Error(w, "frontend asset error", http.StatusInternalServerError)
			return
		}

		http.ServeFile(w, r, indexPath)
	})
}

func (s *Server) withAccessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		duration := time.Since(started).Round(time.Millisecond)
		log.Printf("[http] type=%s method=%s path=%s status=%d duration=%s remote=%s", requestKind(r), r.Method, r.URL.Path, recorder.status, duration, remoteAddr(r))
		s.recordRuntimeLog("info", "http request served", map[string]any{"type": requestKind(r), "method": r.Method, "path": r.URL.Path, "status": recorder.status, "duration": duration.String(), "remote": remoteAddr(r)})
	})
}

func (s *Server) recordRuntimeLog(level, message string, metadata map[string]any) {
	if s.database == nil {
		return
	}
	s.database.RecordRuntimeLog("ui-panel", level, message, metadata)
}

func requestKind(r *http.Request) string {
	if websocket.IsWebSocketUpgrade(r) {
		return "ws"
	}
	if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" {
		return "api"
	}
	if strings.HasPrefix(r.URL.Path, "/assets/") || r.URL.Path == "/favicon.ico" {
		return "asset"
	}
	return "page"
}

func generateSecretToken(byteLength int) (string, error) {
	if byteLength <= 0 {
		byteLength = 24
	}
	buffer := make([]byte, byteLength)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("failed to generate secure token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func rotateDatabasePassword(cfg config.Config, password string) error {
	password = strings.TrimSpace(password)
	if password == "" {
		return fmt.Errorf("database password tidak boleh kosong")
	}

	statement := fmt.Sprintf(
		"ALTER USER '%s'@'%s' IDENTIFIED BY '%s'; GRANT ALL PRIVILEGES ON `%s`.* TO '%s'@'%s'; FLUSH PRIVILEGES;",
		escapeSQLString(cfg.DatabaseUser),
		escapeSQLString(cfg.DatabaseHost),
		escapeSQLString(password),
		strings.ReplaceAll(cfg.DatabaseName, "`", "``"),
		escapeSQLString(cfg.DatabaseUser),
		escapeSQLString(cfg.DatabaseHost),
	)

	if err := runDatabaseSQL(statement); err != nil {
		return err
	}

	envPath := firstNonEmpty(os.Getenv("PANEL_ENV_FILE"), filepath.Join("/etc", "ui-panel", "agent.env"))
	if err := rewriteEnvValue(envPath, "PANEL_DB_PASSWORD", password); err != nil {
		return err
	}

	return nil
}

func runDatabaseSQL(statement string) error {
	clients := []string{"mariadb", "mysql"}
	var lastErr error
	for _, client := range clients {
		path, err := exec.LookPath(client)
		if err != nil {
			lastErr = err
			continue
		}
		cmd := exec.Command(path, "-u", "root", "-e", statement)
		output, err := cmd.CombinedOutput()
		if err == nil {
			return nil
		}
		lastErr = fmt.Errorf("%s failed: %s", client, strings.TrimSpace(string(output)))
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("MariaDB/MySQL client tidak tersedia")
	}
	return lastErr
}

func rewriteEnvValue(path, key, value string) error {
	contents, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("gagal membaca env runtime: %w", err)
	}

	lines := strings.Split(string(contents), "\n")
	prefix := key + "="
	replaced := false
	for index, line := range lines {
		if strings.HasPrefix(line, prefix) {
			lines[index] = prefix + value
			replaced = true
			break
		}
	}
	if !replaced {
		lines = append(lines, prefix+value)
	}

	payload := strings.Join(lines, "\n")
	if !strings.HasSuffix(payload, "\n") {
		payload += "\n"
	}
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		return fmt.Errorf("gagal memperbarui env runtime: %w", err)
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func escapeSQLString(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func remoteAddr(r *http.Request) string {
	forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if forwarded != "" {
		parts := strings.Split(forwarded, ",")
		return strings.TrimSpace(parts[0])
	}
	return r.RemoteAddr
}

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

type syncWriter struct {
	mu sync.Mutex
}

func (s *syncWriter) Lock() {
	s.mu.Lock()
}

func (s *syncWriter) Unlock() {
	s.mu.Unlock()
}

func closeChannel(ch chan struct{}) {
	select {
	case <-ch:
		return
	default:
		close(ch)
	}
}
