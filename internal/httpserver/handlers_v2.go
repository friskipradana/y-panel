package httpserver

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	osuserpkg "os/user"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	panelosuser "github.com/friskipradana/panel-desktop-ui/internal/osuser"
	"github.com/friskipradana/panel-desktop-ui/internal/users"
)

// ─── Context key ─────────────────────────────────────────────────────────────

type contextKey string

const ctxUser contextKey = "user"

func userFromCtx(r *http.Request) *database.User {
	u, _ := r.Context().Value(ctxUser).(*database.User)
	return u
}

func (s *Server) writeCloudflareDecryptError(w http.ResponseWriter, userLabel string, err error) {
	if userLabel != "" {
		log.Printf("[cloudflare] decrypt failed user=%q — key may have changed since token was saved: %v", userLabel, err)
	} else {
		log.Printf("[cloudflare] decrypt failed — key may have changed since token was saved: %v", err)
	}
	s.writeJSON(w, http.StatusInternalServerError, jsonResponse{
		"error":  "failed to decrypt stored Cloudflare token — encryption key may have changed; re-save your CF config",
		"action": "re-save-cloudflare-config",
	})
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

func (s *Server) requireCapability(capability string, next http.Handler) http.Handler {
	return s.requireAuthV2(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := userFromCtx(r)
		if u == nil {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
			return
		}
		if !auth.HasCapability(u.Role, capability) {
			s.auditSensitiveAction(r, u, capability, "denied", map[string]any{"reason": "missing_capability"})
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "forbidden: missing capability"})
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
	targetUser, _ := s.database.GetUserByID(id)
	targetName := "user tersebut"
	if targetUser != nil {
		targetName = fmt.Sprintf("user '%s'", targetUser.Username)
	}
	s.notifyCurrentUserAction(r, "Quota user diperbarui 📦", fmt.Sprintf("Quota untuk %s berhasil diperbarui.", targetName), "info")
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
		log.Printf("[cloudflare] token encryption failed user=%q err=%v", u.Username, err)
		if strings.Contains(err.Error(), "encryption key") || strings.Contains(err.Error(), "invalid encryption key") {
			s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "server encryption key is invalid; redeploy to regenerate PANEL_ENCRYPTION_KEY"})
			return
		}
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
		s.writeCloudflareDecryptError(w, u.Username, err)
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
		s.writeCloudflareDecryptError(w, u.Username, err)
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

func (s *Server) activeCloudflareClient(r *http.Request) (*cloudflareapi.Client, []cloudflareapi.ZoneInfo, error) {
	u := userFromCtx(r)
	cfg, _ := s.database.GetCFConfig(u.ID)
	if cfg == nil || cfg.Status != "active" {
		return nil, nil, errors.New("Cloudflare config not active")
	}
	apiToken, err := crypto.Decrypt(s.cfg.EncryptionKey, cfg.APITokenEncrypted)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to decrypt stored Cloudflare token — encryption key may have changed; re-save your CF config: %w", err)
	}
	client := cloudflareapi.NewClient(apiToken, cfg.AccountID, "")
	zones, err := client.ListZones()
	if err != nil {
		return nil, nil, err
	}
	return client, zones, nil
}

func zoneAllowed(zones []cloudflareapi.ZoneInfo, zoneID string) bool {
	for _, zone := range zones {
		if zone.ID == zoneID {
			return true
		}
	}
	return false
}

func (s *Server) handleCloudflareDomains(w http.ResponseWriter, r *http.Request) {
	_, zones, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, zones)
}

type createCloudflareDomainRequest struct {
	Name string `json:"name"`
}

func (s *Server) handleCreateCloudflareDomain(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	client, _, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	var req createCloudflareDomainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	domain := strings.ToLower(strings.TrimSpace(req.Name))
	if domain == "" || strings.Contains(domain, "/") || strings.Contains(domain, " ") {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "domain tidak valid"})
		return
	}
	zone, err := client.CreateZone(domain)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, zone)
}

func (s *Server) handleGetCloudflareDomain(w http.ResponseWriter, r *http.Request) {
	client, zones, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	zoneID := r.PathValue("zoneId")
	if !zoneAllowed(zones, zoneID) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "zone not allowed"})
		return
	}
	zone, err := client.GetZone(zoneID)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, zone)
}

