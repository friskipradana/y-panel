package httpserver

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Public site switches, kept in the state directory like the demo choice so they work before the
// database is reachable:
//   - landing:  the public pages (landing, articles, install guide, MCP guide) exist or not
//   - indexing: search engines and AI crawlers may index what is public
//   - hosting:  hosting mode (plans, demo account, subdomains for buyers)

const siteSettingsFile = "site-settings.json"

type siteSettings struct {
	LandingEnabled  bool `json:"landingEnabled"`
	IndexingEnabled bool `json:"indexingEnabled"`
	HostingEnabled  bool `json:"hostingEnabled"`
}

var (
	siteSettingsMu    sync.Mutex
	siteSettingsCache = map[string]siteCacheEntry{}
)

type siteCacheEntry struct {
	value  siteSettings
	loaded time.Time
}

// Every request to a public page asks for these; a short cache keeps that off the disk
const siteSettingsTTL = 2 * time.Second

func (s *Server) siteSettingsPath() string {
	return filepath.Join(s.cfg.StateDir, siteSettingsFile)
}

// loadSiteSettings returns the stored switches. Without a file everything public stays on,
// and hosting mode is on only when a demo account was already running (so an upgrade does not
// switch the demo off).
func (s *Server) loadSiteSettings() siteSettings {
	path := s.siteSettingsPath()
	siteSettingsMu.Lock()
	defer siteSettingsMu.Unlock()
	if entry, ok := siteSettingsCache[path]; ok && time.Since(entry.loaded) < siteSettingsTTL {
		return entry.value
	}
	value := siteSettings{LandingEnabled: true, IndexingEnabled: true}
	if raw, err := os.ReadFile(path); err == nil {
		// fields missing from an older file keep their defaults
		_ = json.Unmarshal(raw, &value)
	} else {
		demo, _ := s.loadDemoSettings()
		value.HostingEnabled = demo.Enabled
	}
	siteSettingsCache[path] = siteCacheEntry{value: value, loaded: time.Now()}
	return value
}

func (s *Server) saveSiteSettings(value siteSettings) error {
	path := s.siteSettingsPath()
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.cfg.StateDir, 0o750); err != nil {
		return err
	}
	siteSettingsMu.Lock()
	defer siteSettingsMu.Unlock()
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return err
	}
	siteSettingsCache[path] = siteCacheEntry{value: value, loaded: time.Now()}
	return nil
}

func (s *Server) landingEnabled() bool { return s.loadSiteSettings().LandingEnabled }
func (s *Server) indexingAllowed() bool {
	settings := s.loadSiteSettings()
	return settings.LandingEnabled && settings.IndexingEnabled
}
func (s *Server) hostingEnabled() bool { return s.loadSiteSettings().HostingEnabled }

// requireLanding hides public data (articles, contributors) while the public pages are off
func (s *Server) requireLanding(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.landingEnabled() {
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
			return
		}
		next(w, r)
	}
}

// handlePublicSite tells the frontend which public pages exist
func (s *Server) handlePublicSite(w http.ResponseWriter, _ *http.Request) {
	settings := s.loadSiteSettings()
	w.Header().Set("Cache-Control", "no-store")
	s.writeJSON(w, http.StatusOK, jsonResponse{"landing": settings.LandingEnabled, "hosting": settings.HostingEnabled})
}

func (s *Server) handleGetSiteSettings(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, s.loadSiteSettings())
}

func (s *Server) handleSetSiteSettings(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		LandingEnabled  *bool `json:"landingEnabled"`
		IndexingEnabled *bool `json:"indexingEnabled"`
		HostingEnabled  *bool `json:"hostingEnabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	current := s.loadSiteSettings()
	next := current
	if req.LandingEnabled != nil {
		next.LandingEnabled = *req.LandingEnabled
	}
	if req.IndexingEnabled != nil {
		next.IndexingEnabled = *req.IndexingEnabled
	}
	if req.HostingEnabled != nil {
		next.HostingEnabled = *req.HostingEnabled
	}
	if err := s.saveSiteSettings(next); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("could not save the site settings"))
		return
	}
	// without hosting mode there is no demo account
	if current.HostingEnabled && !next.HostingEnabled {
		s.disableDemoAccount()
	}
	if u := userFromCtx(r); u != nil {
		changes := map[string]any{}
		if next.LandingEnabled != current.LandingEnabled {
			changes["landing"] = next.LandingEnabled
		}
		if next.IndexingEnabled != current.IndexingEnabled {
			changes["indexing"] = next.IndexingEnabled
		}
		if next.HostingEnabled != current.HostingEnabled {
			changes["hosting"] = next.HostingEnabled
		}
		s.auditSensitiveAction(r, u, "settings.site", "ok", changes)
	}
	s.writeJSON(w, http.StatusOK, next)
}
