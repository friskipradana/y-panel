package httpserver

import (
	"github.com/friskipradana/panel-desktop-ui/internal/runtimepath"
	"context"
	"errors"
	"fmt"
	"html"
	"log"
	"net"
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
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
	"github.com/friskipradana/panel-desktop-ui/internal/docsync"
	"github.com/friskipradana/panel-desktop-ui/internal/metrics"
	"github.com/friskipradana/panel-desktop-ui/internal/projects"
	"github.com/friskipradana/panel-desktop-ui/internal/system"
	"github.com/friskipradana/panel-desktop-ui/internal/updater"
	"github.com/friskipradana/panel-desktop-ui/internal/webserver"
	"github.com/friskipradana/panel-desktop-ui/internal/terminal"
	"github.com/gorilla/websocket"
)

const (
	sessionCookieName       = "reneo_session"
	legacySessionCookieName = "ypanel_session"
)

// requestSessionCookie reads the session cookie, falling back to the name used before the rename
// so people stay signed in across the update.
func requestSessionCookie(r *http.Request) (*http.Cookie, error) {
	if c, err := r.Cookie(sessionCookieName); err == nil && c.Value != "" {
		return c, nil
	}
	return r.Cookie(legacySessionCookieName)
}

type wsConn struct {
	conn      *websocket.Conn
	writeMu   *syncWriter
	closed    chan struct{}
	safeWrite func(payload any) error
}

