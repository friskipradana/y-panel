package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/k8s"
)

func (s *Server) resolveClusterKubeconfig(w http.ResponseWriter, r *http.Request) (*database.K8sCluster, string, *database.User, bool) {
	u := userFromCtx(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return nil, "", nil, false
	}
	rawID := strings.TrimSpace(r.PathValue("clusterId"))
	if rawID == "local-k3s" {
		if u.Role != auth.SuperadminRole {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses K3s lokal hanya untuk superadmin"})
			return nil, "", nil, false
		}
		return &database.K8sCluster{
			ID:               0,
			Name:             "K3s Lokal",
			Provider:         "k3s-local",
			APIServer:        "https://127.0.0.1:6443",
			DefaultNamespace: "default",
		}, "__k3s_local__", u, true
	}

	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID cluster tidak valid"})
		return nil, "", nil, false
	}
	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "database panel belum terhubung"})
		return nil, "", nil, false
	}
	cluster, err := s.database.GetK8sCluster(id)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return nil, "", nil, false
	}
	if cluster == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "cluster Kubernetes tidak ditemukan"})
		return nil, "", nil, false
	}
	if u.Role != auth.SuperadminRole && cluster.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "tidak memiliki akses ke cluster ini"})
		return nil, "", nil, false
	}
	if cluster.Provider == "k3s-local" {
		if u.Role != auth.SuperadminRole {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses K3s lokal hanya untuk superadmin"})
			return nil, "", nil, false
		}
		return cluster, "__k3s_local__", u, true
	}
	kubeconfig, err := crypto.Decrypt(s.cfg.EncryptionKey, cluster.KubeconfigEnc)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "gagal mendekripsi kubeconfig tersimpan"})
		return nil, "", nil, false
	}
	return cluster, kubeconfig, u, true
}

// handleK8sStatus returns host kubectl/K3s readiness and all clusters accessible to the signed-in admin.
func (s *Server) handleK8sStatus(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	host := k8s.DetectHost(r.Context())
	var clusters []database.K8sCluster
	if s.database != nil && s.database.IsConnected() {
		list, err := s.database.ListK8sClusters(u.ID, u.Role == auth.SuperadminRole)
		if err == nil {
			clusters = list
		}
	}
	if clusters == nil {
		clusters = make([]database.K8sCluster, 0)
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"host":     host,
		"clusters": clusters,
		"isSuper":  u.Role == auth.SuperadminRole,
	})
}

