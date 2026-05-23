package httpserver

import (
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/gorilla/websocket"
)

// ─── Middleware ──────────────────────────────────────────────────────────────

// requireAuth is a legacy alias for requireAuthV2.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return s.requireAuthV2(next)
}

// currentUser returns the username from the session cookie, if authenticated.
func (s *Server) currentUser(r *http.Request) (string, bool) {
	u := s.currentUserRecord(r)
	if u == nil {
		return "", false
	}
	return u.Username, true
}

// currentUserRecord returns the full User record from the session cookie.
func (s *Server) currentUserRecord(r *http.Request) *database.User {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return nil
	}
	u, ok := s.auth.Validate(cookie.Value)
	if !ok || u == nil {
		return nil
	}
	return u
}

// requireHTMLAuth is a legacy alias for requireHTMLAuthV2.
func (s *Server) requireHTMLAuth(next http.Handler) http.Handler {
	return s.requireHTMLAuthV2(next)
}

// requireHTMLAuthV2 protects HTML page routes by redirecting unauthenticated
// users to /login.
func (s *Server) requireHTMLAuthV2(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasPrefix(path, "/api/") || path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}

		if strings.HasPrefix(path, "/assets/") || path == "/favicon.ico" || path == "/favicon.svg" || path == "/icons.svg" || strings.HasPrefix(path, "/ChatGPT Image ") {
			next.ServeHTTP(w, r)
			return
		}

		_, authed := s.currentUser(r)
		if !authed && path != "/" && path != "/login" {
			if acceptsHTML(r) {
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if authed && path == "/login" {
			http.Redirect(w, r, "/home", http.StatusFound)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// ServeHTTP applies the middleware chain: access log → host guard → CORS → rate limit → mux.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.withAccessLog(s.withHostGuard(s.withCORS(s.withRateLimit(s.mux)))).ServeHTTP(w, r)
}

// ─── CORS ───────────────────────────────────────────────────────────────────

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
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		if strings.HasPrefix(r.URL.Path, "/assets/") || r.URL.Path == "/favicon.ico" || r.URL.Path == "/favicon.svg" || r.URL.Path == "/icons.svg" || strings.HasPrefix(r.URL.Path, "/ChatGPT Image ") {
			next.ServeHTTP(w, r)
			return
		}

		requestOrigin := effectiveRequestOrigin(r)
		if requestOrigin != "" && !s.isOriginAllowed(requestOrigin) {
			s.writeStatusPage(w, r, http.StatusForbidden, "Origin not allowed", "Alamat origin aktif dari request ini belum diizinkan oleh runtime panel.", "Tambahkan origin yang sedang Anda akses ke allowed origins, atau gunakan URL panel yang memang masih aktif di konfigurasi runtime.", false)
			return
		}

		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" && !s.isOriginAllowed(origin) {
			s.writeStatusPage(w, r, http.StatusForbidden, "Origin not allowed", "Permintaan ini datang dari origin yang belum diizinkan oleh runtime panel.", "Tambahkan origin ini di pengaturan panel, lalu restart atau simpan ulang konfigurasi runtime agar allowlist aktif tersinkron penuh.", false)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// ─── Host Guard ─────────────────────────────────────────────────────────────

func (s *Server) withHostGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.isHostAllowed(r.Host) {
			if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" {
				http.Error(w, "host not allowed", http.StatusForbidden)
				return
			}
			s.writeStatusPage(w, r, http.StatusForbidden, "Host not allowed", "Alamat host yang Anda gunakan belum diizinkan oleh runtime panel.", "Tambahkan host atau IP ini ke allowed hosts atau allowed origins pada pengaturan runtime, lalu simpan agar service memuat konfigurasi baru.", false)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) isHostAllowed(hostport string) bool {
	host := normalizeHost(hostport)
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}
	if host == "" {
		return false
	}
	hosts := s.allowedHosts()
	origins := s.allowedOrigins()
	if len(hosts) == 0 && len(origins) == 0 {
		return true
	}

	for _, candidate := range hosts {
		if strings.EqualFold(host, normalizeHost(candidate)) {
			return true
		}
	}
	for _, candidate := range origins {
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
	origins := s.allowedOrigins()
	if len(origins) == 0 {
		return true
	}

	normalizedOrigin, ok := normalizeOrigin(origin)
	if !ok {
		return false
	}
	for _, candidate := range origins {
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

// ─── Rate Limiting ──────────────────────────────────────────────────────────

type rateLimitRule struct {
	Window time.Duration
	Limit  int
}

type rateLimitEntry struct {
	Count      int
	ResetAt    time.Time
	LastSeenAt time.Time
}

func (s *Server) withRateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rule, key, enabled := s.rateLimitRuleForRequest(r)
		if !enabled {
			next.ServeHTTP(w, r)
			return
		}

		allowed, retryAfter := s.allowRateLimit(key, rule)
		if allowed {
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
		log.Printf("[security] rate limit hit path=%s method=%s remote=%s retry_after=%s", r.URL.Path, r.Method, remoteAddr(r), retryAfter)
		s.recordRuntimeLog("warning", "request rate limited", map[string]any{"path": r.URL.Path, "method": r.Method, "remote": remoteAddr(r), "retryAfter": retryAfter.String()})
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" {
			s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many requests"})
			return
		}
		http.Error(w, "too many requests", http.StatusTooManyRequests)
	})
}