func (s *Server) handleDeleteCloudflareDomain(w http.ResponseWriter, r *http.Request) {
	client, zones, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	zoneID := r.PathValue("zoneId")
	if !zoneAllowed(zones, zoneID) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "zone not allowed"})
		return
	}
	if err := client.DeleteZone(zoneID); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleCloudflareDNSRecords(w http.ResponseWriter, r *http.Request) {
	client, zones, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	zoneID := r.PathValue("zoneId")
	if !zoneAllowed(zones, zoneID) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "zone not allowed"})
		return
	}
	records, err := client.ListDNSRecords(zoneID)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": records})
}

func decodeDNSPayload(r *http.Request) (cloudflareapi.DNSRecordPayload, error) {
	defer r.Body.Close()
	var payload cloudflareapi.DNSRecordPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		return payload, err
	}
	payload.Type = strings.ToUpper(strings.TrimSpace(payload.Type))
	payload.Name = strings.TrimSpace(payload.Name)
	payload.Content = strings.TrimSpace(payload.Content)
	if payload.TTL == 0 {
		payload.TTL = 1
	}
	if payload.Type == "" || payload.Name == "" || payload.Content == "" {
		return payload, errors.New("type, name, and content are required")
	}
	return payload, nil
}

func (s *Server) handleCreateCloudflareDNSRecord(w http.ResponseWriter, r *http.Request) {
	client, zones, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	zoneID := r.PathValue("zoneId")
	if !zoneAllowed(zones, zoneID) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "zone not allowed"})
		return
	}
	payload, err := decodeDNSPayload(r)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	record, err := client.CreateDNSRecord(zoneID, payload)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, record)
}

func (s *Server) handleUpdateCloudflareDNSRecord(w http.ResponseWriter, r *http.Request) {
	client, zones, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	zoneID := r.PathValue("zoneId")
	if !zoneAllowed(zones, zoneID) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "zone not allowed"})
		return
	}
	payload, err := decodeDNSPayload(r)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	record, err := client.UpdateDNSRecord(zoneID, r.PathValue("recordId"), payload)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, record)
}

func (s *Server) handleDeleteCloudflareDNSRecord(w http.ResponseWriter, r *http.Request) {
	client, zones, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	zoneID := r.PathValue("zoneId")
	if !zoneAllowed(zones, zoneID) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "zone not allowed"})
		return
	}
	if err := client.DeleteDNSRecord(zoneID, r.PathValue("recordId")); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

type cloudflareTunnelProfile struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Status        string `json:"status"`
	RouteCount    int    `json:"routeCount"`
	DaemonRunning bool   `json:"daemonRunning"`
}

type createCloudflareTunnelProfileRequest struct {
	Name     string `json:"name"`
	Mode     string `json:"mode"`
	TunnelID string `json:"tunnelId"`
}

func (s *Server) handleCreateCloudflareTunnelProfile(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)
	client, _, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	var req createCloudflareTunnelProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "panel-tunnel-" + fmt.Sprint(u.ID)
	}
	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "managed"
	}
	if mode == "custom" {
		tunnelID := strings.TrimSpace(req.TunnelID)
		if tunnelID == "" {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "tunnelId wajib diisi untuk custom profile"})
			return
		}
		info, err := client.GetTunnel(tunnelID)
		if err != nil {
			s.writeError(w, http.StatusBadGateway, err)
			return
		}
		s.writeJSON(w, http.StatusCreated, cloudflareTunnelProfile{ID: info.ID, Name: info.Name, Status: info.Status, RouteCount: 0, DaemonRunning: s.cfDaemon.IsRunning(info.ID)})
		return
	}
	info, creds, err := client.CreateTunnel(name)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	credFile := s.cfDaemon.CredFilePathFor(u.ID, info.ID)
	configYAML := cloudflareapi.GenerateConfigYAML(cloudflareapi.TunnelConfigOptions{
		TunnelID: info.ID,
		CredFile: credFile,
		Ingress:  []cloudflareapi.IngressRule{},
	})
	if err := s.cfDaemon.StartTunnel(info.ID, u.ID, creds, configYAML); err != nil {
		log.Printf("[tunnels] managed profile daemon start failed id=%s err=%v", info.ID, err)
	}
	s.writeJSON(w, http.StatusCreated, cloudflareTunnelProfile{ID: info.ID, Name: info.Name, Status: info.Status, RouteCount: 0, DaemonRunning: s.cfDaemon.IsRunning(info.ID)})
}

