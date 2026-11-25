package httpserver

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/backup"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/k8s"
	"github.com/friskipradana/panel-desktop-ui/internal/runtimepath"
	"github.com/friskipradana/panel-desktop-ui/internal/userdb"
)

var (
	backupRunningMu sync.Mutex
	backupRunning   = map[int64]bool{}
)

func claimBackupJob(jobID int64) bool {
	backupRunningMu.Lock()
	defer backupRunningMu.Unlock()
	if backupRunning[jobID] {
		return false
	}
	backupRunning[jobID] = true
	return true
}

func releaseBackupJob(jobID int64) {
	backupRunningMu.Lock()
	defer backupRunningMu.Unlock()
	delete(backupRunning, jobID)
}

func (s *Server) runBackupSchedulerLoop(interval time.Duration, stop <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			if s.database == nil || !s.database.IsConnected() {
				continue
			}
			due, err := s.database.ListDueBackupJobs(time.Now())
			if err != nil {
				continue
			}
			for _, job := range due {
				if !claimBackupJob(job.ID) {
					continue
				}
				j := job
				go func() {
					defer releaseBackupJob(j.ID)
					ctx, cancel := context.WithTimeout(s.bgCtx, 30*time.Minute)
					defer cancel()
					if _, runErr := s.executeBackupJob(ctx, &j); runErr != nil {
						log.Printf("[backups] scheduled job id=%d name=%q failed: %v", j.ID, j.Name, runErr)
					}
				}()
			}
		}
	}
}

func defaultBackupDir() string {
	return filepath.Join(runtimepath.StateDir(), "backups")
}

func (s *Server) buildS3Client(target *database.BackupTarget) (*backup.S3Client, error) {
	accessKey, err := crypto.Decrypt(s.cfg.EncryptionKey, target.S3AccessKeyEnc)
	if err != nil {
		return nil, errors.New("gagal mendekripsi Access Key S3/R2")
	}
	secretKey, err := crypto.Decrypt(s.cfg.EncryptionKey, target.S3SecretKeyEnc)
	if err != nil {
		return nil, errors.New("gagal mendekripsi Secret Key S3/R2")
	}
	return backup.NewS3Client(backup.S3Config{
		Endpoint:       target.S3Endpoint,
		Region:         target.S3Region,
		Bucket:         target.S3Bucket,
		Prefix:         target.S3Prefix,
		AccessKey:      accessKey,
		SecretKey:      secretKey,
		ForcePathStyle: target.S3ForcePath,
	})
}

func (s *Server) findDatabaseForBackup(dbID, ownerID int64, isSuper bool) (*database.ManagedDatabase, error) {
	if !isSuper {
		return s.database.GetManagedDatabase(dbID, ownerID)
	}
	all, err := s.database.ListManagedDatabases(0, true)
	if err != nil {
		return nil, err
	}
	for i := range all {
		if all[i].ID == dbID {
			return &all[i], nil
		}
	}
	return nil, nil
}