func (s *Server) handleK8sCreateCluster(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "database panel belum terhubung"})
		return
	}
	defer r.Body.Close()
	var req struct {
		Name             string `json:"name"`
		Provider         string `json:"provider"`
		DefaultNamespace string `json:"defaultNamespace"`
		Kubeconfig       string `json:"kubeconfig"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "nama cluster wajib diisi"})
		return
	}
	ns := strings.TrimSpace(req.DefaultNamespace)
	if ns == "" {
		ns = "default"
	}
	if !k8s.ValidNamespace(ns) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "namespace bawaan tidak valid"})
		return
	}

	provider := "external"
	apiServer := ""
	kubeEnc := ""
	if strings.EqualFold(strings.TrimSpace(req.Provider), "k3s-local") {
		if u.Role != auth.SuperadminRole {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "hanya superadmin yang dapat menautkan K3s lokal"})
			return
		}
		provider = "k3s-local"
		apiServer = "https://127.0.0.1:6443"
	} else {
		srv, err := k8s.ParseKubeconfigMeta(req.Kubeconfig)
		if err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
			return
		}
		enc, err := crypto.Encrypt(s.cfg.EncryptionKey, strings.TrimSpace(req.Kubeconfig))
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		apiServer = srv
		kubeEnc = enc
	}

	created, err := s.database.CreateK8sCluster(&database.K8sCluster{
		OwnerUserID:      u.ID,
		Name:             name,
		Provider:         provider,
		APIServer:        apiServer,
		DefaultNamespace: ns,
		KubeconfigEnc:    kubeEnc,
	})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "k8s.cluster.create", "ok", map[string]any{"id": created.ID, "name": created.Name, "provider": created.Provider})
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleK8sDeleteCluster(w http.ResponseWriter, r *http.Request) {
	cluster, _, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	if cluster.ID <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "cluster lokal bawaan tidak perlu dihapus dari daftar"})
		return
	}
	if err := s.database.DeleteK8sCluster(cluster.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "k8s.cluster.delete", "ok", map[string]any{"id": cluster.ID, "name": cluster.Name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleK8sInstallK3s(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil || u.Role != auth.SuperadminRole {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "hanya superadmin yang dapat memasang K3s"})
		return
	}
	var opts k8s.K3sInstallOptions
	if r.Body != nil {
		defer r.Body.Close()
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&opts)
	}

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)
	emit := func(payload map[string]any) {
		b, _ := json.Marshal(payload)
		_, _ = w.Write(append(b, '\n'))
		if flusher != nil {
			flusher.Flush()
		}
	}

	emit(map[string]any{"phase": "start", "line": "Memulai pemasangan K3s di host Linux..."})
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Minute)
	defer cancel()
	err := k8s.InstallK3s(ctx, opts, func(line string) {
		emit(map[string]any{"phase": "log", "line": line})
	})
	if err != nil {
		s.auditSensitiveAction(r, u, "k8s.k3s.install", "error", map[string]any{"error": err.Error()})
		emit(map[string]any{"phase": "error", "error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.k3s.install", "ok", map[string]any{"disableTraefik": opts.DisableTraefik})
	emit(map[string]any{"phase": "done", "line": "K3s berhasil terpasang dan aktif."})
}

func (s *Server) handleK8sUninstallK3s(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil || u.Role != auth.SuperadminRole {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "hanya superadmin yang dapat mencopot K3s"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Minute)
	defer cancel()
	var lines []string
	err := k8s.UninstallK3s(ctx, func(line string) {
		lines = append(lines, line)
	})
	if err != nil {
		s.auditSensitiveAction(r, u, "k8s.k3s.uninstall", "error", map[string]any{"error": err.Error()})
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error(), "logs": strings.Join(lines, "\n")})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.k3s.uninstall", "ok", nil)
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "logs": strings.Join(lines, "\n")})
}

func (s *Server) handleK8sJoinCommand(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil || u.Role != auth.SuperadminRole {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "hanya superadmin yang dapat membaca token K3s"})
		return
	}
	serverURL, token, command, err := k8s.ReadLocalK3sJoinCommand()
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"serverUrl": serverURL,
		"token":     token,
		"command":   command,
	})
}

func (s *Server) handleK8sSummary(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	sum, err := k8s.GetSummary(ctx, kubeconfig)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, sum)
}

func (s *Server) handleK8sNamespaces(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	items, err := k8s.ListNamespaces(ctx, kubeconfig)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}

func (s *Server) handleK8sCreateNamespace(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	defer r.Body.Close()
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := k8s.CreateNamespace(ctx, kubeconfig, strings.TrimSpace(req.Name)); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.namespace.create", "ok", map[string]any{"cluster": cluster.Name, "namespace": req.Name})
	s.writeJSON(w, http.StatusCreated, jsonResponse{"ok": true, "name": req.Name})
}

func (s *Server) handleK8sNodes(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	items, err := k8s.ListNodes(ctx, kubeconfig)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}

func (s *Server) handleK8sPods(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	items, err := k8s.ListPods(ctx, kubeconfig, ns)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}

func (s *Server) handleK8sDeletePod(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := k8s.DeletePod(ctx, kubeconfig, ns, name); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.pod.delete", "ok", map[string]any{"cluster": cluster.Name, "namespace": ns, "pod": name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleK8sPodLogs(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	container := r.URL.Query().Get("container")
	tail, _ := strconv.Atoi(r.URL.Query().Get("tail"))
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	logs, err := k8s.PodLogs(ctx, kubeconfig, ns, name, container, tail)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"logs": logs})
}

func (s *Server) handleK8sPodExec(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	defer r.Body.Close()
	var req struct {
		Container string `json:"container"`
		Command   string `json:"command"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	output, err := k8s.ExecPodCommand(ctx, kubeconfig, ns, name, req.Container, req.Command)
	s.auditSensitiveAction(r, u, "k8s.pod.exec", func() string {
		if err != nil {
			return "error"
		}
		return "ok"
	}(), map[string]any{"cluster": cluster.Name, "namespace": ns, "pod": name})
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error(), "output": output})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"output": output})
}

