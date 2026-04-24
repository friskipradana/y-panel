package httpserver

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
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

func parseLimitOffset(r *http.Request, defaultLimit, maxLimit int) (int, int, error) {
	limit := defaultLimit
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return 0, 0, fmt.Errorf("limit harus berupa angka")
		}
		limit = parsed
	}
	if limit <= 0 {
		limit = defaultLimit
	}
	if maxLimit > 0 && limit > maxLimit {
		limit = maxLimit
	}

	offset := 0
	if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return 0, 0, fmt.Errorf("offset harus berupa angka")
		}
		offset = parsed
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset, nil
}

func querySearch(r *http.Request) string {
	return strings.TrimSpace(r.URL.Query().Get("q"))
}

func (s *Server) notifyUserAction(userID int64, title, body, notifType string) {
	if err := s.database.CreateNotification(userID, title, body, notifType, ""); err != nil {
		return
	}
	latest, err := s.database.GetLatestNotification(userID)
	if err != nil {
		latest = nil
	}
	s.pushNotificationSnapshot(userID, "created", latest)
}

func (s *Server) notifyCurrentUserAction(r *http.Request, title, body, notifType string) {
	if user := userFromCtx(r); user != nil {
		s.notifyUserAction(user.ID, title, body, notifType)
	}
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
	limit, offset, err := parseLimitOffset(r, 12, 100)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	query := querySearch(r)
	userList, total, err := s.database.ListUsersFiltered(query, limit, offset)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": userList, "total": total, "limit": limit, "offset": offset})
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
	actorName := "system"
	if actor != nil {
		actorName = actor.Username
		s.notifyUserAction(actor.ID, "User baru dibuat 👤", fmt.Sprintf("User '%s' dengan role %s berhasil dibuat.", u.Username, u.Role), "success")
	}
	log.Printf("[users] created user=%q role=%q by=%q", u.Username, u.Role, actorName)
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
	if u != nil {
		s.notifyCurrentUserAction(r, "User diperbarui ✏️", fmt.Sprintf("Perubahan pada user '%s' berhasil disimpan.", u.Username), "info")
	}
	s.writeJSON(w, http.StatusOK, u)
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	id := parsePathID(r, "id")
	actor := userFromCtx(r)
	if actor != nil && actor.ID == id {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "cannot delete yourself"})
		return
	}

	targetUser, err := s.database.GetUserByID(id)
	if err != nil || targetUser == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}

	if err := s.database.DeleteUser(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if actor != nil {
		s.notifyUserAction(actor.ID, "User dihapus 🗑️", fmt.Sprintf("User '%s' berhasil dihapus.", targetUser.Username), "warning")
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleSuspendUser(w http.ResponseWriter, r *http.Request) {
	id := parsePathID(r, "id")
	targetUser, err := s.database.GetUserByID(id)
	if err != nil || targetUser == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}
	if err := users.SuspendUser(s.database, id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.notifyCurrentUserAction(r, "User disuspend ⛔", fmt.Sprintf("User '%s' berhasil disuspend.", targetUser.Username), "warning")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleActivateUser(w http.ResponseWriter, r *http.Request) {
	id := parsePathID(r, "id")
	targetUser, err := s.database.GetUserByID(id)
	if err != nil || targetUser == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}
	if err := users.ActivateUser(s.database, id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.notifyCurrentUserAction(r, "User diaktifkan kembali ✅", fmt.Sprintf("User '%s' berhasil diaktifkan.", targetUser.Username), "success")
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
	s.notifyCurrentUserAction(r, "Quota user diperbarui 📦", fmt.Sprintf("Quota untuk user ID %d berhasil diperbarui.", id), "info")
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
	s.notifyUserAction(u.ID, "Cloudflare config disimpan ☁️", "Konfigurasi Cloudflare berhasil disimpan dan siap diverifikasi.", "info")
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
		s.notifyUserAction(u.ID, "Verifikasi Cloudflare gagal ⚠️", verifyErr.Error(), "warning")
		s.writeJSON(w, http.StatusOK, jsonResponse{"valid": false, "error": verifyErr.Error()})
		return
	}
	_ = s.database.UpsertCFConfig(u.ID, cfg.APITokenEncrypted, cfg.AccountID, cfg.ZoneID, cfg.BaseDomain, status)
	s.notifyUserAction(u.ID, "Cloudflare aktif ✅", "Token Cloudflare berhasil diverifikasi dan siap digunakan.", "success")
	s.writeJSON(w, http.StatusOK, jsonResponse{"valid": true, "status": status})
}

func (s *Server) handleGetCFZones(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	cfg, _ := s.database.GetCFConfig(u.ID)
	if cfg == nil || cfg.Status != "active" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "Cloudflare config not active"})
		return
	}
	apiToken, err := crypto.Decrypt(s.cfg.EncryptionKey, cfg.APITokenEncrypted)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "failed to decrypt token"})
		return
	}
	client := cloudflareapi.NewClient(apiToken, cfg.AccountID, "")
	zones, err := client.ListZones()
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, zones)
}

