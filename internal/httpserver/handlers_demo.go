package httpserver

import (
	"log"
	"net/http"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/users"
)

// Demo account: a normal "user" row that is locked to a read-only allowlist.
// It is enabled by setting RENEO_DEMO_PASSWORD (or PANEL_DEMO_PASSWORD); the
// credentials are shown on the public landing page on purpose.

const defaultDemoUsername = "demo"

// demoReadOnlyRoutes is every request the demo account may make. Anything not
// listed is refused, so new endpoints are blocked for demo by default.
var demoReadOnlyRoutes = map[string]bool{
	"GET /api/v1/me":                         true,
	"GET /api/v1/me/widgets":                 true,
	"PUT /api/v1/me/widgets":                 true,
	"GET /api/v1/projects":                   true,
	"GET /api/v1/projects/attention-summary": true,
	"GET /api/v1/tunnels":                    true,
	"GET /api/v1/containers":                 true,
	"GET /api/v1/docker/networks":            true,
	"GET /api/v1/docker/images":              true,
	"GET /api/v1/docs":                       true,
	"GET /api/v1/notifications":              true,
	"GET /api/v1/notifications/ws":           true,
	"GET /api/v1/system/summary":             true,
	"GET /api/v1/system/history":             true,
	"GET /api/v1/system/changelog":           true,
	"GET /api/v1/system/update":              true,
	"GET /api/v1/settings/wallpaper":         true,
	"GET /api/v1/frontend/revision":          true,
	"GET /api/v1/mcp-catalog":                true,
	"POST /api/v1/auth/logout":               true,
	"GET /api/v1/me/usage":                   true,
}

func (s *Server) demoUsername() string {
	if strings.TrimSpace(s.cfg.DemoPassword) == "" {
		return ""
	}
	name := strings.ToLower(strings.TrimSpace(s.cfg.DemoUsername))
	if name == "" {
		name = defaultDemoUsername
	}
	return name
}

func (s *Server) isDemoUser(u *database.User) bool {
	name := s.demoUsername()
	return u != nil && name != "" && strings.EqualFold(u.Username, name)
}

// demoAllowed reports whether the demo account may perform this request.
func demoAllowed(r *http.Request) bool {
	path := r.URL.Path
	if r.Method == http.MethodGet && strings.HasPrefix(path, "/api/v1/docs/") {
		return true
	}
	return demoReadOnlyRoutes[r.Method+" "+path]
}

// guardDemo writes the refusal and returns false when the demo account tries
// something outside the read-only allowlist.
func (s *Server) guardDemo(w http.ResponseWriter, r *http.Request, u *database.User) bool {
	if !s.isDemoUser(u) || demoAllowed(r) {
		return true
	}
	s.writeJSON(w, http.StatusForbidden, jsonResponse{
		"error": "demo account is read-only: this action is disabled",
		"demo":  true,
	})
	return false
}

// EnsureDemoAccount creates or refreshes the demo user from configuration.
// The configured password is authoritative, so it is re-applied on every start.
func (s *Server) EnsureDemoAccount() {
	name := s.demoUsername()
	if name == "" || s.database == nil || !s.database.IsConnected() {
		return
	}
	if err := users.ValidateUsername(name); err != nil {
		log.Printf("[demo] skipped: invalid demo username %q: %v", name, err)
		return
	}
	if err := users.ValidatePassword(s.cfg.DemoPassword); err != nil {
		log.Printf("[demo] skipped: %v", err)
		return
	}
	hash, err := auth.HashPassword(s.cfg.DemoPassword)
	if err != nil {
		log.Printf("[demo] skipped: %v", err)
		return
	}

	existing, _ := s.database.GetUserByUsername(name)
	if existing == nil {
		created, err := s.database.CreateUser(name, name+"@demo.reneo", hash, auth.UserRole, "Demo")
		if err != nil {
			log.Printf("[demo] could not create account: %v", err)
			return
		}
		existing = created
		log.Printf("[demo] account %q created (read-only)", name)
	} else {
		if existing.Role != auth.UserRole {
			log.Printf("[demo] refusing to use existing %q account with role %q", name, existing.Role)
			return
		}
		_ = s.database.UpdateUserPasswordHash(existing.ID, hash)
		_ = s.database.UpdateUser(existing.ID, map[string]any{"status": "active"})
	}
	// no capacity to create anything, even if the allowlist were bypassed
	_ = s.database.UpdateUserQuota(database.UserQuota{UserID: existing.ID, MaxProjects: 0, MaxTunnels: 0, DiskQuotaMB: 0, CPULimitPct: 1, MemoryLimitMB: 0})
}

// handlePublicDemo exposes the demo credentials for the landing page.
func (s *Server) handlePublicDemo(w http.ResponseWriter, _ *http.Request) {
	name := s.demoUsername()
	if name == "" {
		s.writeJSON(w, http.StatusOK, jsonResponse{"enabled": false})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"enabled":  true,
		"username": name,
		"password": s.cfg.DemoPassword,
		"readOnly": true,
	})
}