func (s *Server) rateLimitRuleForRequest(r *http.Request) (rateLimitRule, string, bool) {
	path := r.URL.Path
	remote := remoteAddr(r)
	if remote == "" {
		remote = "unknown"
	}

	switch {
	case path == "/healthz" || strings.HasPrefix(path, "/assets/") || path == "/favicon.ico":
		return rateLimitRule{}, "", false
	case path == "/api/v1/auth/login" || path == "/api/v1/setup/initialize":
		return rateLimitRule{Window: time.Minute, Limit: 12}, "auth:" + remote, true
	case websocket.IsWebSocketUpgrade(r):
		return rateLimitRule{Window: time.Minute, Limit: 20}, "ws:" + remote, true
	case strings.HasPrefix(path, "/api/"):
		return rateLimitRule{Window: time.Minute, Limit: 240}, "api:" + remote, true
	default:
		return rateLimitRule{Window: time.Minute, Limit: 180}, "page:" + remote, true
	}
}

func (s *Server) allowRateLimit(key string, rule rateLimitRule) (bool, time.Duration) {
	now := time.Now()
	s.rateLimitMu.Lock()
	defer s.rateLimitMu.Unlock()

	for candidate, entry := range s.rateLimits {
		if now.Sub(entry.LastSeenAt) > 10*time.Minute {
			delete(s.rateLimits, candidate)
		}
	}

	entry := s.rateLimits[key]
	if entry == nil || now.After(entry.ResetAt) {
		s.rateLimits[key] = &rateLimitEntry{Count: 1, ResetAt: now.Add(rule.Window), LastSeenAt: now}
		return true, 0
	}

	entry.LastSeenAt = now
	if entry.Count >= rule.Limit {
		return false, time.Until(entry.ResetAt).Round(time.Second)
	}

	entry.Count++
	return true, 0
}

// ─── Access Logging ─────────────────────────────────────────────────────────

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

// ─── Runtime Logging & Audit ────────────────────────────────────────────────

func (s *Server) recordRuntimeLog(level, message string, metadata map[string]any) {
	if s.database == nil {
		return
	}
	s.database.RecordRuntimeLog("ypanel", level, message, metadata)
}

func (s *Server) auditSensitiveAction(r *http.Request, user *database.User, action, result string, metadata map[string]any) {
	if s.database == nil {
		return
	}
	meta := map[string]any{
		"action": action,
		"result": result,
		"path":   r.URL.Path,
		"method": r.Method,
		"remote": remoteAddr(r),
	}
	for key, value := range metadata {
		meta[key] = value
	}
	message := strings.TrimSpace(action)
	if message == "" {
		message = "sensitive_action"
	}
	if result != "" {
		message += " " + result
	}
	var userID *int64
	if user != nil {
		userID = &user.ID
		meta["actorUsername"] = user.Username
		meta["actorRole"] = user.Role
	}
	s.database.RecordRuntimeLogWithContext("security", "info", message, userID, nil, meta)
}

func (s *Server) auditFileAction(r *http.Request, action, result string, metadata map[string]any) {
	s.auditSensitiveAction(r, s.currentUserRecord(r), action, result, metadata)
}
