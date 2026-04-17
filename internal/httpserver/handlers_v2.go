package httpserver

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/users"
)

// ─── Context key ─────────────────────────────────────────────────────────────

type contextKey string

const ctxUser contextKey = "user"

func userFromCtx(r *http.Request) *database.User {
	u, _ := r.Context().Value(ctxUser).(*database.User)
	return u
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

// requireAuthV2 validates the session cookie and injects the User into context.
func (s *Server) requireAuthV2(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
			return
		}
		u, ok := s.auth.Validate(cookie.Value)
		if !ok || u == nil {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
			return
		}
		ctx := context.WithValue(r.Context(), ctxUser, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireRole checks that the current user has at least the given role.
func (s *Server) requireRole(role string, next http.Handler) http.Handler {
	return s.requireAuthV2(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := userFromCtx(r)
		if u == nil || !auth.HasRole(u.Role, role) {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "forbidden: insufficient role"})
			return
		}
		next.ServeHTTP(w, r)
	}))
}

// ─── Auth V2 Handlers ─────────────────────────────────────────────────────────

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type setupStatusResponse struct {
	NeedsSetup    bool   `json:"needsSetup"`
	DatabaseReady bool   `json:"databaseReady"`
	DatabaseError string `json:"databaseError,omitempty"`
}

type initializeSetupRequest struct {
	Username        string `json:"username"`
	Email           string `json:"email"`
	Password        string `json:"password"`
	ConfirmPassword string `json:"confirmPassword"`
	DisplayName     string `json:"displayName"`
}

func (s *Server) needsSetup() bool {
	if s == nil || s.database == nil || !s.database.IsConnected() {
		return false
	}
	return !s.database.HasUsers()
}

func (s *Server) issueSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
		MaxAge:   int(s.cfg.SessionTTL.Seconds()),
	})
}

func (s *Server) handleSetupStatus(w http.ResponseWriter, r *http.Request) {
	status := setupStatusResponse{NeedsSetup: false}
	if s != nil && s.database != nil {
		dbStatus := s.database.Status()
		status.DatabaseReady = dbStatus.Connected
		status.DatabaseError = dbStatus.LastError
		status.NeedsSetup = dbStatus.Connected && !s.database.HasUsers()
	}
	s.writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleInitializeSetup(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "database belum terhubung; periksa konfigurasi PostgreSQL panel"})
		return
	}
	if !s.needsSetup() {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "initial setup already completed"})
		return
	}
	defer r.Body.Close()

	var req initializeSetupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}
	if req.Password != req.ConfirmPassword {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "password confirmation does not match"})
		return
	}
	if err := users.ValidateUsername(req.Username); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if err := users.ValidateEmail(req.Email); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if err := users.ValidatePassword(req.Password); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	u, err := s.auth.CreateUser(req.Username, req.Email, req.Password, auth.SuperadminRole, req.DisplayName)
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	token, loggedInUser, err := s.auth.Login(req.Username, req.Password, remoteAddr(r), r.UserAgent())
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "initial admin created but auto-login failed"})
		return
	}
	log.Printf("[auth] first-run setup completed user=%q remote=%s", u.Username, remoteAddr(r))
	s.issueSessionCookie(w, token)
	s.writeJSON(w, http.StatusCreated, jsonResponse{
		"ok":       true,
		"username": loggedInUser.Username,
		"role":     loggedInUser.Role,
	})
}

func (s *Server) handleLoginV2(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}

	token, u, err := s.auth.Login(
		strings.TrimSpace(req.Username),
		req.Password,
		remoteAddr(r),
		r.UserAgent(),
	)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserSuspended):
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "account suspended"})
		default:
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "invalid credentials"})
		}
		log.Printf("[auth] login failed username=%q remote=%s", req.Username, remoteAddr(r))
		return
	}

	s.issueSessionCookie(w, token)

	log.Printf("[auth] login success user=%q role=%q remote=%s", u.Username, u.Role, remoteAddr(r))
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":       true,
		"username": u.Username,
		"role":     u.Role,
	})
}

func (s *Server) handleMeV2(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	cfStatus := "unconfigured"
	cfCfg, _ := s.database.GetCFConfig(u.ID)
	if cfCfg != nil {
		cfStatus = cfCfg.Status
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"id":               u.ID,
		"username":         u.Username,
		"email":            u.Email,
		"role":             u.Role,
		"status":           u.Status,
		"displayName":      u.DisplayName,
		"avatarUrl":        u.AvatarURL,
		"createdAt":        u.CreatedAt,
		"lastLoginAt":      u.LastLoginAt,
		"cloudflareStatus": cfStatus,
	})
}

// ─── User Management Handlers ─────────────────────────────────────────────────

