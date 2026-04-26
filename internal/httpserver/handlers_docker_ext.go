package httpserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

func (s *Server) handleDockerNetworksList(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeError(w, http.StatusUnauthorized, fmt.Errorf("unauthorized"))
		return
	}
	networks, err := docker.ListNetworks()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if !auth.IsAdmin(actor.Role) {
		filtered := make([]docker.Network, 0, len(networks))
		for _, network := range networks {
			if network.OwnerUserID == actor.ID {
				filtered = append(filtered, network)
			}
		}
		networks = filtered
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"items": networks})
}

func (s *Server) handleDockerNetworkCreate(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Name    string `json:"name"`
		Subnet  string `json:"subnet"`
		Gateway string `json:"gateway"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, fmt.Errorf("invalid request body"))
		return
	}
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeError(w, http.StatusUnauthorized, fmt.Errorf("unauthorized"))
		return
	}
	owner, err := s.resolveDockerOwnerContext(actor, actor.ID)
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if err := docker.CreateNetworkForOwner(owner, payload.Name, payload.Subnet, payload.Gateway); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDockerNetworkDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.ensureNetworkAccess(r, id); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if err := docker.RemoveNetwork(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDockerImagesList(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeError(w, http.StatusUnauthorized, fmt.Errorf("unauthorized"))
		return
	}
	images, err := docker.ListImages()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if !auth.IsAdmin(actor.Role) {
		filtered := make([]docker.Image, 0, len(images))
		for _, image := range images {
			if imageOwnedBy(image, actor.ID) {
				filtered = append(filtered, image)
			}
		}
		images = filtered
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"items": images})
}

func (s *Server) handleDockerImageDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.ensureImageAccess(r, id); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if err := docker.RemoveImage(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDockerImagePull(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var payload dockerPullImageRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, fmt.Errorf("invalid request body"))
		return
	}
	if err := validateRegistryAuthPayload(payload.RegistryAuth); err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := docker.PullImage(payload.Image, payload.RegistryAuth); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "image": payload.Image})
}

func (s *Server) handleDockerTemplatesList(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeError(w, http.StatusUnauthorized, fmt.Errorf("unauthorized"))
		return
	}
	templates, err := s.database.ListComposeTemplates()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if !auth.IsAdmin(actor.Role) {
		filtered := make([]database.DockerComposeTemplate, 0, len(templates))
		for _, tmpl := range templates {
			if tmpl.OwnerUserID == actor.ID {
				filtered = append(filtered, tmpl)
			}
		}
		templates = filtered
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"items": templates})
}

func (s *Server) handleDockerTemplateCreate(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r)
	if user == nil {
		s.writeError(w, http.StatusUnauthorized, fmt.Errorf("unauthorized"))
		return
	}

	var payload struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		YAMLContent string `json:"yamlContent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, fmt.Errorf("invalid request body"))
		return
	}
	tmpl, err := s.database.CreateComposeTemplate(user.ID, payload.Name, payload.Description, payload.YAMLContent)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, tmpl)
}

func (s *Server) handleDockerTemplateUpdate(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r)
	if user == nil {
		s.writeError(w, http.StatusUnauthorized, fmt.Errorf("unauthorized"))
		return
	}

	idStr := r.PathValue("id")
	id, _ := strconv.ParseInt(idStr, 10, 64)
	var payload struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		YAMLContent string `json:"yamlContent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, fmt.Errorf("invalid request body"))
		return
	}
	ownerID := user.ID
	if auth.IsAdmin(user.Role) {
		ownerID = 0
	}
	if err := s.database.UpdateComposeTemplate(id, ownerID, payload.Name, payload.Description, payload.YAMLContent); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDockerTemplateDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, _ := strconv.ParseInt(idStr, 10, 64)
	user := userFromCtx(r)
	if user == nil {
		s.writeError(w, http.StatusUnauthorized, fmt.Errorf("unauthorized"))
		return
	}
	ownerID := user.ID
	if auth.IsAdmin(user.Role) {
		ownerID = 0
	}
	if err := s.database.DeleteComposeTemplateForOwner(id, ownerID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
func imageOwnedBy(image docker.Image, userID int64) bool {
	for _, ownerID := range image.OwnerUserIDs {
		if ownerID == userID {
			return true
		}
	}
	return false
}

func (s *Server) ensureImageAccess(r *http.Request, id string) error {
	actor := s.currentUserRecord(r)
	if actor == nil {
		return fmt.Errorf("unauthorized")
	}
	if auth.IsAdmin(actor.Role) {
		return nil
	}
	images, err := docker.ListImages()
	if err != nil {
		return err
	}
	for _, image := range images {
		if imageOwnedBy(image, actor.ID) && (image.ID == id || image.Repository == id || image.Repository+":"+image.Tag == id) {
			return nil
		}
	}
	return fmt.Errorf("forbidden: image bukan milik user ini")
}

func (s *Server) ensureNetworkAccess(r *http.Request, id string) error {
	actor := s.currentUserRecord(r)
	if actor == nil {
		return fmt.Errorf("unauthorized")
	}
	if auth.IsAdmin(actor.Role) {
		return nil
	}
	networks, err := docker.ListNetworks()
	if err != nil {
		return err
	}
	for _, network := range networks {
		if network.OwnerUserID == actor.ID && (network.ID == id || network.Name == id) {
			return nil
		}
	}
	return fmt.Errorf("forbidden: network bukan milik user ini")
}