func (s *Server) handleDeleteCFConfig(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if err := s.database.DeleteCFConfig(u.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.notifyUserAction(u.ID, "Cloudflare config dihapus 🗑️", "Konfigurasi Cloudflare berhasil dihapus dari akun Anda.", "warning")
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
	limit, offset, err := parseLimitOffset(r, 12, 100)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	query := querySearch(r)
	includeAll := auth.IsAdmin(u.Role) && r.URL.Query().Get("all") == "1"

	projectList, total, err := s.database.ListProjectsFiltered(u.ID, includeAll, query, limit, offset)
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
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"items":  result,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
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
	s.notifyUserAction(u.ID, "Project dibuat 🚀", fmt.Sprintf("Project '%s' berhasil dibuat pada port %d.", p.Name, p.AssignedPort), "success")
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
	p, err := s.database.GetProject(id, u.ID)
	if err != nil || p == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}
	_ = s.projectManager.Stop(id)
	if err := s.database.DeleteProject(id, u.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	log.Printf("[projects] deleted id=%d user=%q", id, u.Username)
	s.notifyUserAction(u.ID, "Project dihapus 🗑️", fmt.Sprintf("Project '%s' berhasil dihapus.", p.Name), "warning")
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
	if err := s.projectManager.Start(u, p); err != nil {
		_ = s.database.UpdateProjectStatus(id, "error")
		s.notifyUserAction(u.ID, "Project gagal dijalankan ⚠️", fmt.Sprintf("Project '%s' gagal dijalankan: %s", p.Name, err.Error()), "warning")
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	_ = s.database.UpdateProjectStatus(id, "active")
	s.notifyUserAction(u.ID, "Project berjalan ▶️", fmt.Sprintf("Project '%s' berhasil dijalankan.", p.Name), "success")
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
	s.notifyUserAction(u.ID, "Project dihentikan ⏸️", fmt.Sprintf("Project '%s' berhasil dihentikan.", existing.Name), "info")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "status": "stopped"})
}

// ─── Tunnels Handlers ─────────────────────────────────────────────────────────

type createTunnelRequest struct {
	Name      string `json:"name"`
	Subdomain string `json:"subdomain"`
	Domain    string `json:"domain"`
	ZoneID    string `json:"zoneId"`
	Path      string `json:"path"`
	Protocol  string `json:"protocol"`
	IP        string `json:"ip"`
	Port      string `json:"port"`
	ProjectID *int64 `json:"projectId"`
}

