package httpserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

func (s *Server) handleDockerNetworksList(w http.ResponseWriter, r *http.Request) {
	networks, err := docker.ListNetworks()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
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
	if err := docker.CreateNetwork(payload.Name, payload.Subnet, payload.Gateway); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDockerNetworkDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := docker.RemoveNetwork(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDockerImagesList(w http.ResponseWriter, r *http.Request) {
	images, err := docker.ListImages()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"items": images})
}

func (s *Server) handleDockerImageDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
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
	templates, err := s.database.ListComposeTemplates()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]any{"items": templates})
}

func (s *Server) handleDockerTemplateCreate(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		YAMLContent string `json:"yamlContent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeError(w, http.StatusBadRequest, fmt.Errorf("invalid request body"))
		return
	}
	tmpl, err := s.database.CreateComposeTemplate(payload.Name, payload.Description, payload.YAMLContent)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, tmpl)
}

func (s *Server) handleDockerTemplateUpdate(w http.ResponseWriter, r *http.Request) {
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
	if err := s.database.UpdateComposeTemplate(id, payload.Name, payload.Description, payload.YAMLContent); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleDockerTemplateDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, _ := strconv.ParseInt(idStr, 10, 64)
	if err := s.database.DeleteComposeTemplate(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