type Server struct {
	cfgMu                        sync.RWMutex
	cfg                          config.Config
	auth                         *auth.Manager
	mux                          *http.ServeMux
	frontendFS                   http.Handler
	authedFrontend               http.Handler
	docsSync                     *docsync.Client
	terminalManager              *terminal.Manager
	terminalUpgrader             websocket.Upgrader
	database                     *database.Manager
	notify                       *notify.Service
	projectManager               *projects.Manager
	metrics                      *metrics.Recorder
	updates                      *updater.Checker
	cfDaemon                     *cloudflareapi.Daemon
	notificationMu               sync.RWMutex
	notificationWSConns          map[int64][]*wsConn
	capturedNotificationsMu      sync.RWMutex
	capturedNotificationsWSConns map[int64][]*wsConn
	rateLimitMu                  sync.Mutex
	rateLimits                   map[string]*rateLimitEntry
	reconcileStop                chan struct{}
	reconcileDone                chan struct{}
	databaseCreateMu             sync.Mutex
	fileRootAccessMu             sync.Mutex
	fileRootAccess               map[string]time.Time
	// the public proxy of an install that has a public address, and the routes it answers for
	publicProxy  publicProxyRuntime
	publicRoutes publicRouteCache
	// testIssuer stands in for the public proxy when a test asks for certificates, and testWebRunner for the commands of nginx and Apache
	testIssuer    certIssuer
	testWebRunner webserver.Runner
	// testCloudflare stands in for the Cloudflare account of the superadmin
	testCloudflare *cloudflareapi.Client
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

func New(cfg config.Config) *Server {
	db := database.New(database.Config{
		Enabled: cfg.DatabaseEnable,
		DSN:     cfg.DatabaseDSN,
	})

	authMgr := auth.NewManager(db, cfg.SessionTTL)

	s := &Server{
		cfg:                          cfg,
		auth:                         authMgr,
		mux:                          http.NewServeMux(),
		frontendFS:                   newFrontendHandler(cfg.FrontendDir),
		terminalManager:              terminal.NewManager(),
		database:                     db,
		projectManager:               projects.NewManager(cfg.StateDir),
		cfDaemon:                     cloudflareapi.NewDaemon(cfg.StateDir),
		notificationWSConns:          make(map[int64][]*wsConn),
		capturedNotificationsWSConns: make(map[int64][]*wsConn),
		rateLimits:                   make(map[string]*rateLimitEntry),
		reconcileStop:                make(chan struct{}),
		reconcileDone:                make(chan struct{}),
		fileRootAccess:               make(map[string]time.Time),
	}
	s.terminalUpgrader = websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin:     s.isWebSocketOriginAllowed,
	}
	s.authedFrontend = s.requireHTMLAuthV2(s.seoFrontend(s.frontendFS, cfg.FrontendDir))

	s.metrics = metrics.New(cfg.StateDir, func() (map[string]float64, map[string]uint64) {
		sm := system.TakeSample(cfg.StateDir)
		values := map[string]float64{"cpu": sm.CPUPercent, "ram": sm.RAMPercent, "disk": sm.DiskPercent}
		if sm.CPUTemp > 0 {
			values["temp"] = sm.CPUTemp
		}
		return values, map[string]uint64{"net-rx": sm.BytesRecv, "net-tx": sm.BytesSent}
	})
	go s.metrics.Run()
	s.updates = updater.New()
	if docsync.Enabled() {
		s.docsSync = docsync.New()
		// the first list is fetched now, not by the first visitor of llms.txt or the articles page
		go func() { _, _ = s.docsSync.Articles(context.Background(), false) }()
	}

	// notices outside the panel: the queue, its workers, and the detectors of attacks
	s.notify = notify.New(db, cfg.EncryptionKey)
	if db.IsConnected() {
		s.notify.Start(4)
		if port := listenPort(cfg.BindAddr); port != "" {
			// the WAHA container reaches the panel through the host, to tell it what people answer
			s.notify.SetInboundBase("http://host.docker.internal:" + port)
		}
	}

	s.routes()
	go s.runProjectReconcileLoop(25 * time.Second)
	go s.runPlanExpiryLoop(15 * time.Minute)
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

func (s *Server) RestoreProjects() {
	if s.database == nil || s.projectManager == nil || !s.database.IsConnected() {
		return
	}
	projectList, _, err := s.database.ListAllProjects(1000, 0)
	if err != nil {
		log.Printf("[projects] failed to list projects for restore: %v", err)
		return
	}
	for _, project := range projectList {
		status := strings.TrimSpace(strings.ToLower(project.Status))
		switch status {
		case "active":
			user, err := s.database.GetUserByID(project.UserID)
			if err != nil || user == nil {
				log.Printf("[projects] skip restore project=%d: user lookup failed: %v", project.ID, err)
				_ = s.database.UpdateProjectStatus(project.ID, "degraded")
				continue
			}
			if err := s.projectManager.Start(user, &project); err != nil {
				log.Printf("[projects] failed to restore active project=%d: %v", project.ID, err)
				_ = s.database.UpdateProjectStatus(project.ID, "degraded")
				continue
			}
			log.Printf("[projects] restored active project id=%d name=%q port=%d", project.ID, project.Name, project.AssignedPort)
		case "stopped":
			if s.projectManager.SnapshotProject(project).Running {
				if err := s.projectManager.StopProject(project); err != nil {
					log.Printf("[projects] failed to stop inactive project=%d during restore: %v", project.ID, err)
				}
			}
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
		return "stopped"
	case "building":
		// still installing or starting stays so; once it listens it is active, and a process that ended is an error
		if snapshot.Listening {
			return "active"
		}
		if snapshot.Running {
			return "building"
		}
		return "error"
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
		snapshot := s.projectManager.SnapshotProject(project)
		if strings.EqualFold(strings.TrimSpace(project.Status), "stopped") && snapshot.Running {
			if err := s.projectManager.StopProject(project); err != nil {
				log.Printf("[reconcile] failed to stop drifted project=%d: %v", project.ID, err)
			} else {
				snapshot = s.projectManager.SnapshotProject(project)
			}
		}
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
	round := 0
	for {
		select {
		case <-s.reconcileStop:
			return
		case <-ticker.C:
			s.reconcileProjectStatuses()
			if round%policySweepEvery == 0 {
				s.enforceContainerPolicy()
			}
			round++
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
	s.stopPublicProxy()
	s.notify.Stop()
	if s.database != nil {
		return s.database.Close()
	}
	return nil
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"status":  "ok",
		"service": "reneo-agent",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleFrontendRevision(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"revision": s.frontendRevision(),
		"version":  s.appVersion(),
	})
}

// appVersion is the installed panel version written by the installer ("" when unknown).
func (s *Server) appVersion() string {
	if v := strings.TrimSpace(os.Getenv("PANEL_VERSION")); v != "" {
		return v
	}
	candidates := []string{runtimepath.VersionFile()}
	if s.cfg.FrontendDir != "" {
		candidates = append([]string{filepath.Join(filepath.Dir(s.cfg.FrontendDir), "VERSION")}, candidates...)
	}
	for _, path := range candidates {
		if b, err := os.ReadFile(path); err == nil {
			if v := strings.TrimSpace(string(b)); v != "" {
				return v
			}
		}
	}
	return ""
}

func (s *Server) frontendRevision() string {
	indexPath := filepath.Join(s.cfg.FrontendDir, "index.html")
	info, err := os.Stat(indexPath)
	if err != nil {
		return "unknown"
	}

	return fmt.Sprintf("%d-%d", info.ModTime().UTC().Unix(), info.Size())
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := requestSessionCookie(r)
	if err == nil && cookie.Value != "" {
		s.auth.Logout(cookie.Value)
	}

	username, _ := s.currentUser(r)
	for _, name := range []string{sessionCookieName, legacySessionCookieName} {
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			Secure:   requestIsHTTPS(r),
			MaxAge:   -1,
			Expires:  time.Unix(0, 0),
		})
	}

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
			// files in /assets/ carry a hash of their content in the name, so a browser can keep them for good
			if strings.HasPrefix(r.URL.Path, "/assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else if isStaticPicture(r.URL.Path) {
				// pictures without a hash in the name are kept for a day; the page, the service worker and the manifest are not
				w.Header().Set("Cache-Control", "public, max-age=86400")
			}
			if serveGzipped(w, r, target, info) {
				return
			}
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
	w.Header().Set("Cache-Control", "no-store")
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

	actions := `<a class="btn btn-primary" href="/">Kembali ke panel</a>`
	if showActions {
		actions += `<a class="btn" href="/healthz">Cek health runtime</a>`
	}

	_, _ = fmt.Fprintf(w, `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>%d %s | Reneo</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f6f8fb;
      --card: #ffffff;
      --line: #dbe2ec;
      --text: #0f172a;
      --muted: #52607a;
      --primary: #1d4ed8;
      --primary-text: #ffffff;
      --mono-bg: #eef2f8;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b0f19;
        --card: #121826;
        --line: #26304a;
        --text: #e6ebf5;
        --muted: #9aa7bf;
        --primary: #3b82f6;
        --primary-text: #07101f;
        --mono-bg: #0b1220;
      }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%%; }
    body {
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 20px;
      background: var(--bg);
      color: var(--text);
      font-family: Outfit, Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
      overflow-y: auto;
    }
    main {
      width: min(100%%, 520px);
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--card);
      padding: 28px;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: -0.01em; }
    .mark {
      width: 28px; height: 28px; border-radius: 8px;
      background: #0b2a57; color: #fff; display: grid; place-items: center;
      font-size: 15px; font-weight: 800;
    }
    .code { margin: 22px 0 0; font-size: 13px; font-weight: 600; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    h1 { margin: 4px 0 0; font-size: 1.5rem; line-height: 1.25; letter-spacing: -0.02em; }
    p { margin: 10px 0 0; font-size: 14px; line-height: 1.65; color: var(--muted); }
    dl {
      margin: 20px 0 0; padding: 12px 14px; border-radius: 12px;
      background: var(--mono-bg); border: 1px solid var(--line);
      display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 13px;
    }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .hint { color: var(--text); }
    .actions { margin-top: 22px; display: flex; flex-wrap: wrap; gap: 10px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 40px; padding: 0 16px; border-radius: 10px;
      border: 1px solid var(--line); color: var(--text); text-decoration: none; font-size: 14px; font-weight: 600;
    }
    .btn:hover { border-color: var(--primary); }
    .btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .btn-primary { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
  </style>
</head>
<body>
  <main>
    <div class="brand"><span class="mark" aria-hidden="true">R</span><span>Reneo</span></div>
    <div class="code">HTTP %d</div>
    <h1>%s</h1>
    <p>%s</p>
    <dl>
      <dt>Host</dt><dd>%s</dd>
      <dt>Path</dt><dd>%s</dd>
    </dl>
    <p class="hint">%s</p>
    <div class="actions">%s</div>
  </main>
</body>
</html>`, status, html.EscapeString(title), status, html.EscapeString(title), html.EscapeString(description), html.EscapeString(requestHost), html.EscapeString(requestPath), html.EscapeString(hint), actions)
}

// listenPort is the port of a bind address such as 0.0.0.0:8787; "" when the panel listens on the loopback address
// only, which the WAHA container cannot reach
func listenPort(bind string) string {
	host, port, err := net.SplitHostPort(bind)
	if err != nil {
		return ""
	}
	if ip := net.ParseIP(host); host == "localhost" || (ip != nil && ip.IsLoopback()) {
		return ""
	}
	return port
}

func isStaticPicture(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png", ".svg", ".ico", ".jpg", ".jpeg", ".webp", ".avif", ".woff2":
		return true
	}
	return false
}
