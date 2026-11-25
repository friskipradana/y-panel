package database

import (
	"database/sql"
	"fmt"
	"time"
)

type BackupTarget struct {
	ID              int64     `json:"id"`
	OwnerUserID     int64     `json:"ownerUserId"`
	Name            string    `json:"name"`
	Kind            string    `json:"kind"` // "local" | "s3"
	LocalDir        string    `json:"localDir,omitempty"`
	S3Endpoint      string    `json:"s3Endpoint,omitempty"`
	S3Region        string    `json:"s3Region,omitempty"`
	S3Bucket        string    `json:"s3Bucket,omitempty"`
	S3Prefix        string    `json:"s3Prefix,omitempty"`
	S3AccessKeyEnc  string    `json:"-"`
	S3SecretKeyEnc  string    `json:"-"`
	S3ForcePath     bool      `json:"s3ForcePathStyle"`
	HasCredentials  bool      `json:"hasCredentials"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type BackupJob struct {
	ID             int64      `json:"id"`
	OwnerUserID    int64      `json:"ownerUserId"`
	TargetID       int64      `json:"targetId"`
	TargetName     string     `json:"targetName"`
	TargetKind     string     `json:"targetKind"`
	Name           string     `json:"name"`
	Scope          string     `json:"scope"` // "database" | "project"
	ResourceID     int64      `json:"resourceId"`
	ResourceName   string     `json:"resourceName"`
	IntervalHours  int        `json:"intervalHours"` // 0 = manual only
	RetentionCount int        `json:"retentionCount"`
	Enabled        bool       `json:"enabled"`
	LastStatus     string     `json:"lastStatus"`
	LastRunAt      *time.Time `json:"lastRunAt,omitempty"`
	NextRunAt      *time.Time `json:"nextRunAt,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type BackupRun struct {
	ID           int64      `json:"id"`
	JobID        int64      `json:"jobId"`
	JobName      string     `json:"jobName"`
	OwnerUserID  int64      `json:"ownerUserId"`
	TargetID     int64      `json:"targetId"`
	Scope        string     `json:"scope"`
	ResourceID   int64      `json:"resourceId"`
	ResourceName string     `json:"resourceName"`
	Status       string     `json:"status"` // "running" | "success" | "failed"
	StorageKind  string     `json:"storageKind"`
	StorageKey   string     `json:"storageKey"`
	SizeBytes    int64      `json:"sizeBytes"`
	SHA256       string     `json:"sha256"`
	ErrorMessage string     `json:"errorMessage,omitempty"`
	StartedAt    time.Time  `json:"startedAt"`
	FinishedAt   *time.Time `json:"finishedAt,omitempty"`
}

