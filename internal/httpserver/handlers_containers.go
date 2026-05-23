package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	panelosuser "github.com/friskipradana/panel-desktop-ui/internal/osuser"
	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

// ─── Docker Container Handlers ──────────────────────────────────────────────

type dockerDeployImageRequest struct {
	OwnerUserID        int64                  `json:"ownerUserId"`
	Name               string                 `json:"name"`
	Image              string                 `json:"image"`
	Network            string                 `json:"network"`
	Ports              []docker.PortBinding   `json:"ports"`
	Env                []docker.EnvVar        `json:"env"`
	EnvMode            string                 `json:"envMode"`
	EnvRaw             string                 `json:"envRaw"`
	RegistryAuth       *docker.RegistryAuth   `json:"registryAuth"`
	Volumes            []docker.VolumeBinding `json:"volumes"`
	ReplaceContainerID string                 `json:"replaceContainerId"`
}

type dockerPullImageRequest struct {
	Image        string               `json:"image"`
	RegistryAuth *docker.RegistryAuth `json:"registryAuth"`
}

type dockerDeployComposeRequest struct {
	OwnerUserID        int64                `json:"ownerUserId"`
	Name               string               `json:"name"`
	ComposeYAML        string               `json:"composeYaml"`
	RegistryAuth       *docker.RegistryAuth `json:"registryAuth"`
	ReplaceContainerID string               `json:"replaceContainerId"`
}

func validateRegistryAuthPayload(auth *docker.RegistryAuth) error {
	if auth == nil || !auth.Enabled {
		return nil
	}
	if strings.TrimSpace(auth.UsernameOrEmail) == "" {
		return errors.New("registry username/email is required when authentication is enabled")
	}
	if strings.TrimSpace(auth.Password) == "" {
		return errors.New("registry password is required when authentication is enabled")
	}
	return nil
}

func filterContainersForUser(actor *database.User, containers []docker.Container) []docker.Container {
	if actor == nil || auth.IsAdmin(actor.Role) {
		return containers
	}
	filtered := make([]docker.Container, 0, len(containers))
	for _, container := range containers {
		if container.OwnerUserID == actor.ID {
			filtered = append(filtered, container)
		}
	}
	return filtered
}

func (s *Server) ensureContainerAccess(r *http.Request, id string) (*database.User, error) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		return nil, errors.New("unauthorized")
	}
	if auth.IsAdmin(actor.Role) {
		return actor, nil
	}
	containers, err := docker.ListContainers()
	if err != nil {
		return nil, err
	}
	for _, container := range containers {
		if (container.ID == id || strings.HasPrefix(container.ID, id)) && container.OwnerUserID == actor.ID {
			return actor, nil
		}
	}
	return nil, errors.New("forbidden: container bukan milik user ini")
}

func (s *Server) handleContainersList(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	containers, err := docker.ListContainers()
	if err != nil {
		s.writeJSON(w, http.StatusOK, []docker.Container{})
		return
	}
	containers = filterContainersForUser(actor, containers)
	if containers == nil {
		containers = []docker.Container{}
	}
	s.writeJSON(w, http.StatusOK, containers)
}

func (s *Server) handleContainerStart(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing container id"})
		return
	}
	if _, err := s.ensureContainerAccess(r, id); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if err := docker.StartContainer(id); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleContainerStop(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing container id"})
		return
	}
	if _, err := s.ensureContainerAccess(r, id); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if err := docker.StopContainer(id); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleContainerRestart(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing container id"})
		return
	}
	if _, err := s.ensureContainerAccess(r, id); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if err := docker.RestartContainer(id); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleContainerDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing container id"})
		return
	}
	removeVolumes := r.URL.Query().Get("removeVolumes") == "true"
	removeImage := r.URL.Query().Get("removeImage") == "true"
	if _, err := s.ensureContainerAccess(r, id); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if err := docker.DeleteContainer(id, removeVolumes, removeImage); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleImageInUse(w http.ResponseWriter, r *http.Request) {
	imageRef := r.URL.Query().Get("image")
	excludeID := r.URL.Query().Get("excludeContainer")
	if imageRef == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing image param"})
		return
	}
	inUse, err := docker.IsImageInUse(imageRef, excludeID)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"inUse": inUse})
}

func (s *Server) handleContainerLogs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing container id"})
		return
	}
	if _, err := s.ensureContainerAccess(r, id); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	tail := 200
	if rawTail := strings.TrimSpace(r.URL.Query().Get("tail")); rawTail != "" {
		if parsed, err := strconv.Atoi(rawTail); err == nil {
			tail = parsed
		}
	}
	logs, err := docker.ReadContainerLogs(id, tail)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, logs)
}

func (s *Server) handleContainerInspectConfig(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing container id"})
		return
	}
	if _, err := s.ensureContainerAccess(r, id); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	cfg, err := docker.InspectContainerConfig(id)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, cfg)
}

