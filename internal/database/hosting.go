package database

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ─── Hosting plans ────────────────────────────────────────────────────────────

type HostingPlan struct {
	ID            int64     `json:"id"`
	Slug          string    `json:"slug"`
	Name          string    `json:"name"`
	Tagline       string    `json:"tagline"`
	PriceAmount   int64     `json:"priceAmount"`
	Period        string    `json:"period"`
	Features      []string  `json:"features"`
	MaxProjects   int       `json:"maxProjects"`
	MaxTunnels    int       `json:"maxTunnels"`
	MaxDatabases  int       `json:"maxDatabases"`
	DiskQuotaMB   int64     `json:"diskQuotaMb"`
	CPULimitPct   int       `json:"cpuLimitPct"`
	MemoryLimitMB int       `json:"memoryLimitMb"`
	MaxSubdomains int       `json:"maxSubdomains"`
	Highlighted   bool      `json:"highlighted"`
	Visible       bool      `json:"visible"`
	SortOrder     int       `json:"sortOrder"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	// Accounts is how many accounts are on the plan; filled by the list queries
	Accounts int `json:"accounts"`
}

// ErrPlanInUse is returned when a plan that accounts are still on is deleted
var ErrPlanInUse = errors.New("plan is still assigned to accounts")

const planColumns = `p.id, p.slug, p.name, p.tagline, p.price_amount, p.period, p.features,
	p.max_projects, p.max_tunnels, p.max_databases, p.disk_quota_mb, p.cpu_limit_pct, p.memory_limit_mb, p.max_subdomains,
	p.highlighted, p.visible, p.sort_order, p.created_at, p.updated_at,
	(SELECT COUNT(*) FROM user_plans up WHERE up.plan_id = p.id)`

func scanPlan(row rowScanner) (*HostingPlan, error) {
	var p HostingPlan
	var features []byte
	if err := row.Scan(&p.ID, &p.Slug, &p.Name, &p.Tagline, &p.PriceAmount, &p.Period, &features,
		&p.MaxProjects, &p.MaxTunnels, &p.MaxDatabases, &p.DiskQuotaMB, &p.CPULimitPct, &p.MemoryLimitMB, &p.MaxSubdomains,
		&p.Highlighted, &p.Visible, &p.SortOrder, &p.CreatedAt, &p.UpdatedAt, &p.Accounts); err != nil {
		return nil, err
	}
	p.Features = []string{}
	if len(features) > 0 {
		_ = json.Unmarshal(features, &p.Features)
	}
	return &p, nil
}

func (m *Manager) ListHostingPlans(visibleOnly bool) ([]HostingPlan, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	query := `SELECT ` + planColumns + ` FROM hosting_plans p`
	if visibleOnly {
		query += ` WHERE p.visible`
	}
	query += ` ORDER BY p.sort_order, p.id`
	rows, err := m.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	plans := []HostingPlan{}
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		plans = append(plans, *p)
	}
	return plans, rows.Err()
}

func (m *Manager) GetHostingPlan(id int64) (*HostingPlan, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	p, err := scanPlan(m.db.QueryRow(`SELECT `+planColumns+` FROM hosting_plans p WHERE p.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return p, err
}

func (m *Manager) CreateHostingPlan(p HostingPlan) (*HostingPlan, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	features, _ := json.Marshal(nonNilStrings(p.Features))
	var id int64
	err := m.db.QueryRow(`
		INSERT INTO hosting_plans (slug, name, tagline, price_amount, period, features, max_projects, max_tunnels, max_databases,
			disk_quota_mb, cpu_limit_pct, memory_limit_mb, max_subdomains, highlighted, visible, sort_order)
		VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id
	`, p.Slug, p.Name, p.Tagline, p.PriceAmount, p.Period, string(features), p.MaxProjects, p.MaxTunnels, p.MaxDatabases,
		p.DiskQuotaMB, p.CPULimitPct, p.MemoryLimitMB, p.MaxSubdomains, p.Highlighted, p.Visible, p.SortOrder).Scan(&id)
	if err != nil {
		return nil, err
	}
	return m.GetHostingPlan(id)
}

