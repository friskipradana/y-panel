package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	panelosuser "github.com/friskipradana/panel-desktop-ui/internal/osuser"
	"github.com/friskipradana/panel-desktop-ui/internal/users"
)

const usageDiskScanBudget = 3 * time.Second

// vetUserFields applies the account-management policy to a PATCH body and returns
// the columns that may be written. Unknown keys are dropped.
func (s *Server) vetUserFields(actor, target *database.User, in map[string]any) (map[string]any, error) {
	if actor == nil {
		return nil, errors.New("unauthorized")
	}
	aliases := map[string]string{
		"displayName": "display_name", "display_name": "display_name",
		"avatarUrl": "avatar_url", "avatar_url": "avatar_url",
		"email": "email", "role": "role", "status": "status",
	}
	out := map[string]any{}
	for key, value := range in {
		col, ok := aliases[key]
		if !ok {
			continue
		}
		out[col] = value
	}

	_, wantsRole := out["role"]
	_, wantsStatus := out["status"]
	selfOnly := !wantsRole && !wantsStatus
	if err := users.CanManage(actor.ID, actor.Role, target, selfOnly); err != nil {
		return nil, err
	}

	if raw, ok := out["role"]; ok {
		role, _ := raw.(string)
		if role != target.Role {
			if err := users.CanAssignRole(actor.Role, role); err != nil {
				return nil, err
			}
		} else {
			delete(out, "role")
		}
	}
	if raw, ok := out["status"]; ok {
		status, _ := raw.(string)
		if status != "active" && status != "suspended" {
			return nil, errors.New("status must be active or suspended")
		}
	}
	if raw, ok := out["email"]; ok {
		email, _ := raw.(string)
		email = strings.ToLower(strings.TrimSpace(email))
		if err := users.ValidateEmail(email); err != nil {
			return nil, err
		}
		out["email"] = email
	}
	return out, nil
}

// stopUserWorkloads halts everything a user runs through the panel so a suspended
// or deleted account does not keep serving traffic.
func (s *Server) stopUserWorkloads(userID int64) {
	if s.database == nil {
		return
	}
	s.stopUserDatabases(userID, false)
	if s.projectManager != nil {
		if list, err := s.database.ListProjects(userID); err == nil {
			for _, p := range list {
				if err := s.projectManager.StopProject(p); err != nil {
					log.Printf("[users] stop project id=%d user=%d: %v", p.ID, userID, err)
				}
			}
		}
	}
	if s.cfDaemon != nil {
		if list, err := s.database.ListTunnels(userID); err == nil {
			for _, t := range list {
				if t.CFTunnelID != "" {
					_ = s.cfDaemon.StopTunnel(t.CFTunnelID)
				}
			}
		}
	}
}

type accountUsage struct {
	UserID          int64               `json:"userId"`
	Projects        int                 `json:"projects"`
	ProjectsActive  int                 `json:"projectsActive"`
	Tunnels         int                 `json:"tunnels"`
	Databases       int                 `json:"databases"`
	DiskUsedMB      int64               `json:"diskUsedMb"`
	DiskScanPartial bool                `json:"diskScanPartial"`
	Quota           *database.UserQuota `json:"quota"`
}

func (s *Server) collectUsage(target *database.User) accountUsage {
	usage := accountUsage{UserID: target.ID}
	if list, err := s.database.ListProjects(target.ID); err == nil {
		usage.Projects = len(list)
		for _, p := range list {
			if p.Status == "active" {
				usage.ProjectsActive++
			}
		}
	}
	if list, err := s.database.ListTunnels(target.ID); err == nil {
		usage.Tunnels = len(list)
	}
	if n, err := s.database.CountManagedDatabases(target.ID); err == nil {
		usage.Databases = n
	}
	usage.Quota, _ = s.database.GetUserQuota(target.ID)

	if home := panelosuser.ResolveHomeDir(target.Username); home != "" {
		bytes, partial := dirSize(home, usageDiskScanBudget)
		usage.DiskUsedMB = bytes >> 20
		usage.DiskScanPartial = partial
	}
	return usage
}

// dirSize sums regular file sizes under root, stopping at the time budget.
func dirSize(root string, budget time.Duration) (int64, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), budget)
	defer cancel()
	var total int64
	partial := false
	_ = filepath.WalkDir(root, func(_ string, d fs.DirEntry, err error) error {
		if ctx.Err() != nil {
			partial = true
			return filepath.SkipAll
		}
		if err != nil || d.IsDir() || d.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		if info, infoErr := d.Info(); infoErr == nil {
			total += info.Size()
		}
		return nil
	})
	return total, partial
}

func (s *Server) handleGetUserUsage(w http.ResponseWriter, r *http.Request) {
	target, err := s.database.GetUserByID(parsePathID(r, "id"))
	if err != nil || target == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}
	s.writeJSON(w, http.StatusOK, s.collectUsage(target))
}

func (s *Server) handleGetMyUsage(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	s.writeJSON(w, http.StatusOK, s.collectUsage(u))
}

// handleChangeMyPassword lets any signed-in account change its own password.
func (s *Server) handleChangeMyPassword(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := users.ValidatePassword(req.NewPassword); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if req.NewPassword == req.CurrentPassword {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "new password must differ from the current one"})
		return
	}
	if err := s.auth.ChangePassword(u.ID, req.CurrentPassword, req.NewPassword); err != nil {
		s.auditSensitiveAction(r, u, "account.password.change", "denied", nil)
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "account.password.change", "ok", nil)
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// handleResetUserPassword lets an admin set a new password for an account they may manage.
func (s *Server) handleResetUserPassword(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	actor := userFromCtx(r)
	target, err := s.database.GetUserByID(parsePathID(r, "id"))
	if err != nil || target == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
		return
	}
	// resetting your own password goes through /me/password, which checks the current one
	if err := users.CanManage(actor.ID, actor.Role, target, false); err != nil {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
		return
	}
	var req struct {
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := users.ValidatePassword(req.NewPassword); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if err := s.auth.ResetPassword(target.ID, req.NewPassword); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	_ = s.database.DeleteUserSessions(target.ID)
	s.auditSensitiveAction(r, actor, "user.password.reset", "ok", map[string]any{"target": target.Username})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}
