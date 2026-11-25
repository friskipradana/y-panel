package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/k8s"
)

func (s *Server) handleK8sEvents(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	items, err := k8s.ListEvents(ctx, kubeconfig, ns)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}

func (s *Server) handleK8sPodLogsSocket(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, actor, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	container := strings.TrimSpace(r.URL.Query().Get("container"))
	tail := 200
	if raw := strings.TrimSpace(r.URL.Query().Get("tail")); raw != "" {
		if parsed, convErr := strconv.Atoi(raw); convErr == nil {
			tail = parsed
		}
	}
	if !k8s.ValidNamespace(ns) || !k8s.ValidResourceName(name) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "namespace atau nama pod tidak valid"})
		return
	}
	if !takeLogStream(actor.ID) {
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "terlalu banyak aliran log terbuka; tutup salah satu terlebih dulu"})
		return
	}
	defer releaseLogStream(actor.ID)

	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	var writeMu sync.Mutex
	send := func(msg logStreamMessage) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(logWriteWait))
		return conn.WriteJSON(msg)
	}

	conn.SetReadLimit(1024)
	_ = conn.SetReadDeadline(time.Now().Add(logPongWait))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(logPongWait)) })
	go func() {
		defer cancel()
		for {
			if _, _, readErr := conn.ReadMessage(); readErr != nil {
				return
			}
			_ = conn.SetReadDeadline(time.Now().Add(logPongWait))
		}
	}()
	go func() {
		ticker := time.NewTicker(logPingPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				writeMu.Lock()
				pingErr := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(logWriteWait))
				writeMu.Unlock()
				if pingErr != nil {
					cancel()
					return
				}
			}
		}
	}()

	streamErr := k8s.StreamPodLogs(ctx, kubeconfig, ns, name, container, tail, func(lines []string) error {
		return send(logStreamMessage{Type: "lines", Lines: append([]string(nil), lines...)})
	})
	if ctx.Err() != nil && !errors.Is(streamErr, context.Canceled) {
		return
	}
	if streamErr != nil && !errors.Is(streamErr, context.Canceled) {
		log.Printf("[k8s] log stream of %s/%s ended: %v", ns, name, streamErr)
		_ = send(logStreamMessage{Type: "end", Error: streamErr.Error()})
		return
	}
	_ = send(logStreamMessage{Type: "end"})
}

func (s *Server) handleK8sDeployProjectSource(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "database panel belum terhubung"})
		return
	}
	defer r.Body.Close()
	var req struct {
		ProjectID     int64             `json:"projectId"`
		Name          string            `json:"name"`
		Namespace     string            `json:"namespace"`
		Port          int               `json:"port"`
		Replicas      int               `json:"replicas"`
		ServiceType   string            `json:"serviceType"`
		NodePort      int               `json:"nodePort"`
		RegistryImage string            `json:"registryImage"`
		Env           map[string]string `json:"env"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	if req.ProjectID <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "pilih proyek sumber terlebih dulu"})
		return
	}

	var (
		project *database.Project
		err     error
	)
	if u.Role == auth.SuperadminRole {
		project, err = s.database.GetProjectAny(req.ProjectID)
	} else {
		project, err = s.database.GetProject(req.ProjectID, u.ID)
	}
	if err != nil || project == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "proyek tidak ditemukan atau akses ditolak"})
		return
	}

	// Merge project's encrypted env vars with request overrides
	mergedEnv := map[string]string{}
	if strings.TrimSpace(project.Run.EnvEnc) != "" {
		if plain, decErr := crypto.Decrypt(s.cfg.EncryptionKey, project.Run.EnvEnc); decErr == nil {
			var parsed map[string]string
			if json.Unmarshal([]byte(plain), &parsed) == nil {
				for k, v := range parsed {
					mergedEnv[k] = v
				}
			}
		}
	}
	for k, v := range req.Env {
		mergedEnv[k] = v
	}

	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, _ := w.(http.Flusher)

	var encMu sync.Mutex
	emitJSON := func(payload map[string]any) {
		encMu.Lock()
		defer encMu.Unlock()
		b, _ := json.Marshal(payload)
		_, _ = w.Write(append(b, '\n'))
		if flusher != nil {
			flusher.Flush()
		}
	}

	workloadName := strings.TrimSpace(req.Name)
	if workloadName == "" {
		workloadName = project.Name
	}
	port := req.Port
	if port <= 0 {
		port = project.AssignedPort
	}
	if port <= 0 {
		port = project.ExposedPort
	}
	ns := strings.TrimSpace(req.Namespace)
	if ns == "" {
		ns = "default"
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Minute)
	defer cancel()

	isLocalK3s := kubeconfig == "__k3s_local__" || cluster.Provider == "k3s-local"
	res, deployErr := k8s.BuildAndDeployProjectSource(ctx, kubeconfig, isLocalK3s, k8s.SourceBuildSpec{
		ProjectName:   workloadName,
		WorkingDir:    project.WorkingDir,
		ProjectType:   project.ProjectType,
		SPAFallback:   project.SPAFallback,
		StartCommand:  project.Run.Start,
		Namespace:     ns,
		Port:          port,
		Replicas:      req.Replicas,
		ServiceType:   req.ServiceType,
		NodePort:      req.NodePort,
		RegistryImage: req.RegistryImage,
		Env:           mergedEnv,
	}, func(phase, line string) {
		emitJSON(map[string]any{"phase": phase, "line": line})
	})

	if deployErr != nil {
		s.auditSensitiveAction(r, u, "k8s.project.source_deploy", "error", map[string]any{"cluster": cluster.Name, "projectId": project.ID, "error": deployErr.Error()})
		emitJSON(map[string]any{"phase": "error", "error": deployErr.Error()})
		return
	}

	s.auditSensitiveAction(r, u, "k8s.project.source_deploy", "ok", map[string]any{"cluster": cluster.Name, "projectId": project.ID, "workload": res.Name, "namespace": res.Namespace, "nodePort": res.NodePort})
	msg := fmt.Sprintf("Proyek %s berhasil di-build dan dideploy ke %s/%s", project.Name, res.Namespace, res.Name)
	if res.NodePort > 0 {
		msg += fmt.Sprintf(" (NodePort %d)", res.NodePort)
	}
	emitJSON(map[string]any{"phase": "done", "result": res, "message": msg})
}
