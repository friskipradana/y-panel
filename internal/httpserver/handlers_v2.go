package httpserver

import (
	"context"
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
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	panelosuser "github.com/friskipradana/panel-desktop-ui/internal/osuser"
	"github.com/friskipradana/panel-desktop-ui/internal/projects"
	"github.com/friskipradana/panel-desktop-ui/internal/userdb"
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

// requireAuthV2 validates the session cookie OR a Bearer API token and injects the User into context.
func (s *Server) requireAuthV2(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try Bearer API token or query parameter (?key=... / ?token=...)
		rawToken := ""
		if authHeader := strings.TrimSpace(r.Header.Get("Authorization")); strings.HasPrefix(authHeader, "Bearer ") {
			rawToken = strings.TrimPrefix(authHeader, "Bearer ")
		} else if qKey := strings.TrimSpace(r.URL.Query().Get("key")); qKey != "" {
			rawToken = qKey
		} else if qToken := strings.TrimSpace(r.URL.Query().Get("token")); qToken != "" {
			rawToken = qToken
		}

		if rawToken != "" && strings.HasPrefix(rawToken, "ypat_") {
			tokenHash := hashAPIToken(rawToken)
			u, _, ok := s.database.GetAPITokenUser(tokenHash)
			if !ok || u == nil {
				s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "invalid or expired API token"})
				return
			}
			if !s.userMayUseHost(r, u.ID) {
				s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "this address belongs to another account"})
				return
			}
			if !s.guardDemo(w, r, u) {
				return
			}
			ctx := context.WithValue(r.Context(), ctxUser, u)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}
		// Fall back to session cookie
		cookie, err := requestSessionCookie(r)
		if err != nil {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
			return
		}
		u, ok := s.auth.Validate(cookie.Value)
		if !ok || u == nil {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
			return
		}
		if !s.userMayUseHost(r, u.ID) {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "this address belongs to another account"})
			return
		}
		// an account that got its password from an admin can do nothing but choose its own
		if !passwordGateAllows(r.URL.Path) && s.database.MustChangePassword(u.ID) {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "choose a new password first", "code": "password_change_required"})
			return
		}
		if !s.guardDemo(w, r, u) {
			return
		}
		ctx := context.WithValue(r.Context(), ctxUser, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// passwordGateAllows lists what an account may still reach before it has chosen its own password
func passwordGateAllows(path string) bool {
	switch path {
	case "/api/v1/me", "/api/v1/me/password", "/api/v1/auth/logout":
		return true
	}
	return false
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
	http.SetCookie(w, &http.Cookie{Name: legacySessionCookieName, Value: "", Path: "/", HttpOnly: true, MaxAge: -1, Expires: time.Unix(0, 0)})
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

	// repeated failures for one account name stop here, whatever address they come from
	if blocked, wait := loginFailures.blocked(req.Username); blocked {
		w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		s.notify.LoginLocked(req.Username)
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many failed sign-ins for this account, try again later"})
		return
	}

	token, u, err := s.auth.Login(
		strings.TrimSpace(req.Username),
		req.Password,
		clientIP(r),
		r.UserAgent(),
	)
	if err != nil {
		if !errors.Is(err, auth.ErrUserSuspended) && !errors.Is(err, auth.ErrUserPending) {
			loginFailures.fail(req.Username)
			s.notify.LoginFailed(req.Username, clientIP(r))
		}
		switch {
		case errors.Is(err, auth.ErrUserSuspended):
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "account suspended"})
		case errors.Is(err, auth.ErrUserPending):
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "account waiting for payment"})
		default:
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "invalid credentials"})
		}
		log.Printf("[auth] login failed username=%q remote=%s", req.Username, remoteAddr(r))
		return
	}

	// on the address of a buyer's panel only that buyer can sign in; the answer is the same as for a wrong password
	if !s.userMayUseHost(r, u.ID) {
		s.auth.Logout(token)
		loginFailures.fail(req.Username)
		s.notify.LoginFailed(req.Username, clientIP(r))
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "invalid credentials"})
		log.Printf("[auth] login refused user=%q: not the owner of host %q remote=%s", u.Username, r.Host, remoteAddr(r))
		return
	}

	loginFailures.clear(req.Username)
	s.issueSessionCookie(w, token)
	// a sign-in from a device the account has not used before is told to its owner
	go s.notify.SignedIn(u.ID, u.Username, clientIP(r), r.UserAgent())

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

	role := u.Role
	if s.isDemoUser(u) {
		role = "demo"
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"id":                 u.ID,
		"username":           u.Username,
		"email":              u.Email,
		"role":               role,
		"status":             u.Status,
		"displayName":        u.DisplayName,
		"avatarUrl":          u.AvatarURL,
		"createdAt":          u.CreatedAt,
		"lastLoginAt":        u.LastLoginAt,
		"cloudflareStatus":   cfStatus,
		"mustChangePassword": s.database.MustChangePassword(u.ID),
	})
}

