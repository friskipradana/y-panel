package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/projects"
	"github.com/friskipradana/panel-desktop-ui/internal/terminal"
	"github.com/gorilla/websocket"
)

const sessionCookieName = "ypanel_session"

type wsConn struct {
	conn      *websocket.Conn
	writeMu   *syncWriter
	closed    chan struct{}
	safeWrite func(payload any) error
}

type Server struct {
	cfgMu               sync.RWMutex
	cfg                 config.Config
	auth                *auth.Manager
	mux                 *http.ServeMux
	frontendFS          http.Handler
	authedFrontend      http.Handler
	terminalManager     *terminal.Manager
	terminalUpgrader    websocket.Upgrader
	database            *database.Manager
	projectManager      *projects.Manager
	cfDaemon            *cloudflareapi.Daemon
	notificationMu      sync.RWMutex
	notificationWSConns map[int64][]*wsConn
	capturedNotificationsMu      sync.RWMutex
	capturedNotificationsWSConns map[int64][]*wsConn
	rateLimitMu         sync.Mutex
	rateLimits          map[string]*rateLimitEntry
	reconcileStop       chan struct{}
	reconcileDone       chan struct{}
	fileRootAccessMu    sync.Mutex
	fileRootAccess      map[string]time.Time
}

// ReloadAccessConfig reloads AllowedOrigins and AllowedHosts in-memory from disk.
func (s *Server) ReloadAccessConfig(allowedHosts, allowedOrigins []string) {
	s.cfgMu.Lock()
	defer s.cfgMu.Unlock()
	s.cfg.AllowedHosts = allowedHosts
	s.cfg.AllowedOrigins = allowedOrigins
}

func (s *Server) notifyCurrentServerUser(r *http.Request, title, body, notifType string) {
	if user := s.currentUserRecord(r); user != nil {
		s.notifyUserAction(user.ID, title, body, notifType)
	}
}

type notificationSocketPayload struct {
	Type         string                 `json:"type"`
	UnreadCount  int                    `json:"unreadCount"`
	Notification *database.Notification `json:"notification,omitempty"`
}

func (s *Server) allowedOrigins() []string {
	s.cfgMu.RLock()
	defer s.cfgMu.RUnlock()
	return s.cfg.AllowedOrigins
}

func (s *Server) allowedHosts() []string {
	s.cfgMu.RLock()
	defer s.cfgMu.RUnlock()
	return s.cfg.AllowedHosts
}

type legacyLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func New(cfg config.Config) *Server {
	db := database.New(database.Config{
		Enabled: cfg.DatabaseEnable,
		DSN:     cfg.DatabaseDSN,
	})

	authMgr := auth.NewManager(db, cfg.SessionTTL)

	s := &Server{
		cfg:                 cfg,
		auth:                authMgr,
		mux:                 http.NewServeMux(),
		frontendFS:          newFrontendHandler(cfg.FrontendDir),
		terminalManager:     terminal.NewManager(),
		database:            db,
		projectManager:      projects.NewManager(cfg.StateDir),
		cfDaemon:            cloudflareapi.NewDaemon(cfg.StateDir),
		notificationWSConns: make(map[int64][]*wsConn),
		capturedNotificationsWSConns: make(map[int64][]*wsConn),
		rateLimits:          make(map[string]*rateLimitEntry),
		reconcileStop:       make(chan struct{}),
		reconcileDone:       make(chan struct{}),
		fileRootAccess:      make(map[string]time.Time),
	}
	s.terminalUpgrader = websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin:     s.isWebSocketOriginAllowed,
	}
	s.authedFrontend = s.requireHTMLAuthV2(s.frontendFS)

	s.routes()
	go s.runProjectReconcileLoop(25 * time.Second)
	return s
}

func (s *Server) RestoreTunnels() {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	tunnels, err := s.database.ListAllActiveTunnels()
	if err != nil {
		log.Printf("[tunnels] failed to list active tunnels: %v", err)
		return
	}

	started := make(map[string]bool)
	for _, t := range tunnels {
		if t.CFTunnelID == "" || started[t.CFTunnelID] {
			continue
		}
		credFile := s.cfDaemon.CredFilePathFor(t.UserID, t.CFTunnelID)
		configFile := filepath.Join(filepath.Dir(credFile), "config.yml")

		credJSON, err1 := os.ReadFile(credFile)
		configYAML, err2 := os.ReadFile(configFile)
		if err1 == nil && err2 == nil {
			_ = s.cfDaemon.StartTunnel(t.CFTunnelID, t.UserID, credJSON, configYAML)
			started[t.CFTunnelID] = true
			log.Printf("[tunnels] restored cloudflared for tunnel id=%s", t.CFTunnelID)
		} else {
			log.Printf("[tunnels] skip restore tunnel %s: missing creds or config", t.CFTunnelID)
		}
	}
}

