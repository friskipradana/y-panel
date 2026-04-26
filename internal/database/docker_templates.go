package database

import (
	"database/sql"
	"fmt"
	"time"
)

type DockerComposeTemplate struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	YAMLContent string    `json:"yamlContent"`
	OwnerUserID int64     `json:"ownerUserId"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (m *Manager) CreateComposeTemplate(ownerUserID int64, name, description, yamlContent string) (*DockerComposeTemplate, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if !m.connected {
		return nil, fmt.Errorf("database not connected")
	}

	query := `
		INSERT INTO docker_compose_templates (owner_user_id, name, description, yaml_content)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`
	tmpl := &DockerComposeTemplate{
		Name:        name,
		Description: description,
		YAMLContent: yamlContent,
		OwnerUserID: ownerUserID,
	}

	err := m.db.QueryRow(query, ownerUserID, name, description, yamlContent).Scan(&tmpl.ID, &tmpl.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert template: %w", err)
	}

	return tmpl, nil
}

func (m *Manager) UpdateComposeTemplate(id, ownerUserID int64, name, description, yamlContent string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if !m.connected {
		return fmt.Errorf("database not connected")
	}

	query := `
		UPDATE docker_compose_templates
		SET name = $1, description = $2, yaml_content = $3
		WHERE id = $4 AND ($5 = 0 OR owner_user_id = $5)
	`
	res, err := m.db.Exec(query, name, description, yamlContent, id, ownerUserID)
	if err != nil {
		return fmt.Errorf("update template: %w", err)
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("template with id %d not found", id)
	}

	return nil
}

func (m *Manager) DeleteComposeTemplateForOwner(id, ownerUserID int64) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if !m.connected {
		return fmt.Errorf("database not connected")
	}

	query := `DELETE FROM docker_compose_templates WHERE id = $1 AND ($2 = 0 OR owner_user_id = $2)`
	res, err := m.db.Exec(query, id, ownerUserID)
	if err != nil {
		return fmt.Errorf("delete template: %w", err)
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("template with id %d not found", id)
	}
	return nil
}

func (m *Manager) ListComposeTemplates() ([]DockerComposeTemplate, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if !m.connected {
		return nil, fmt.Errorf("database not connected")
	}

	query := `
		SELECT id, owner_user_id, name, description, yaml_content, created_at
		FROM docker_compose_templates
		ORDER BY name ASC
	`
	rows, err := m.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query templates: %w", err)
	}
	defer rows.Close()

	templates := []DockerComposeTemplate{}
	for rows.Next() {
		var tmpl DockerComposeTemplate
		var desc sql.NullString
		if err := rows.Scan(&tmpl.ID, &tmpl.OwnerUserID, &tmpl.Name, &desc, &tmpl.YAMLContent, &tmpl.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan template: %w", err)
		}
		tmpl.Description = desc.String
		templates = append(templates, tmpl)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	return templates, nil
}