func (s *Server) handleListTunnels(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	limit, offset, err := parseLimitOffset(r, 12, 100)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	query := querySearch(r)
	tunnels, total, err := s.database.ListTunnelsFiltered(u.ID, query, limit, offset)
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
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"items":  result,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (s *Server) handleCreateTunnel(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)

	var req createTunnelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Domain) == "" || strings.TrimSpace(req.IP) == "" || strings.TrimSpace(req.Port) == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "name, domain, ip, and port are required"})
		return
	}

	targetURL := fmt.Sprintf("%s://%s:%s%s", req.Protocol, req.IP, req.Port, req.Path)

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
	t, err := s.database.CreateTunnel(u.ID, req.ProjectID, req.Name, targetURL)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	// Async CF provisioning
	go func(tunnelDBID int64, userID int64, name, reqSubdomain, reqDomain, reqZoneID string, cfCopy *database.CloudflareConfig, token string) {
		cfClient := cloudflareapi.NewClient(token, cfCopy.AccountID, "")
		
		hostname := reqDomain
		if reqSubdomain != "" && reqSubdomain != "@" {
			hostname = reqSubdomain + "." + reqDomain
		}

		allRoutes, _ := s.database.ListTunnels(userID)
		
		var mainTunnelID string
		for _, r := range allRoutes {
			if r.CFTunnelID != "" {
				mainTunnelID = r.CFTunnelID
				break
			}
		}

		var credJSON []byte
		if mainTunnelID == "" {
			info, creds, cfErr := cfClient.CreateTunnel("panel-tunnel-" + fmt.Sprint(userID))
			if cfErr != nil {
				log.Printf("[tunnels] CF create failed db_id=%d err=%v", tunnelDBID, cfErr)
				_ = s.database.UpdateTunnelStatus(tunnelDBID, "error")
				s.notifyUserAction(userID, "Pembuatan tunnel gagal ⚠️", fmt.Sprintf("Tunnel '%s' gagal dibuat: %s", name, cfErr.Error()), "warning")
				return
			}
			mainTunnelID = info.ID
			credJSON = creds
		} else {
			credFile := s.cfDaemon.CredFilePathFor(userID, mainTunnelID)
			credJSON, _ = os.ReadFile(credFile)
		}

		// CNAME
		if hostname != "" {
			_, err := cfClient.EnsureCNAMERecord(reqZoneID, hostname, mainTunnelID)
			if err != nil {
				log.Printf("[tunnels] warning: failed to ensure CNAME %s: %v", hostname, err)
			}
		}

		// Build Rules
		var rules []cloudflareapi.IngressRule
		for _, r := range allRoutes {
			rHost := r.CFHostname
			rTarget := r.TargetURL
			if r.ID == tunnelDBID {
				rHost = hostname
				rTarget = targetURL
			}
			if rHost != "" {
				uParse, parseErr := url.Parse(rTarget)
				path := ""
				service := rTarget
				if parseErr == nil {
					path = uParse.Path
					service = uParse.Scheme + "://" + uParse.Host
				}
				rules = append(rules, cloudflareapi.IngressRule{
					Hostname: rHost,
					Path:     path,
					Service:  service,
				})
			}
		}

		_ = cfClient.UpdateTunnelConfig(mainTunnelID, rules)

		credFile := s.cfDaemon.CredFilePathFor(userID, mainTunnelID)
		configYAML := cloudflareapi.GenerateConfigYAML(cloudflareapi.TunnelConfigOptions{
			TunnelID: mainTunnelID,
			CredFile: credFile,
			Ingress:  rules,
		})
		
		_ = s.cfDaemon.StopTunnel(mainTunnelID)
		if daemonErr := s.cfDaemon.StartTunnel(mainTunnelID, userID, credJSON, configYAML); daemonErr != nil {
			log.Printf("[tunnels] daemon start failed db_id=%d err=%v", tunnelDBID, daemonErr)
			s.notifyUserAction(userID, "Daemon tunnel bermasalah ⚠️", fmt.Sprintf("Tunnel '%s' aktif tetapi daemon gagal start: %s", name, daemonErr.Error()), "warning")
		}

		_ = s.database.UpdateTunnelCF(tunnelDBID, mainTunnelID, hostname, reqZoneID, "active")
		log.Printf("[tunnels] tunnel active db_id=%d cf_id=%s hostname=%s", tunnelDBID, mainTunnelID, hostname)
		s.notifyUserAction(userID, "Rute Tunnel Aktif 🟢", "Rute '"+name+"' berhasil dibuat.", "success")
	}(t.ID, u.ID, req.Name, req.Subdomain, req.Domain, req.ZoneID, cfCfg, apiToken)

	s.writeJSON(w, http.StatusAccepted, jsonResponse{
		"ok":      true,
		"id":      t.ID,
		"status":  "creating",
		"message": "Tunnel sedang dibuat, cek status dalam beberapa detik.",
	})
}

