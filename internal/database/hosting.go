package database

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
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
