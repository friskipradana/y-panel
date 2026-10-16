package httpserver

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/mcp"
	"github.com/friskipradana/panel-desktop-ui/internal/osuser"
)

const (
	execMaxOutput  = 64 << 10
	execMaxCommand = 4096
	execMaxTimeout = 60
)

// A one-shot command for API and MCP clients. It runs as the caller's own OS account, inside the
// account's CPU and memory slice, so it never reaches further than the caller's terminal does.
func (s *Server) handleTerminalExec(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := s.currentUserRecord(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	if !s.cfg.TerminalEnabled {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "terminal host dinonaktifkan oleh konfigurasi panel"})
		return
	}
	if runtime.GOOS != "linux" && !auth.IsSuperAdmin(u.Role) {
		s.writeJSON(w, http.StatusNotImplemented, jsonResponse{"error": "account isolation needs a Linux host"})
		return
	}
	var req struct {
		Command        string `json:"command"`
		TimeoutSeconds int    `json:"timeoutSeconds"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	command := strings.TrimSpace(req.Command)
	if command == "" || len(command) > execMaxCommand {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "command is required (max 4096 characters)"})
		return
	}
	if err := mcp.ValidateCommand(command); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	timeout := req.TimeoutSeconds
	if timeout <= 0 {
		timeout = 30
	}
	if timeout > execMaxTimeout {
		timeout = execMaxTimeout
	}

	osUsername, err := osuser.EnsureUserForRole(u.Username, u.DisplayName, u.Role)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	cmd, err := osuser.WrapCommand(exec.Command("/bin/sh", "-c", command), osUsername)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	cmd.Dir = osuser.ResolveHomeDir(u.Username)
	if !auth.IsSuperAdmin(u.Role) {
		if quota, qerr := s.database.GetUserQuota(u.ID); qerr == nil && quota != nil {
			if slice := osuser.SliceFor(osUsername, osuser.Limits{CPUPercent: quota.CPULimitPct, MemoryMB: quota.MemoryLimitMB}); slice != "" {
				cmd = osuser.InSlice(cmd, slice)
			}
		}
	}

	var out bytes.Buffer
	limited := &cappedWriter{buf: &out, left: execMaxOutput}
	cmd.Stdout, cmd.Stderr = limited, limited
	s.auditSensitiveAction(r, u, "terminal.exec", "started", map[string]any{"osUsername": osUsername})

	if err := cmd.Start(); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	timedOut := false
	timer := time.AfterFunc(time.Duration(timeout)*time.Second, func() {
		timedOut = true
		_ = cmd.Process.Kill()
	})
	waitErr := cmd.Wait()
	timer.Stop()

	exitCode := 0
	if waitErr != nil {
		var exitErr *exec.ExitError
		if errors.As(waitErr, &exitErr) {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"output":    strings.TrimSpace(out.String()),
		"exitCode":  exitCode,
		"timedOut":  timedOut,
		"truncated": limited.truncated,
		"user":      osUsername,
	})
}

type cappedWriter struct {
	buf       *bytes.Buffer
	left      int
	truncated bool
}

func (c *cappedWriter) Write(p []byte) (int, error) {
	if c.left <= 0 {
		c.truncated = true
		return len(p), nil
	}
	if len(p) > c.left {
		c.buf.Write(p[:c.left])
		c.left = 0
		c.truncated = true
		return len(p), nil
	}
	c.buf.Write(p)
	c.left -= len(p)
	return len(p), nil
}