func (m *Manager) UpdateHostingPlan(p HostingPlan) (*HostingPlan, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	features, _ := json.Marshal(nonNilStrings(p.Features))
	res, err := m.db.Exec(`
		UPDATE hosting_plans SET slug=$2, name=$3, tagline=$4, price_amount=$5, period=$6, features=$7::jsonb,
			max_projects=$8, max_tunnels=$9, max_databases=$10, disk_quota_mb=$11, cpu_limit_pct=$12, memory_limit_mb=$13,
			max_subdomains=$14, highlighted=$15, visible=$16, sort_order=$17, updated_at=NOW()
		WHERE id=$1
	`, p.ID, p.Slug, p.Name, p.Tagline, p.PriceAmount, p.Period, string(features), p.MaxProjects, p.MaxTunnels, p.MaxDatabases,
		p.DiskQuotaMB, p.CPULimitPct, p.MemoryLimitMB, p.MaxSubdomains, p.Highlighted, p.Visible, p.SortOrder)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, nil
	}
	return m.GetHostingPlan(p.ID)
}

// DeleteHostingPlan refuses while accounts are on the plan: their quota came from it
func (m *Manager) DeleteHostingPlan(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	var accounts int
	if err := m.db.QueryRow(`SELECT COUNT(*) FROM user_plans WHERE plan_id = $1`, id).Scan(&accounts); err != nil {
		return err
	}
	if accounts > 0 {
		return ErrPlanInUse
	}
	_, err := m.db.Exec(`DELETE FROM hosting_plans WHERE id = $1`, id)
	return err
}

func nonNilStrings(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}

// ─── Accounts on a plan ───────────────────────────────────────────────────────

type UserPlan struct {
	UserID             int64      `json:"userId"`
	PlanID             *int64     `json:"planId"`
	ExpiresAt          *time.Time `json:"expiresAt"`
	SuspendedForExpiry bool       `json:"suspendedForExpiry"`
}

func (m *Manager) GetUserPlan(userID int64) (*UserPlan, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var up UserPlan
	err := m.db.QueryRow(`SELECT user_id, plan_id, expires_at, suspended_for_expiry FROM user_plans WHERE user_id = $1`, userID).
		Scan(&up.UserID, &up.PlanID, &up.ExpiresAt, &up.SuspendedForExpiry)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &up, err
}

// SetUserPlan puts an account on a plan until expiresAt (nil: no end) and clears an old expiry suspension flag
func (m *Manager) SetUserPlan(userID, planID int64, expiresAt *time.Time) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		INSERT INTO user_plans (user_id, plan_id, expires_at, suspended_for_expiry)
		VALUES ($1, $2, $3, FALSE)
		ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, expires_at = EXCLUDED.expires_at,
			suspended_for_expiry = FALSE, updated_at = NOW()
	`, userID, planID, expiresAt)
	return err
}

func (m *Manager) ClearUserPlan(userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM user_plans WHERE user_id = $1`, userID)
	return err
}

func (m *Manager) SetPlanSuspendedForExpiry(userID int64, suspended bool) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE user_plans SET suspended_for_expiry = $2, updated_at = NOW() WHERE user_id = $1`, userID, suspended)
	return err
}

// ListExpiredUserPlans returns plans whose end is before cutoff and that are not yet suspended for it
func (m *Manager) ListExpiredUserPlans(cutoff time.Time) ([]UserPlan, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`
		SELECT user_id, plan_id, expires_at, suspended_for_expiry FROM user_plans
		WHERE expires_at IS NOT NULL AND expires_at <= $1 AND NOT suspended_for_expiry
	`, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []UserPlan
	for rows.Next() {
		var up UserPlan
		if err := rows.Scan(&up.UserID, &up.PlanID, &up.ExpiresAt, &up.SuspendedForExpiry); err != nil {
			return nil, err
		}
		out = append(out, up)
	}
	return out, rows.Err()
}

// ─── Domains and subdomains ───────────────────────────────────────────────────

type HostingDomain struct {
	ZoneID  string `json:"zoneId"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

func (m *Manager) ListHostingDomains() ([]HostingDomain, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`SELECT zone_id, name, enabled FROM hosting_domains ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HostingDomain{}
	for rows.Next() {
		var d HostingDomain
		if err := rows.Scan(&d.ZoneID, &d.Name, &d.Enabled); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (m *Manager) SetHostingDomain(zoneID, name string, enabled bool) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		INSERT INTO hosting_domains (zone_id, name, enabled) VALUES ($1, $2, $3)
		ON CONFLICT (zone_id) DO UPDATE SET name = EXCLUDED.name, enabled = EXCLUDED.enabled, updated_at = NOW()
	`, zoneID, name, enabled)
	return err
}