func (s *Server) executeBackupJob(ctx context.Context, job *database.BackupJob) (*database.BackupRun, error) {
	target, err := s.database.GetBackupTarget(job.TargetID)
	if err != nil || target == nil {
		return nil, errors.New("tujuan storage backup tidak ditemukan")
	}

	ts := time.Now().UTC().Format("20060102-150405")
	slug := k8s.SanitizeK8sName(job.ResourceName)
	if slug == "" {
		slug = fmt.Sprintf("%s-%d", job.Scope, job.ResourceID)
	}
	ext := ".tar.gz"
	if job.Scope == "database" {
		ext = ".sql.gz"
	}
	fileName := fmt.Sprintf("%s-%s-%s%s", job.Scope, slug, ts, ext)

	run, err := s.database.CreateBackupRun(database.BackupRun{
		JobID:        job.ID,
		OwnerUserID:  job.OwnerUserID,
		TargetID:     target.ID,
		Scope:        job.Scope,
		ResourceID:   job.ResourceID,
		ResourceName: job.ResourceName,
		StorageKind:  target.Kind,
		StorageKey:   fileName,
	})
	if err != nil {
		return nil, err
	}

	failRun := func(runErr error) (*database.BackupRun, error) {
		_ = s.database.FinishBackupRun(run.ID, "failed", run.StorageKey, 0, "", runErr.Error())
		_ = s.database.MarkBackupJobRan(job.ID, "failed", job.IntervalHours, job.Enabled)
		s.notifyUserAction(job.OwnerUserID, fmt.Sprintf("Backup Gagal: %s", job.Name), runErr.Error(), "error")
		return nil, runErr
	}

	// Stage archive to temporary file first so we can compute exact size + SHA-256
	tmpFile, err := os.CreateTemp("", "reneo-backup-*"+ext)
	if err != nil {
		return failRun(err)
	}
	tmpPath := tmpFile.Name()
	defer func() { _ = os.Remove(tmpPath) }()

	switch job.Scope {
	case "database":
		dbItem, dbErr := s.findDatabaseForBackup(job.ResourceID, job.OwnerUserID, true)
		if dbErr != nil || dbItem == nil {
			_ = tmpFile.Close()
			return failRun(errors.New("database target tidak ditemukan"))
		}
		engine, ok := userdb.Lookup(dbItem.Engine)
		if !ok || !userdb.IsSQL(engine) {
			_ = tmpFile.Close()
			return failRun(errors.New("backup SQL otomatis saat ini mendukung PostgreSQL, MySQL, dan MariaDB"))
		}
		if userdb.State(dbItem.ID) != "running" {
			_ = tmpFile.Close()
			return failRun(errors.New("container database sedang berhenti; jalankan database terlebih dulu"))
		}
		plainPwd, decErr := crypto.Decrypt(s.cfg.EncryptionKey, dbItem.PasswordEncrypted)
		if decErr != nil {
			_ = tmpFile.Close()
			return failRun(errors.New("kredensial database tidak dapat didekripsi"))
		}
		conn := userdb.Conn{
			ID:       dbItem.ID,
			Engine:   engine,
			Database: dbItem.DatabaseName,
			User:     dbItem.Username,
			Password: plainPwd,
		}
		gz := gzip.NewWriter(tmpFile)
		dumpErr := userdb.ExportSQL(ctx, conn, gz)
		gzCloseErr := gz.Close()
		fileCloseErr := tmpFile.Close()
		if dumpErr != nil {
			return failRun(dumpErr)
		}
		if gzCloseErr != nil {
			return failRun(gzCloseErr)
		}
		if fileCloseErr != nil {
			return failRun(fileCloseErr)
		}
	case "project":
		proj, pErr := s.database.GetProjectAny(job.ResourceID)
		if pErr != nil || proj == nil {
			_ = tmpFile.Close()
			return failRun(errors.New("proyek target tidak ditemukan"))
		}
		archErr := backup.ArchiveDirectoryTarGz(proj.WorkingDir, tmpFile)
		fileCloseErr := tmpFile.Close()
		if archErr != nil {
			return failRun(archErr)
		}
		if fileCloseErr != nil {
			return failRun(fileCloseErr)
		}
	case "docker-volume":
		archErr := backup.ArchiveDockerVolume(ctx, job.ResourceName, tmpFile)
		fileCloseErr := tmpFile.Close()
		if archErr != nil {
			return failRun(archErr)
		}
		if fileCloseErr != nil {
			return failRun(fileCloseErr)
		}
	case "panel-config":
		archErr := backup.ArchivePanelConfig(runtimepath.StateDir(), tmpFile)
		fileCloseErr := tmpFile.Close()
		if archErr != nil {
			return failRun(archErr)
		}
		if fileCloseErr != nil {
			return failRun(fileCloseErr)
		}
	default:
		_ = tmpFile.Close()
		return failRun(errors.New("tipe scope backup tidak dikenal"))
	}

	sizeBytes, shaHex, err := backup.HashFile(tmpPath)
	if err != nil {
		return failRun(err)
	}

	storageKey := fileName
	if target.Kind == "s3" {
		s3c, s3Err := s.buildS3Client(target)
		if s3Err != nil {
			return failRun(s3Err)
		}
		storageKey = s3c.FullKey(fileName)
		if upErr := s3c.PutFile(ctx, storageKey, tmpPath, shaHex, sizeBytes); upErr != nil {
			return failRun(upErr)
		}
	} else {
		dir := strings.TrimSpace(target.LocalDir)
		if dir == "" {
			dir = defaultBackupDir()
		}
		if mkErr := os.MkdirAll(dir, 0o750); mkErr != nil {
			return failRun(fmt.Errorf("gagal membuat folder backup lokal: %w", mkErr))
		}
		destPath := filepath.Join(dir, fileName)
		if mvErr := copyFileAtomic(tmpPath, destPath); mvErr != nil {
			return failRun(mvErr)
		}
		storageKey = destPath
	}

	if err := s.database.FinishBackupRun(run.ID, "success", storageKey, sizeBytes, shaHex, ""); err != nil {
		return nil, err
	}
	_ = s.database.MarkBackupJobRan(job.ID, "success", job.IntervalHours, job.Enabled)
	s.notifyUserAction(job.OwnerUserID, fmt.Sprintf("Backup Selesai: %s", job.Name), fmt.Sprintf("Arsip %s (%d KB) tersimpan di %s.", job.ResourceName, sizeBytes/1024, target.Name), "success")

	// Retention pruning
	if job.RetentionCount > 0 {
		if expired, expErr := s.database.ListExpiredBackupRuns(job.ID, job.RetentionCount); expErr == nil {
			for _, old := range expired {
				s.deleteBackupArtifact(ctx, target, old.StorageKey)
				_ = s.database.DeleteBackupRun(old.ID)
			}
		}
	}

	return s.database.GetBackupRun(run.ID)
}