func deriveReconciledProjectStatus(desiredStatus string, snapshot projects.RuntimeSnapshot) string {
	desired := strings.TrimSpace(strings.ToLower(desiredStatus))
	switch desired {
	case "active":
		if snapshot.Running {
			return "active"
		}
		return "degraded"
	case "stopped":
		if snapshot.Running {
			return "active"
		}
		return "stopped"
	case "error", "degraded":
		if snapshot.Running {
			return "active"
		}
		if desired == "degraded" {
			return "degraded"
		}
		return "error"
	default:
		if snapshot.Running {
			return "active"
		}
		if desired != "" {
			return desired
		}
		return snapshot.Status
	}
}

func (s *Server) reconcileProjectStatuses() {
	if s == nil || s.database == nil || s.projectManager == nil || !s.database.IsConnected() {
		return
	}
	projectList, _, err := s.database.ListAllProjects(200, 0)
	if err != nil {
		log.Printf("[reconcile] failed to list projects: %v", err)
		return
	}
	for _, project := range projectList {
		snapshot := s.projectManager.Snapshot(project.ID, project.Status)
		nextStatus := deriveReconciledProjectStatus(project.Status, snapshot)
		if nextStatus == strings.TrimSpace(project.Status) {
			continue
		}
		if err := s.database.UpdateProjectStatus(project.ID, nextStatus); err != nil {
			log.Printf("[reconcile] failed to update project=%d status=%q: %v", project.ID, nextStatus, err)
			continue
		}
		s.recordRuntimeLog("info", "project status reconciled", map[string]any{
			"projectId":      project.ID,
			"projectName":    project.Name,
			"previousStatus": project.Status,
			"nextStatus":     nextStatus,
			"runtimeKnown":   snapshot.Known,
			"runtimeRunning": snapshot.Running,
			"runtimeStatus":  snapshot.Status,
			"drift":          snapshot.Drift,
			"driftReason":    snapshot.DriftReason,
		})
	}
}

func (s *Server) runProjectReconcileLoop(interval time.Duration) {
	defer close(s.reconcileDone)
	if interval <= 0 {
		interval = 25 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-s.reconcileStop:
			return
		case <-ticker.C:
			s.reconcileProjectStatuses()
		}
	}
}

func (s *Server) Close() error {
	if s.reconcileStop != nil {
		close(s.reconcileStop)
		s.reconcileStop = nil
	}
	if s.reconcileDone != nil {
		<-s.reconcileDone
	}
	if s.database != nil {
		return s.database.Close()
	}
	return nil
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"status":  "ok",
		"service": "ypanel-agent",
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

	var req legacyLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[auth] login decode failed remote=%s err=%v", remoteAddr(r), err)
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	username := strings.TrimSpace(req.Username)
	token, user, err := s.auth.Login(username, req.Password, remoteAddr(r), r.UserAgent())
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
		"username": user.Username,
		"role":     user.Role,
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

// ─── Frontend Handler ─────────────────────────────────────────────────────────

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
		} else if err != nil && !errors.Is(err, os.ErrNotExist) {
			writeStatusPage(w, r, http.StatusInternalServerError, "Frontend asset error", "Asset frontend gagal dibaca dari runtime panel.", "Periksa hasil build frontend di server atau lakukan redeploy agar file statis dimuat ulang dengan benar.", true)
			return
		}

		http.ServeFile(w, r, indexPath)
	})
}

// ─── Notification WebSocket Helpers ──────────────────────────────────────────

func (s *Server) removeNotificationWSConn(userID int64, conn *websocket.Conn) {
	s.notificationMu.Lock()
	defer s.notificationMu.Unlock()
	conns := s.notificationWSConns[userID]
	for i, candidate := range conns {
		if candidate.conn == conn {
			s.notificationWSConns[userID] = append(conns[:i], conns[i+1:]...)
			break
		}
	}
	if len(s.notificationWSConns[userID]) == 0 {
		delete(s.notificationWSConns, userID)
	}
}