type createUserRequest struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	Role        string `json:"role"`
	DisplayName string `json:"displayName"`
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	limit := 50
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	userList, total, err := s.database.ListUsers(limit, offset)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"users": userList, "total": total, "limit": limit, "offset": offset})
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := users.ValidateUsername(req.Username); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if err := users.ValidateEmail(req.Email); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if err := users.ValidatePassword(req.Password); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	u, err := s.auth.CreateUser(req.Username, req.Email, req.Password, req.Role, req.DisplayName)
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	actor := userFromCtx(r)
	log.Printf("[users] created user=%q role=%q by=%q", u.Username, u.Role, actor.Username)
	s.writeJSON(w, http.StatusCreated, u)
}

func (s *Server) handleGetUser(w http.ResponseWriter, r *http.Request) {
	id := parsePathID(r, "id")
	u, err := s.database.GetUserByID(id)
	if err != nil || u == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}
	s.writeJSON(w, http.StatusOK, u)
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	id := parsePathID(r, "id")
	var fields map[string]any
	if err := json.NewDecoder(r.Body).Decode(&fields); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := s.database.UpdateUser(id, fields); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	u, _ := s.database.GetUserByID(id)
	s.writeJSON(w, http.StatusOK, u)
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	id := parsePathID(r, "id")
	actor := userFromCtx(r)
	if actor != nil && actor.ID == id {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "cannot delete yourself"})
		return
	}
	if err := s.database.DeleteUser(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleSuspendUser(w http.ResponseWriter, r *http.Request) {
	id := parsePathID(r, "id")
	if err := users.SuspendUser(s.database, id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleActivateUser(w http.ResponseWriter, r *http.Request) {
	id := parsePathID(r, "id")
	if err := users.ActivateUser(s.database, id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleGetUserQuota(w http.ResponseWriter, r *http.Request) {
	id := parsePathID(r, "id")
	q, err := s.database.GetUserQuota(id)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, q)
}

func (s *Server) handleUpdateUserQuota(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	id := parsePathID(r, "id")
	var q database.UserQuota
	if err := json.NewDecoder(r.Body).Decode(&q); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	q.UserID = id
	if err := s.database.UpdateUserQuota(q); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// ─── Cloudflare Config Handlers ───────────────────────────────────────────────

type cfConfigRequest struct {
	APIToken   string `json:"apiToken"`
	AccountID  string `json:"accountId"`
	ZoneID     string `json:"zoneId"`
	BaseDomain string `json:"baseDomain"`
}

func (s *Server) handleGetCFConfig(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	cfg, _ := s.database.GetCFConfig(u.ID)
	if cfg == nil {
		s.writeJSON(w, http.StatusOK, jsonResponse{"configured": false})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"configured": true,
		"accountId":  cfg.AccountID,
		"zoneId":     cfg.ZoneID,
		"baseDomain": cfg.BaseDomain,
		"status":     cfg.Status,
		"verifiedAt": cfg.VerifiedAt,
	})
}

func (s *Server) handleSetCFConfig(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)
	var req cfConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if strings.TrimSpace(req.APIToken) == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "apiToken is required"})
		return
	}
	encrypted, err := crypto.Encrypt(s.cfg.EncryptionKey, req.APIToken)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("failed to encrypt token"))
		return
	}
	if err := s.database.UpsertCFConfig(u.ID, encrypted, req.AccountID, req.ZoneID, req.BaseDomain, "unconfigured"); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": "Cloudflare config saved. Use /verify to validate."})
}

func (s *Server) handleVerifyCFConfig(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	cfg, _ := s.database.GetCFConfig(u.ID)
	if cfg == nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "no Cloudflare config found"})
		return
	}
	apiToken, err := crypto.Decrypt(s.cfg.EncryptionKey, cfg.APITokenEncrypted)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "failed to decrypt token"})
		return
	}
	client := cloudflareapi.NewClient(apiToken, cfg.AccountID, cfg.ZoneID)
	status := "active"
	if verifyErr := client.VerifyToken(); verifyErr != nil {
		status = "invalid"
		_ = s.database.UpsertCFConfig(u.ID, cfg.APITokenEncrypted, cfg.AccountID, cfg.ZoneID, cfg.BaseDomain, status)
		s.writeJSON(w, http.StatusOK, jsonResponse{"valid": false, "error": verifyErr.Error()})
		return
	}
	_ = s.database.UpsertCFConfig(u.ID, cfg.APITokenEncrypted, cfg.AccountID, cfg.ZoneID, cfg.BaseDomain, status)
	s.writeJSON(w, http.StatusOK, jsonResponse{"valid": true, "status": status})
}