func copyFileAtomic(srcPath, destPath string) error {
	src, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer src.Close()
	tmpDest := destPath + ".part"
	dst, err := os.OpenFile(tmpDest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(dst, src); err != nil {
		_ = dst.Close()
		_ = os.Remove(tmpDest)
		return err
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(tmpDest)
		return err
	}
	return os.Rename(tmpDest, destPath)
}

func (s *Server) deleteBackupArtifact(ctx context.Context, target *database.BackupTarget, storageKey string) {
	if target == nil || strings.TrimSpace(storageKey) == "" {
		return
	}
	if target.Kind == "s3" {
		if s3c, err := s.buildS3Client(target); err == nil {
			_ = s3c.DeleteObject(ctx, storageKey)
		}
		return
	}
	_ = os.Remove(storageKey)
}

func (s *Server) handleBackupOverview(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "database panel belum terhubung"})
		return
	}
	isSuper := u.Role == auth.SuperadminRole
	targets, err := s.database.ListBackupTargets(u.ID, isSuper)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	jobs, err := s.database.ListBackupJobs(u.ID, isSuper)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	runs, err := s.database.ListBackupRuns(u.ID, isSuper, 60)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	dbs, _ := s.database.ListManagedDatabases(u.ID, isSuper)
	dbOptions := make([]map[string]any, 0, len(dbs))
	for _, d := range dbs {
		eng, ok := userdb.Lookup(d.Engine)
		if ok && userdb.IsSQL(eng) {
			dbOptions = append(dbOptions, map[string]any{"id": d.ID, "name": d.Name, "engine": d.Engine})
		}
	}
	var projs []database.Project
	if isSuper {
		projs, _, _ = s.database.ListAllProjects(200, 0)
	} else {
		projs, _ = s.database.ListProjects(u.ID)
	}
	projOptions := make([]map[string]any, 0, len(projs))
	for _, p := range projs {
		if strings.TrimSpace(p.WorkingDir) != "" {
			projOptions = append(projOptions, map[string]any{"id": p.ID, "name": p.Name, "workingDir": p.WorkingDir})
		}
	}
	var volumes []string
	if isSuper {
		volumes, _ = backup.ListDockerVolumeNames(r.Context())
	} else {
		volumes = []string{}
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"targets":         targets,
		"jobs":            jobs,
		"runs":            runs,
		"databases":       dbOptions,
		"projects":        projOptions,
		"volumes":         volumes,
		"isSuper":         isSuper,
		"defaultLocalDir": defaultBackupDir(),
	})
}