func (s *Server) handleK8sDeployments(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	items, err := k8s.ListDeployments(ctx, kubeconfig, ns)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}

func (s *Server) handleK8sScaleDeployment(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	defer r.Body.Close()
	var req struct {
		Replicas int `json:"replicas"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := k8s.ScaleDeployment(ctx, kubeconfig, ns, name, req.Replicas); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.deployment.scale", "ok", map[string]any{"cluster": cluster.Name, "namespace": ns, "deployment": name, "replicas": req.Replicas})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "replicas": req.Replicas})
}

func (s *Server) handleK8sRestartDeployment(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := k8s.RestartDeployment(ctx, kubeconfig, ns, name); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.deployment.restart", "ok", map[string]any{"cluster": cluster.Name, "namespace": ns, "deployment": name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleK8sServices(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	svcs, err := k8s.ListServices(ctx, kubeconfig, ns)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	ingresses, _ := k8s.ListIngresses(ctx, kubeconfig, ns)
	if ingresses == nil {
		ingresses = make([]k8s.IngressInfo, 0)
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"services":  svcs,
		"ingresses": ingresses,
	})
}

func (s *Server) handleK8sConfigs(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	items, err := k8s.ListConfigs(ctx, kubeconfig, ns)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}

func (s *Server) handleK8sGetYAML(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	kind := r.URL.Query().Get("kind")
	ns := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	yamlText, err := k8s.GetResourceYAML(ctx, kubeconfig, kind, ns, name)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"yaml": yamlText})
}

func (s *Server) handleK8sApplyYAML(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	defer r.Body.Close()
	var req struct {
		Namespace string `json:"namespace"`
		YAML      string `json:"yaml"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	out, err := k8s.ApplyYAML(ctx, kubeconfig, req.Namespace, req.YAML)
	if err != nil {
		s.auditSensitiveAction(r, u, "k8s.yaml.apply", "error", map[string]any{"cluster": cluster.Name, "error": err.Error()})
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error(), "output": out})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.yaml.apply", "ok", map[string]any{"cluster": cluster.Name, "namespace": req.Namespace})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "output": out})
}

func (s *Server) handleK8sDeleteResource(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	kind := r.URL.Query().Get("kind")
	ns := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := k8s.DeleteResource(ctx, kubeconfig, kind, ns, name); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.resource.delete", "ok", map[string]any{"cluster": cluster.Name, "kind": kind, "namespace": ns, "name": name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// handleK8sDeployProject (Stage 2) builds and applies a Deployment + Service manifest from a Reneo Project or image.
func (s *Server) handleK8sDeployProject(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	defer r.Body.Close()
	var spec k8s.ProjectDeploySpec
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&spec); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	res, err := k8s.DeployProjectToCluster(ctx, kubeconfig, spec)
	if err != nil {
		s.auditSensitiveAction(r, u, "k8s.project.deploy", "error", map[string]any{"cluster": cluster.Name, "name": spec.Name, "error": err.Error()})
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.project.deploy", "ok", map[string]any{"cluster": cluster.Name, "name": res.Name, "namespace": res.Namespace, "nodePort": res.NodePort})
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":       true,
		"result":   res,
		"message":  fmt.Sprintf("Deployment %s/%s berhasil diterapkan", res.Namespace, res.Name),
	})
}