func (s *Server) handleDeleteCFConfig(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if err := s.database.DeleteCFConfig(u.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// ─── Projects Handlers ────────────────────────────────────────────────────────

type createProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	ProjectType string `json:"projectType"`
	RepoURL     string `json:"repoUrl"`
	WorkingDir  string `json:"workingDir"`
}

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	var (
		projectList []database.Project
		err         error
	)
	if auth.IsAdmin(u.Role) && r.URL.Query().Get("all") == "1" {
		projectList, _, err = s.database.ListAllProjects(100, 0)
	} else {
		projectList, err = s.database.ListProjects(u.ID)
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	type projectWithRunning struct {
		database.Project
		Running bool `json:"running"`
	}
	result := make([]projectWithRunning, len(projectList))
	for i, p := range projectList {
		result[i] = projectWithRunning{Project: p, Running: s.projectManager.IsRunning(p.ID)}
	}
	s.writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)
	var req createProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "name is required"})
		return
	}

	// Quota check
	quota, _ := s.database.GetUserQuota(u.ID)
	if quota != nil {
		existing, _ := s.database.ListProjects(u.ID)
		if len(existing) >= quota.MaxProjects {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "project quota exceeded"})
			return
		}
	}

	slug := slugify(req.Name)
	existing, _ := s.database.ListProjects(u.ID)
	assignedPort := allocateProjectPort(u.ID, len(existing))

	p, err := s.database.CreateProject(u.ID, req.Name, slug, req.Description, req.ProjectType, req.RepoURL, req.WorkingDir, assignedPort)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	log.Printf("[projects] created id=%d name=%q user=%q port=%d", p.ID, p.Name, u.Username, p.AssignedPort)
	s.writeJSON(w, http.StatusCreated, p)
}

func (s *Server) handleGetProject(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	p, err := s.database.GetProject(id, u.ID)
	if err != nil || p == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}
	s.writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	_ = s.projectManager.Stop(id)
	if err := s.database.DeleteProject(id, u.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	log.Printf("[projects] deleted id=%d user=%q", id, u.Username)
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleStartProject(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	p, err := s.database.GetProject(id, u.ID)
	if err != nil || p == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}
	if err := s.projectManager.Start(p); err != nil {
		_ = s.database.UpdateProjectStatus(id, "error")
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	_ = s.database.UpdateProjectStatus(id, "active")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "status": "active"})
}

func (s *Server) handleStopProject(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	existing, _ := s.database.GetProject(id, u.ID)
	if existing == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}
	if err := s.projectManager.Stop(id); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	_ = s.database.UpdateProjectStatus(id, "stopped")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "status": "stopped"})
}

// ─── Tunnels Handlers ─────────────────────────────────────────────────────────

type createTunnelRequest struct {
	Name      string `json:"name"`
	TargetURL string `json:"targetUrl"`
	ProjectID *int64 `json:"projectId"`
}

