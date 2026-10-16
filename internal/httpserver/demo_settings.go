package httpserver

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/friskipradana/panel-desktop-ui/internal/users"
)

// The demo account can be switched on and off from Settings. The choice is kept in the state
// directory; without that file the environment (PANEL_DEMO_PASSWORD) decides, as before.

const demoSettingsFile = "demo-account.json"

type demoSettings struct {
	Enabled bool `json:"enabled"`
	// Provisioned stays true once the account exists, so it stays locked to the read-only
	// allowlist even while the demo is switched off.
	Provisioned bool   `json:"provisioned"`
	Username    string `json:"username,omitempty"`
	Password    string `json:"password,omitempty"`
}

var demoSettingsMu sync.Mutex

func (s *Server) demoSettingsPath() string {
	return filepath.Join(s.cfg.StateDir, demoSettingsFile)
}

// loadDemoSettings returns the stored choice, or the environment defaults when none was made.
// stored reports whether the file exists.
func (s *Server) loadDemoSettings() (settings demoSettings, stored bool) {
	demoSettingsMu.Lock()
	defer demoSettingsMu.Unlock()
	if raw, err := os.ReadFile(s.demoSettingsPath()); err == nil {
		if json.Unmarshal(raw, &settings) == nil {
			if strings.TrimSpace(settings.Username) == "" {
				settings.Username = strings.TrimSpace(s.cfg.DemoUsername)
			}
			if strings.TrimSpace(settings.Username) == "" {
				settings.Username = defaultDemoUsername
			}
			return settings, true
		}
	}
	envPassword := strings.TrimSpace(s.cfg.DemoPassword)
	name := strings.TrimSpace(s.cfg.DemoUsername)
	if name == "" {
		name = defaultDemoUsername
	}
	return demoSettings{Enabled: envPassword != "", Provisioned: envPassword != "", Username: name, Password: s.cfg.DemoPassword}, false
}

func (s *Server) saveDemoSettings(settings demoSettings) error {
	demoSettingsMu.Lock()
	defer demoSettingsMu.Unlock()
	raw, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.cfg.StateDir, 0o750); err != nil {
		return err
	}
	return os.WriteFile(s.demoSettingsPath(), raw, 0o600)
}

func (s *Server) demoPassword() string {
	settings, _ := s.loadDemoSettings()
	return settings.Password
}

func randomDemoPassword() (string, error) {
	const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	out := make([]byte, 16)
	for i := range out {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", err
		}
		out[i] = alphabet[n.Int64()]
	}
	return string(out), nil
}

type demoSettingsView struct {
	Enabled  bool   `json:"enabled"`
	Username string `json:"username"`
	Password string `json:"password,omitempty"`
	Source   string `json:"source"`
}

func (s *Server) demoSettingsView() demoSettingsView {
	settings, stored := s.loadDemoSettings()
	source := "default"
	switch {
	case stored:
		source = "panel"
	case strings.TrimSpace(s.cfg.DemoPassword) != "":
		source = "env"
	}
	view := demoSettingsView{Enabled: settings.Enabled, Username: settings.Username, Source: source}
	if settings.Enabled {
		view.Password = settings.Password
	}
	return view
}

func (s *Server) handleGetDemoSettings(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, s.demoSettingsView())
}

func (s *Server) handleSetDemoSettings(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}

	current, _ := s.loadDemoSettings()
	next := current
	next.Enabled = req.Enabled
	if req.Enabled {
		if err := users.ValidatePassword(next.Password); err != nil || strings.TrimSpace(next.Password) == "" {
			pw, genErr := randomDemoPassword()
			if genErr != nil {
				s.writeError(w, http.StatusInternalServerError, errors.New("could not generate a demo password"))
				return
			}
			next.Password = pw
		}
		next.Provisioned = true
	}
	if err := s.saveDemoSettings(next); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("could not save the demo setting"))
		return
	}

	if req.Enabled {
		s.EnsureDemoAccount()
	} else {
		s.suspendDemoAccount(next.Username)
	}
	if u := userFromCtx(r); u != nil {
		result := "disabled"
		if req.Enabled {
			result = "enabled"
		}
		s.auditSensitiveAction(r, u, "settings.demo", result, nil)
	}
	s.writeJSON(w, http.StatusOK, s.demoSettingsView())
}
