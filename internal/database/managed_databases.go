package database

import (
	"database/sql"
	"fmt"
	"time"
)

// ManagedDatabase is one database a panel user created (a container run by internal/userdb).
type ManagedDatabase struct {
	ID                int64     `json:"id"`
	UserID            int64     `json:"userId"`
	OwnerName         string    `json:"ownerName,omitempty"`
	Name              string    `json:"name"`
	Engine            string    `json:"engine"`
	Version           string    `json:"version"`
	ContainerName     string    `json:"containerName"`
	HostPort          int       `json:"port"`
	DatabaseName      string    `json:"database"`
	Username          string    `json:"username"`
	PasswordEncrypted string    `json:"-"`
	Status            string    `json:"status"`
	LastError         string    `json:"lastError,omitempty"`
	CreatedAt         time.Time `json:"createdAt"`
}

const managedDatabaseColumns = `d.id, d.user_id, COALESCE(u.username,''), d.name, d.engine, d.version, d.container_name,
	d.host_port, d.db_name, d.db_user, d.password_encrypted, d.status, COALESCE(d.last_error,''), d.created_at`

func scanManagedDatabase(row interface{ Scan(...any) error }) (*ManagedDatabase, error) {
	var d ManagedDatabase
	err := row.Scan(&d.ID, &d.UserID, &d.OwnerName, &d.Name, &d.Engine, &d.Version, &d.ContainerName,
		&d.HostPort, &d.DatabaseName, &d.Username, &d.PasswordEncrypted, &d.Status, &d.LastError, &d.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// ListManagedDatabases returns a user's databases, or every user's when all is set.
func (m *Manager) ListManagedDatabases(userID int64, all bool) ([]ManagedDatabase, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	query := `SELECT ` + managedDatabaseColumns + ` FROM managed_databases d JOIN users u ON u.id = d.user_id`
	args := []any{}
	if !all {
		query += ` WHERE d.user_id = $1`
		args = append(args, userID)
	}
	query += ` ORDER BY d.created_at DESC`
	rows, err := m.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []ManagedDatabase{}
	for rows.Next() {
		d, err := scanManagedDatabase(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *d)
	}
	return list, rows.Err()
}

// GetManagedDatabase loads one database owned by userID (nil when not found).
func (m *Manager) GetManagedDatabase(id, userID int64) (*ManagedDatabase, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	row := m.db.QueryRow(`SELECT `+managedDatabaseColumns+` FROM managed_databases d JOIN users u ON u.id = d.user_id WHERE d.id = $1 AND d.user_id = $2`, id, userID)
	d, err := scanManagedDatabase(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return d, err
}

// ManagedDatabasePorts returns the host ports already taken by user databases.
func (m *Manager) ManagedDatabasePorts() (map[int]bool, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`SELECT host_port FROM managed_databases`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	used := map[int]bool{}
	for rows.Next() {
		var port int
		if err := rows.Scan(&port); err != nil {
			return nil, err
		}
		used[port] = true
	}
	return used, rows.Err()
}

// CreateManagedDatabase inserts the row first so its id names the container.
func (m *Manager) CreateManagedDatabase(userID int64, name, engine, version, dbName, dbUser, passwordEncrypted string, hostPort int) (*ManagedDatabase, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var id int64
	err := m.db.QueryRow(`
		INSERT INTO managed_databases (user_id, name, engine, version, container_name, host_port, db_name, db_user, password_encrypted, status)
		VALUES ($1, $2, $3, $4, '', $5, $6, $7, $8, 'creating')
		RETURNING id`, userID, name, engine, version, hostPort, dbName, dbUser, passwordEncrypted).Scan(&id)
	if err != nil {
		return nil, err
	}
	container := fmt.Sprintf("reneo-db-%d", id)
	if _, err := m.db.Exec(`UPDATE managed_databases SET container_name = $1 WHERE id = $2`, container, id); err != nil {
		return nil, err
	}
	return m.GetManagedDatabase(id, userID)
}

func (m *Manager) SetManagedDatabaseStatus(id int64, status, lastError string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE managed_databases SET status = $1, last_error = $2 WHERE id = $3`, status, lastError, id)
	return err
}

func (m *Manager) DeleteManagedDatabase(id, userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM managed_databases WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (m *Manager) CountManagedDatabases(userID int64) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var n int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM managed_databases WHERE user_id = $1`, userID).Scan(&n)
	return n, err
}
