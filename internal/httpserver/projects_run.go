package httpserver

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/projects"
)

// How a project runs, as the window sends and reads it: the commands, the variables, and the processes of a project made of several.
// The variables are kept encrypted; the list of projects shows their names with the values hidden, and the project read on its own
// (the form that edits it) shows them.

// maskedEnvValue stands for a value that is hidden; sent back as it is, it means "keep what is saved"
const maskedEnvValue = "********"

type projectRunRequest struct {
	InstallCommand string                    `json:"installCommand"`
	BuildCommand   string                    `json:"buildCommand"`
	StartCommand   string                    `json:"startCommand"`
	Env            map[string]string         `json:"env"`
	Services       []database.ProjectService `json:"services"`
}

// openEnv reads the variables a project keeps encrypted
func (s *Server) openEnv(run database.ProjectRun) map[string]string {
	if run.EnvEnc == "" {
		return map[string]string{}
	}
	plain, err := crypto.Decrypt(s.cfg.EncryptionKey, run.EnvEnc)
	if err != nil {
		return map[string]string{}
	}
	env := map[string]string{}
	_ = json.Unmarshal([]byte(plain), &env)
	return env
}

// runView is how a project runs as the API shows it: no ciphertext, and the variables with their values, or with the values hidden
func (s *Server) runView(run database.ProjectRun, reveal bool) database.ProjectRun {
	env := s.openEnv(run)
	if !reveal {
		for key := range env {
			env[key] = maskedEnvValue
		}
	}
	run.EnvEnc = ""
	run.Env = env
	return run
}

// runFromRequest makes the way of running a project from what a request says, checked for the type of the project. Without a "run" in
// the request the saved one stays (and is checked against the type, which may have changed).
func (s *Server) runFromRequest(req *projectRunRequest, projectType string, assignedPort int, saved *database.ProjectRun) (database.ProjectRun, error) {
	if req == nil {
		var run database.ProjectRun
		if saved != nil {
			run = *saved
			run.Env = s.openEnv(run)
		}
		if err := projects.ValidateRun(projectType, run, assignedPort); err != nil {
			return run, fmt.Errorf("%w (send the run settings of this type)", err)
		}
		return run, nil
	}
	run := database.ProjectRun{
		Install: req.InstallCommand, Build: req.BuildCommand, Start: req.StartCommand,
		Services: req.Services, Env: map[string]string{},
	}
	for key, value := range req.Env {
		run.Env[strings.TrimSpace(key)] = value
	}
	// a value sent back hidden keeps the saved one
	if saved != nil {
		before := s.openEnv(*saved)
		for key, value := range run.Env {
			if value == maskedEnvValue {
				if old, ok := before[key]; ok {
					run.Env[key] = old
				} else {
					return run, fmt.Errorf("the value of %s is hidden: type it again", key)
				}
			}
		}
	}
	projects.CleanRun(&run)
	if err := projects.ValidateRun(projectType, run, assignedPort); err != nil {
		return run, err
	}
	if len(run.Env) > 0 {
		raw, err := json.Marshal(run.Env)
		if err != nil {
			return run, err
		}
		if run.EnvEnc, err = crypto.Encrypt(s.cfg.EncryptionKey, string(raw)); err != nil {
			return run, fmt.Errorf("the variables could not be kept: %w", err)
		}
	}
	return run, nil
}

// clearBuildMarkers takes away the files that say a project was installed and built, so its next start does both again. The
// folders are the ones of the project, symlinks resolved; a marker folder that is a link is left alone.
func clearBuildMarkers(project database.Project) {
	dirs := []string{project.WorkingDir}
	if project.ProjectType == "stack" {
		dirs = dirs[:0]
		for _, svc := range project.Run.Services {
			if dir, err := projects.ServiceDir(project.WorkingDir, svc.Dir); err == nil {
				dirs = append(dirs, dir)
			}
		}
	}
	for _, dir := range dirs {
		if info, err := os.Lstat(filepath.Join(dir, ".reneo")); err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			continue
		}
		for _, marker := range projects.RebuildMarkers(dir) {
			_ = os.Remove(marker)
		}
	}
}

// handleRebuildProject installs and builds a project again and starts it: the markers go, the project is stopped, and the start
// runs the steps (their output is in the log of the project)
func (s *Server) handleRebuildProject(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := parsePathID(r, "id")
	p, err := s.database.GetProject(id, u.ID)
	if err != nil || p == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "project not found"})
		return
	}
	if !projects.Runnable(p.ProjectType) || p.ProjectType == "static" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "this type of project has nothing to build"})
		return
	}
	if err := s.projectManager.StopProject(*p); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	clearBuildMarkers(*p)
	log.Printf("[projects] rebuild id=%d user=%q", p.ID, u.Username)

	ready, err := s.projectManager.StartAndWait(u, p, projectStartWait)
	if err != nil {
		_ = s.database.UpdateProjectStatus(id, "error")
		s.notifyUserAction(u.ID, "Project gagal dibangun ulang", fmt.Sprintf("Project '%s' gagal dibangun ulang: %s", p.Name, err.Error()), "warning")
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	if !ready {
		_ = s.database.UpdateProjectStatus(id, "building")
		p.Status = "building"
		s.notifyUserAction(u.ID, "Project sedang dibangun", fmt.Sprintf("Project '%s' sedang dipasang dan dibangun. Pantau log project.", p.Name), "info")
		s.writeJSON(w, http.StatusAccepted, jsonResponse{"ok": true, "status": "building", "project": s.projectWithRuntime(*p)})
		return
	}
	_ = s.database.UpdateProjectStatus(id, "active")
	p.Status = "active"
	s.notifyUserAction(u.ID, "Project dibangun ulang", fmt.Sprintf("Project '%s' dibangun ulang dan berjalan.", p.Name), "success")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "status": "active", "project": s.projectWithRuntime(*p)})
}

