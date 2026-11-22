package httpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	panelosuser "github.com/friskipradana/panel-desktop-ui/internal/osuser"
	"github.com/friskipradana/panel-desktop-ui/internal/toolchain"
)

// The development tools of an account (Node.js, Bun, pm2 and others), installed in its own home without root, and how it shapes
// its environment. Every script runs as the account, so what it does it could do in its own terminal.

const toolchainTimeout = 15 * time.Minute

// one install at a time per account
var toolchainBusy sync.Map

type toolchainEvent struct {
	Type  string `json:"type"` // log | done | error
	Line  string `json:"line,omitempty"`
	Error string `json:"error,omitempty"`
}

// toolchainAccount finds the account of the signed-in user and the way to run a script as it.
func (s *Server) toolchainAccount(w http.ResponseWriter, r *http.Request) (user *database.User, osUsername, home string, run toolchain.Runner, ok bool) {
	if runtime.GOOS != "linux" {
		s.writeJSON(w, http.StatusNotImplemented, jsonResponse{"error": "alat pengembangan hanya tersedia di server Linux"})
		return nil, "", "", nil, false
	}
	user = userFromCtx(r)
	if user == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return nil, "", "", nil, false
	}
	osUsername, err := panelosuser.EnsureUserForRole(user.Username, user.DisplayName, user.Role)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return nil, "", "", nil, false
	}
	home = panelosuser.ResolveHomeDir(user.Username)
	run = func(ctx context.Context, script string, env []string, emit func(string)) error {
		cmd := exec.CommandContext(ctx, "/bin/bash", "-c", script)
		cmd.Dir = home
		cmd.Env = panelosuser.BaseEnv(append([]string{"TERM=dumb", "NO_COLOR=1"}, env...)...)
		wrapped, err := panelosuser.WrapCommand(cmd, osUsername)
		if err != nil {
			return err
		}
		out := &logLines{emit: emit}
		wrapped.Stdout, wrapped.Stderr = out, out
		runErr := wrapped.Run()
		out.flush()
		return runErr
	}
	return user, osUsername, home, run, true
}

func (s *Server) handleToolchainStatus(w http.ResponseWriter, r *http.Request) {
	_, _, home, run, ok := s.toolchainAccount(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Minute)
	defer cancel()
	prefs := toolchain.LoadPrefs(home)
	// the shells of the account read the PATH from a file the panel keeps; it is written the first time the page is opened
	if _, err := os.Lstat(filepath.Join(home, ".reneo", "env.sh")); err != nil {
		if err := toolchain.Apply(ctx, run, prefs); err != nil {
			s.writeError(w, http.StatusBadGateway, err)
			return
		}
	}
	tools, checks, err := toolchain.Inspect(ctx, run, home)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"supported": true, "home": home, "tools": tools, "checks": checks, "prefs": prefs})
}

func (s *Server) handleToolchainPrefs(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	user, _, _, run, ok := s.toolchainAccount(w, r)
	if !ok {
		return
	}
	var prefs toolchain.Prefs
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&prefs); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	clean, err := prefs.Clean()
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Minute)
	defer cancel()
	if err := toolchain.Apply(ctx, run, clean); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.auditSensitiveAction(r, user, "toolchain.prefs", "ok", map[string]any{"path": len(clean.Path), "env": len(clean.Env)})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "prefs": clean})
}

// handleToolchainRun installs or removes a tool; the answer is a stream of JSON lines with what the installer prints.
func (s *Server) handleToolchainRun(remove bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		user, osUsername, _, run, ok := s.toolchainAccount(w, r)
		if !ok {
			return
		}
		var req struct {
			Tool    string `json:"tool"`
			Version string `json:"version"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
			return
		}
		if _, loaded := toolchainBusy.LoadOrStore(osUsername, true); loaded {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "ada pemasangan lain yang sedang berjalan untuk akun ini"})
			return
		}
		defer toolchainBusy.Delete(osUsername)

		send := startLineStream(w)
		emit := func(line string) { send(toolchainEvent{Type: "log", Line: line}) }
		ctx, cancel := context.WithTimeout(r.Context(), toolchainTimeout)
		defer cancel()
		var err error
		action := "toolchain.install"
		if remove {
			action = "toolchain.remove"
			err = toolchain.Remove(ctx, run, strings.TrimSpace(req.Tool), emit)
		} else {
			err = toolchain.Install(ctx, run, strings.TrimSpace(req.Tool), req.Version, emit)
		}
		result := "ok"
		if err != nil {
			result = "failed"
			message := err.Error()
			if ctx.Err() == context.DeadlineExceeded {
				message = "proses melebihi batas waktu"
			}
			send(toolchainEvent{Type: "error", Error: message})
		} else {
			send(toolchainEvent{Type: "done"})
		}
		s.auditSensitiveAction(r, user, action, result, map[string]any{"tool": req.Tool, "version": req.Version})
	}
}