func (s *Server) handleListTunnels(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	tunnels, err := s.database.ListTunnels(u.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	type tunnelWithDaemon struct {
		database.Tunnel
		DaemonRunning bool `json:"daemonRunning"`
	}
	result := make([]tunnelWithDaemon, len(tunnels))
	for i, t := range tunnels {
		result[i] = tunnelWithDaemon{Tunnel: t, DaemonRunning: s.cfDaemon.IsRunning(t.CFTunnelID)}
	}
	s.writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleCreateTunnel(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)

	var req createTunnelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.TargetURL) == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "name and targetUrl are required"})
		return
	}

	// Quota check
	quota, _ := s.database.GetUserQuota(u.ID)
	if quota != nil {
		existing, _ := s.database.ListTunnels(u.ID)
		if len(existing) >= quota.MaxTunnels {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "tunnel quota exceeded"})
			return
		}
	}

	// Get user's CF config
	cfCfg, _ := s.database.GetCFConfig(u.ID)
	if cfCfg == nil || cfCfg.Status != "active" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "Cloudflare config not configured or not verified"})
		return
	}

	apiToken, err := crypto.Decrypt(s.cfg.EncryptionKey, cfCfg.APITokenEncrypted)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "failed to decrypt CF token"})
		return
	}

	// Create DB record first (status=creating)
	t, err := s.database.CreateTunnel(u.ID, req.ProjectID, req.Name, req.TargetURL)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	// Async CF provisioning
	go func(tunnelDBID int64, userID int64, name, targetURL string, cfCopy *database.CloudflareConfig, token string) {
		cfClient := cloudflareapi.NewClient(token, cfCopy.AccountID, cfCopy.ZoneID)
		info, credJSON, cfErr := cfClient.CreateTunnel(name)
		if cfErr != nil {
			log.Printf("[tunnels] CF create failed db_id=%d err=%v", tunnelDBID, cfErr)
			_ = s.database.UpdateTunnelStatus(tunnelDBID, "error")
			return
		}

		// Create CNAME if base_domain is set
		hostname := ""
		if cfCopy.BaseDomain != "" {
			sub := generateRandomSubdomain()
			hostname = sub + "." + cfCopy.BaseDomain
			if _, dnsErr := cfClient.CreateCNAMERecord(hostname, info.ID); dnsErr != nil {
				log.Printf("[tunnels] DNS CNAME failed: %v", dnsErr)
				hostname = ""
			}
		}

		// Configure ingress
		rules := []cloudflareapi.IngressRule{{Hostname: hostname, Service: targetURL}}
		_ = cfClient.UpdateTunnelConfig(info.ID, rules)

		// Generate config.yml and start daemon
		credFile := s.cfDaemon.CredFilePathFor(userID, info.ID)
		configYAML := cloudflareapi.GenerateConfigYAML(cloudflareapi.TunnelConfigOptions{
			TunnelID: info.ID,
			CredFile: credFile,
			Ingress:  rules,
		})
		if daemonErr := s.cfDaemon.StartTunnel(info.ID, userID, credJSON, configYAML); daemonErr != nil {
			log.Printf("[tunnels] daemon start failed db_id=%d err=%v", tunnelDBID, daemonErr)
		}

		_ = s.database.UpdateTunnelCF(tunnelDBID, info.ID, hostname, "active")
		log.Printf("[tunnels] tunnel active db_id=%d cf_id=%s hostname=%s", tunnelDBID, info.ID, hostname)
		_ = s.database.CreateNotification(userID, "Tunnel Active 🟢", "Tunnel '"+name+"' berhasil dibuat.", "success", "")
	}(t.ID, u.ID, req.Name, req.TargetURL, cfCfg, apiToken)

	s.writeJSON(w, http.StatusAccepted, jsonResponse{
		"ok":      true,
		"id":      t.ID,
		"status":  "creating",
		"message": "Tunnel sedang dibuat, cek status dalam beberapa detik.",
	})
}

func (s *Server) handleGetTunnel(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	t, err := s.database.GetTunnel(id, u.ID)
	if err != nil || t == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "tunnel not found"})
		return
	}
	s.writeJSON(w, http.StatusOK, t)
}

func (s *Server) handleDeleteTunnel(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	t, err := s.database.GetTunnel(id, u.ID)
	if err != nil || t == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "tunnel not found"})
		return
	}
	_ = s.cfDaemon.StopTunnel(t.CFTunnelID)
	if t.CFTunnelID != "" {
		go func(cfID string) {
			cfCfg, _ := s.database.GetCFConfig(u.ID)
			if cfCfg == nil {
				return
			}
			apiToken, err := crypto.Decrypt(s.cfg.EncryptionKey, cfCfg.APITokenEncrypted)
			if err != nil {
				return
			}
			_ = cloudflareapi.NewClient(apiToken, cfCfg.AccountID, cfCfg.ZoneID).DeleteTunnel(cfID)
		}(t.CFTunnelID)
	}
	_ = s.database.DeleteTunnel(id, u.ID)
	log.Printf("[tunnels] deleted id=%d cf_id=%s user=%q", id, t.CFTunnelID, u.Username)
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// ─── Notifications Handlers ───────────────────────────────────────────────────

func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	notifs, err := s.database.ListNotifications(u.ID, 30)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"notifications": notifs})
}

func (s *Server) handleMarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	_ = s.database.MarkNotificationRead(id, u.ID)
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleMarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	_ = s.database.MarkAllNotificationsRead(u.ID)
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func parsePathID(r *http.Request, key string) int64 {
	n, _ := strconv.ParseInt(r.PathValue(key), 10, 64)
	return n
}

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	for _, c := range s {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			b.WriteRune(c)
		} else {
			b.WriteRune('-')
		}
	}
	result := strings.Trim(b.String(), "-")
	for strings.Contains(result, "--") {
		result = strings.ReplaceAll(result, "--", "-")
	}
	if len(result) > 60 {
		result = result[:60]
	}
	return result
}

func allocateProjectPort(userID int64, projectIndex int) int {
	const base, block, maxUID = 10000, 100, 900
	basePt := base + int((userID-1)%int64(maxUID))*block
	return basePt + (projectIndex % block)
}

func generateRandomSubdomain() string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	buf := make([]byte, 8)
	_, _ = rand.Read(buf)
	for i := range buf {
		buf[i] = chars[int(buf[i])%len(chars)]
	}
	return string(buf)
}
