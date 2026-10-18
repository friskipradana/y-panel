package database

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// A domain of the buyer's own that leads to their panel (see migration 000020).

// ErrCustomDomainTaken is returned when the domain is already registered here
var ErrCustomDomainTaken = errors.New("this domain is already in use")

type HostingCustomDomain struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"userId"`
	Username  string    `json:"username,omitempty"`
	Hostname  string    `json:"hostname"`
	CFID      string    `json:"-"`
	Status    string    `json:"status"`
	SSLStatus string    `json:"sslStatus"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

const customDomainColumns = `c.id, c.user_id, COALESCE(u.username, ''), c.hostname, c.cf_id, c.status, c.ssl_status, c.note, c.created_at, c.updated_at`

func scanCustomDomain(row rowScanner) (*HostingCustomDomain, error) {
	var d HostingCustomDomain
	if err := row.Scan(&d.ID, &d.UserID, &d.Username, &d.Hostname, &d.CFID, &d.Status, &d.SSLStatus, &d.Note, &d.CreatedAt, &d.UpdatedAt); err != nil {
		return nil, err
	}
	return &d, nil
}

// ListHostingCustomDomains returns the domains of one account, or of all (userID 0)
func (m *Manager) ListHostingCustomDomains(userID int64) ([]HostingCustomDomain, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	query := `SELECT ` + customDomainColumns + ` FROM hosting_custom_domains c LEFT JOIN users u ON u.id = c.user_id`
	var args []any
	if userID > 0 {
		query += ` WHERE c.user_id = $1`
		args = append(args, userID)
	}
	rows, err := m.db.Query(query+` ORDER BY c.hostname`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []HostingCustomDomain{}
	for rows.Next() {
		d, err := scanCustomDomain(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

func (m *Manager) GetHostingCustomDomain(id int64) (*HostingCustomDomain, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	d, err := scanCustomDomain(m.db.QueryRow(`SELECT `+customDomainColumns+` FROM hosting_custom_domains c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return d, err
}

// GetHostingCustomDomainByHostname finds the registration of a domain, nil when there is none
func (m *Manager) GetHostingCustomDomainByHostname(hostname string) (*HostingCustomDomain, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	d, err := scanCustomDomain(m.db.QueryRow(`SELECT `+customDomainColumns+` FROM hosting_custom_domains c LEFT JOIN users u ON u.id = c.user_id WHERE c.hostname = $1`, strings.ToLower(hostname)))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return d, err
}

func (m *Manager) CreateHostingCustomDomain(userID int64, hostname, cfID, status, sslStatus, note string) (*HostingCustomDomain, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var id int64
	err := m.db.QueryRow(`
		INSERT INTO hosting_custom_domains (user_id, hostname, cf_id, status, ssl_status, note)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
	`, userID, strings.ToLower(hostname), cfID, status, sslStatus, note).Scan(&id)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key") {
			return nil, ErrCustomDomainTaken
		}
		return nil, err
	}
	return m.GetHostingCustomDomain(id)
}

func (m *Manager) SetHostingCustomDomainState(id int64, status, sslStatus, note string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE hosting_custom_domains SET status = $2, ssl_status = $3, note = $4, updated_at = NOW() WHERE id = $1`, id, status, sslStatus, note)
	return err
}

func (m *Manager) DeleteHostingCustomDomain(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM hosting_custom_domains WHERE id = $1`, id)
	return err
}

func (m *Manager) CountHostingCustomDomains(userID int64) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var n int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM hosting_custom_domains WHERE user_id = $1`, userID).Scan(&n)
	return n, err
}
