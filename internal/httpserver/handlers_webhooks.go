package httpserver

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/k8s"
)

var (
	webhookDeployMu sync.Mutex
	webhookRunning  = map[int64]bool{}
)

func claimWebhookDeploy(projectID int64) bool {
	webhookDeployMu.Lock()
	defer webhookDeployMu.Unlock()
	if webhookRunning[projectID] {
		return false
	}
	webhookRunning[projectID] = true
	return true
}

func releaseWebhookDeploy(projectID int64) {
	webhookDeployMu.Lock()
	defer webhookDeployMu.Unlock()
	delete(webhookRunning, projectID)
}

func randomHexToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Server) ownedProjectForWebhook(w http.ResponseWriter, r *http.Request) (*database.Project, *database.User, bool) {
	u := userFromCtx(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return nil, nil, false
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID proyek tidak valid"})
		return nil, nil, false
	}
	var proj *database.Project
	if u.Role == auth.SuperadminRole {
		proj, err = s.database.GetProjectAny(id)
	} else {
		proj, err = s.database.GetProject(id, u.ID)
	}
	if err != nil || proj == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "proyek tidak ditemukan"})
		return nil, nil, false
	}
	return proj, u, true
}

func (s *Server) handleGetProjectWebhook(w http.ResponseWriter, r *http.Request) {
	proj, _, ok := s.ownedProjectForWebhook(w, r)
	if !ok {
		return
	}
	wh, err := s.database.GetProjectWebhookByProject(proj.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	logs, _ := s.database.ListProjectDeployLogs(proj.ID, 15)
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"webhook": wh,
		"logs":    logs,
	})
}