func (s *Server) handleContainerDeployImage(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	var req dockerDeployImageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := validateRegistryAuthPayload(req.RegistryAuth); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	owner, err := s.resolveDockerOwnerContext(actor, req.OwnerUserID)
	if err != nil {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
		return
	}

	if req.ReplaceContainerID != "" {
		if _, err := s.ensureContainerAccess(r, req.ReplaceContainerID); err != nil {
			s.writeError(w, http.StatusForbidden, err)
			return
		}
		_ = docker.DeleteContainer(req.ReplaceContainerID, false, false)
	}

	result, err := docker.DeployFromImage(owner, docker.DeployImageRequest{
		Name:         req.Name,
		Image:        req.Image,
		Network:      req.Network,
		Ports:        req.Ports,
		Env:          req.Env,
		EnvMode:      req.EnvMode,
		EnvRaw:       req.EnvRaw,
		RegistryAuth: req.RegistryAuth,
		Volumes:      req.Volumes,
	})
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, jsonResponse{
		"ok":          true,
		"projectName": result.ProjectName,
		"composePath": result.ComposePath,
		"projectDir":  result.ProjectDir,
		"owner": jsonResponse{
			"userId":        owner.UserID,
			"username":      owner.Username,
			"displayName":   owner.DisplayName,
			"homeDir":       owner.HomeDir,
			"dockerRootDir": owner.DockerRootDir,
			"diskQuotaMb":   owner.DiskQuotaMB,
			"cpuLimitPct":   owner.CPULimitPct,
			"memoryLimitMb": owner.MemoryLimitMB,
		},
	})
}

func (s *Server) handleContainerDeployCompose(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	var req dockerDeployComposeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := validateRegistryAuthPayload(req.RegistryAuth); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	owner, err := s.resolveDockerOwnerContext(actor, req.OwnerUserID)
	if err != nil {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
		return
	}

	if req.ReplaceContainerID != "" {
		if _, err := s.ensureContainerAccess(r, req.ReplaceContainerID); err != nil {
			s.writeError(w, http.StatusForbidden, err)
			return
		}
		_ = docker.DeleteContainer(req.ReplaceContainerID, false, false)
	}

	result, err := docker.DeployFromCompose(owner, docker.DeployComposeRequest{
		Name:         req.Name,
		ComposeYAML:  req.ComposeYAML,
		RegistryAuth: req.RegistryAuth,
	})
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, jsonResponse{
		"ok":          true,
		"projectName": result.ProjectName,
		"composePath": result.ComposePath,
		"projectDir":  result.ProjectDir,
		"owner": jsonResponse{
			"userId":        owner.UserID,
			"username":      owner.Username,
			"displayName":   owner.DisplayName,
			"homeDir":       owner.HomeDir,
			"dockerRootDir": owner.DockerRootDir,
			"diskQuotaMb":   owner.DiskQuotaMB,
			"cpuLimitPct":   owner.CPULimitPct,
			"memoryLimitMb": owner.MemoryLimitMB,
		},
	})
}

func (s *Server) handleContainerOwners(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	if auth.IsAdmin(actor.Role) {
		limit, offset, err := parseLimitOffset(r, 50, 200)
		if err != nil {
			s.writeError(w, http.StatusBadRequest, err)
			return
		}
		users, total, err := s.database.ListUsersFiltered(querySearch(r), limit, offset)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		items := make([]map[string]any, 0, len(users))
		for _, user := range users {
			quota, _ := s.database.GetUserQuota(user.ID)
			homeDir := panelosuser.ResolveHomeDir(user.Username)
			items = append(items, map[string]any{
				"id":            user.ID,
				"username":      user.Username,
				"displayName":   user.DisplayName,
				"role":          user.Role,
				"homeDir":       homeDir,
				"dockerRootDir": filepath.Join(homeDir, "docker"),
				"quota":         quota,
			})
		}
		if items == nil {
			items = []map[string]any{}
		}
		s.writeJSON(w, http.StatusOK, jsonResponse{"items": items, "total": total, "limit": limit, "offset": offset})
		return
	}
	owner, err := s.resolveDockerOwnerContext(actor, actor.ID)
	if err != nil {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"items": []map[string]any{{
			"id":            owner.UserID,
			"username":      owner.Username,
			"displayName":   owner.DisplayName,
			"role":          owner.Role,
			"homeDir":       owner.HomeDir,
			"dockerRootDir": owner.DockerRootDir,
			"quota": jsonResponse{
				"userId":        owner.UserID,
				"diskQuotaMb":   owner.DiskQuotaMB,
				"cpuLimitPct":   owner.CPULimitPct,
				"memoryLimitMb": owner.MemoryLimitMB,
			},
		}},
		"total":  1,
		"limit":  1,
		"offset": 0,
	})
}

func (s *Server) resolveDockerOwnerContext(actor *database.User, ownerUserID int64) (docker.OwnerContext, error) {
	if actor == nil {
		return docker.OwnerContext{}, errors.New("unauthorized")
	}
	ownerID := ownerUserID
	if ownerID <= 0 {
		ownerID = actor.ID
	}
	if !auth.IsAdmin(actor.Role) && ownerID != actor.ID {
		return docker.OwnerContext{}, errors.New("forbidden: owner user is not allowed")
	}
	owner, err := s.database.GetUserByID(ownerID)
	if err != nil || owner == nil {
		return docker.OwnerContext{}, errors.New("owner user not found")
	}
	quota, err := s.database.GetUserQuota(owner.ID)
	if err != nil || quota == nil {
		return docker.OwnerContext{}, errors.New("owner quota not found")
	}
	homeDir := panelosuser.ResolveHomeDir(owner.Username)
	dockerRootDir := filepath.Join(homeDir, "docker")
	if err := os.MkdirAll(dockerRootDir, 0755); err != nil {
		return docker.OwnerContext{}, fmt.Errorf("prepare owner docker directory: %w", err)
	}
	return docker.OwnerContext{
		UserID:        owner.ID,
		Username:      owner.Username,
		DisplayName:   owner.DisplayName,
		Role:          owner.Role,
		OSUsername:    panelosuser.MappedUsername(owner.Username),
		HomeDir:       homeDir,
		DockerRootDir: dockerRootDir,
		DiskQuotaMB:   quota.DiskQuotaMB,
		CPULimitPct:   quota.CPULimitPct,
		MemoryLimitMB: quota.MemoryLimitMB,
	}, nil
}
