package database

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/lib/pq"
)

// PublicRoute is a domain the public proxy answers for, and what it leads to
type PublicRoute struct {
	ID        int64  `json:"id"`
	Hostname  string `json:"hostname"`
	Kind      string `json:"kind"`
	ProjectID *int64 `json:"projectId"`
	// Port is the port on this machine for a route of kind "port"
	Port    int    `json:"port"`
	Enabled bool   `json:"enabled"`
	Note    string `json:"note"`
	// the last check with the test service of Let's Encrypt
	CheckedAt  *time.Time `json:"checkedAt"`
	CheckOK    bool       `json:"checkOk"`
	CheckError string     `json:"checkError"`
	CreatedAt  time.Time  `json:"createdAt"`
	// filled from the project the route leads to
	ProjectName string `json:"projectName"`
	ProjectSlug string `json:"projectSlug"`
	// ProjectPort is the port the project runs on; 0 when it has none
	ProjectPort int `json:"projectPort"`
}

// ErrPublicRouteTaken is returned when the domain is already registered
var ErrPublicRouteTaken = errors.New("this domain is already registered")

const publicRouteColumns = `r.id, r.hostname, r.kind, r.project_id, r.port, r.enabled, r.note, r.checked_at, r.check_ok, r.check_error, r.created_at,
	COALESCE(p.name, ''), COALESCE(p.slug, ''), COALESCE(p.assigned_port, 0)`

const publicRouteFrom = ` FROM public_routes r LEFT JOIN projects p ON p.id = r.project_id`

func scanPublicRoute(row rowScanner) (*PublicRoute, error) {
	var r PublicRoute
	if err := row.Scan(&r.ID, &r.Hostname, &r.Kind, &r.ProjectID, &r.Port, &r.Enabled, &r.Note, &r.CheckedAt, &r.CheckOK, &r.CheckError, &r.CreatedAt,
		&r.ProjectName, &r.ProjectSlug, &r.ProjectPort); err != nil {
		return nil, err
	}
	return &r, nil
}

func (m *Manager) ListPublicRoutes() ([]PublicRoute, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`SELECT ` + publicRouteColumns + publicRouteFrom + ` ORDER BY r.hostname`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PublicRoute{}
	for rows.Next() {
		r, err := scanPublicRoute(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

func (m *Manager) GetPublicRoute(id int64) (*PublicRoute, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	r, err := scanPublicRoute(m.db.QueryRow(`SELECT `+publicRouteColumns+publicRouteFrom+` WHERE r.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return r, err
}

func (m *Manager) CreatePublicRoute(r PublicRoute, createdBy int64) (*PublicRoute, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var by any
	if createdBy > 0 {
		by = createdBy
	}
	var id int64
	err := m.db.QueryRow(`
		INSERT INTO public_routes (hostname, kind, project_id, port, enabled, note, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
	`, r.Hostname, r.Kind, r.ProjectID, r.Port, r.Enabled, r.Note, by).Scan(&id)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			return nil, ErrPublicRouteTaken
		}
		return nil, err
	}
	return m.GetPublicRoute(id)
}

// UpdatePublicRoute changes what a route leads to and its switch. A change of target clears the last check, which was about the old one.
func (m *Manager) UpdatePublicRoute(r PublicRoute) (*PublicRoute, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	res, err := m.db.Exec(`
		UPDATE public_routes SET kind = $2, project_id = $3, port = $4, enabled = $5, note = $6, updated_at = NOW(),
			checked_at = CASE WHEN kind <> $2 OR project_id IS DISTINCT FROM $3 OR port <> $4 THEN NULL ELSE checked_at END,
			check_ok = CASE WHEN kind <> $2 OR project_id IS DISTINCT FROM $3 OR port <> $4 THEN false ELSE check_ok END,
			check_error = CASE WHEN kind <> $2 OR project_id IS DISTINCT FROM $3 OR port <> $4 THEN '' ELSE check_error END
		WHERE id = $1
	`, r.ID, r.Kind, r.ProjectID, r.Port, r.Enabled, r.Note)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, nil
	}
	return m.GetPublicRoute(r.ID)
}

func (m *Manager) DeletePublicRoute(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM public_routes WHERE id = $1`, id)
	return err
}

// SetPublicRouteCheck keeps what the last check with the test service said
func (m *Manager) SetPublicRouteCheck(id int64, ok bool, reason string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE public_routes SET checked_at = NOW(), check_ok = $2, check_error = $3 WHERE id = $1`, id, ok, reason)
	return err
}

// ProjectExists says whether a project with this id exists, whoever owns it
func (m *Manager) ProjectExists(id int64) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	var ok bool
	err := m.db.QueryRow(`SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`, id).Scan(&ok)
	return ok, err
}