func (s *Server) handleSaveProjectWebhook(w http.ResponseWriter, r *http.Request) {
	proj, u, ok := s.ownedProjectForWebhook(w, r)
	if !ok {
		return
	}
	defer r.Body.Close()
	var req struct {
		Enabled       bool   `json:"enabled"`
		Secret        string `json:"secret"`
		RotateToken   bool   `json:"rotateToken"`
		Branch        string `json:"branch"`
		DeployMode    string `json:"deployMode"`
		K8sClusterID  string `json:"k8sClusterId"`
		K8sNamespace  string `json:"k8sNamespace"`
		NotifyEnabled bool   `json:"notifyEnabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	existing, _ := s.database.GetProjectWebhookByProject(proj.ID)
	token := ""
	if existing == nil || req.RotateToken || existing.Token == "" {
		token = randomHexToken(24)
	}
	secretEnc := ""
	if strings.TrimSpace(req.Secret) != "" {
		enc, err := crypto.Encrypt(s.cfg.EncryptionKey, strings.TrimSpace(req.Secret))
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		secretEnc = enc
	}
	branch := strings.TrimSpace(req.Branch)
	if branch == "" {
		branch = "main"
	}
	mode := strings.ToLower(strings.TrimSpace(req.DeployMode))
	if mode != "k8s" {
		mode = "project"
	}
	k8sNS := strings.TrimSpace(req.K8sNamespace)
	if k8sNS == "" {
		k8sNS = "default"
	}

	saved, err := s.database.UpsertProjectWebhook(database.ProjectWebhook{
		ProjectID:     proj.ID,
		OwnerUserID:   proj.UserID,
		Enabled:       req.Enabled,
		Token:         token,
		SecretEnc:     secretEnc,
		Branch:        branch,
		DeployMode:    mode,
		K8sClusterID:  strings.TrimSpace(req.K8sClusterID),
		K8sNamespace:  k8sNS,
		NotifyEnabled: req.NotifyEnabled,
	})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "project.webhook.save", "ok", map[string]any{"project": proj.Name, "enabled": saved.Enabled, "branch": saved.Branch})
	s.writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleTriggerProjectWebhook(w http.ResponseWriter, r *http.Request) {
	proj, u, ok := s.ownedProjectForWebhook(w, r)
	if !ok {
		return
	}
	wh, _ := s.database.GetProjectWebhookByProject(proj.ID)
	if wh == nil {
		wh = &database.ProjectWebhook{
			ProjectID:     proj.ID,
			OwnerUserID:   proj.UserID,
			Branch:        "main",
			DeployMode:    "project",
			NotifyEnabled: true,
		}
	}
	if !claimWebhookDeploy(proj.ID) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "deploy proyek ini sedang berjalan"})
		return
	}
	go func() {
		defer releaseWebhookDeploy(proj.ID)
		ctx, cancel := context.WithTimeout(s.bgCtx, 15*time.Minute)
		defer cancel()
		s.executeProjectGitDeploy(ctx, proj, wh, "manual", wh.Branch, "")
	}()
	s.auditSensitiveAction(r, u, "project.webhook.trigger", "ok", map[string]any{"project": proj.Name})
	s.writeJSON(w, http.StatusAccepted, jsonResponse{"ok": true, "message": "Git pull & deploy dimulai di latar belakang"})
}

func (s *Server) handleGitWebhookReceive(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.PathValue("token"))
	if len(token) < 16 {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "webhook tidak ditemukan"})
		return
	}
	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "database belum terhubung"})
		return
	}
	wh, err := s.database.GetProjectWebhookByToken(token)
	if err != nil || wh == nil || !wh.Enabled {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "webhook tidak aktif atau tidak ditemukan"})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "gagal membaca body webhook"})
		return
	}

	// Verify HMAC-SHA256 (GitHub / Gitea) or GitLab X-Gitlab-Token if secret is configured
	if wh.SecretEnc != "" {
		plainSecret, decErr := crypto.Decrypt(s.cfg.EncryptionKey, wh.SecretEnc)
		if decErr != nil {
			s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "gagal memverifikasi secret webhook"})
			return
		}
		if !verifyGitWebhookSignature(r, body, plainSecret) {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "signature webhook tidak valid"})
			return
		}
	}

	// Handle GitHub ping event cleanly
	if strings.EqualFold(r.Header.Get("X-GitHub-Event"), "ping") {
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "event": "ping"})
		return
	}

	// Parse pushed ref & head commit
	var payload struct {
		Ref        string `json:"ref"`
		After      string `json:"after"`
		HeadCommit struct {
			ID string `json:"id"`
		} `json:"head_commit"`
	}
	_ = json.Unmarshal(body, &payload)
	pushedBranch := strings.TrimPrefix(strings.TrimSpace(payload.Ref), "refs/heads/")
	targetBranch := strings.TrimSpace(wh.Branch)
	if targetBranch != "" && pushedBranch != "" && pushedBranch != targetBranch {
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "skipped": true, "reason": "branch tidak cocok"})
		return
	}
	commitSHA := payload.HeadCommit.ID
	if commitSHA == "" {
		commitSHA = payload.After
	}
	if len(commitSHA) > 12 {
		commitSHA = commitSHA[:12]
	}

	proj, err := s.database.GetProjectAny(wh.ProjectID)
	if err != nil || proj == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "proyek tidak ditemukan"})
		return
	}
	if !claimWebhookDeploy(proj.ID) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "deploy proyek ini sedang berjalan"})
		return
	}

	go func() {
		defer releaseWebhookDeploy(proj.ID)
		ctx, cancel := context.WithTimeout(s.bgCtx, 15*time.Minute)
		defer cancel()
		s.executeProjectGitDeploy(ctx, proj, wh, "webhook", targetBranch, commitSHA)
	}()

	s.writeJSON(w, http.StatusAccepted, jsonResponse{"ok": true, "project": proj.Name, "branch": targetBranch, "commit": commitSHA})
}

func verifyGitWebhookSignature(r *http.Request, body []byte, secret string) bool {
	if glToken := strings.TrimSpace(r.Header.Get("X-Gitlab-Token")); glToken != "" {
		return subtle.ConstantTimeCompare([]byte(glToken), []byte(secret)) == 1
	}
	sig := strings.TrimSpace(r.Header.Get("X-Hub-Signature-256"))
	if sig == "" {
		sig = strings.TrimSpace(r.Header.Get("X-Gitea-Signature"))
	}
	if sig == "" {
		return false
	}
	sig = strings.TrimPrefix(sig, "sha256=")
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(strings.ToLower(sig)), []byte(expected))
}

func (s *Server) executeProjectGitDeploy(ctx context.Context, proj *database.Project, wh *database.ProjectWebhook, trigger, branch, commitSHA string) {
	logID, _ := s.database.CreateProjectDeployLog(proj.ID, trigger, branch, commitSHA)
	var out bytes.Buffer
	appendLog := func(line string) {
		out.WriteString(line)
		if !strings.HasSuffix(line, "\n") {
			out.WriteByte('\n')
		}
	}

	finish := func(status, sha string) {
		if logID > 0 {
			_ = s.database.FinishProjectDeployLog(logID, status, sha, out.String())
		}
		_ = s.database.MarkProjectWebhookRan(proj.ID, status, sha)
		if wh.NotifyEnabled {
			if status == "success" {
				s.notifyUserAction(proj.UserID, fmt.Sprintf("Auto-Deploy Sukses: %s", proj.Name), fmt.Sprintf("Branch %s (%s) berhasil dideploy.", branch, sha), "success")
			} else {
				s.notifyUserAction(proj.UserID, fmt.Sprintf("Auto-Deploy Gagal: %s", proj.Name), fmt.Sprintf("Deploy proyek %s (%s) gagal. Periksa log webhook.", proj.Name, branch), "error")
			}
		}
	}

	if strings.TrimSpace(proj.WorkingDir) == "" {
		appendLog("ERROR: Proyek belum memiliki folder kerja (workingDir).")
		finish("failed", commitSHA)
		return
	}

	// 1. git pull
	appendLog(fmt.Sprintf("== Git pull (%s) di %s ==", branch, proj.WorkingDir))
	pullArgs := []string{"-C", proj.WorkingDir, "pull", "--ff-only"}
	if branch != "" {
		pullArgs = append(pullArgs, "origin", branch)
	}
	gitCmd := exec.CommandContext(ctx, "git", pullArgs...)
	gitOut, gitErr := gitCmd.CombinedOutput()
	appendLog(strings.TrimSpace(string(gitOut)))
	if gitErr != nil {
		appendLog("ERROR git pull: " + gitErr.Error())
		finish("failed", commitSHA)
		return
	}
	if revOut, revErr := exec.CommandContext(ctx, "git", "-C", proj.WorkingDir, "rev-parse", "--short", "HEAD").Output(); revErr == nil {
		if short := strings.TrimSpace(string(revOut)); short != "" {
			commitSHA = short
		}
	}

	// 2. Deploy to K8s OR rebuild/restart local Reneo project
	if wh.DeployMode == "k8s" && wh.K8sClusterID != "" {
		appendLog(fmt.Sprintf("== Auto-Build & Deploy ke Kubernetes (%s / %s) ==", wh.K8sClusterID, wh.K8sNamespace))
		kubeconfig, isLocalK3s, kcErr := s.resolveKubeconfigByID(wh.K8sClusterID, proj.UserID)
		if kcErr != nil {
			appendLog("ERROR kubeconfig: " + kcErr.Error())
			finish("failed", commitSHA)
			return
		}
		mergedEnv := map[string]string{}
		if strings.TrimSpace(proj.Run.EnvEnc) != "" {
			if plain, decErr := crypto.Decrypt(s.cfg.EncryptionKey, proj.Run.EnvEnc); decErr == nil {
				_ = json.Unmarshal([]byte(plain), &mergedEnv)
			}
		}
		res, depErr := k8s.BuildAndDeployProjectSource(ctx, kubeconfig, isLocalK3s, k8s.SourceBuildSpec{
			ProjectName:  proj.Name,
			WorkingDir:   proj.WorkingDir,
			ProjectType:  proj.ProjectType,
			SPAFallback:  proj.SPAFallback,
			StartCommand: proj.Run.Start,
			Namespace:    wh.K8sNamespace,
			Port:         proj.AssignedPort,
			Replicas:     1,
			ServiceType:  "NodePort",
			Env:          mergedEnv,
		}, func(phase, line string) {
			appendLog(fmt.Sprintf("[%s] %s", phase, line))
		})
		if depErr != nil {
			appendLog("ERROR K8s deploy: " + depErr.Error())
			finish("failed", commitSHA)
			return
		}
		appendLog(fmt.Sprintf("Deployed %s/%s (NodePort %d)", res.Namespace, res.Name, res.NodePort))
		finish("success", commitSHA)
		return
	}

	// Local project restart/rebuild
	owner, err := s.database.GetUserByID(proj.UserID)
	if err != nil || owner == nil {
		appendLog("ERROR: Akun pemilik proyek tidak ditemukan.")
		finish("failed", commitSHA)
		return
	}
	appendLog("== Restarting Reneo project ==")
	_ = s.projectManager.StopProject(*proj)
	if _, startErr := s.projectManager.StartAndWait(owner, proj, 30*time.Second); startErr != nil {
		log.Printf("[webhook] restart project %s failed: %v", proj.Name, startErr)
		appendLog("ERROR restart proyek: " + startErr.Error())
		finish("failed", commitSHA)
		return
	}
	appendLog("Proyek berhasil diperbarui dan dijalankan ulang.")
	finish("success", commitSHA)
}

func (s *Server) resolveKubeconfigByID(rawID string, ownerID int64) (string, bool, error) {
	if rawID == "local-k3s" {
		return "__k3s_local__", true, nil
	}
	id, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || id <= 0 {
		return "", false, fmt.Errorf("ID cluster K8s tidak valid")
	}
	c, err := s.database.GetK8sCluster(id)
	if err != nil || c == nil {
		return "", false, fmt.Errorf("cluster K8s tidak ditemukan")
	}
	if c.Provider == "k3s-local" {
		return "__k3s_local__", true, nil
	}
	if c.OwnerUserID != ownerID {
		u, _ := s.database.GetUserByID(ownerID)
		if u == nil || u.Role != auth.SuperadminRole {
			return "", false, fmt.Errorf("akses ke cluster K8s ditolak")
		}
	}
	plain, err := crypto.Decrypt(s.cfg.EncryptionKey, c.KubeconfigEnc)
	return plain, false, err
}
