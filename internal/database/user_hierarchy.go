package database

import (
	"fmt"
	"strings"

	"github.com/lib/pq"
)

// SetUserParent records which account created (and manages) another account.
func (m *Manager) SetUserParent(id, parentID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	if id == parentID {
		return fmt.Errorf("an account cannot be its own parent")
	}
	var parent any = parentID
	if parentID <= 0 {
		parent = nil
	}
	_, err := m.db.Exec(`UPDATE users SET parent_id = $2, updated_at = NOW() WHERE id = $1`, id, parent)
	return err
}

// UserSubtreeIDs returns the account itself and every account below it.
func (m *Manager) UserSubtreeIDs(rootID int64) ([]int64, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`
		WITH RECURSIVE tree(id) AS (
			SELECT id FROM users WHERE id = $1
			UNION
			SELECT u.id FROM users u JOIN tree t ON u.parent_id = t.id
		)
		SELECT id FROM tree
	`, rootID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ListUsersByIDs is ListUsersFiltered limited to a set of accounts.
func (m *Manager) ListUsersByIDs(ids []int64, query string, limit, offset int) ([]User, int64, error) {
	if !m.IsConnected() {
		return nil, 0, fmt.Errorf("database not connected")
	}
	query = strings.TrimSpace(query)
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	search := "%" + strings.ToLower(query) + "%"
	where := `id = ANY($1) AND ($2 = '' OR LOWER(username) LIKE $3 OR LOWER(email) LIKE $3 OR LOWER(COALESCE(display_name,'')) LIKE $3)`

	var total int64
	if err := m.db.QueryRow(`SELECT COUNT(*) FROM users WHERE `+where, pq.Array(ids), query, search).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := m.db.Query(`
		SELECT id, username, email, role, status, COALESCE(display_name,''), COALESCE(avatar_url,''), created_at, updated_at, last_login_at
		FROM users WHERE `+where+` ORDER BY created_at DESC LIMIT $4 OFFSET $5
	`, pq.Array(ids), query, search, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]User, 0)
	for rows.Next() {
		u, err := scanUserFromRows(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *u)
	}
	return out, total, rows.Err()
}

// ListProjectsForOwners is ListProjectsFiltered across several owners.
func (m *Manager) ListProjectsForOwners(ownerIDs []int64, query string, limit, offset int) ([]Project, int64, error) {
	if !m.IsConnected() {
		return nil, 0, fmt.Errorf("database not connected")
	}
	query = strings.TrimSpace(query)
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	search := "%" + strings.ToLower(query) + "%"
	where := `user_id = ANY($1) AND ($2 = '' OR LOWER(name) LIKE $3 OR LOWER(slug) LIKE $3 OR LOWER(COALESCE(description,'')) LIKE $3 OR LOWER(COALESCE(project_type,'')) LIKE $3 OR LOWER(COALESCE(working_dir,'')) LIKE $3)`

	var total int64
	if err := m.db.QueryRow(`SELECT COUNT(*) FROM projects WHERE `+where, pq.Array(ownerIDs), query, search).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := m.db.Query(`
		SELECT `+projectColumns+`
		FROM projects WHERE `+where+` ORDER BY created_at DESC LIMIT $4 OFFSET $5
	`, pq.Array(ownerIDs), query, search, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]Project, 0)
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *p)
	}
	return out, total, rows.Err()
}

// UserParentIDs maps account IDs to the account that manages them (accounts without a parent are
// left out).
func (m *Manager) UserParentIDs(ids []int64) (map[int64]int64, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	out := map[int64]int64{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := m.db.Query(`SELECT id, parent_id FROM users WHERE id = ANY($1) AND parent_id IS NOT NULL`, pq.Array(ids))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, parent int64
		if err := rows.Scan(&id, &parent); err != nil {
			return nil, err
		}
		out[id] = parent
	}
	return out, rows.Err()
}