type HostingSubdomain struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"userId"`
	Username  string    `json:"username,omitempty"`
	Label     string    `json:"label"`
	ZoneID    string    `json:"zoneId"`
	Domain    string    `json:"domain"`
	Hostname  string    `json:"hostname"`
	ProjectID *int64    `json:"projectId"`
	Status    string    `json:"status"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ErrHostnameTaken is returned when a hostname is already held by someone
var ErrHostnameTaken = errors.New("hostname is already taken")

const subdomainColumns = `s.id, s.user_id, COALESCE(u.username,''), s.label, s.zone_id, s.domain, s.hostname, s.project_id, s.status, s.note, s.created_at, s.updated_at`

func scanSubdomain(row rowScanner) (*HostingSubdomain, error) {
	var s HostingSubdomain
	if err := row.Scan(&s.ID, &s.UserID, &s.Username, &s.Label, &s.ZoneID, &s.Domain, &s.Hostname, &s.ProjectID, &s.Status, &s.Note, &s.CreatedAt, &s.UpdatedAt); err != nil {
		return nil, err
	}
	return &s, nil
}

// ListHostingSubdomains returns every subdomain (userID 0) or those of one account
func (m *Manager) ListHostingSubdomains(userID int64) ([]HostingSubdomain, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	query := `SELECT ` + subdomainColumns + ` FROM hosting_subdomains s JOIN users u ON u.id = s.user_id`
	args := []any{}
	if userID != 0 {
		query += ` WHERE s.user_id = $1`
		args = append(args, userID)
	}
	query += ` ORDER BY s.hostname`
	rows, err := m.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HostingSubdomain{}
	for rows.Next() {
		s, err := scanSubdomain(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

func (m *Manager) GetHostingSubdomain(id int64) (*HostingSubdomain, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	s, err := scanSubdomain(m.db.QueryRow(`SELECT `+subdomainColumns+` FROM hosting_subdomains s JOIN users u ON u.id = s.user_id WHERE s.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

func (m *Manager) CreateHostingSubdomain(userID int64, label, zoneID, domain, hostname string, projectID *int64) (*HostingSubdomain, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var id int64
	err := m.db.QueryRow(`
		INSERT INTO hosting_subdomains (user_id, label, zone_id, domain, hostname, project_id, status)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id
	`, userID, label, zoneID, domain, hostname, projectID).Scan(&id)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key") {
			return nil, ErrHostnameTaken
		}
		return nil, err
	}
	return m.GetHostingSubdomain(id)
}

func (m *Manager) SetHostingSubdomainProject(id int64, projectID *int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE hosting_subdomains SET project_id = $2, updated_at = NOW() WHERE id = $1`, id, projectID)
	return err
}

func (m *Manager) SetHostingSubdomainStatus(id int64, status, note string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE hosting_subdomains SET status = $2, note = $3, updated_at = NOW() WHERE id = $1`, id, status, note)
	return err
}

func (m *Manager) DeleteHostingSubdomain(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM hosting_subdomains WHERE id = $1`, id)
	return err
}

func (m *Manager) CountHostingSubdomains(userID int64) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var n int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM hosting_subdomains WHERE user_id = $1`, userID).Scan(&n)
	return n, err
}

// GetHostingState and SetHostingState hold small operational values (the carrier tunnel id)
func (m *Manager) GetHostingState(key string) (string, error) {
	if !m.IsConnected() {
		return "", fmt.Errorf("database not connected")
	}
	var value string
	err := m.db.QueryRow(`SELECT value FROM hosting_state WHERE key = $1`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return value, err
}

func (m *Manager) SetHostingState(key, value string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		INSERT INTO hosting_state (key, value) VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
	`, key, value)
	return err
}

// GetSuperadminID is the account whose Cloudflare credentials carry the subdomains
func (m *Manager) GetSuperadminID() (int64, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var id int64
	err := m.db.QueryRow(`SELECT id FROM users WHERE role = 'superadmin' ORDER BY id LIMIT 1`).Scan(&id)
	return id, err
}