func (m *Manager) ListBackupTargets(ownerUserID int64, includeAll bool) ([]BackupTarget, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var (
		rows *sql.Rows
		err  error
	)
	if includeAll {
		rows, err = m.db.Query(`
			SELECT id, owner_user_id, name, kind, local_dir, s3_endpoint, s3_region, s3_bucket, s3_prefix,
			       s3_access_key_enc, s3_secret_key_enc, s3_force_path_style, created_at, updated_at
			FROM backup_targets ORDER BY id DESC`)
	} else {
		rows, err = m.db.Query(`
			SELECT id, owner_user_id, name, kind, local_dir, s3_endpoint, s3_region, s3_bucket, s3_prefix,
			       s3_access_key_enc, s3_secret_key_enc, s3_force_path_style, created_at, updated_at
			FROM backup_targets WHERE owner_user_id = $1 ORDER BY id DESC`, ownerUserID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]BackupTarget, 0)
	for rows.Next() {
		var t BackupTarget
		if err := rows.Scan(
			&t.ID, &t.OwnerUserID, &t.Name, &t.Kind, &t.LocalDir,
			&t.S3Endpoint, &t.S3Region, &t.S3Bucket, &t.S3Prefix,
			&t.S3AccessKeyEnc, &t.S3SecretKeyEnc, &t.S3ForcePath,
			&t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		t.HasCredentials = t.S3AccessKeyEnc != "" && t.S3SecretKeyEnc != ""
		out = append(out, t)
	}
	return out, rows.Err()
}

func (m *Manager) GetBackupTarget(id int64) (*BackupTarget, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var t BackupTarget
	err := m.db.QueryRow(`
		SELECT id, owner_user_id, name, kind, local_dir, s3_endpoint, s3_region, s3_bucket, s3_prefix,
		       s3_access_key_enc, s3_secret_key_enc, s3_force_path_style, created_at, updated_at
		FROM backup_targets WHERE id = $1`, id).Scan(
		&t.ID, &t.OwnerUserID, &t.Name, &t.Kind, &t.LocalDir,
		&t.S3Endpoint, &t.S3Region, &t.S3Bucket, &t.S3Prefix,
		&t.S3AccessKeyEnc, &t.S3SecretKeyEnc, &t.S3ForcePath,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.HasCredentials = t.S3AccessKeyEnc != "" && t.S3SecretKeyEnc != ""
	return &t, nil
}

func (m *Manager) CreateBackupTarget(t BackupTarget) (*BackupTarget, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	err := m.db.QueryRow(`
		INSERT INTO backup_targets (
			owner_user_id, name, kind, local_dir, s3_endpoint, s3_region, s3_bucket, s3_prefix,
			s3_access_key_enc, s3_secret_key_enc, s3_force_path_style
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING id, created_at, updated_at`,
		t.OwnerUserID, t.Name, t.Kind, t.LocalDir, t.S3Endpoint, t.S3Region, t.S3Bucket, t.S3Prefix,
		t.S3AccessKeyEnc, t.S3SecretKeyEnc, t.S3ForcePath,
	).Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	t.HasCredentials = t.S3AccessKeyEnc != "" && t.S3SecretKeyEnc != ""
	return &t, nil
}

func (m *Manager) DeleteBackupTarget(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM backup_targets WHERE id = $1`, id)
	return err
}

func (m *Manager) ListBackupJobs(ownerUserID int64, includeAll bool) ([]BackupJob, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	query := `
		SELECT j.id, j.owner_user_id, j.target_id, COALESCE(t.name, ''), COALESCE(t.kind, ''),
		       j.name, j.scope, j.resource_id, j.resource_name, j.interval_hours, j.retention_count,
		       j.enabled, j.last_status, j.last_run_at, j.next_run_at, j.created_at, j.updated_at
		FROM backup_jobs j
		LEFT JOIN backup_targets t ON t.id = j.target_id`
	var (
		rows *sql.Rows
		err  error
	)
	if includeAll {
		rows, err = m.db.Query(query + ` ORDER BY j.id DESC`)
	} else {
		rows, err = m.db.Query(query+` WHERE j.owner_user_id = $1 ORDER BY j.id DESC`, ownerUserID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanBackupJobs(rows)
}

func (m *Manager) ListDueBackupJobs(now time.Time) ([]BackupJob, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`
		SELECT j.id, j.owner_user_id, j.target_id, COALESCE(t.name, ''), COALESCE(t.kind, ''),
		       j.name, j.scope, j.resource_id, j.resource_name, j.interval_hours, j.retention_count,
		       j.enabled, j.last_status, j.last_run_at, j.next_run_at, j.created_at, j.updated_at
		FROM backup_jobs j
		LEFT JOIN backup_targets t ON t.id = j.target_id
		WHERE j.enabled = TRUE AND j.interval_hours > 0 AND j.next_run_at IS NOT NULL AND j.next_run_at <= $1
		ORDER BY j.next_run_at ASC
		LIMIT 20`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanBackupJobs(rows)
}

func scanBackupJobs(rows *sql.Rows) ([]BackupJob, error) {
	out := make([]BackupJob, 0)
	for rows.Next() {
		var j BackupJob
		var lastAt, nextAt sql.NullTime
		if err := rows.Scan(
			&j.ID, &j.OwnerUserID, &j.TargetID, &j.TargetName, &j.TargetKind,
			&j.Name, &j.Scope, &j.ResourceID, &j.ResourceName, &j.IntervalHours, &j.RetentionCount,
			&j.Enabled, &j.LastStatus, &lastAt, &nextAt, &j.CreatedAt, &j.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if lastAt.Valid {
			t := lastAt.Time
			j.LastRunAt = &t
		}
		if nextAt.Valid {
			t := nextAt.Time
			j.NextRunAt = &t
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

func (m *Manager) GetBackupJob(id int64) (*BackupJob, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var j BackupJob
	var lastAt, nextAt sql.NullTime
	err := m.db.QueryRow(`
		SELECT j.id, j.owner_user_id, j.target_id, COALESCE(t.name, ''), COALESCE(t.kind, ''),
		       j.name, j.scope, j.resource_id, j.resource_name, j.interval_hours, j.retention_count,
		       j.enabled, j.last_status, j.last_run_at, j.next_run_at, j.created_at, j.updated_at
		FROM backup_jobs j
		LEFT JOIN backup_targets t ON t.id = j.target_id
		WHERE j.id = $1`, id).Scan(
		&j.ID, &j.OwnerUserID, &j.TargetID, &j.TargetName, &j.TargetKind,
		&j.Name, &j.Scope, &j.ResourceID, &j.ResourceName, &j.IntervalHours, &j.RetentionCount,
		&j.Enabled, &j.LastStatus, &lastAt, &nextAt, &j.CreatedAt, &j.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if lastAt.Valid {
		t := lastAt.Time
		j.LastRunAt = &t
	}
	if nextAt.Valid {
		t := nextAt.Time
		j.NextRunAt = &t
	}
	return &j, nil
}

func (m *Manager) CreateBackupJob(j BackupJob) (*BackupJob, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var nextRun any
	if j.Enabled && j.IntervalHours > 0 {
		t := time.Now().Add(time.Duration(j.IntervalHours) * time.Hour)
		nextRun = t
		j.NextRunAt = &t
	}
	err := m.db.QueryRow(`
		INSERT INTO backup_jobs (
			owner_user_id, target_id, name, scope, resource_id, resource_name,
			interval_hours, retention_count, enabled, last_status, next_run_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'idle',$10)
		RETURNING id, created_at, updated_at`,
		j.OwnerUserID, j.TargetID, j.Name, j.Scope, j.ResourceID, j.ResourceName,
		j.IntervalHours, j.RetentionCount, j.Enabled, nextRun,
	).Scan(&j.ID, &j.CreatedAt, &j.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return m.GetBackupJob(j.ID)
}

func (m *Manager) UpdateBackupJob(id int64, enabled bool, intervalHours, retentionCount int) (*BackupJob, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var nextRun any
	if enabled && intervalHours > 0 {
		nextRun = time.Now().Add(time.Duration(intervalHours) * time.Hour)
	}
	_, err := m.db.Exec(`
		UPDATE backup_jobs
		SET enabled = $1, interval_hours = $2, retention_count = $3, next_run_at = $4, updated_at = NOW()
		WHERE id = $5`,
		enabled, intervalHours, retentionCount, nextRun, id,
	)
	if err != nil {
		return nil, err
	}
	return m.GetBackupJob(id)
}

func (m *Manager) MarkBackupJobRan(id int64, status string, intervalHours int, enabled bool) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	now := time.Now()
	var nextRun any
	if enabled && intervalHours > 0 {
		nextRun = now.Add(time.Duration(intervalHours) * time.Hour)
	}
	_, err := m.db.Exec(`
		UPDATE backup_jobs
		SET last_status = $1, last_run_at = $2, next_run_at = $3, updated_at = NOW()
		WHERE id = $4`, status, now, nextRun, id)
	return err
}

func (m *Manager) DeleteBackupJob(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM backup_jobs WHERE id = $1`, id)
	return err
}

func (m *Manager) CreateBackupRun(r BackupRun) (*BackupRun, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	err := m.db.QueryRow(`
		INSERT INTO backup_runs (
			job_id, owner_user_id, target_id, scope, resource_id, resource_name,
			status, storage_kind, storage_key
		) VALUES ($1,$2,$3,$4,$5,$6,'running',$7,$8)
		RETURNING id, started_at`,
		r.JobID, r.OwnerUserID, r.TargetID, r.Scope, r.ResourceID, r.ResourceName,
		r.StorageKind, r.StorageKey,
	).Scan(&r.ID, &r.StartedAt)
	if err != nil {
		return nil, err
	}
	r.Status = "running"
	return &r, nil
}

func (m *Manager) FinishBackupRun(id int64, status, storageKey string, sizeBytes int64, sha256Hex, errMsg string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		UPDATE backup_runs
		SET status = $1, storage_key = $2, size_bytes = $3, sha256 = $4, error_message = $5, finished_at = NOW()
		WHERE id = $6`,
		status, storageKey, sizeBytes, sha256Hex, errMsg, id,
	)
	return err
}

func (m *Manager) ListBackupRuns(ownerUserID int64, includeAll bool, limit int) ([]BackupRun, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `
		SELECT r.id, r.job_id, COALESCE(j.name, r.resource_name), r.owner_user_id, r.target_id,
		       r.scope, r.resource_id, r.resource_name, r.status, r.storage_kind, r.storage_key,
		       r.size_bytes, r.sha256, r.error_message, r.started_at, r.finished_at
		FROM backup_runs r
		LEFT JOIN backup_jobs j ON j.id = r.job_id`
	var (
		rows *sql.Rows
		err  error
	)
	if includeAll {
		rows, err = m.db.Query(query+` ORDER BY r.id DESC LIMIT $1`, limit)
	} else {
		rows, err = m.db.Query(query+` WHERE r.owner_user_id = $1 ORDER BY r.id DESC LIMIT $2`, ownerUserID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanBackupRuns(rows)
}

func (m *Manager) GetBackupRun(id int64) (*BackupRun, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var r BackupRun
	var fin sql.NullTime
	err := m.db.QueryRow(`
		SELECT r.id, r.job_id, COALESCE(j.name, r.resource_name), r.owner_user_id, r.target_id,
		       r.scope, r.resource_id, r.resource_name, r.status, r.storage_kind, r.storage_key,
		       r.size_bytes, r.sha256, r.error_message, r.started_at, r.finished_at
		FROM backup_runs r
		LEFT JOIN backup_jobs j ON j.id = r.job_id
		WHERE r.id = $1`, id).Scan(
		&r.ID, &r.JobID, &r.JobName, &r.OwnerUserID, &r.TargetID,
		&r.Scope, &r.ResourceID, &r.ResourceName, &r.Status, &r.StorageKind, &r.StorageKey,
		&r.SizeBytes, &r.SHA256, &r.ErrorMessage, &r.StartedAt, &fin,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if fin.Valid {
		t := fin.Time
		r.FinishedAt = &t
	}
	return &r, nil
}

func (m *Manager) ListExpiredBackupRuns(jobID int64, keep int) ([]BackupRun, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	if keep <= 0 {
		return nil, nil
	}
	rows, err := m.db.Query(`
		SELECT r.id, r.job_id, '', r.owner_user_id, r.target_id,
		       r.scope, r.resource_id, r.resource_name, r.status, r.storage_kind, r.storage_key,
		       r.size_bytes, r.sha256, r.error_message, r.started_at, r.finished_at
		FROM backup_runs r
		WHERE r.job_id = $1 AND r.status = 'success'
		ORDER BY r.id DESC
		OFFSET $2`, jobID, keep)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanBackupRuns(rows)
}

func (m *Manager) DeleteBackupRun(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM backup_runs WHERE id = $1`, id)
	return err
}

func scanBackupRuns(rows *sql.Rows) ([]BackupRun, error) {
	out := make([]BackupRun, 0)
	for rows.Next() {
		var r BackupRun
		var fin sql.NullTime
		if err := rows.Scan(
			&r.ID, &r.JobID, &r.JobName, &r.OwnerUserID, &r.TargetID,
			&r.Scope, &r.ResourceID, &r.ResourceName, &r.Status, &r.StorageKind, &r.StorageKey,
			&r.SizeBytes, &r.SHA256, &r.ErrorMessage, &r.StartedAt, &fin,
		); err != nil {
			return nil, err
		}
		if fin.Valid {
			t := fin.Time
			r.FinishedAt = &t
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
