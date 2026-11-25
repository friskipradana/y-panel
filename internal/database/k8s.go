package database

import (
	"database/sql"
	"fmt"
	"time"
)

// K8sCluster stores an encrypted kubeconfig or local K3s reference owned by an admin account.
type K8sCluster struct {
	ID               int64     `json:"id"`
	OwnerUserID      int64     `json:"ownerUserId"`
	Name             string    `json:"name"`
	Provider         string    `json:"provider"` // "k3s-local" | "external"
	APIServer        string    `json:"apiServer"`
	DefaultNamespace string    `json:"defaultNamespace"`
	KubeconfigEnc    string    `json:"-"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

func (m *Manager) ListK8sClusters(ownerUserID int64, isSuperadmin bool) ([]K8sCluster, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var (
		rows *sql.Rows
		err  error
	)
	if isSuperadmin {
		rows, err = m.db.Query(
			`SELECT id, owner_user_id, name, provider, api_server, default_namespace, kubeconfig_enc, created_at, updated_at
			 FROM k8s_clusters ORDER BY (provider = 'k3s-local') DESC, id ASC`,
		)
	} else {
		rows, err = m.db.Query(
			`SELECT id, owner_user_id, name, provider, api_server, default_namespace, kubeconfig_enc, created_at, updated_at
			 FROM k8s_clusters WHERE owner_user_id = $1 ORDER BY id ASC`,
			ownerUserID,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]K8sCluster, 0)
	for rows.Next() {
		var c K8sCluster
		if err := rows.Scan(
			&c.ID, &c.OwnerUserID, &c.Name, &c.Provider,
			&c.APIServer, &c.DefaultNamespace, &c.KubeconfigEnc,
			&c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (m *Manager) GetK8sCluster(id int64) (*K8sCluster, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var c K8sCluster
	err := m.db.QueryRow(
		`SELECT id, owner_user_id, name, provider, api_server, default_namespace, kubeconfig_enc, created_at, updated_at
		 FROM k8s_clusters WHERE id = $1`,
		id,
	).Scan(
		&c.ID, &c.OwnerUserID, &c.Name, &c.Provider,
		&c.APIServer, &c.DefaultNamespace, &c.KubeconfigEnc,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (m *Manager) CreateK8sCluster(c *K8sCluster) (*K8sCluster, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	if c.DefaultNamespace == "" {
		c.DefaultNamespace = "default"
	}
	if c.Provider == "" {
		c.Provider = "external"
	}
	err := m.db.QueryRow(
		`INSERT INTO k8s_clusters (owner_user_id, name, provider, api_server, default_namespace, kubeconfig_enc)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, created_at, updated_at`,
		c.OwnerUserID, c.Name, c.Provider, c.APIServer, c.DefaultNamespace, c.KubeconfigEnc,
	).Scan(&c.ID, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (m *Manager) DeleteK8sCluster(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM k8s_clusters WHERE id = $1`, id)
	return err
}

// GetProjectAny fetches a project by ID without restricting user_id (used by superadmin K8s source deploy and backups).
func (m *Manager) GetProjectAny(id int64) (*Project, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	row := m.db.QueryRow(`SELECT `+projectColumns+` FROM projects WHERE id = $1`, id)
	return scanProject(row)
}