// ─── User Management Handlers ─────────────────────────────────────────────────

type createUserRequest struct {
	Username    string `json:"username"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	Role        string `json:"role"`
	DisplayName string `json:"displayName"`
	// ForcePasswordChange (default true) makes the account choose its own password at the first sign-in
	ForcePasswordChange *bool `json:"forcePasswordChange"`
	// PlanID and Months put the new account on a plan right away (superadmin, hosting mode on)
	PlanID *int64 `json:"planId"`
	Months *int   `json:"months"`
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	limit, offset, err := parseLimitOffset(r, 12, 100)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	actor := userFromCtx(r)
	// plans belong to the superadmin and only exist while hosting mode is on
	hosting := actor != nil && actor.Role == auth.SuperadminRole && s.hostingEnabled()
	site := s.loadSiteSettings()
	q := r.URL.Query()
	opts := database.UserListOptions{
		Query:     querySearch(r),
		Status:    q.Get("status"),
		Limit:     limit,
		Offset:    offset,
		GraceDays: site.GraceDays,
	}
	switch role := q.Get("role"); role {
	case auth.SuperadminRole, auth.AdminRole, auth.UserRole:
		opts.Role = role
	}
	if hosting {
		opts.Plan = q.Get("plan")
		opts.PlanState = q.Get("planState")
	}
	if scope := s.ownerScopeFor(actor); !scope.all {
		opts.IDs = scope.list()
	}
	userList, total, err := s.database.ListUsersAdvanced(opts)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	// each account carries the account that manages it, so the UI can show and change the hierarchy
	ids := make([]int64, 0, len(userList))
	for _, u := range userList {
		ids = append(ids, u.ID)
	}
	parents, _ := s.database.UserParentIDs(ids)
	var info map[int64]database.UserHosting
	if hosting {
		info, _ = s.database.UserHostingInfo(ids)
	}
	type userRow struct {
		database.User
		ParentID *int64           `json:"parentId"`
		Hosting  *userHostingView `json:"hosting,omitempty"`
	}
	now := time.Now()
	items := make([]userRow, 0, len(userList))
	for _, u := range userList {
		item := userRow{User: u}
		if p, ok := parents[u.ID]; ok {
			parent := p
			item.ParentID = &parent
		}
		if hosting && u.Role != auth.SuperadminRole {
			view := hostingViewFor(info[u.ID], site.GraceDays, now)
			item.Hosting = &view
		}
		items = append(items, item)
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items, "total": total, "limit": limit, "offset": offset})
}

// handleUsersSummary counts the accounts of the caller's scope for the strip above the list
func (s *Server) handleUsersSummary(w http.ResponseWriter, r *http.Request) {
	actor := userFromCtx(r)
	hosting := actor != nil && actor.Role == auth.SuperadminRole && s.hostingEnabled()
	var ids []int64
	if scope := s.ownerScopeFor(actor); !scope.all {
		ids = scope.list()
	}
	summary, err := s.database.UserSummaryFor(ids, s.loadSiteSettings().GraceDays, time.Now())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if !hosting {
		// without hosting mode (or for an admin) there are no plans to count
		summary.NoPlan, summary.PlanActive, summary.Grace, summary.Expired, summary.Expiring = 0, 0, 0, 0, 0
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"summary": summary, "hosting": hosting})
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
	if req.Role == "" {
		req.Role = "user"
	}
	if actor := userFromCtx(r); actor != nil {
		if err := users.CanAssignRole(actor.Role, req.Role); err != nil {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
			return
		}
	}
	// a plan is checked before the account exists, so a bad plan never leaves a half-made account
	var plan *database.HostingPlan
	var planEndsAt *time.Time
	if req.PlanID != nil {
		actor := userFromCtx(r)
		if actor == nil || actor.Role != auth.SuperadminRole {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "only the superadmin can give a plan"})
			return
		}
		if !s.requireHostingMode(w) {
			return
		}
		if req.Role == auth.SuperadminRole {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "the superadmin account does not take a plan"})
			return
		}
		plan, _ = s.database.GetHostingPlan(*req.PlanID)
		if plan == nil {
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "plan not found"})
			return
		}
		ends, planErr := planEnd(plan, nil, nil, req.Months, time.Now())
		if planErr != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": planErr.Error()})
			return
		}
		planEndsAt = ends
	}
	u, err := s.auth.CreateUser(req.Username, req.Email, req.Password, req.Role, req.DisplayName)
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	if plan != nil {
		if err := s.applyUserPlan(u.ID, plan, planEndsAt); err != nil {
			log.Printf("[hosting] new account %q created but the plan was not applied: %v", u.Username, err)
		}
	}
	if req.ForcePasswordChange == nil || *req.ForcePasswordChange {
		if err := s.database.SetMustChangePassword(u.ID, true); err != nil {
			log.Printf("[users] could not require a password change for %q: %v", u.Username, err)
		}
	}
	if creator := userFromCtx(r); creator != nil {
		// the account is managed by whoever created it
		_ = s.database.SetUserParent(u.ID, creator.ID)
	}
	actor := userFromCtx(r)
	actorName := "system"
	if actor != nil {
		actorName = actor.Username
		s.notifyUserAction(actor.ID, "Akun baru dibuat", fmt.Sprintf("Akun '%s' dibuat dengan role %s.", u.Username, u.Role), "success")
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
	actor := userFromCtx(r)
	target, _ := s.database.GetUserByID(id)
	if target == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}
	fields, err := s.vetUserFields(actor, target, fields)
	if err != nil {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
		return
	}
	if err := s.database.UpdateUser(id, fields); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	u, _ := s.database.GetUserByID(id)
	// a changed role or status must not leave a shell open that the new one would not allow
	if _, roleChanged := fields["role"]; roleChanged {
		s.terminalManager.CloseOwned(id)
	} else if status, ok := fields["status"].(string); ok && status != "active" {
		s.terminalManager.CloseOwned(id)
	}
	if u != nil {
		s.notifyCurrentUserAction(r, "Akun diperbarui", fmt.Sprintf("Perubahan pada akun '%s' disimpan.", u.Username), "info")
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

	if actor != nil {
		if err := users.CanManage(actor.ID, actor.Role, targetUser, false); err != nil {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
			return
		}
	}
	s.stopUserWorkloads(targetUser.ID)
	s.stopUserDatabases(targetUser.ID, true)
	_ = s.database.DeleteUserSessions(targetUser.ID)
	// the DNS records of their subdomains must go before the rows do
	s.releaseUserSubdomains(targetUser.ID)
	s.releaseUserCustomDomains(targetUser.ID)
	// the WhatsApp session lives in WAHA, outside the database, so it goes before the row does
	s.forgetUserWhatsApp(targetUser.ID)
	if err := s.database.DeleteUser(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	go s.syncHostingRoutes()
	if actor != nil {
		s.auditSensitiveAction(r, actor, "user.delete", "ok", map[string]any{"target": targetUser.Username})
		s.notifyUserAction(actor.ID, "Akun dihapus", fmt.Sprintf("Akun '%s' dihapus beserta datanya.", targetUser.Username), "warning")
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
	if actor := userFromCtx(r); actor != nil {
		if err := users.CanManage(actor.ID, actor.Role, targetUser, false); err != nil {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
			return
		}
		s.auditSensitiveAction(r, actor, "user.suspend", "ok", map[string]any{"target": targetUser.Username})
	}
	if err := users.SuspendUser(s.database, id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	// A suspended account must stop serving: sign it out and halt its projects and tunnels
	_ = s.database.DeleteUserSessions(id)
	s.stopUserWorkloads(id)
	go s.syncHostingRoutes()
	s.notifyCurrentUserAction(r, "Akun ditangguhkan", fmt.Sprintf("Akun '%s' ditangguhkan: tidak bisa masuk sampai diaktifkan lagi.", targetUser.Username), "warning")
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
	go s.syncHostingRoutes()
	s.notifyCurrentUserAction(r, "Akun diaktifkan lagi", fmt.Sprintf("Akun '%s' bisa masuk lagi.", targetUser.Username), "success")
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
	// Partial update: fields that are not sent keep their stored value
	q, err := s.database.GetUserQuota(id)
	if err != nil || q == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}
	var patch struct {
		MaxProjects   *int   `json:"maxProjects"`
		MaxTunnels    *int   `json:"maxTunnels"`
		MaxDatabases  *int   `json:"maxDatabases"`
		DiskQuotaMB   *int64 `json:"diskQuotaMb"`
		CPULimitPct   *int   `json:"cpuLimitPct"`
		MemoryLimitMB *int   `json:"memoryLimitMb"`
	}
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if patch.MaxProjects != nil {
		q.MaxProjects = *patch.MaxProjects
	}
	if patch.MaxTunnels != nil {
		q.MaxTunnels = *patch.MaxTunnels
	}
	if patch.MaxDatabases != nil {
		q.MaxDatabases = *patch.MaxDatabases
	}
	if patch.DiskQuotaMB != nil {
		q.DiskQuotaMB = *patch.DiskQuotaMB
	}
	if patch.CPULimitPct != nil {
		q.CPULimitPct = *patch.CPULimitPct
	}
	if patch.MemoryLimitMB != nil {
		q.MemoryLimitMB = *patch.MemoryLimitMB
	}
	if err := users.ValidateQuota(*q); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	q.UserID = id
	if err := s.database.UpdateUserQuota(*q); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	targetUser, _ := s.database.GetUserByID(id)
	targetName := "user tersebut"
	if targetUser != nil {
		targetName = fmt.Sprintf("user '%s'", targetUser.Username)
	}
	s.notifyCurrentUserAction(r, "Kuota akun diperbarui", fmt.Sprintf("Kuota untuk %s diperbarui.", targetName), "info")
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
	s.notifyUserAction(u.ID, "Konfigurasi Cloudflare disimpan", "Token Cloudflare disimpan. Verifikasi dulu sebelum dipakai.", "info")
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
	perm := client.VerifyTokenPermissions()
	status := "active"
	if !perm.Valid {
		status = "invalid"
		_ = s.database.UpsertCFConfig(u.ID, cfg.APITokenEncrypted, cfg.AccountID, cfg.ZoneID, cfg.BaseDomain, status)
		s.notifyUserAction(u.ID, "Verifikasi Cloudflare gagal", perm.Summary, "warning")
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"valid":   false,
			"status":  status,
			"error":   perm.Summary,
			"details": perm,
		})
		return
	}
	_ = s.database.UpsertCFConfig(u.ID, cfg.APITokenEncrypted, cfg.AccountID, cfg.ZoneID, cfg.BaseDomain, status)
	s.notifyUserAction(u.ID, "Cloudflare terhubung", perm.Summary, "success")
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"valid":   true,
		"status":  status,
		"message": perm.Summary,
		"details": perm,
	})
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
	s.notifyUserAction(u.ID, "Konfigurasi Cloudflare dihapus", "Token Cloudflare dihapus dari akun Anda. Tunnel yang sudah ada tidak terpengaruh.", "warning")
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
	s.writeJSON(w, http.StatusOK, tableResponse(records, dnsSpec(), r.URL.Query()))
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
	result := make([]tunnelRow, 0)
	for _, route := range routes {
		matches := route.CFTunnelID == profileID || (profileID == "pending" && route.CFTunnelID == "")
		if matches {
			result = append(result, tunnelRow{Tunnel: route, DaemonRunning: route.CFTunnelID != "" && s.cfDaemon.IsRunning(route.CFTunnelID)})
		}
	}
	s.writeJSON(w, http.StatusOK, tableResponse(result, routeSpec(), r.URL.Query()))
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

// driftLogged remembers when a project's drift was last written to the runtime log
var (
	driftLoggedMu sync.Mutex
	driftLogged   = map[string]time.Time{}
)

const driftLogEvery = 10 * time.Minute

// shouldLogDrift is true the first time a drift (project and reason) is seen, then once per driftLogEvery
func shouldLogDrift(projectID int64, reason string, now time.Time) bool {
	key := fmt.Sprintf("%d|%s", projectID, reason)
	driftLoggedMu.Lock()
	defer driftLoggedMu.Unlock()
	if last, ok := driftLogged[key]; ok && now.Sub(last) < driftLogEvery {
		return false
	}
	driftLogged[key] = now
	return true
}

func (s *Server) projectWithRuntime(project database.Project) projectWithRuntime {
	snapshot := s.projectManager.SnapshotProject(project)
	if snapshot.Drift && shouldLogDrift(project.ID, snapshot.DriftReason, time.Now()) {
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
	includeAll := auth.IsAdmin(u.Role) && r.URL.Query().Get("all") == "1"

	// the state of a project is known only with its runtime, so the whole list is read; the search, the column
	// filters and the order are then applied to it, and only the page asked for is sent
	projectList, _, err := s.listProjectsScoped(u, includeAll, "", projectScanLimit, 0)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	all := make([]projectWithRuntime, len(projectList))
	for i, p := range projectList {
		all[i] = s.projectWithRuntime(p)
	}
	res := tableResponse(all, projectSpec(), r.URL.Query())
	if offset > res.Total {
		offset = res.Total
	}
	end := offset + limit
	if end > res.Total {
		end = res.Total
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"items":  res.Items[offset:end],
		"total":  res.Total,
		"all":    res.All,
		"limit":  limit,
		"offset": offset,
		"facets": res.Facets,
	})
}

func (s *Server) handleProjectAttentionSummary(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	query := querySearch(r)
	includeAll := auth.IsAdmin(u.Role) && r.URL.Query().Get("all") == "1"

	projectList, total, err := s.listProjectsScoped(u, includeAll, query, 250, 0)
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

	req.ProjectType = strings.ToLower(strings.TrimSpace(req.ProjectType))
	if err := validateProjectType(req.ProjectType); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	slug := slugify(req.Name)
	existing, _ := s.database.ListProjects(u.ID)
	for _, other := range existing {
		if other.Slug == slug {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "a project with this name already exists"})
			return
		}
	}
	assignedPort, err := s.allocateProjectPort(u.ID)
	if err != nil {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
		return
	}
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
	s.notifyUserAction(u.ID, "Project dibuat", fmt.Sprintf("Project '%s' dibuat di port %d.", p.Name, p.AssignedPort), "success")
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
	// the panel chowns this directory to the user, so it has to stay inside their home
	resolvedDir, inHome, err := projects.ResolveWorkingDir(filepath.Clean(workingDir), panelosuser.ResolveHomeDir(u.Username), u.Role == "superadmin")
	if err != nil {
		return "", err
	}
	workingDir = resolvedDir
	if err := os.MkdirAll(workingDir, 0755); err != nil {
		return "", err
	}
	if inHome {
		if err := chownPathToUser(workingDir, osUsername); err != nil {
			return "", err
		}
	}

	if strings.EqualFold(strings.TrimSpace(projectType), "static") {
		indexPath := filepath.Join(workingDir, "index.html")
		// Lstat: a dangling symlink here must not be followed by the write below
		if _, err := os.Lstat(indexPath); errors.Is(err, os.ErrNotExist) {
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
			if inHome {
				if err := chownPathToUser(indexPath, osUsername); err != nil {
					return "", err
				}
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
	return os.Lchown(path, uid, gid)
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
	projectDir, _, dirErr := projects.ResolveWorkingDir(filepath.Clean(project.WorkingDir), panelosuser.ResolveHomeDir(u.Username), u.Role == "superadmin")
	if dirErr != nil {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": dirErr.Error()})
		return
	}
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

	tempFile, err := os.CreateTemp("", "reneo-static-upload-*.zip")
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

	// unpacked beside the project, so putting it in place is a rename and not a long copy
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	stageDir, err := os.MkdirTemp(filepath.Dir(projectDir), ".reneo-upload-*")
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	defer os.RemoveAll(stageDir)

	if err := extractProjectZip(tempPath, stageDir); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "gagal extract ZIP: " + err.Error()})
		return
	}
	sourceDir, err := detectStaticUploadSource(stageDir, strings.TrimSpace(r.FormValue("rootDir")))
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if _, err := os.Stat(filepath.Join(sourceDir, "index.html")); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ZIP tidak berisi index.html; isi folder root jika build ada di dalam folder"})
		return
	}
	osUsername := panelosuser.MappedUsername(u.Username)
	if err := chownTreeNoFollow(stageDir, osUsername); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	// a clean upload swaps entries one by one, so the site is never empty in between
	place := mergeTree
	if strings.EqualFold(r.FormValue("clean"), "true") {
		place = replaceTree
	}
	if err := place(sourceDir, projectDir); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := chownTreeNoFollow(projectDir, osUsername); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	s.auditFileAction(r, "project.static_upload", "success", map[string]any{"projectId": project.ID, "dest": projectDir, "file": header.Filename})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "project": project, "workingDir": projectDir})
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
	projectType = strings.ToLower(projectType)
	if projectType != existing.ProjectType {
		if err := validateProjectType(projectType); err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
			return
		}
	}
	if strings.TrimSpace(req.WorkingDir) == "" {
		req.WorkingDir = existing.WorkingDir
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
	// what runs must match what is saved: a changed folder, type, script or SPA setting needs a new process
	if existing.WorkingDir != p.WorkingDir || existing.ProjectType != p.ProjectType || existing.RepoURL != p.RepoURL || existing.SPAFallback != p.SPAFallback {
		if status, restartErr := s.restartProject(u, existing, p); restartErr != nil {
			log.Printf("[projects] restart after update failed id=%d: %v", p.ID, restartErr)
		} else if status != "" {
			p.Status = status
		}
	}
	log.Printf("[projects] updated id=%d name=%q user=%q", p.ID, p.Name, u.Username)
	s.notifyUserAction(u.ID, "Project diperbarui", fmt.Sprintf("Project '%s' diperbarui.", p.Name), "success")
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
	s.projectManager.RemoveLog(p.ID)
	log.Printf("[projects] deleted id=%d user=%q", id, u.Username)
	s.notifyUserAction(u.ID, "Project dihapus", fmt.Sprintf("Project '%s' dihapus dari panel. Berkas di foldernya tidak ikut dihapus.", p.Name), "warning")
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
	if !projects.Runnable(p.ProjectType) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "tipe project ini tidak dijalankan sebagai proses"})
		return
	}
	// active only once the project accepts connections; one still installing or building says so
	ready, err := s.projectManager.StartAndWait(u, p, projectStartWait)
	if err != nil {
		_ = s.database.UpdateProjectStatus(id, "error")
		s.notifyUserAction(u.ID, "Project gagal dijalankan", fmt.Sprintf("Project '%s' gagal dijalankan: %s", p.Name, err.Error()), "warning")
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	if !ready {
		_ = s.database.UpdateProjectStatus(id, "building")
		p.Status = "building"
		s.notifyUserAction(u.ID, "Project sedang dimulai", fmt.Sprintf("Project '%s' belum membuka port. Pantau log project.", p.Name), "info")
		s.writeJSON(w, http.StatusAccepted, jsonResponse{"ok": true, "status": "building", "project": s.projectWithRuntime(*p)})
		return
	}
	_ = s.database.UpdateProjectStatus(id, "active")
	p.Status = "active"
	s.notifyUserAction(u.ID, "Project berjalan", fmt.Sprintf("Project '%s' berjalan.", p.Name), "success")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "status": "active", "project": s.projectWithRuntime(*p)})
}

// projectStartWait is how long a start waits for the project to open its port
const projectStartWait = 30 * time.Second

// restartProject starts a running project again after its settings changed, so the running
// process matches what is saved. A project that is not running is left alone.
func (s *Server) restartProject(u *database.User, before, after *database.Project) (string, error) {
	if !s.projectManager.SnapshotProject(*before).Running {
		return "", nil
	}
	if err := s.projectManager.StopProject(*before); err != nil {
		return "", err
	}
	ready, err := s.projectManager.StartAndWait(u, after, projectStartWait)
	status := "active"
	switch {
	case err != nil:
		status = "error"
	case !ready:
		status = "building"
	}
	_ = s.database.UpdateProjectStatus(after.ID, status)
	return status, err
}

func (s *Server) handleProjectLogs(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	p, err := s.database.GetProject(id, u.ID)
	if err != nil || p == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}
	lines := 300
	if raw := r.URL.Query().Get("lines"); raw != "" {
		if n, convErr := strconv.Atoi(raw); convErr == nil && n > 0 && n <= 2000 {
			lines = n
		}
	}
	out, err := s.projectManager.ReadLog(p.ID, lines)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"lines": out})
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
	s.notifyUserAction(u.ID, "Project dihentikan", fmt.Sprintf("Project '%s' dihentikan.", existing.Name), "info")
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
				s.notifyUserAction(userID, "Tunnel gagal dibuat", fmt.Sprintf("Tunnel '%s' gagal dibuat: %s", name, cfErr.Error()), "warning")
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
			s.notifyUserAction(userID, "Daemon tunnel bermasalah", fmt.Sprintf("Tunnel '%s' dibuat, tetapi daemon-nya gagal berjalan: %s", name, daemonErr.Error()), "warning")
		}

		_ = s.database.UpdateTunnelCF(tunnelDBID, mainTunnelID, hostname, reqZoneID, "active")
		log.Printf("[tunnels] tunnel active db_id=%d cf_id=%s hostname=%s", tunnelDBID, mainTunnelID, hostname)
		s.notifyUserAction(userID, "Rute tunnel dibuat", "Rute '"+name+"' dibuat.", "success")
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

	s.notifyUserAction(u.ID, "Rute tunnel diperbarui", fmt.Sprintf("Rute '%s' diperbarui.", req.Name), "info")
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

	s.notifyUserAction(u.ID, "Rute tunnel dihapus", fmt.Sprintf("Rute '%s' dihapus.", t.Name), "warning")
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
	Title    string `json:"title"`
	Slug     string `json:"slug"`
	Excerpt  string `json:"excerpt"`
	Content  string `json:"content"`
	Status   string `json:"status"`
	IsPublic bool   `json:"isPublic"`
}

const maxDocContentBytes = 200 << 10

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
	if len(req.Content) > maxDocContentBytes {
		return fmt.Errorf("content is too long (max %d KB)", maxDocContentBytes>>10)
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
	doc, err := s.database.CreateDoc(&u.ID, req.Title, req.Slug, req.Excerpt, req.Content, req.Status, req.IsPublic)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "an article with this slug already exists"})
			return
		}
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.notifyUserAction(u.ID, "Artikel dibuat", fmt.Sprintf("Artikel '%s' dibuat.", doc.Title), "success")
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
	doc, err := s.database.UpdateDoc(id, req.Title, req.Slug, req.Excerpt, req.Content, req.Status, req.IsPublic)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "an article with this slug already exists"})
			return
		}
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if doc == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "doc not found"})
		return
	}
	s.notifyUserAction(u.ID, "Artikel diperbarui", fmt.Sprintf("Artikel '%s' diperbarui.", doc.Title), "info")
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
	s.notifyUserAction(u.ID, "Artikel dihapus", fmt.Sprintf("%s dihapus.", docTitle), "warning")
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

// runnableProjectTypes are the types the agent can start as a process. "docker" and
// "proxy" rows only exist from older versions: containers belong in the Docker
// window and public routes in Cloudflare tunnels.
var runnableProjectTypes = map[string]bool{"static": true, "nodejs": true, "python": true, "php": true, "custom": true}

func validateProjectType(projectType string) error {
	if runnableProjectTypes[projectType] {
		return nil
	}
	switch projectType {
	case "docker":
		return errors.New("container workloads are created from the Docker window, not as a project")
	case "proxy":
		return errors.New("public routes to existing services are created from Cloudflare tunnels, not as a project")
	case "":
		return errors.New("project type is required")
	}
	return fmt.Errorf("unsupported project type %q (use static, nodejs, python, php or custom)", projectType)
}

// allocateProjectPort gives a project the first free port of its owner's block. A port that a
// project, a database or a container holds, or that something on the host listens on, is never given.
// An owner whose block is full takes the first free port of the whole project range.
func (s *Server) allocateProjectPort(userID int64) (int, error) {
	start := projects.AllocatePort(userID, 0)
	if port, err := s.freePort(start, start+projects.PortBlock-1, nil); err == nil {
		return port, nil
	}
	port, err := s.freePort(projects.PortBase, 65535, func(p int) bool { return p >= userdb.PortStart && p <= userdb.PortEnd })
	if err != nil {
		return 0, errors.New("no free port left for projects")
	}
	return port, nil
}
