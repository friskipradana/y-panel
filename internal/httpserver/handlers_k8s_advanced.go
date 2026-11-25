package httpserver

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/friskipradana/panel-desktop-ui/internal/k8s"
)

func (s *Server) handleK8sStorageBatch(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := strings.TrimSpace(r.URL.Query().Get("namespace"))
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	data, err := k8s.ListStorageAndBatch(ctx, kubeconfig, ns)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, data)
}

func (s *Server) handleK8sTriggerCronJob(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	out, err := k8s.TriggerCronJob(ctx, kubeconfig, ns, name)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.cronjob.trigger", "ok", map[string]any{"cluster": cluster.Name, "namespace": ns, "cronjob": name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "output": out})
}

func (s *Server) handleK8sHelmOverview(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	ov, err := k8s.ListHelmOverview(ctx, kubeconfig)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error(), "installed": ov != nil && ov.Installed})
		return
	}
	s.writeJSON(w, http.StatusOK, ov)
}

func (s *Server) handleK8sHelmInstall(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	defer r.Body.Close()
	var req struct {
		Release    string `json:"release"`
		Chart      string `json:"chart"`
		RepoName   string `json:"repoName"`
		RepoURL    string `json:"repoUrl"`
		Namespace  string `json:"namespace"`
		ValuesYAML string `json:"valuesYaml"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()
	out, err := k8s.InstallOrUpgradeHelm(ctx, kubeconfig, req.Release, req.Chart, req.RepoName, req.RepoURL, req.Namespace, req.ValuesYAML)
	if err != nil {
		s.auditSensitiveAction(r, u, "k8s.helm.install", "error", map[string]any{"cluster": cluster.Name, "release": req.Release, "chart": req.Chart, "error": err.Error()})
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.helm.install", "ok", map[string]any{"cluster": cluster.Name, "release": req.Release, "chart": req.Chart, "namespace": req.Namespace})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "output": out})
}

func (s *Server) handleK8sHelmValues(w http.ResponseWriter, r *http.Request) {
	_, kubeconfig, _, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	vals, err := k8s.GetHelmValues(ctx, kubeconfig, ns, name)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"values": vals})
}

func (s *Server) handleK8sHelmRollback(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	out, err := k8s.RollbackHelmRelease(ctx, kubeconfig, ns, name)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.helm.rollback", "ok", map[string]any{"cluster": cluster.Name, "namespace": ns, "release": name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "output": out})
}

func (s *Server) handleK8sHelmUninstall(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, u, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	out, err := k8s.UninstallHelmRelease(ctx, kubeconfig, ns, name)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "k8s.helm.uninstall", "ok", map[string]any{"cluster": cluster.Name, "namespace": ns, "release": name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "output": out})
}

// handleK8sPodShellSocket bridges an interactive pod shell (kubectl exec -i) to xterm over WebSocket.
func (s *Server) handleK8sPodShellSocket(w http.ResponseWriter, r *http.Request) {
	cluster, kubeconfig, actor, ok := s.resolveClusterKubeconfig(w, r)
	if !ok {
		return
	}
	ns := r.PathValue("ns")
	name := r.PathValue("name")
	container := strings.TrimSpace(r.URL.Query().Get("container"))
	shellBin := strings.TrimSpace(r.URL.Query().Get("shell"))
	if shellBin == "" {
		shellBin = "/bin/sh"
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	cmd, cleanup, err := k8s.PrepareKubectlShellCommand(ctx, kubeconfig, ns, name, container, shellBin)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	defer cleanup()

	stdin, err := cmd.StdinPipe()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	if err := cmd.Start(); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\nGagal memulai shell pod: "+err.Error()+"\r\n"))
		return
	}
	s.auditSensitiveAction(r, actor, "k8s.pod.shell", "ok", map[string]any{"cluster": cluster.Name, "namespace": ns, "pod": name})

	var writeMu sync.Mutex
	sendText := func(b []byte) {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		_ = conn.WriteMessage(websocket.TextMessage, b)
	}

	sendText([]byte("Connected to pod " + ns + "/" + name + " (" + shellBin + ")\r\n"))

	var pumpWG sync.WaitGroup
	pump := func(r io.Reader) {
		defer pumpWG.Done()
		buf := make([]byte, 4096)
		for {
			n, readErr := r.Read(buf)
			if n > 0 {
				chunk := strings.ReplaceAll(string(buf[:n]), "\n", "\r\n")
				sendText([]byte(chunk))
			}
			if readErr != nil {
				return
			}
		}
	}
	pumpWG.Add(2)
	go pump(stdout)
	go pump(stderr)

	go func() {
		defer cancel()
		defer stdin.Close()
		var lineBuf strings.Builder
		for {
			mt, data, readErr := conn.ReadMessage()
			if readErr != nil {
				return
			}
			if mt != websocket.TextMessage && mt != websocket.BinaryMessage {
				continue
			}
			// Ignore JSON resize frames cleanly
			if len(data) > 0 && data[0] == '{' && strings.Contains(string(data), `"type":"resize"`) {
				continue
			}
			for _, ch := range string(data) {
				switch ch {
				case '\r', '\n':
					sendText([]byte("\r\n"))
					_, _ = io.WriteString(stdin, lineBuf.String()+"\n")
					lineBuf.Reset()
				case 0x7f, 0x08: // backspace
					cur := lineBuf.String()
					if len(cur) > 0 {
						lineBuf.Reset()
						lineBuf.WriteString(cur[:len(cur)-1])
						sendText([]byte("\b \b"))
					}
				case 0x03: // Ctrl+C
					lineBuf.Reset()
					sendText([]byte("^C\r\n"))
				case 0x04: // Ctrl+D
					return
				default:
					lineBuf.WriteRune(ch)
					sendText([]byte(string(ch)))
				}
			}
		}
	}()

	_ = cmd.Wait()
	pumpWG.Wait()
	sendText([]byte("\r\n[shell closed]\r\n"))
}