func (s *Server) handleUpdateTunnel(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)
	id := parsePathID(r, "id")

	var req createTunnelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Domain) == "" || strings.TrimSpace(req.IP) == "" || strings.TrimSpace(req.Port) == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "name, domain, ip, and port are required"})
		return
	}

	t, err := s.database.GetTunnel(id, u.ID)
	if err != nil || t == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "tunnel not found"})
		return
	}

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

	hostname := req.Domain
	if req.Subdomain != "" && req.Subdomain != "@" {
		hostname = req.Subdomain + "." + req.Domain
	}
	targetURL := fmt.Sprintf("%s://%s:%s%s", req.Protocol, req.IP, req.Port, req.Path)

	_ = s.database.UpdateTunnel(id, u.ID, req.Name, targetURL, hostname, req.ZoneID)

	// Async CF update
	go func(tunnelDBID int64, userID int64, cfTunnelID string, oldHostname, oldZoneID, newHostname, reqZoneID string, cfCopy *database.CloudflareConfig, token string) {
		cfClient := cloudflareapi.NewClient(token, cfCopy.AccountID, "")

		if oldHostname != "" && oldZoneID != "" && (oldHostname != newHostname || oldZoneID != reqZoneID) {
			_ = cfClient.DeleteDNSRecordByHostname(oldZoneID, oldHostname)
		} else if oldHostname != "" && oldHostname != newHostname {
			// Fallback if oldZoneID wasn't set but reqZoneID is the same
			_ = cfClient.DeleteDNSRecordByHostname(reqZoneID, oldHostname)
		}

		if newHostname != "" && cfTunnelID != "" && reqZoneID != "" {
			_, _ = cfClient.EnsureCNAMERecord(reqZoneID, newHostname, cfTunnelID)
		}

		allRoutes, _ := s.database.ListTunnels(userID)
		
		var rules []cloudflareapi.IngressRule
		for _, rRoute := range allRoutes {
			if rRoute.CFHostname != "" {
				uParse, parseErr := url.Parse(rRoute.TargetURL)
				path := ""
				service := rRoute.TargetURL
				if parseErr == nil {
					path = uParse.Path
					service = uParse.Scheme + "://" + uParse.Host
				}
				rules = append(rules, cloudflareapi.IngressRule{
					Hostname: rRoute.CFHostname,
					Path:     path,
					Service:  service,
				})
			}
		}

		if cfTunnelID != "" {
			_ = cfClient.UpdateTunnelConfig(cfTunnelID, rules)

			credFile := s.cfDaemon.CredFilePathFor(userID, cfTunnelID)
			credJSON, _ := os.ReadFile(credFile)
			configYAML := cloudflareapi.GenerateConfigYAML(cloudflareapi.TunnelConfigOptions{
				TunnelID: cfTunnelID,
				CredFile: credFile,
				Ingress:  rules,
			})
			
			_ = s.cfDaemon.StopTunnel(cfTunnelID)
			_ = s.cfDaemon.StartTunnel(cfTunnelID, userID, credJSON, configYAML)
		}
	}(t.ID, u.ID, t.CFTunnelID, t.CFHostname, t.CFZoneID, hostname, req.ZoneID, cfCfg, apiToken)

	s.notifyUserAction(u.ID, "Rute tunnel diperbarui 🌐", fmt.Sprintf("Rute '%s' berhasil diperbarui.", req.Name), "info")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": "Rute berhasil diperbarui"})
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
	
	_ = s.database.DeleteTunnel(id, u.ID)
	log.Printf("[tunnels] deleted route id=%d user=%q", id, u.Username)

	allRoutes, _ := s.database.ListTunnels(u.ID)

	if len(allRoutes) == 0 {
		_ = s.cfDaemon.StopTunnel(t.CFTunnelID)
	}

	if t.CFTunnelID != "" {
		go func(cfID, hostname, zoneID string, userID int64) {
			cfCfg, _ := s.database.GetCFConfig(userID)
			if cfCfg == nil {
				return
			}
			apiToken, err := crypto.Decrypt(s.cfg.EncryptionKey, cfCfg.APITokenEncrypted)
			if err != nil {
				return
			}
			cfClient := cloudflareapi.NewClient(apiToken, cfCfg.AccountID, "")

			if hostname != "" && zoneID != "" {
				_ = cfClient.DeleteDNSRecordByHostname(zoneID, hostname)
			} else if hostname != "" && cfCfg.ZoneID != "" {
				_ = cfClient.DeleteDNSRecordByHostname(cfCfg.ZoneID, hostname)
			}

			if len(allRoutes) == 0 {
				_ = cfClient.DeleteTunnel(cfID)
			} else {
				var rules []cloudflareapi.IngressRule
				for _, rRoute := range allRoutes {
					if rRoute.CFHostname != "" {
						uParse, parseErr := url.Parse(rRoute.TargetURL)
						path := ""
						service := rRoute.TargetURL
						if parseErr == nil {
							path = uParse.Path
							service = uParse.Scheme + "://" + uParse.Host
						}
						rules = append(rules, cloudflareapi.IngressRule{
							Hostname: rRoute.CFHostname,
							Path:     path,
							Service:  service,
						})
					}
				}

				_ = cfClient.UpdateTunnelConfig(cfID, rules)

				credFile := s.cfDaemon.CredFilePathFor(userID, cfID)
				credJSON, _ := os.ReadFile(credFile)
				configYAML := cloudflareapi.GenerateConfigYAML(cloudflareapi.TunnelConfigOptions{
					TunnelID: cfID,
					CredFile: credFile,
					Ingress:  rules,
				})

				_ = s.cfDaemon.StopTunnel(cfID)
				_ = s.cfDaemon.StartTunnel(cfID, userID, credJSON, configYAML)
			}
		}(t.CFTunnelID, t.CFHostname, t.CFZoneID, u.ID)
	}

	s.notifyUserAction(u.ID, "Rute tunnel dihapus 🗑️", fmt.Sprintf("Rute '%s' berhasil dihapus.", t.Name), "warning")
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
	s.pushNotificationSnapshot(u.ID, "read", nil)
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleMarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	_ = s.database.MarkAllNotificationsRead(u.ID)
	s.pushNotificationSnapshot(u.ID, "read_all", nil)
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

