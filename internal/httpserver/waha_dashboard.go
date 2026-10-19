package httpserver

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// The dashboard of WAHA, for the superadmin only. WAHA listens on the loopback address and its dashboard calls /api on
// its own origin, so it cannot live under a path of the panel. It gets an address of its own instead (a domain the
// owner points at the panel, like the addresses of buyers): there the panel answers with nothing but WAHA, after a
// short-lived link made inside the panel by the superadmin has been used. The panel puts WAHA's own key and login on
// every request, so nobody types or sees them, and anyone without the cookie that link gives gets nothing.

const (
	wahaDashEnterPath = "/__waha/enter"
	wahaDashExitPath  = "/__waha/exit"
	wahaDashCookie    = "reneo_waha_dashboard"
	wahaDashLinkTTL   = 90 * time.Second
	wahaDashSession   = 4 * time.Hour
)

// wahaDashUsedLinks remembers the links already used until they would have expired anyway: a link works once
var wahaDashUsedLinks sync.Map

func (s *Server) wahaDashSigningKey() []byte {
	sum := sha256.Sum256([]byte("waha-dashboard|" + s.cfg.EncryptionKey))
	return sum[:]
}

func (s *Server) wahaDashSign(payload string) string {
	mac := hmac.New(sha256.New, s.wahaDashSigningKey())
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + hex.EncodeToString(mac.Sum(nil))
}

// wahaDashOpen checks a signed value and returns what it says: its kind, the account, and when it ends
func (s *Server) wahaDashOpen(signed string) (kind string, userID int64, nonce string, expires time.Time, ok bool) {
	dot := strings.IndexByte(signed, '.')
	if dot < 0 {
		return
	}
	raw, err := base64.RawURLEncoding.DecodeString(signed[:dot])
	if err != nil {
		return
	}
	mac := hmac.New(sha256.New, s.wahaDashSigningKey())
	mac.Write(raw)
	if !hmac.Equal([]byte(hex.EncodeToString(mac.Sum(nil))), []byte(signed[dot+1:])) {
		return
	}
	parts := strings.Split(string(raw), "|")
	if len(parts) != 4 {
		return
	}
	id, err1 := strconv.ParseInt(parts[1], 10, 64)
	exp, err2 := strconv.ParseInt(parts[2], 10, 64)
	if err1 != nil || err2 != nil || time.Now().Unix() > exp {
		return
	}
	return parts[0], id, parts[3], time.Unix(exp, 0), true
}

func (s *Server) wahaDashMint(kind string, userID int64, ttl time.Duration) string {
	return s.wahaDashSign(fmt.Sprintf("%s|%d|%d|%s", kind, userID, time.Now().Add(ttl).Unix(), randomToken(12)))
}

func randomToken(n int) string {
	raw := make([]byte, n)
	if _, err := rand.Read(raw); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(raw)
}

// wahaDashAdmin is the superadmin an opened value names, still active; nil for anyone else
func (s *Server) wahaDashAdmin(userID int64) *database.User {
	u, err := s.database.GetUserByID(userID)
	if err != nil || u == nil || u.Role != auth.SuperadminRole || u.Status != "active" {
		return nil
	}
	return u
}

func requestIsHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// ─── What the superadmin does inside the panel ────────────────────────────────

type wahaDashboardView struct {
	Host string `json:"host"`
}

func (s *Server) handleGetWahaDashboardHost(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	s.writeJSON(w, http.StatusOK, wahaDashboardView{Host: s.notify.WahaDashboardHost()})
}

