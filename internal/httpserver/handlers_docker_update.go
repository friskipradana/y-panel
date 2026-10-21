package httpserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

// Updating from the Docker window: the newest image is downloaded and, for a container made by compose, the container is made
// again from it. What docker prints is sent as it comes, one JSON line each, so the window shows the download and then the state
// of the container.

// startLineStream answers with a stream of JSON lines; the returned function sends one.
func startLineStream(w http.ResponseWriter) func(any) {
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")
	// a proxy in front must not hold the lines back
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	encoder := json.NewEncoder(w)
	return func(event any) {
		_ = encoder.Encode(event)
		if flusher != nil {
			flusher.Flush()
		}
	}
}

// startEventStream is the stream of the update window
func startEventStream(w http.ResponseWriter) func(docker.UpdateEvent) {
	send := startLineStream(w)
	return func(event docker.UpdateEvent) { send(event) }
}

func (s *Server) handleContainerUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing container id"})
		return
	}
	actor, err := s.ensureContainerAccess(r, id)
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	if containers, listErr := docker.ListContainers(); listErr == nil {
		for _, c := range containers {
			if (c.ID == id || strings.HasPrefix(c.ID, id)) && docker.ManagedKind(c) != "" {
				s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "this container belongs to the Database window: manage it there"})
				return
			}
		}
	}
	emit := startEventStream(w)
	result := "ok"
	if err := docker.UpdateContainer(r.Context(), id, emit); err != nil {
		result = "failed"
		emit(docker.UpdateEvent{Type: "error", Error: err.Error()})
	}
	s.auditSensitiveAction(r, actor, "docker.container.update", result, map[string]any{"container": id})
}

// handleDockerImageUpdate downloads the newest version of an image and lists the containers made from the one that was there.
func (s *Server) handleDockerImageUpdate(w http.ResponseWriter, r *http.Request) {
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
	image := strings.TrimSpace(payload.Image)
	if image == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "image is required"})
		return
	}
	actor := s.currentUserRecord(r)
	emit := startEventStream(w)
	result := "ok"
	changed, err := docker.PullStreaming(r.Context(), image, payload.RegistryAuth, emit)
	if err != nil {
		result = "failed"
		emit(docker.UpdateEvent{Type: "error", Error: err.Error()})
	} else {
		if containers, listErr := docker.ContainersOfImage(image); listErr == nil {
			var statuses []docker.UpdateContainerStatus
			for _, c := range s.filterContainersForUser(actor, containers) {
				statuses = append(statuses, docker.StatusOfContainer(c))
			}
			emit(docker.UpdateEvent{Type: "containers", Containers: statuses})
		}
		emit(docker.UpdateEvent{Type: "done", Changed: &changed})
	}
	s.auditSensitiveAction(r, actor, "docker.image.update", result, map[string]any{"image": image})
}