type docPayload struct {
	Title   string `json:"title"`
	Slug    string `json:"slug"`
	Excerpt string `json:"excerpt"`
	Content string `json:"content"`
	Status  string `json:"status"`
}

func normalizeDocPayload(req *docPayload) error {
	req.Title = strings.TrimSpace(req.Title)
	req.Slug = slugify(req.Slug)
	if req.Slug == "" {
		req.Slug = slugify(req.Title)
	}
	req.Excerpt = strings.TrimSpace(req.Excerpt)
	req.Content = strings.TrimSpace(req.Content)
	req.Status = strings.ToLower(strings.TrimSpace(req.Status))
	if req.Title == "" {
		return fmt.Errorf("title is required")
	}
	if req.Slug == "" {
		return fmt.Errorf("slug is required")
	}
	switch req.Status {
	case "", "published":
		req.Status = "published"
	case "draft", "archived":
	default:
		return fmt.Errorf("status is invalid")
	}
	if req.Excerpt == "" {
		runes := []rune(req.Content)
		if len(runes) > 180 {
			req.Excerpt = string(runes[:180]) + "..."
		} else {
			req.Excerpt = req.Content
		}
	}
	return nil
}

func (s *Server) handleListDocs(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	limit, offset, err := parseLimitOffset(r, 8, 100)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	query := querySearch(r)
	includeDrafts := auth.IsAdmin(u.Role) && r.URL.Query().Get("includeDrafts") == "1"
	items, total, err := s.database.ListDocs(query, limit, offset, includeDrafts)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"items":  items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (s *Server) handleGetDoc(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	includeDrafts := auth.IsAdmin(u.Role)
	doc, err := s.database.GetDocByID(id, includeDrafts)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if doc == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "doc not found"})
		return
	}
	s.writeJSON(w, http.StatusOK, doc)
}

func (s *Server) handleCreateDoc(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)
	var req docPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := normalizeDocPayload(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	doc, err := s.database.CreateDoc(&u.ID, req.Title, req.Slug, req.Excerpt, req.Content, req.Status)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.notifyUserAction(u.ID, "Dokumentasi dibuat 📝", fmt.Sprintf("Artikel '%s' berhasil dibuat.", doc.Title), "success")
	s.writeJSON(w, http.StatusCreated, doc)
}

func (s *Server) handleUpdateDoc(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	var req docPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := normalizeDocPayload(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	doc, err := s.database.UpdateDoc(id, req.Title, req.Slug, req.Excerpt, req.Content, req.Status)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if doc == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "doc not found"})
		return
	}
	s.notifyUserAction(u.ID, "Dokumentasi diperbarui ✨", fmt.Sprintf("Artikel '%s' berhasil diperbarui.", doc.Title), "info")
	s.writeJSON(w, http.StatusOK, doc)
}

func (s *Server) handleDeleteDoc(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	if err := s.database.DeleteDoc(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.notifyUserAction(u.ID, "Dokumentasi dihapus 🗑️", fmt.Sprintf("Artikel dengan ID %d berhasil dihapus.", id), "warning")
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
