package httpserver

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/config"
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

func New(cfg config.Config) http.Handler {
	s := &Server{
		cfg:             cfg,
		auth:            auth.NewManager(cfg.AdminUsername, cfg.AdminPassword, cfg.SessionTTL),
		mux:             http.NewServeMux(),
		frontendFS:      newFrontendHandler(cfg.FrontendDir),
		terminalManager: terminal.NewManager(),
		terminalUpgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin:     func(_ *http.Request) bool { return true },
		},
	}
	s.authedFrontend = s.requireHTMLAuth(s.frontendFS)

	s.routes()
	return s.withCORS(s.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)
	s.mux.HandleFunc("GET /api/v1/bootstrap/status", s.handleBootstrapStatus)
	s.mux.HandleFunc("POST /api/v1/auth/login", s.handleLogin)
	s.mux.Handle("POST /api/v1/auth/logout", s.requireAuth(http.HandlerFunc(s.handleLogout)))
	s.mux.Handle("GET /api/v1/me", s.requireAuth(http.HandlerFunc(s.handleMe)))
	s.mux.Handle("GET /api/v1/system/summary", s.requireAuth(http.HandlerFunc(s.handleSystemSummary)))
	s.mux.Handle("GET /api/v1/containers", s.requireAuth(http.HandlerFunc(s.handleContainersList)))
	s.mux.Handle("POST /api/v1/containers/{id}/start", s.requireAuth(http.HandlerFunc(s.handleContainerStart)))
	s.mux.Handle("POST /api/v1/containers/{id}/stop", s.requireAuth(http.HandlerFunc(s.handleContainerStop)))
	s.mux.Handle("POST /api/v1/terminal/sessions", s.requireAuth(http.HandlerFunc(s.handleTerminalSessionStart)))
	s.mux.Handle("GET /api/v1/terminal/sessions/{id}/ws", s.requireAuth(http.HandlerFunc(s.handleTerminalSessionWebSocket)))
	s.mux.Handle("DELETE /api/v1/terminal/sessions/{id}", s.requireAuth(http.HandlerFunc(s.handleTerminalSessionClose)))
	s.mux.Handle("/", s.authedFrontend)
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"status":  "ok",
		"service": "ui-panel-agent",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleBootstrapStatus(w http.ResponseWriter, _ *http.Request) {
	hostname, _ := os.Hostname()
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"installed":    true,
		"channel":      s.cfg.InstallChannel,
		"bindAddr":     s.cfg.BindAddr,
		"portainerUrl": s.cfg.PortainerURL,
		"hostname":     hostname,
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	token, err := s.auth.Login(strings.TrimSpace(req.Username), req.Password)
	if err != nil {
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

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
		MaxAge:   -1,
	})

	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleSystemSummary(w http.ResponseWriter, _ *http.Request) {
	summary := system.Inspect(s.cfg.PortainerURL, s.cfg.StateDir)
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
	})
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

func (s *Server) handleTerminalSessionStart(w http.ResponseWriter, _ *http.Request) {
	id, err := s.terminalManager.Start()
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"sessionId": id})
}

func (s *Server) handleTerminalSessionWebSocket(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing session id"})
		return
	}

	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

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
			_ = safeWrite(terminalSocketMessage{Type: "closed", Closed: true, Session: id})
			closeChannel(closed)
		},
	); err != nil {
		_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
		_ = conn.Close()
		return
	}
	defer func() {
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
				_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
				return
			}
		case "resize":
			if err := s.terminalManager.Resize(id, msg.Cols, msg.Rows); err != nil {
				_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
				return
			}
		case "close":
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
			w.Header().Set("Access-Control-Allow-Origin", "*")
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

func acceptsHTML(r *http.Request) bool {
	accept := r.Header.Get("Accept")
	return accept == "" || strings.Contains(accept, "text/html") || strings.Contains(accept, "*/*")
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