func (s *Server) notificationSnapshot(userID int64, eventType string, notif *database.Notification) notificationSocketPayload {
	unreadCount, err := s.database.CountUnreadNotifications(userID)
	if err != nil {
		unreadCount = 0
	}
	return notificationSocketPayload{
		Type:         eventType,
		UnreadCount:  unreadCount,
		Notification: notif,
	}
}

func (s *Server) pushNotificationSnapshot(userID int64, eventType string, notif *database.Notification) {
	payload := s.notificationSnapshot(userID, eventType, notif)

	s.notificationMu.RLock()
	targets := make([]*wsConn, len(s.notificationWSConns[userID]))
	copy(targets, s.notificationWSConns[userID])
	s.notificationMu.RUnlock()

	for _, ws := range targets {
		if err := ws.safeWrite(payload); err != nil {
			s.removeNotificationWSConn(userID, ws.conn)
			closeChannel(ws.closed)
			_ = ws.conn.Close()
		}
	}
}

// ─── Status Page ─────────────────────────────────────────────────────────────

func (s *Server) writeStatusPage(w http.ResponseWriter, r *http.Request, status int, title, description, hint string, showActions bool) {
	writeStatusPage(w, r, status, title, description, hint, showActions)
}

func writeStatusPage(w http.ResponseWriter, r *http.Request, status int, title, description, hint string, showActions bool) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)

	requestPath := "/"
	requestHost := "unknown"
	if r != nil {
		if strings.TrimSpace(r.URL.Path) != "" {
			requestPath = r.URL.Path
		}
		if strings.TrimSpace(r.Host) != "" {
			requestHost = r.Host
		}
	}

	actionsHTML := ""
	if showActions {
		actionsHTML = `<div class="status-actions">
          <a class="status-btn status-btn-primary" href="/">Kembali ke panel</a>
          <a class="status-btn status-btn-secondary" href="/healthz">Cek health runtime</a>
        </div>`
	}

	_, _ = fmt.Fprintf(w, `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>%d • %s</title>
  <meta name="description" content="Halaman status YPanel untuk %s" />
  <style>
    :root {
      color-scheme: dark;
      --bg0: #020617;
      --bg1: #0f172a;
      --bg2: rgba(15, 23, 42, 0.82);
      --line: rgba(255,255,255,0.10);
      --text: #e2e8f0;
      --muted: rgba(226,232,240,0.68);
      --accentA: #38bdf8;
      --accentB: #8b5cf6;
      --accentC: #f97316;
      --shadow: 0 30px 80px rgba(2,6,23,0.55);
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%%;
      min-height: 100vh;
      font-family: Outfit, Inter, system-ui, sans-serif;
      background:
        radial-gradient(circle at 18%% 16%%, rgba(56,189,248,0.22), transparent 24%%),
        radial-gradient(circle at 82%% 18%%, rgba(139,92,246,0.20), transparent 28%%),
        radial-gradient(circle at 50%% 100%%, rgba(249,115,22,0.18), transparent 32%%),
        linear-gradient(135deg, var(--bg0) 0%%, var(--bg1) 48%%, #111827 100%%);
      color: var(--text);
    }
    body {
      min-height: 100vh;
      display: grid;
      place-items: center;
      align-content: center;
      justify-items: center;
      padding: 28px;
      overflow: auto;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      opacity: 0.12;
      pointer-events: none;
      background-image: radial-gradient(rgba(255,255,255,0.8) 0.6px, transparent 0.6px);
      background-size: 18px 18px;
      mask-image: linear-gradient(180deg, rgba(0,0,0,0.55), transparent 85%%);
    }
    .status-shell {
      width: min(100%%, 1080px);
      border-radius: 34px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05));
      backdrop-filter: blur(28px);
      box-shadow: var(--shadow);
      overflow: hidden;
      position: relative;
    }
    .status-shell::after {
      content: "";
      position: absolute;
      inset: auto -100px -120px auto;
      width: 280px;
      height: 280px;
      border-radius: 999px;
      background: radial-gradient(circle, rgba(249,115,22,0.24), transparent 64%%);
      pointer-events: none;
    }
    .status-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(300px, 380px);
      gap: 0;
    }
    .status-hero {
      padding: 42px;
      position: relative;
    }
    .status-side {
      padding: 42px 34px;
      border-left: 1px solid var(--line);
      background: rgba(2, 6, 23, 0.18);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.06);
      padding: 8px 12px;
      font-size: 12px;
      color: rgba(255,255,255,0.78);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .brand-mark {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(135deg, var(--accentA), var(--accentB), var(--accentC));
      box-shadow: 0 0 20px rgba(56,189,248,0.42);
    }
    .code {
      margin-top: 26px;
      font-size: clamp(3.6rem, 10vw, 7rem);
      line-height: 0.95;
      letter-spacing: -0.08em;
      font-weight: 700;
      background: linear-gradient(135deg, #f8fafc 0%%, #7dd3fc 38%%, #c4b5fd 68%%, #fdba74 100%%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    h1 {
      margin: 14px 0 0;
      font-size: clamp(2rem, 4vw, 3.1rem);
      line-height: 1.02;
      letter-spacing: -0.05em;
    }
    .lead {
      margin-top: 18px;
      max-width: 720px;
      font-size: 15px;
      line-height: 1.85;
      color: var(--muted);
    }
    .meta-grid {
      margin-top: 28px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .meta-card, .tip-card {
      border-radius: 24px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.05);
      padding: 16px 18px;
    }
    .meta-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: rgba(255,255,255,0.42);
    }
    .meta-value {
      margin-top: 8px;
      font-size: 14px;
      line-height: 1.7;
      color: #f8fafc;
      word-break: break-word;
      font-family: "JetBrains Mono", ui-monospace, monospace;
    }
    .tip-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: rgba(125,211,252,0.88);
    }
    .tip-copy {
      margin-top: 10px;
      font-size: 14px;
      line-height: 1.8;
      color: var(--muted);
    }
    .status-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 22px;
    }
    .status-item {
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
      padding: 14px 15px;
    }
    .status-item strong {
      display: block;
      font-size: 13px;
      color: #f8fafc;
    }
    .status-item span {
      display: block;
      margin-top: 6px;
      font-size: 12px;
      line-height: 1.7;
      color: var(--muted);
    }
    .status-actions {
      margin-top: 24px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .status-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 18px;
      border-radius: 14px;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      transition: transform 160ms ease, filter 160ms ease, border-color 160ms ease;
    }
    .status-btn-primary {
      color: white;
      background: linear-gradient(135deg, var(--accentC), #ec4899, var(--accentB));
      box-shadow: 0 18px 36px rgba(249,115,22,0.24);
    }
    .status-btn-secondary {
      color: #dbeafe;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.05);
    }
    .status-btn:hover {
      transform: translateY(-1px);
      filter: brightness(1.05);
    }
    @media (max-width: 900px) {
      .status-grid { grid-template-columns: 1fr; }
      .status-side { border-left: none; border-top: 1px solid var(--line); }
      .status-hero, .status-side { padding: 28px; }
      .meta-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="status-shell">
    <section class="status-grid">
      <div class="status-hero">
        <div class="brand"><span class="brand-mark"></span> YPanel Runtime</div>
        <div class="code">%d</div>
        <h1>%s</h1>
        <p class="lead">%s</p>
        <div class="meta-grid">
          <div class="meta-card">
            <div class="meta-label">Host aktif</div>
            <div class="meta-value">%s</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Path request</div>
            <div class="meta-value">%s</div>
          </div>
        </div>
        %s
      </div>
      <aside class="status-side">
        <div class="tip-card">
          <div class="tip-title">Diagnostic hint</div>
          <div class="tip-copy">%s</div>
        </div>
        <div class="status-list">
          <div class="status-item">
            <strong>404 • Halaman tidak ditemukan</strong>
            <span>Dipakai untuk asset atau path frontend yang memang tidak tersedia di runtime aktif.</span>
          </div>
          <div class="status-item">
            <strong>403 • Host tidak diizinkan</strong>
            <span>Muncul saat host/IP yang dipakai belum masuk allowlist runtime panel.</span>
          </div>
          <div class="status-item">
            <strong>403 • Origin tidak diizinkan</strong>
            <span>Muncul saat browser mengirim origin yang belum cocok dengan konfigurasi allowed origins.</span>
          </div>
        </div>
      </aside>
    </section>
  </main>
</body>
</html>`, status, html.EscapeString(title), html.EscapeString(title), status, html.EscapeString(title), html.EscapeString(description), html.EscapeString(requestHost), html.EscapeString(requestPath), actionsHTML, html.EscapeString(hint))
}
