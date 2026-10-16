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
// Nothing shared or global is on the list (docs, images, networks, changelog,
// settings) and widget layouts are never saved to the server, so one visitor
// cannot leave content for the next.
// It is enabled by setting RENEO_DEMO_PASSWORD (or PANEL_DEMO_PASSWORD); the
// credentials are shown on the public landing page on purpose.

const defaultDemoUsername = "demo"

// demoReadOnlyRoutes is every request the demo account may make. Anything not
// listed is refused, so new endpoints are blocked for demo by default.
var demoReadOnlyRoutes = map[string]bool{
	"GET /api/v1/me":                         true,
	"GET /api/v1/me/widgets":                 true,
	"GET /api/v1/projects":                   true,
	"GET /api/v1/projects/attention-summary": true,
	"GET /api/v1/tunnels":                    true,
	"GET /api/v1/containers":                 true,
	"GET /api/v1/notifications":              true,
	"GET /api/v1/notifications/ws":           true,
	"GET /api/v1/system/summary":             true,
	"GET /api/v1/system/history":             true,
	"GET /api/v1/settings/wallpaper":         true,
	"GET /api/v1/frontend/revision":          true,
	"GET /api/v1/mcp-catalog":                true,
	"POST /api/v1/auth/logout":               true,
	"GET /api/v1/me/usage":                   true,
}

// demoUsername is the demo account name while the demo is switched on, "" otherwise.
func (s *Server) demoUsername() string {
	settings, _ := s.loadDemoSettings()
	if !settings.Enabled || strings.TrimSpace(settings.Password) == "" {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(settings.Username))
}

// demoLockedName is the account that stays locked to the read-only allowlist: the demo user
// while it is on, and also after the demo was switched off (its sessions must not widen).
func (s *Server) demoLockedName() string {
	settings, _ := s.loadDemoSettings()
	if !settings.Enabled && !settings.Provisioned {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(settings.Username))
}

// suspendDemoAccount blocks the demo user when the demo is switched off.
func (s *Server) suspendDemoAccount(name string) {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	existing, _ := s.database.GetUserByUsername(strings.ToLower(strings.TrimSpace(name)))
	if existing == nil || existing.Role != auth.UserRole {
		return
	}
	_ = s.database.UpdateUser(existing.ID, map[string]any{"status": "suspended"})
}

func (s *Server) isDemoUser(u *database.User) bool {
	name := s.demoLockedName()
	// only a plain "user" row can be the demo account; an admin that happens to share the name is not locked
	return u != nil && name != "" && u.Role == auth.UserRole && strings.EqualFold(u.Username, name)
}

// demoAllowed reports whether the demo account may perform this request.
func demoAllowed(r *http.Request) bool {
	return demoReadOnlyRoutes[r.Method+" "+r.URL.Path]
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
	password := s.demoPassword()
	if err := users.ValidatePassword(password); err != nil {
		log.Printf("[demo] skipped: %v", err)
		return
	}
	hash, err := auth.HashPassword(password)
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
	s.seedDemoProjects(existing.ID)
}

// demoSampleProjects are display rows only: they stay "stopped", have no working
// directory and no port, and the demo account cannot start them.
var demoSampleProjects = []struct {
	name, slug, description, projectType string
	spa                                  bool
}{
	{"landing-site", "landing-site", "Static marketing site (sample)", "static", true},
	{"orders-api", "orders-api", "Node.js REST API (sample)", "nodejs", false},
	{"report-worker", "report-worker", "Python batch worker (sample)", "python", false},
}

func (s *Server) seedDemoProjects(userID int64) {
	if existing, err := s.database.ListProjects(userID); err != nil || len(existing) > 0 {
		return
	}
	for _, sample := range demoSampleProjects {
		if _, err := s.database.CreateProject(userID, sample.name, sample.slug, sample.description, sample.projectType, "", "", sample.spa, 0); err != nil {
			log.Printf("[demo] could not seed sample project %q: %v", sample.name, err)
			return
		}
	}
	log.Printf("[demo] seeded %d sample projects", len(demoSampleProjects))
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
		"password": s.demoPassword(),
		"readOnly": true,
	})
}