// handleSetWahaDashboardHost saves the address the dashboard answers on; empty switches it off
func (s *Server) handleSetWahaDashboardHost(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.notifyReady(w) {
		return
	}
	var req struct {
		Host string `json:"host"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	host := strings.ToLower(strings.TrimSpace(req.Host))
	// it must not be the address the panel itself is being used on, nor the panel address of an account
	if host != "" && (host == strings.ToLower(r.Host) || normalizeHost(host) == normalizeHost(r.Host) && !strings.Contains(host, ":") ||
		s.hostingHostOwner(normalizeHost(host)) != 0) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "this address is already used by the panel, pick another one"})
		return
	}
	if err := s.notify.SetWahaDashboardHost(host); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "notify.waha.dashboard_host", "ok", map[string]any{"host": host})
	}
	s.writeJSON(w, http.StatusOK, wahaDashboardView{Host: host})
}

// handleWahaDashboardLink gives the superadmin a link that works once and for a minute and a half
func (s *Server) handleWahaDashboardLink(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	host := s.notify.WahaDashboardHost()
	if host == "" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "set the address of the dashboard first"})
		return
	}
	if _, _, _, _, err := s.notify.WahaProxyTarget(); err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "switch WAHA on first"})
		return
	}
	u := userFromCtx(r)
	scheme := "http"
	if requestIsHTTPS(r) {
		scheme = "https"
	}
	token := s.wahaDashMint("enter", u.ID, wahaDashLinkTTL)
	s.auditSensitiveAction(r, u, "notify.waha.dashboard_link", "ok", map[string]any{"host": host})
	s.writeJSON(w, http.StatusOK, jsonResponse{"url": scheme + "://" + host + wahaDashEnterPath + "?t=" + url.QueryEscape(token)})
}

// ─── The address of the dashboard ─────────────────────────────────────────────

// wahaDashboardRequest says whether a request is for the dashboard address, which the panel then does not serve itself
func (s *Server) wahaDashboardRequest(r *http.Request) bool {
	if s.notify == nil {
		return false
	}
	host := s.notify.WahaDashboardHost()
	return host != "" && strings.EqualFold(r.Host, host)
}

// serveWahaDashboard answers on the dashboard address: only the one-time link, the exit, and WAHA behind the cookie
func (s *Server) serveWahaDashboard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	w.Header().Set("Referrer-Policy", "no-referrer")

	switch r.URL.Path {
	case wahaDashEnterPath:
		s.wahaDashboardEnter(w, r)
		return
	case wahaDashExitPath:
		http.SetCookie(w, &http.Cookie{Name: wahaDashCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
		http.Error(w, "closed", http.StatusOK)
		return
	}
	cookie, err := r.Cookie(wahaDashCookie)
	if err != nil {
		wahaDashDenied(w)
		return
	}
	kind, userID, _, _, ok := s.wahaDashOpen(cookie.Value)
	if !ok || kind != "session" || s.wahaDashAdmin(userID) == nil {
		wahaDashDenied(w)
		return
	}
	if r.URL.Path == "/" {
		http.Redirect(w, r, "/dashboard/", http.StatusFound)
		return
	}
	base, key, user, pass, err := s.notify.WahaProxyTarget()
	if err != nil {
		http.Error(w, "WAHA is not running", http.StatusBadGateway)
		return
	}
	target, err := url.Parse(base)
	if err != nil {
		http.Error(w, "bad WAHA address", http.StatusBadGateway)
		return
	}
	proxy := &httputil.ReverseProxy{
		Director: func(out *http.Request) {
			out.URL.Scheme, out.URL.Host = target.Scheme, target.Host
			out.Host = target.Host
			// nothing of the browser's session reaches WAHA, and WAHA gets its own credentials
			out.Header.Del("Cookie")
			out.Header.Del("Authorization")
			out.Header.Del("X-Api-Key")
			out.Header.Del("Origin")
			out.Header.Set("X-Api-Key", key)
			if !strings.HasPrefix(out.URL.Path, "/api/") && user != "" {
				out.SetBasicAuth(user, pass)
			}
		},
		ErrorHandler: func(rw http.ResponseWriter, _ *http.Request, err error) {
			http.Error(rw, "WAHA did not answer", http.StatusBadGateway)
		},
	}
	proxy.ServeHTTP(w, r)
}

func wahaDashDenied(w http.ResponseWriter) {
	http.Error(w, "Open the dashboard from the panel: Settings > Notifications > WhatsApp WAHA.", http.StatusForbidden)
}

// wahaDashboardEnter uses a link once: a good one starts a session of a few hours on this address
func (s *Server) wahaDashboardEnter(w http.ResponseWriter, r *http.Request) {
	if allowed, _ := s.allowRateLimit("wahadash:"+clientIP(r), rateLimitRule{Window: time.Minute, Limit: 20}); !allowed {
		http.Error(w, "too many requests", http.StatusTooManyRequests)
		return
	}
	kind, userID, nonce, expires, ok := s.wahaDashOpen(r.URL.Query().Get("t"))
	if !ok || kind != "enter" || s.wahaDashAdmin(userID) == nil {
		wahaDashDenied(w)
		return
	}
	if _, used := wahaDashUsedLinks.LoadOrStore(nonce, expires); used {
		wahaDashDenied(w)
		return
	}
	// forget the links that would be refused as expired anyway
	wahaDashUsedLinks.Range(func(k, v any) bool {
		if time.Now().After(v.(time.Time)) {
			wahaDashUsedLinks.Delete(k)
		}
		return true
	})
	http.SetCookie(w, &http.Cookie{
		Name: wahaDashCookie, Value: s.wahaDashMint("session", userID, wahaDashSession), Path: "/", HttpOnly: true,
		Secure: requestIsHTTPS(r), SameSite: http.SameSiteLaxMode, MaxAge: int(wahaDashSession.Seconds()),
	})
	http.Redirect(w, r, "/dashboard/", http.StatusFound)
}