func (s *Server) handleCloudflareTunnelProfiles(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	client, _, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	routes, err := s.database.ListTunnels(u.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	profiles := make([]cloudflareTunnelProfile, 0)
	seen := map[string]int{}
	tunnels, err := client.ListTunnels()
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	for _, tunnel := range tunnels {
		seen[tunnel.ID] = len(profiles)
		profiles = append(profiles, cloudflareTunnelProfile{
			ID:            tunnel.ID,
			Name:          tunnel.Name,
			Status:        tunnel.Status,
			RouteCount:    0,
			DaemonRunning: s.cfDaemon.IsRunning(tunnel.ID),
		})
	}
	for _, route := range routes {
		profileID := strings.TrimSpace(route.CFTunnelID)
		if profileID == "" {
			profileID = "pending"
		}
		if idx, ok := seen[profileID]; ok {
			profiles[idx].RouteCount++
			if profiles[idx].Status == "" || profiles[idx].Status == "inactive" {
				profiles[idx].Status = route.Status
			}
			continue
		}
		if profileID == "pending" {
			seen[profileID] = len(profiles)
			profiles = append(profiles, cloudflareTunnelProfile{
				ID:            "pending",
				Name:          "Provisioning Routes",
				Status:        "creating",
				RouteCount:    1,
				DaemonRunning: false,
			})
		}
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": profiles})
}

func (s *Server) handleDeleteCloudflareTunnelProfile(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	profileID := strings.TrimSpace(r.PathValue("profileId"))
	if profileID == "" || profileID == "pending" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "profile tunnel tidak valid"})
		return
	}
	client, _, err := s.activeCloudflareClient(r)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	routes, err := s.database.ListTunnels(u.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	for _, route := range routes {
		if route.CFTunnelID == profileID {
			_ = s.database.DeleteTunnel(route.ID, u.ID)
		}
	}
	_ = s.cfDaemon.StopTunnel(profileID)
	if err := client.DeleteTunnel(profileID); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleCloudflareTunnelProfileRoutes(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	profileID := r.PathValue("profileId")
	routes, err := s.database.ListTunnels(u.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	type tunnelWithDaemon struct {
		database.Tunnel
		DaemonRunning bool `json:"daemonRunning"`
	}
	result := make([]tunnelWithDaemon, 0)
	for _, route := range routes {
		matches := route.CFTunnelID == profileID || (profileID == "pending" && route.CFTunnelID == "")
		if matches {
			result = append(result, tunnelWithDaemon{Tunnel: route, DaemonRunning: route.CFTunnelID != "" && s.cfDaemon.IsRunning(route.CFTunnelID)})
		}
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": result})
}

// ─── Projects Handlers ────────────────────────────────────────────────────────

type createProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	ProjectType string `json:"projectType"`
	RepoURL     string `json:"repoUrl"`
	WorkingDir  string `json:"workingDir"`
	SPAFallback *bool  `json:"spaFallback"`
}

type projectRuntimeState struct {
	Known       bool   `json:"known"`
	Running     bool   `json:"running"`
	Status      string `json:"status"`
	Drift       bool   `json:"drift"`
	DriftReason string `json:"driftReason,omitempty"`
}

type projectWithRuntime struct {
	database.Project
	Running bool                `json:"running"`
	Runtime projectRuntimeState `json:"runtime"`
}

type projectAttentionSummary struct {
	Total          int64 `json:"total"`
	AttentionCount int64 `json:"attentionCount"`
	DegradedCount  int64 `json:"degradedCount"`
	DriftCount     int64 `json:"driftCount"`
}

func (s *Server) projectWithRuntime(project database.Project) projectWithRuntime {
	snapshot := s.projectManager.SnapshotProject(project)
	if snapshot.Drift {
		s.recordRuntimeLog("warning", "project runtime drift detected", map[string]any{
			"projectId":     project.ID,
			"projectName":   project.Name,
			"desiredStatus": project.Status,
			"runtimeStatus": snapshot.Status,
			"driftReason":   snapshot.DriftReason,
		})
	}
	return projectWithRuntime{
		Project: project,
		Running: snapshot.Running,
		Runtime: projectRuntimeState{
			Known:       snapshot.Known,
			Running:     snapshot.Running,
			Status:      snapshot.Status,
			Drift:       snapshot.Drift,
			DriftReason: snapshot.DriftReason,
		},
	}
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
	result := make([]projectWithRuntime, len(projectList))
	for i, p := range projectList {
		result[i] = s.projectWithRuntime(p)
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"items":  result,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (s *Server) handleProjectAttentionSummary(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	query := querySearch(r)
	includeAll := auth.IsAdmin(u.Role) && r.URL.Query().Get("all") == "1"

	projectList, total, err := s.database.ListProjectsFiltered(u.ID, includeAll, query, 250, 0)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	summary := projectAttentionSummary{Total: total}
	for _, project := range projectList {
		snapshot := s.projectManager.SnapshotProject(project)
		isDegraded := strings.EqualFold(strings.TrimSpace(project.Status), "degraded")
		if isDegraded {
			summary.DegradedCount++
		}
		if snapshot.Drift {
			summary.DriftCount++
		}
		if isDegraded || snapshot.Drift {
			summary.AttentionCount++
		}
	}

	s.writeJSON(w, http.StatusOK, summary)
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
	workingDir, err := prepareProjectWorkingDir(u, slug, req.WorkingDir, req.ProjectType)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, fmt.Errorf("prepare project directory: %w", err))
		return
	}

	spaFallback := true
	if req.SPAFallback != nil {
		spaFallback = *req.SPAFallback
	}
	p, err := s.database.CreateProject(u.ID, req.Name, slug, req.Description, req.ProjectType, req.RepoURL, workingDir, spaFallback, assignedPort)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	log.Printf("[projects] created id=%d name=%q user=%q port=%d", p.ID, p.Name, u.Username, p.AssignedPort)
	s.notifyUserAction(u.ID, "Project dibuat 🚀", fmt.Sprintf("Project '%s' berhasil dibuat pada port %d.", p.Name, p.AssignedPort), "success")
	s.writeJSON(w, http.StatusCreated, p)
}

func prepareProjectWorkingDir(u *database.User, slug, requestedDir, projectType string) (string, error) {
	if u == nil {
		return "", errors.New("user is required")
	}
	osUsername, err := panelosuser.EnsureUser(u.Username, u.DisplayName)
	if err != nil {
		return "", err
	}

	workingDir := strings.TrimSpace(requestedDir)
	if workingDir == "" {
		workingDir = filepath.Join(panelosuser.ResolveHomeDir(u.Username), "project", slug)
	}
	workingDir = filepath.Clean(workingDir)
	if err := os.MkdirAll(workingDir, 0755); err != nil {
		return "", err
	}
	if err := chownPathToUser(workingDir, osUsername); err != nil {
		return "", err
	}

	if strings.EqualFold(strings.TrimSpace(projectType), "static") {
		indexPath := filepath.Join(workingDir, "index.html")
		if _, err := os.Stat(indexPath); errors.Is(err, os.ErrNotExist) {
			content := fmt.Sprintf(`<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>%s</title>
</head>
<body>
  <main>
    <h1>%s</h1>
    <p>Static project siap. Upload file build SPA ke folder ini.</p>
  </main>
</body>
</html>
`, slug, slug)
			if err := os.WriteFile(indexPath, []byte(content), 0644); err != nil {
				return "", err
			}
			if err := chownPathToUser(indexPath, osUsername); err != nil {
				return "", err
			}
		} else if err != nil {
			return "", err
		}
	}

	return workingDir, nil
}

func chownPathToUser(path, osUsername string) error {
	if runtime.GOOS != "linux" || strings.TrimSpace(osUsername) == "" {
		return nil
	}
	account, err := osuserpkg.Lookup(osUsername)
	if err != nil {
		return nil
	}
	uid, err := strconv.Atoi(account.Uid)
	if err != nil {
		return nil
	}
	gid, err := strconv.Atoi(account.Gid)
	if err != nil {
		return nil
	}
	return os.Chown(path, uid, gid)
}

func chownPathRecursiveToUser(path, osUsername string) error {
	if runtime.GOOS != "linux" || strings.TrimSpace(osUsername) == "" {
		return nil
	}
	return filepath.Walk(path, func(current string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		return chownPathToUser(current, osUsername)
	})
}

func clearDirectoryContents(dir string) error {
	cleanDir := filepath.Clean(dir)
	entries, err := os.ReadDir(cleanDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		target := filepath.Join(cleanDir, entry.Name())
		if !pathWithinRoot(target, cleanDir) || filepath.Clean(target) == cleanDir {
			return fmt.Errorf("refusing to remove unsafe path %q", target)
		}
		if err := os.RemoveAll(target); err != nil {
			return err
		}
	}
	return nil
}

func normalizeStaticUploadRoot(projectDir string) error {
	indexPath := filepath.Join(projectDir, "index.html")
	if _, err := os.Stat(indexPath); err == nil {
		return nil
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}

	entries, err := os.ReadDir(projectDir)
	if err != nil {
		return err
	}
	if len(entries) != 1 || !entries[0].IsDir() {
		return nil
	}

	nestedDir := filepath.Join(projectDir, entries[0].Name())
	if _, err := os.Stat(filepath.Join(nestedDir, "index.html")); err != nil {
		return nil
	}
	nestedEntries, err := os.ReadDir(nestedDir)
	if err != nil {
		return err
	}
	for _, entry := range nestedEntries {
		source := filepath.Join(nestedDir, entry.Name())
		target := filepath.Join(projectDir, entry.Name())
		if _, err := os.Stat(target); err == nil {
			return fmt.Errorf("target already exists while flattening upload: %s", entry.Name())
		}
		if err := os.Rename(source, target); err != nil {
			return err
		}
	}
	return os.Remove(nestedDir)
}

func detectStaticUploadSource(tempDir, requestedRoot string) (string, error) {
	cleanRoot := strings.TrimSpace(requestedRoot)
	if cleanRoot != "" {
		source, err := resolveRequestedStaticRoot(tempDir, cleanRoot)
		if err != nil {
			return "", err
		}
		return source, nil
	}

	if _, err := os.Stat(filepath.Join(tempDir, "index.html")); err == nil {
		return tempDir, nil
	}

	candidates, err := findStaticRootCandidates(tempDir)
	if err != nil {
		return "", err
	}
	if len(candidates) > 0 {
		return candidates[0], nil
	}
	return tempDir, nil
}

func resolveRequestedStaticRoot(tempDir, requestedRoot string) (string, error) {
	if filepath.IsAbs(requestedRoot) {
		return "", errors.New("folder root ZIP harus berupa path relatif")
	}
	source := filepath.Clean(filepath.Join(tempDir, filepath.Clean(requestedRoot)))
	if !pathWithinRoot(source, tempDir) {
		return "", errors.New("folder root ZIP tidak aman")
	}
	if info, err := os.Stat(source); err == nil {
		if !info.IsDir() {
			return "", fmt.Errorf("folder root ZIP bukan direktori: %s", requestedRoot)
		}
		if _, err := os.Stat(filepath.Join(source, "index.html")); err != nil {
			return "", fmt.Errorf("folder root ZIP tidak berisi index.html: %s", requestedRoot)
		}
		return source, nil
	}

	var matches []string
	err := filepath.Walk(tempDir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !info.IsDir() || path == tempDir {
			return nil
		}
		rel, err := filepath.Rel(tempDir, path)
		if err != nil {
			return err
		}
		if filepath.ToSlash(rel) == filepath.ToSlash(filepath.Clean(requestedRoot)) || strings.EqualFold(info.Name(), requestedRoot) {
			if _, err := os.Stat(filepath.Join(path, "index.html")); err == nil {
				matches = append(matches, path)
			}
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	if len(matches) > 1 {
		return "", fmt.Errorf("folder root ZIP ambigu, ditemukan %d folder bernama %s", len(matches), requestedRoot)
	}
	return "", fmt.Errorf("folder root ZIP tidak ditemukan atau tidak berisi index.html: %s", requestedRoot)
}

func findStaticRootCandidates(tempDir string) ([]string, error) {
	commonNames := map[string]int{"dist": 0, "build": 1, "out": 2, "public": 3}
	type candidate struct {
		path  string
		score int
		depth int
	}
	var candidates []candidate
	err := filepath.Walk(tempDir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !info.IsDir() {
			return nil
		}
		if _, err := os.Stat(filepath.Join(path, "index.html")); err != nil {
			return nil
		}
		rel, err := filepath.Rel(tempDir, path)
		if err != nil {
			return err
		}
		depth := 0
		if rel != "." {
			depth = len(strings.Split(filepath.ToSlash(rel), "/"))
		}
		score := 100 + depth
		if rank, ok := commonNames[strings.ToLower(info.Name())]; ok {
			score = rank + depth
		}
		candidates = append(candidates, candidate{path: path, score: score, depth: depth})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].score == candidates[j].score {
			return candidates[i].depth < candidates[j].depth
		}
		return candidates[i].score < candidates[j].score
	})
	paths := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		paths = append(paths, candidate.path)
	}
	return paths, nil
}

func copyDirectoryContents(sourceDir, destDir string) error {
	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		source := filepath.Join(sourceDir, entry.Name())
		dest := filepath.Join(destDir, entry.Name())
		if !pathWithinRoot(dest, destDir) {
			return fmt.Errorf("refusing to copy unsafe path %q", dest)
		}
		if err := copyPathRecursive(source, dest); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) handleUploadStaticProject(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)
	id := parsePathID(r, "id")

	project, err := s.database.GetProject(id, u.ID)
	if err != nil || project == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}
	if !strings.EqualFold(strings.TrimSpace(project.ProjectType), "static") {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "upload build hanya tersedia untuk static project"})
		return
	}
	projectDir := filepath.Clean(project.WorkingDir)
	if projectDir == "" || projectDir == "." {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "project belum memiliki working directory"})
		return
	}
	if err := s.ensureFileManagerAccess(r, projectDir); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 512<<20)
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "file upload tidak valid atau terlalu besar"})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "file ZIP harus dikirim"})
		return
	}
	defer file.Close()
	if header == nil || !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "hanya file .zip yang didukung"})
		return
	}

	tempFile, err := os.CreateTemp("", "ypanel-static-upload-*.zip")
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)
	if _, err := io.Copy(tempFile, file); err != nil {
		tempFile.Close()
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := tempFile.Close(); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	tempDir, err := os.MkdirTemp("", "ypanel-static-build-*")
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	defer os.RemoveAll(tempDir)

	if err := extractZip(tempPath, tempDir); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "gagal extract ZIP: " + err.Error()})
		return
	}
	requestedRoot := strings.TrimSpace(r.FormValue("rootDir"))
	sourceDir, err := detectStaticUploadSource(tempDir, requestedRoot)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	if err := os.MkdirAll(projectDir, 0755); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if strings.EqualFold(r.FormValue("clean"), "true") {
		if err := clearDirectoryContents(projectDir); err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
	}
	serveDir := projectDir
	if requestedRoot != "" {
		if err := copyDirectoryContents(tempDir, projectDir); err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		relSource, err := filepath.Rel(tempDir, sourceDir)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		serveDir = filepath.Clean(filepath.Join(projectDir, relSource))
		if !pathWithinRoot(serveDir, projectDir) {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "folder root ZIP tidak aman"})
			return
		}
		if _, err := os.Stat(filepath.Join(serveDir, "index.html")); err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "folder target tidak berisi index.html"})
			return
		}
		updated, err := s.database.UpdateProject(project.ID, project.UserID, project.Name, project.Description, project.ProjectType, project.RepoURL, serveDir, project.SPAFallback)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		project = updated
	} else {
		if err := copyDirectoryContents(sourceDir, projectDir); err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
	}
	osUsername := panelosuser.MappedUsername(u.Username)
	if err := chownPathRecursiveToUser(projectDir, osUsername); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	s.auditFileAction(r, "project.static_upload", "success", map[string]any{"projectId": project.ID, "dest": projectDir, "serveDir": serveDir, "file": header.Filename})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "project": project, "workingDir": serveDir})
}

