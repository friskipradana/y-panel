package database

import (
	"database/sql"
	"fmt"
	"time"
)

// ProjectWebhook stores Git webhook auto-deploy settings per project.
type ProjectWebhook struct {
	ID            int64      `json:"id"`
	ProjectID     int64      `json:"projectId"`
	OwnerUserID   int64      `json:"ownerUserId"`
	Enabled       bool       `json:"enabled"`
	Token         string     `json:"token"`
	SecretEnc     string     `json:"-"`
	HasSecret     bool       `json:"hasSecret"`
	Branch        string     `json:"branch"`
	DeployMode    string     `json:"deployMode"` // "project" | "k8s"
	K8sClusterID  string     `json:"k8sClusterId,omitempty"`
	K8sNamespace  string     `json:"k8sNamespace,omitempty"`
	NotifyEnabled bool       `json:"notifyEnabled"`
	LastStatus    string     `json:"lastStatus"`
	LastCommit    string     `json:"lastCommit,omitempty"`
	LastRunAt     *time.Time `json:"lastRunAt,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

// ProjectDeployLog records each webhook or manual git-pull deploy execution.
type ProjectDeployLog struct {
	ID         int64      `json:"id"`
	ProjectID  int64      `json:"projectId"`
	Trigger    string     `json:"trigger"` // "webhook" | "manual"
	Branch     string     `json:"branch"`
	CommitSHA  string     `json:"commitSha,omitempty"`
	Status     string     `json:"status"` // "running" | "success" | "failed"
	Output     string     `json:"output"`
	StartedAt  time.Time  `json:"startedAt"`
	FinishedAt *time.Time `json:"finishedAt,omitempty"`
}

// UptimeMonitor tracks a monitored HTTP/HTTPS/TCP endpoint.
type UptimeMonitor struct {
	ID              int64      `json:"id"`
	OwnerUserID     int64      `json:"ownerUserId"`
	Name            string     `json:"name"`
	Kind            string     `json:"kind"` // "http" | "tcp"
	Target          string     `json:"target"`
	ExpectedStatus  int        `json:"expectedStatus"`
	IntervalSeconds int        `json:"intervalSeconds"`
	TimeoutSeconds  int        `json:"timeoutSeconds"`
	Enabled         bool       `json:"enabled"`
	NotifyEnabled   bool       `json:"notifyEnabled"`
	LastStatus      string     `json:"lastStatus"` // "unknown" | "up" | "down"
	LastLatencyMs   int        `json:"lastLatencyMs"`
	LastHTTPCode    int        `json:"lastHttpCode"`
	LastError       string     `json:"lastError,omitempty"`
	SSLExpiresAt    *time.Time `json:"sslExpiresAt,omitempty"`
	SSLDaysLeft     *int       `json:"sslDaysLeft,omitempty"`
	LastSSLAlertAt  *time.Time `json:"-"`
	LastCheckedAt   *time.Time `json:"lastCheckedAt,omitempty"`
	NextCheckAt     *time.Time `json:"nextCheckAt,omitempty"`
	Uptime24hPct    float64    `json:"uptime24hPct"`
	RecentBars      []string   `json:"recentBars"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// UptimeCheck records an individual probe sample.
type UptimeCheck struct {
	ID         int64     `json:"id"`
	MonitorID  int64     `json:"monitorId"`
	Status     string    `json:"status"` // "up" | "down"
	HTTPCode   int       `json:"httpCode"`
	LatencyMs  int       `json:"latencyMs"`
	ErrorText  string    `json:"errorText,omitempty"`
	CheckedAt  time.Time `json:"checkedAt"`
}

func (m *Manager) GetProjectWebhookByProject(projectID int64) (*ProjectWebhook, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	return scanProjectWebhook(m.db.QueryRow(`
		SELECT id, project_id, owner_user_id, enabled, token, secret_enc, branch, deploy_mode,
		       k8s_cluster_id, k8s_namespace, notify_enabled, last_status, last_commit, last_run_at,
		       created_at, updated_at
		FROM project_webhooks WHERE project_id = $1`, projectID))
}

func (m *Manager) GetProjectWebhookByToken(token string) (*ProjectWebhook, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	return scanProjectWebhook(m.db.QueryRow(`
		SELECT id, project_id, owner_user_id, enabled, token, secret_enc, branch, deploy_mode,
		       k8s_cluster_id, k8s_namespace, notify_enabled, last_status, last_commit, last_run_at,
		       created_at, updated_at
		FROM project_webhooks WHERE token = $1`, token))
}

func scanProjectWebhook(row *sql.Row) (*ProjectWebhook, error) {
	var w ProjectWebhook
	var lastRun sql.NullTime
	err := row.Scan(
		&w.ID, &w.ProjectID, &w.OwnerUserID, &w.Enabled, &w.Token, &w.SecretEnc,
		&w.Branch, &w.DeployMode, &w.K8sClusterID, &w.K8sNamespace, &w.NotifyEnabled,
		&w.LastStatus, &w.LastCommit, &lastRun, &w.CreatedAt, &w.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	w.HasSecret = w.SecretEnc != ""
	if lastRun.Valid {
		t := lastRun.Time
		w.LastRunAt = &t
	}
	return &w, nil
}

func (m *Manager) UpsertProjectWebhook(w ProjectWebhook) (*ProjectWebhook, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		INSERT INTO project_webhooks (
			project_id, owner_user_id, enabled, token, secret_enc, branch, deploy_mode,
			k8s_cluster_id, k8s_namespace, notify_enabled
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (project_id) DO UPDATE SET
			enabled = EXCLUDED.enabled,
			token = COALESCE(NULLIF(EXCLUDED.token, ''), project_webhooks.token),
			secret_enc = CASE WHEN EXCLUDED.secret_enc <> '' THEN EXCLUDED.secret_enc ELSE project_webhooks.secret_enc END,
			branch = EXCLUDED.branch,
			deploy_mode = EXCLUDED.deploy_mode,
			k8s_cluster_id = EXCLUDED.k8s_cluster_id,
			k8s_namespace = EXCLUDED.k8s_namespace,
			notify_enabled = EXCLUDED.notify_enabled,
			updated_at = NOW()`,
		w.ProjectID, w.OwnerUserID, w.Enabled, w.Token, w.SecretEnc, w.Branch,
		w.DeployMode, w.K8sClusterID, w.K8sNamespace, w.NotifyEnabled,
	)
	if err != nil {
		return nil, err
	}
	return m.GetProjectWebhookByProject(w.ProjectID)
}

func (m *Manager) MarkProjectWebhookRan(projectID int64, status, commitSHA string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		UPDATE project_webhooks
		SET last_status = $1, last_commit = $2, last_run_at = NOW(), updated_at = NOW()
		WHERE project_id = $3`, status, commitSHA, projectID)
	return err
}

func (m *Manager) CreateProjectDeployLog(projectID int64, trigger, branch, commitSHA string) (int64, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var id int64
	err := m.db.QueryRow(`
		INSERT INTO project_deploy_logs (project_id, trigger, branch, commit_sha, status, output)
		VALUES ($1,$2,$3,$4,'running','')
		RETURNING id`, projectID, trigger, branch, commitSHA).Scan(&id)
	return id, err
}

func (m *Manager) FinishProjectDeployLog(id int64, status, commitSHA, output string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	if len(output) > 16000 {
		output = output[len(output)-16000:]
	}
	_, err := m.db.Exec(`
		UPDATE project_deploy_logs
		SET status = $1, commit_sha = COALESCE(NULLIF($2, ''), commit_sha), output = $3, finished_at = NOW()
		WHERE id = $4`, status, commitSHA, output, id)
	return err
}

func (m *Manager) ListProjectDeployLogs(projectID int64, limit int) ([]ProjectDeployLog, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := m.db.Query(`
		SELECT id, project_id, trigger, branch, commit_sha, status, output, started_at, finished_at
		FROM project_deploy_logs
		WHERE project_id = $1
		ORDER BY id DESC LIMIT $2`, projectID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ProjectDeployLog, 0)
	for rows.Next() {
		var l ProjectDeployLog
		var fin sql.NullTime
		if err := rows.Scan(&l.ID, &l.ProjectID, &l.Trigger, &l.Branch, &l.CommitSHA, &l.Status, &l.Output, &l.StartedAt, &fin); err != nil {
			return nil, err
		}
		if fin.Valid {
			t := fin.Time
			l.FinishedAt = &t
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// --- Uptime Monitors ---

func (m *Manager) ListUptimeMonitors(ownerUserID int64, includeAll bool) ([]UptimeMonitor, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	query := `
		SELECT id, owner_user_id, name, kind, target, expected_status, interval_seconds, timeout_seconds,
		       enabled, notify_enabled, last_status, last_latency_ms, last_http_code, last_error,
		       ssl_expires_at, ssl_days_left, last_ssl_alert_at, last_checked_at, next_check_at,
		       created_at, updated_at
		FROM uptime_monitors`
	var (
		rows *sql.Rows
		err  error
	)
	if includeAll {
		rows, err = m.db.Query(query + ` ORDER BY id DESC`)
	} else {
		rows, err = m.db.Query(query+` WHERE owner_user_id = $1 ORDER BY id DESC`, ownerUserID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list, err := scanUptimeMonitors(rows)
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].Uptime24hPct, list[i].RecentBars = m.uptimeStats24h(list[i].ID)
	}
	return list, nil
}

func (m *Manager) ListDueUptimeMonitors(now time.Time) ([]UptimeMonitor, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`
		SELECT id, owner_user_id, name, kind, target, expected_status, interval_seconds, timeout_seconds,
		       enabled, notify_enabled, last_status, last_latency_ms, last_http_code, last_error,
		       ssl_expires_at, ssl_days_left, last_ssl_alert_at, last_checked_at, next_check_at,
		       created_at, updated_at
		FROM uptime_monitors
		WHERE enabled = TRUE AND (next_check_at IS NULL OR next_check_at <= $1)
		ORDER BY next_check_at ASC NULLS FIRST
		LIMIT 30`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanUptimeMonitors(rows)
}

func (m *Manager) GetUptimeMonitor(id int64) (*UptimeMonitor, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`
		SELECT id, owner_user_id, name, kind, target, expected_status, interval_seconds, timeout_seconds,
		       enabled, notify_enabled, last_status, last_latency_ms, last_http_code, last_error,
		       ssl_expires_at, ssl_days_left, last_ssl_alert_at, last_checked_at, next_check_at,
		       created_at, updated_at
		FROM uptime_monitors WHERE id = $1`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list, err := scanUptimeMonitors(rows)
	if err != nil || len(list) == 0 {
		return nil, err
	}
	list[0].Uptime24hPct, list[0].RecentBars = m.uptimeStats24h(list[0].ID)
	return &list[0], nil
}

func scanUptimeMonitors(rows *sql.Rows) ([]UptimeMonitor, error) {
	out := make([]UptimeMonitor, 0)
	for rows.Next() {
		var u UptimeMonitor
		var sslExp, sslAlert, lastChk, nextChk sql.NullTime
		var sslDays sql.NullInt64
		if err := rows.Scan(
			&u.ID, &u.OwnerUserID, &u.Name, &u.Kind, &u.Target, &u.ExpectedStatus,
			&u.IntervalSeconds, &u.TimeoutSeconds, &u.Enabled, &u.NotifyEnabled,
			&u.LastStatus, &u.LastLatencyMs, &u.LastHTTPCode, &u.LastError,
			&sslExp, &sslDays, &sslAlert, &lastChk, &nextChk, &u.CreatedAt, &u.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if sslExp.Valid {
			t := sslExp.Time
			u.SSLExpiresAt = &t
		}
		if sslDays.Valid {
			d := int(sslDays.Int64)
			u.SSLDaysLeft = &d
		}
		if sslAlert.Valid {
			t := sslAlert.Time
			u.LastSSLAlertAt = &t
		}
		if lastChk.Valid {
			t := lastChk.Time
			u.LastCheckedAt = &t
		}
		if nextChk.Valid {
			t := nextChk.Time
			u.NextCheckAt = &t
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (m *Manager) uptimeStats24h(monitorID int64) (float64, []string) {
	var total, up int
	_ = m.db.QueryRow(`
		SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'up')
		FROM uptime_checks
		WHERE monitor_id = $1 AND checked_at >= NOW() - INTERVAL '24 hours'`, monitorID).Scan(&total, &up)
	pct := 100.0
	if total > 0 {
		pct = float64(up) * 100.0 / float64(total)
	}
	bars := make([]string, 0, 20)
	rows, err := m.db.Query(`
		SELECT status FROM uptime_checks WHERE monitor_id = $1 ORDER BY id DESC LIMIT 20`, monitorID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var st string
			if rows.Scan(&st) == nil {
				bars = append(bars, st)
			}
		}
	}
	// reverse to chronological left-to-right
	for i, j := 0, len(bars)-1; i < j; i, j = i+1, j-1 {
		bars[i], bars[j] = bars[j], bars[i]
	}
	return pct, bars
}

func (m *Manager) CreateUptimeMonitor(u UptimeMonitor) (*UptimeMonitor, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var id int64
	err := m.db.QueryRow(`
		INSERT INTO uptime_monitors (
			owner_user_id, name, kind, target, expected_status, interval_seconds, timeout_seconds,
			enabled, notify_enabled, last_status, next_check_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'unknown',NOW())
		RETURNING id`,
		u.OwnerUserID, u.Name, u.Kind, u.Target, u.ExpectedStatus, u.IntervalSeconds,
		u.TimeoutSeconds, u.Enabled, u.NotifyEnabled,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	return m.GetUptimeMonitor(id)
}

func (m *Manager) UpdateUptimeMonitorEnabled(id int64, enabled, notifyEnabled bool) (*UptimeMonitor, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		UPDATE uptime_monitors
		SET enabled = $1, notify_enabled = $2, updated_at = NOW()
		WHERE id = $3`, enabled, notifyEnabled, id)
	if err != nil {
		return nil, err
	}
	return m.GetUptimeMonitor(id)
}

func (m *Manager) DeleteUptimeMonitor(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM uptime_monitors WHERE id = $1`, id)
	return err
}

func (m *Manager) RecordUptimeCheck(monitorID int64, intervalSec int, status string, httpCode, latencyMs int, errText string, sslExp *time.Time, sslDays *int, markSSLAlert bool) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	now := time.Now()
	nextAt := now.Add(time.Duration(intervalSec) * time.Second)

	_, err := m.db.Exec(`
		INSERT INTO uptime_checks (monitor_id, status, http_code, latency_ms, error_text, checked_at)
		VALUES ($1,$2,$3,$4,$5,$6)`, monitorID, status, httpCode, latencyMs, errText, now)
	if err != nil {
		return err
	}
	if markSSLAlert {
		_, err = m.db.Exec(`
			UPDATE uptime_monitors
			SET last_status = $1, last_latency_ms = $2, last_http_code = $3, last_error = $4,
			    ssl_expires_at = $5, ssl_days_left = $6, last_ssl_alert_at = $7,
			    last_checked_at = $7, next_check_at = $8, updated_at = NOW()
			WHERE id = $9`,
			status, latencyMs, httpCode, errText, sslExp, sslDays, now, nextAt, monitorID)
	} else {
		_, err = m.db.Exec(`
			UPDATE uptime_monitors
			SET last_status = $1, last_latency_ms = $2, last_http_code = $3, last_error = $4,
			    ssl_expires_at = $5, ssl_days_left = $6,
			    last_checked_at = $7, next_check_at = $8, updated_at = NOW()
			WHERE id = $9`,
			status, latencyMs, httpCode, errText, sslExp, sslDays, now, nextAt, monitorID)
	}
	// Keep history bounded (~7 days at 1-min cadence or last 1000 checks)
	_, _ = m.db.Exec(`
		DELETE FROM uptime_checks
		WHERE monitor_id = $1 AND checked_at < NOW() - INTERVAL '7 days'`, monitorID)
	return err
}

func (m *Manager) ListUptimeChecks(monitorID int64, limit int) ([]UptimeCheck, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := m.db.Query(`
		SELECT id, monitor_id, status, http_code, latency_ms, error_text, checked_at
		FROM uptime_checks
		WHERE monitor_id = $1
		ORDER BY id DESC LIMIT $2`, monitorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]UptimeCheck, 0)
	for rows.Next() {
		var c UptimeCheck
		if err := rows.Scan(&c.ID, &c.MonitorID, &c.Status, &c.HTTPCode, &c.LatencyMs, &c.ErrorText, &c.CheckedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