func (s *Server) handleCreateBackupTarget(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	defer r.Body.Close()
	var req struct {
		Name             string `json:"name"`
		Kind             string `json:"kind"`
		LocalDir         string `json:"localDir"`
		S3Endpoint       string `json:"s3Endpoint"`
		S3Region         string `json:"s3Region"`
		S3Bucket         string `json:"s3Bucket"`
		S3Prefix         string `json:"s3Prefix"`
		S3AccessKey      string `json:"s3AccessKey"`
		S3SecretKey      string `json:"s3SecretKey"`
		S3ForcePathStyle bool   `json:"s3ForcePathStyle"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Kind = strings.ToLower(strings.TrimSpace(req.Kind))
	if req.Name == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "nama storage target wajib diisi"})
		return
	}
	if req.Kind != "local" && req.Kind != "s3" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "jenis target harus local atau s3"})
		return
	}
	rec := database.BackupTarget{
		OwnerUserID: u.ID,
		Name:        req.Name,
		Kind:        req.Kind,
	}
	if req.Kind == "local" {
		dir := strings.TrimSpace(req.LocalDir)
		if dir == "" {
			dir = defaultBackupDir()
		}
		if u.Role != auth.SuperadminRole && !strings.HasPrefix(filepath.Clean(dir), filepath.Clean(defaultBackupDir())) {
			dir = filepath.Join(defaultBackupDir(), fmt.Sprintf("user-%d", u.ID))
		}
		rec.LocalDir = dir
	} else {
		if strings.TrimSpace(req.S3Bucket) == "" || strings.TrimSpace(req.S3AccessKey) == "" || strings.TrimSpace(req.S3SecretKey) == "" {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "Bucket, Access Key, dan Secret Key S3/R2 wajib diisi"})
			return
		}
		encAccess, err := crypto.Encrypt(s.cfg.EncryptionKey, strings.TrimSpace(req.S3AccessKey))
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		encSecret, err := crypto.Encrypt(s.cfg.EncryptionKey, strings.TrimSpace(req.S3SecretKey))
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		rec.S3Endpoint = strings.TrimSpace(req.S3Endpoint)
		rec.S3Region = strings.TrimSpace(req.S3Region)
		if rec.S3Region == "" {
			rec.S3Region = "auto"
		}
		rec.S3Bucket = strings.TrimSpace(req.S3Bucket)
		rec.S3Prefix = strings.Trim(strings.TrimSpace(req.S3Prefix), "/")
		rec.S3AccessKeyEnc = encAccess
		rec.S3SecretKeyEnc = encSecret
		rec.S3ForcePath = req.S3ForcePathStyle
	}

	created, err := s.database.CreateBackupTarget(rec)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "backup.target.create", "ok", map[string]any{"target": created.Name, "kind": created.Kind})
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleTestBackupTarget(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID target tidak valid"})
		return
	}
	target, err := s.database.GetBackupTarget(id)
	if err != nil || target == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "storage target tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && target.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	if target.Kind == "local" {
		dir := strings.TrimSpace(target.LocalDir)
		if dir == "" {
			dir = defaultBackupDir()
		}
		if mkErr := os.MkdirAll(dir, 0o750); mkErr != nil {
			s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": mkErr.Error()})
			return
		}
		probe := filepath.Join(dir, ".reneo-write-probe")
		if wErr := os.WriteFile(probe, []byte("ok"), 0o600); wErr != nil {
			s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": wErr.Error()})
			return
		}
		_ = os.Remove(probe)
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": "Folder lokal siap dan dapat ditulis"})
		return
	}
	s3c, err := s.buildS3Client(target)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := s3c.TestConnection(ctx); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": "Koneksi S3/R2 berhasil diverifikasi"})
}

func (s *Server) handleDeleteBackupTarget(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID target tidak valid"})
		return
	}
	target, err := s.database.GetBackupTarget(id)
	if err != nil || target == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "storage target tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && target.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	if err := s.database.DeleteBackupTarget(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "backup.target.delete", "ok", map[string]any{"target": target.Name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleCreateBackupJob(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	defer r.Body.Close()
	var req struct {
		TargetID       int64  `json:"targetId"`
		Name           string `json:"name"`
		Scope          string `json:"scope"`
		ResourceID     int64  `json:"resourceId"`
		ResourceName   string `json:"resourceName"`
		IntervalHours  int    `json:"intervalHours"`
		RetentionCount int    `json:"retentionCount"`
		Enabled        bool   `json:"enabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	target, err := s.database.GetBackupTarget(req.TargetID)
	if err != nil || target == nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "pilih tujuan storage backup terlebih dulu"})
		return
	}
	if u.Role != auth.SuperadminRole && target.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ke storage target ditolak"})
		return
	}
	req.Scope = strings.ToLower(strings.TrimSpace(req.Scope))
	isSuper := u.Role == auth.SuperadminRole
	var resName string
	switch req.Scope {
	case "database":
		dbItem, dbErr := s.findDatabaseForBackup(req.ResourceID, u.ID, isSuper)
		if dbErr != nil || dbItem == nil {
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "database tidak ditemukan"})
			return
		}
		resName = dbItem.Name
	case "project":
		var proj *database.Project
		if isSuper {
			proj, _ = s.database.GetProjectAny(req.ResourceID)
		} else {
			proj, _ = s.database.GetProject(req.ResourceID, u.ID)
		}
		if proj == nil {
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "proyek tidak ditemukan"})
			return
		}
		resName = proj.Name
	case "docker-volume":
		if !isSuper {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "backup volume Docker hanya untuk superadmin"})
			return
		}
		volName := strings.TrimSpace(req.ResourceName)
		if !backup.ValidVolumeName(volName) {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "pilih volume Docker yang valid"})
			return
		}
		resName = volName
	case "panel-config":
		if !isSuper {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "backup konfigurasi panel hanya untuk superadmin"})
			return
		}
		resName = "reneo-panel-config"
	default:
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "scope harus database, project, docker-volume, atau panel-config"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = fmt.Sprintf("Backup %s", resName)
	}
	if req.IntervalHours < 0 {
		req.IntervalHours = 0
	}
	if req.IntervalHours > 720 {
		req.IntervalHours = 720
	}
	if req.RetentionCount <= 0 {
		req.RetentionCount = 7
	}
	if req.RetentionCount > 90 {
		req.RetentionCount = 90
	}

	created, err := s.database.CreateBackupJob(database.BackupJob{
		OwnerUserID:    u.ID,
		TargetID:       target.ID,
		Name:           name,
		Scope:          req.Scope,
		ResourceID:     req.ResourceID,
		ResourceName:   resName,
		IntervalHours:  req.IntervalHours,
		RetentionCount: req.RetentionCount,
		Enabled:        req.Enabled,
	})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "backup.job.create", "ok", map[string]any{"job": created.Name, "scope": created.Scope, "resource": resName})
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateBackupJob(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID jadwal tidak valid"})
		return
	}
	job, err := s.database.GetBackupJob(id)
	if err != nil || job == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "jadwal backup tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && job.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	defer r.Body.Close()
	var req struct {
		Enabled        *bool `json:"enabled"`
		IntervalHours  *int  `json:"intervalHours"`
		RetentionCount *int  `json:"retentionCount"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	enabled := job.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	interval := job.IntervalHours
	if req.IntervalHours != nil && *req.IntervalHours >= 0 && *req.IntervalHours <= 720 {
		interval = *req.IntervalHours
	}
	retention := job.RetentionCount
	if req.RetentionCount != nil && *req.RetentionCount >= 1 && *req.RetentionCount <= 90 {
		retention = *req.RetentionCount
	}
	updated, err := s.database.UpdateBackupJob(id, enabled, interval, retention)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteBackupJob(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID jadwal tidak valid"})
		return
	}
	job, err := s.database.GetBackupJob(id)
	if err != nil || job == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "jadwal backup tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && job.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	if err := s.database.DeleteBackupJob(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "backup.job.delete", "ok", map[string]any{"job": job.Name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleRunBackupJob(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID jadwal tidak valid"})
		return
	}
	job, err := s.database.GetBackupJob(id)
	if err != nil || job == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "jadwal backup tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && job.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	if !claimBackupJob(job.ID) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "backup untuk jadwal ini sedang berjalan"})
		return
	}
	defer releaseBackupJob(job.ID)

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()
	run, runErr := s.executeBackupJob(ctx, job)
	if runErr != nil {
		s.auditSensitiveAction(r, u, "backup.run", "error", map[string]any{"job": job.Name, "error": runErr.Error()})
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": runErr.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "backup.run", "ok", map[string]any{"job": job.Name, "runId": run.ID, "sizeBytes": run.SizeBytes})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "run": run})
}

func (s *Server) openBackupRunReader(ctx context.Context, run *database.BackupRun) (io.ReadCloser, string, error) {
	fileName := filepath.Base(run.StorageKey)
	if run.StorageKind == "s3" {
		target, err := s.database.GetBackupTarget(run.TargetID)
		if err != nil || target == nil {
			return nil, "", errors.New("konfigurasi storage S3/R2 untuk backup ini sudah dihapus")
		}
		s3c, err := s.buildS3Client(target)
		if err != nil {
			return nil, "", err
		}
		rc, _, err := s3c.GetObject(ctx, run.StorageKey)
		return rc, fileName, err
	}
	f, err := os.Open(run.StorageKey)
	if err != nil {
		return nil, "", fmt.Errorf("berkas backup lokal tidak ditemukan: %w", err)
	}
	return f, fileName, nil
}

func (s *Server) handleDownloadBackupRun(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID riwayat backup tidak valid"})
		return
	}
	run, err := s.database.GetBackupRun(id)
	if err != nil || run == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "riwayat backup tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && run.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	if run.Status != "success" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "hanya backup yang berhasil yang dapat diunduh"})
		return
	}
	rc, fileName, err := s.openBackupRunReader(r.Context(), run)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", "application/gzip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", fileName))
	if run.SizeBytes > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(run.SizeBytes, 10))
	}
	_, _ = io.Copy(w, rc)
}

func (s *Server) handleRestoreBackupRun(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID riwayat backup tidak valid"})
		return
	}
	run, err := s.database.GetBackupRun(id)
	if err != nil || run == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "riwayat backup tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && run.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	if run.Status != "success" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "hanya backup yang berhasil yang dapat dipulihkan"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Minute)
	defer cancel()

	rc, fileName, err := s.openBackupRunReader(ctx, run)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	defer rc.Close()

	isSuper := u.Role == auth.SuperadminRole
	switch run.Scope {
	case "database":
		dbItem, dbErr := s.findDatabaseForBackup(run.ResourceID, u.ID, isSuper)
		if dbErr != nil || dbItem == nil {
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "database tujuan restore tidak ditemukan"})
			return
		}
		engine, ok := userdb.Lookup(dbItem.Engine)
		if !ok || !userdb.IsSQL(engine) {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "restore SQL hanya tersedia untuk PostgreSQL, MySQL, dan MariaDB"})
			return
		}
		if userdb.State(dbItem.ID) != "running" {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "jalankah container database terlebih dulu sebelum restore"})
			return
		}
		plainPwd, decErr := crypto.Decrypt(s.cfg.EncryptionKey, dbItem.PasswordEncrypted)
		if decErr != nil {
			s.writeError(w, http.StatusInternalServerError, errors.New("kredensial database tidak dapat didekripsi"))
			return
		}
		conn := userdb.Conn{
			ID:       dbItem.ID,
			Engine:   engine,
			Database: dbItem.DatabaseName,
			User:     dbItem.Username,
			Password: plainPwd,
		}
		summary, impErr := userdb.ImportSQL(ctx, conn, rc, strings.HasSuffix(strings.ToLower(fileName), ".gz"))
		if impErr != nil {
			s.auditSensitiveAction(r, u, "backup.restore", "error", map[string]any{"runId": run.ID, "scope": "database", "error": impErr.Error()})
			s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": impErr.Error()})
			return
		}
		s.auditSensitiveAction(r, u, "backup.restore", "ok", map[string]any{"runId": run.ID, "scope": "database", "database": dbItem.Name})
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": fmt.Sprintf("Database %s berhasil dipulihkan", dbItem.Name), "summary": summary})
	case "project":
		var proj *database.Project
		if isSuper {
			proj, _ = s.database.GetProjectAny(run.ResourceID)
		} else {
			proj, _ = s.database.GetProject(run.ResourceID, u.ID)
		}
		if proj == nil || strings.TrimSpace(proj.WorkingDir) == "" {
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "folder proyek tujuan restore tidak ditemukan"})
			return
		}
		if extErr := backup.ExtractTarGzSafe(rc, proj.WorkingDir); extErr != nil {
			s.auditSensitiveAction(r, u, "backup.restore", "error", map[string]any{"runId": run.ID, "scope": "project", "error": extErr.Error()})
			s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": extErr.Error()})
			return
		}
		s.auditSensitiveAction(r, u, "backup.restore", "ok", map[string]any{"runId": run.ID, "scope": "project", "project": proj.Name})
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": fmt.Sprintf("Berkas proyek %s berhasil dipulihkan", proj.Name)})
	case "docker-volume":
		if !isSuper {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "restore volume Docker hanya untuk superadmin"})
			return
		}
		if err := backup.RestoreDockerVolume(ctx, run.ResourceName, rc); err != nil {
			s.auditSensitiveAction(r, u, "backup.restore", "error", map[string]any{"runId": run.ID, "scope": "docker-volume", "error": err.Error()})
			s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
			return
		}
		s.auditSensitiveAction(r, u, "backup.restore", "ok", map[string]any{"runId": run.ID, "scope": "docker-volume", "volume": run.ResourceName})
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": fmt.Sprintf("Volume Docker %s berhasil dipulihkan", run.ResourceName)})
	default:
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "tipe backup tidak mendukung restore"})
	}
}

func (s *Server) handleDeleteBackupRun(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID riwayat backup tidak valid"})
		return
	}
	run, err := s.database.GetBackupRun(id)
	if err != nil || run == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "riwayat backup tidak ditemukan"})
		return
	}
	if u.Role != auth.SuperadminRole && run.OwnerUserID != u.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akses ditolak"})
		return
	}
	if target, tErr := s.database.GetBackupTarget(run.TargetID); tErr == nil && target != nil {
		s.deleteBackupArtifact(r.Context(), target, run.StorageKey)
	}
	if err := s.database.DeleteBackupRun(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "backup.run.delete", "ok", map[string]any{"runId": run.ID})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}