func (s *Server) handleGetProject(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	p, err := s.database.GetProject(id, u.ID)
	if err != nil || p == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}
	s.writeJSON(w, http.StatusOK, s.projectWithRuntime(*p))
}

func (s *Server) handleUpdateProject(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)
	id := parsePathID(r, "id")

	existing, err := s.database.GetProject(id, u.ID)
	if err != nil || existing == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}

	var req createProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "name is required"})
		return
	}

	projectType := strings.TrimSpace(req.ProjectType)
	if projectType == "" {
		projectType = existing.ProjectType
	}
	workingDir, err := prepareProjectWorkingDir(u, existing.Slug, req.WorkingDir, projectType)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, fmt.Errorf("prepare project directory: %w", err))
		return
	}

	spaFallback := existing.SPAFallback
	if req.SPAFallback != nil {
		spaFallback = *req.SPAFallback
	}
	p, err := s.database.UpdateProject(id, u.ID, req.Name, req.Description, projectType, req.RepoURL, workingDir, spaFallback)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	log.Printf("[projects] updated id=%d name=%q user=%q", p.ID, p.Name, u.Username)
	s.notifyUserAction(u.ID, "Project diperbarui", fmt.Sprintf("Project '%s' berhasil diperbarui.", p.Name), "success")
	s.writeJSON(w, http.StatusOK, s.projectWithRuntime(*p))
}

