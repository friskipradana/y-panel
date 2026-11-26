package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// StudioSectionItem is one card, feature, pricing tier, step, or FAQ entry in a landing section.
type StudioSectionItem struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Price       string   `json:"price,omitempty"`
	Badge       string   `json:"badge,omitempty"`
	Bullets     []string `json:"bullets,omitempty"`
	Highlight   bool     `json:"highlight,omitempty"`
}

// StudioSection is one block inside a generated landing page.
type StudioSection struct {
	ID         string              `json:"id"`
	Type       string              `json:"type"` // features | pricing | steps | faq | cta
	Heading    string              `json:"heading"`
	Subheading string              `json:"subheading,omitempty"`
	Items      []StudioSectionItem `json:"items"`
}

// StudioPage represents a generated or authored landing page or documentation page.
type StudioPage struct {
	ID             int64           `json:"id"`
	OwnerUserID    int64           `json:"ownerUserId"`
	Kind           string          `json:"kind"` // landing | docs
	Slug           string          `json:"slug"`
	Title          string          `json:"title"`
	Subtitle       string          `json:"subtitle"`
	Status         string          `json:"status"` // draft | published
	ShowInDocs     bool            `json:"showInDocs"`
	LinkedDocID    int64           `json:"linkedDocId"`
	BrandName      string          `json:"brandName"`
	ThemeTone      string          `json:"themeTone"` // blue | emerald | slate | amber
	SEODescription string          `json:"seoDescription"`
	CTALabel       string          `json:"ctaLabel"`
	CTAURL         string          `json:"ctaUrl"`
	Sections       []StudioSection `json:"sections"`
	MarkdownBody   string          `json:"markdownBody"`
	SourcePrompt   string          `json:"sourcePrompt"`
	CreatedAt      time.Time       `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
}

const studioPageCols = `id, owner_user_id, kind, slug, title, subtitle, status, show_in_docs,
	linked_doc_id, brand_name, theme_tone, seo_description, cta_label, cta_url,
	sections_json, markdown_body, source_prompt, created_at, updated_at`

func normalizeStudioPage(p *StudioPage) {
	if p.Kind != "docs" {
		p.Kind = "landing"
	}
	if p.Status != "published" {
		p.Status = "draft"
	}
	switch p.ThemeTone {
	case "blue", "emerald", "slate", "amber":
	default:
		p.ThemeTone = "blue"
	}
	p.Slug = strings.TrimSpace(strings.ToLower(p.Slug))
	p.Title = strings.TrimSpace(p.Title)
	p.Subtitle = strings.TrimSpace(p.Subtitle)
	p.BrandName = strings.TrimSpace(p.BrandName)
	p.SEODescription = strings.TrimSpace(p.SEODescription)
	p.CTALabel = strings.TrimSpace(p.CTALabel)
	p.CTAURL = strings.TrimSpace(p.CTAURL)
	if p.Sections == nil {
		p.Sections = []StudioSection{}
	}
}

func scanStudioPage(scanner interface{ Scan(dest ...any) error }) (*StudioPage, error) {
	var p StudioPage
	var sectionsJSON string
	err := scanner.Scan(
		&p.ID, &p.OwnerUserID, &p.Kind, &p.Slug, &p.Title, &p.Subtitle, &p.Status, &p.ShowInDocs,
		&p.LinkedDocID, &p.BrandName, &p.ThemeTone, &p.SEODescription, &p.CTALabel, &p.CTAURL,
		&sectionsJSON, &p.MarkdownBody, &p.SourcePrompt, &p.CreatedAt, &p.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(sectionsJSON), &p.Sections)
	if p.Sections == nil {
		p.Sections = []StudioSection{}
	}
	return &p, nil
}

func (m *Manager) ListStudioPages(ownerUserID int64, includeAll bool, kind string) ([]StudioPage, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var rows *sql.Rows
	var err error
	if includeAll {
		if kind != "" {
			rows, err = m.db.Query(`SELECT `+studioPageCols+` FROM studio_pages WHERE kind = $1 ORDER BY updated_at DESC, id DESC LIMIT 200`, kind)
		} else {
			rows, err = m.db.Query(`SELECT ` + studioPageCols + ` FROM studio_pages ORDER BY updated_at DESC, id DESC LIMIT 200`)
		}
	} else {
		if kind != "" {
			rows, err = m.db.Query(`SELECT `+studioPageCols+` FROM studio_pages WHERE owner_user_id = $1 AND kind = $2 ORDER BY updated_at DESC, id DESC LIMIT 200`, ownerUserID, kind)
		} else {
			rows, err = m.db.Query(`SELECT `+studioPageCols+` FROM studio_pages WHERE owner_user_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 200`, ownerUserID)
		}
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StudioPage{}
	for rows.Next() {
		item, sErr := scanStudioPage(rows)
		if sErr != nil {
			return nil, sErr
		}
		if item != nil {
			out = append(out, *item)
		}
	}
	return out, nil
}

func (m *Manager) GetStudioPage(id int64) (*StudioPage, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	return scanStudioPage(m.db.QueryRow(`SELECT `+studioPageCols+` FROM studio_pages WHERE id = $1`, id))
}

func (m *Manager) GetStudioPageBySlug(slug string) (*StudioPage, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	return scanStudioPage(m.db.QueryRow(`SELECT `+studioPageCols+` FROM studio_pages WHERE slug = $1`, strings.ToLower(strings.TrimSpace(slug))))
}

func (m *Manager) CreateStudioPage(p *StudioPage) (*StudioPage, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	normalizeStudioPage(p)
	secB, _ := json.Marshal(p.Sections)
	err := m.db.QueryRow(`
		INSERT INTO studio_pages (
			owner_user_id, kind, slug, title, subtitle, status, show_in_docs,
			linked_doc_id, brand_name, theme_tone, seo_description, cta_label, cta_url,
			sections_json, markdown_body, source_prompt
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		RETURNING id, created_at, updated_at`,
		p.OwnerUserID, p.Kind, p.Slug, p.Title, p.Subtitle, p.Status, p.ShowInDocs,
		p.LinkedDocID, p.BrandName, p.ThemeTone, p.SEODescription, p.CTALabel, p.CTAURL,
		string(secB), p.MarkdownBody, p.SourcePrompt,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (m *Manager) UpdateStudioPage(p *StudioPage) (*StudioPage, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	normalizeStudioPage(p)
	secB, _ := json.Marshal(p.Sections)
	err := m.db.QueryRow(`
		UPDATE studio_pages SET
			kind = $2, slug = $3, title = $4, subtitle = $5, status = $6, show_in_docs = $7,
			linked_doc_id = $8, brand_name = $9, theme_tone = $10, seo_description = $11,
			cta_label = $12, cta_url = $13, sections_json = $14, markdown_body = $15,
			source_prompt = $16, updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at`,
		p.ID, p.Kind, p.Slug, p.Title, p.Subtitle, p.Status, p.ShowInDocs,
		p.LinkedDocID, p.BrandName, p.ThemeTone, p.SEODescription,
		p.CTALabel, p.CTAURL, string(secB), p.MarkdownBody, p.SourcePrompt,
	).Scan(&p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (m *Manager) DeleteStudioPage(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM studio_pages WHERE id = $1`, id)
	return err
}