func (s *Server) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	p, err := s.database.GetProject(id, u.ID)
	if err != nil || p == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}
	_ = s.projectManager.StopProject(*p)
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
	p.Status = "active"
	s.notifyUserAction(u.ID, "Project berjalan ▶️", fmt.Sprintf("Project '%s' berhasil dijalankan.", p.Name), "success")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "status": "active", "project": s.projectWithRuntime(*p)})
}

func (s *Server) handleStopProject(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	existing, _ := s.database.GetProject(id, u.ID)
	if existing == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}
	if err := s.projectManager.StopProject(*existing); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	_ = s.database.UpdateProjectStatus(id, "stopped")
	existing.Status = "stopped"
	s.notifyUserAction(u.ID, "Project dihentikan ⏸️", fmt.Sprintf("Project '%s' berhasil dihentikan.", existing.Name), "info")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "status": "stopped", "project": s.projectWithRuntime(*existing)})
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
	ProfileID string `json:"profileId"`
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

	if req.ProjectID != nil {
		project, err := s.database.GetProject(*req.ProjectID, u.ID)
		if err != nil || project == nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "project target not found"})
			return
		}
		if project.AssignedPort <= 0 {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "project has no assigned port"})
			return
		}
		req.Protocol = "http"
		req.IP = "localhost"
		req.Port = fmt.Sprint(project.AssignedPort)
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
		s.writeCloudflareDecryptError(w, "", err)
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

		mainTunnelID := strings.TrimSpace(req.ProfileID)
		if mainTunnelID == "pending" {
			mainTunnelID = ""
		}
		for _, r := range allRoutes {
			if mainTunnelID != "" {
				break
			}
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
		s.writeCloudflareDecryptError(w, "", err)
		return
	}

	if req.ProjectID != nil {
		project, err := s.database.GetProject(*req.ProjectID, u.ID)
		if err != nil || project == nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "project target not found"})
			return
		}
		if project.AssignedPort <= 0 {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "project has no assigned port"})
			return
		}
		req.Protocol = "http"
		req.IP = "localhost"
		req.Port = fmt.Sprint(project.AssignedPort)
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
				log.Printf("[cloudflare] background decrypt failed — key may have changed: %v", err)
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
	doc, _ := s.database.GetDocByID(id, true)
	docTitle := "Artikel tersebut"
	if doc != nil && strings.TrimSpace(doc.Title) != "" {
		docTitle = fmt.Sprintf("Artikel '%s'", doc.Title)
	}
	if err := s.database.DeleteDoc(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.notifyUserAction(u.ID, "Dokumentasi dihapus 🗑️", fmt.Sprintf("%s berhasil dihapus.", docTitle), "warning")
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
