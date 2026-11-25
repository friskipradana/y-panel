package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// AIIntegration holds encrypted AI provider settings per owner (or global owner=0).
type AIIntegration struct {
	ID          int64     `json:"id"`
	OwnerUserID int64     `json:"ownerUserId"`
	Provider    string    `json:"provider"`
	BaseURL     string    `json:"baseUrl"`
	Model       string    `json:"model"`
	APIKeyEnc   string    `json:"-"`
	HasAPIKey   bool      `json:"hasApiKey"`
	Temperature float64   `json:"temperature"`
	Enabled     bool      `json:"enabled"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// DevDocItem is a single line item inside a quotation or invoice.
type DevDocItem struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Qty         int64  `json:"qty"`
	Unit        string `json:"unit"`
	UnitPrice   int64  `json:"unitPrice"`
	Subtotal    int64  `json:"subtotal"`
}

// DevDocument stores a quotation or invoice with public share token and history.
type DevDocument struct {
	ID             int64        `json:"id"`
	OwnerUserID    int64        `json:"ownerUserId"`
	Kind           string       `json:"kind"` // "quotation" | "invoice"
	DocNumber      string       `json:"docNumber"`
	PublicToken    string       `json:"publicToken"`
	ClientName     string       `json:"clientName"`
	ClientCompany  string       `json:"clientCompany"`
	ClientContact  string       `json:"clientContact"`
	Title          string       `json:"title"`
	Summary        string       `json:"summary"`
	Currency       string       `json:"currency"`
	Items          []DevDocItem `json:"items"`
	Discount       int64        `json:"discount"`
	DPPercent      int          `json:"dpPercent"`
	TotalAmount    int64        `json:"totalAmount"`
	PaidAmount     int64        `json:"paidAmount"`
	Status         string       `json:"status"` // draft | sent | accepted | dp_paid | paid | cancelled
	IssueDate      string       `json:"issueDate"`
	DueDate        string       `json:"dueDate"`
	ValidUntil     string       `json:"validUntil"`
	Terms          []string     `json:"terms"`
	PaymentInfo    string       `json:"paymentInfo"`
	WAMessage      string       `json:"waMessage"`
	SourceNotes    string       `json:"sourceNotes"`
	LinkedDocID    int64        `json:"linkedDocId"`
	ShareChecklist bool         `json:"shareChecklist"`
	CreatedAt      time.Time    `json:"createdAt"`
	UpdatedAt      time.Time    `json:"updatedAt"`
}

// DevTodo represents a developer task/checklist item optionally linked to a document.
type DevTodo struct {
	ID          int64     `json:"id"`
	OwnerUserID int64     `json:"ownerUserId"`
	DocID       int64     `json:"docId"`
	Title       string    `json:"title"`
	Notes       string    `json:"notes"`
	Status      string    `json:"status"`   // todo | doing | done
	Priority    string    `json:"priority"` // low | medium | high
	DueDate     string    `json:"dueDate"`
	SortOrder   int       `json:"sortOrder"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (m *Manager) GetAIIntegration(ownerUserID int64) (*AIIntegration, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var cfg AIIntegration
	err := m.db.QueryRow(`
		SELECT id, owner_user_id, provider, base_url, model, api_key_enc, temperature, enabled, updated_at
		FROM ai_integrations WHERE owner_user_id = $1`, ownerUserID).Scan(
		&cfg.ID, &cfg.OwnerUserID, &cfg.Provider, &cfg.BaseURL, &cfg.Model,
		&cfg.APIKeyEnc, &cfg.Temperature, &cfg.Enabled, &cfg.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cfg.HasAPIKey = cfg.APIKeyEnc != ""
	return &cfg, nil
}

func (m *Manager) UpsertAIIntegration(cfg *AIIntegration) (*AIIntegration, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	err := m.db.QueryRow(`
		INSERT INTO ai_integrations (owner_user_id, provider, base_url, model, api_key_enc, temperature, enabled, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		ON CONFLICT (owner_user_id) DO UPDATE SET
			provider = EXCLUDED.provider,
			base_url = EXCLUDED.base_url,
			model = EXCLUDED.model,
			api_key_enc = EXCLUDED.api_key_enc,
			temperature = EXCLUDED.temperature,
			enabled = EXCLUDED.enabled,
			updated_at = NOW()
		RETURNING id, updated_at`,
		cfg.OwnerUserID, cfg.Provider, cfg.BaseURL, cfg.Model, cfg.APIKeyEnc, cfg.Temperature, cfg.Enabled,
	).Scan(&cfg.ID, &cfg.UpdatedAt)
	if err != nil {
		return nil, err
	}
	cfg.HasAPIKey = cfg.APIKeyEnc != ""
	return cfg, nil
}

func scanDevDoc(scanner interface{ Scan(dest ...any) error }) (*DevDocument, error) {
	var d DevDocument
	var itemsJSON, termsJSON string
	err := scanner.Scan(
		&d.ID, &d.OwnerUserID, &d.Kind, &d.DocNumber, &d.PublicToken,
		&d.ClientName, &d.ClientCompany, &d.ClientContact, &d.Title, &d.Summary,
		&d.Currency, &itemsJSON, &d.Discount, &d.DPPercent, &d.TotalAmount,
		&d.PaidAmount, &d.Status, &d.IssueDate, &d.DueDate, &d.ValidUntil,
		&termsJSON, &d.PaymentInfo, &d.WAMessage, &d.SourceNotes, &d.LinkedDocID,
		&d.ShareChecklist, &d.CreatedAt, &d.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(itemsJSON), &d.Items)
	_ = json.Unmarshal([]byte(termsJSON), &d.Terms)
	if d.Items == nil {
		d.Items = []DevDocItem{}
	}
	if d.Terms == nil {
		d.Terms = []string{}
	}
	return &d, nil
}

const devDocCols = `id, owner_user_id, kind, doc_number, public_token,
	client_name, client_company, client_contact, title, summary,
	currency, items_json, discount, dp_percent, total_amount,
	paid_amount, status, issue_date, due_date, valid_until,
	terms_json, payment_info, wa_message, source_notes, linked_doc_id,
	share_checklist, created_at, updated_at`

func normalizeDevDoc(d *DevDocument) {
	if d.Kind != "invoice" {
		d.Kind = "quotation"
	}
	if strings.TrimSpace(d.Currency) == "" {
		d.Currency = "IDR"
	}
	if d.DPPercent < 0 {
		d.DPPercent = 0
	}
	if d.DPPercent > 100 {
		d.DPPercent = 100
	}
	if d.Discount < 0 {
		d.Discount = 0
	}
	var subtotal int64
	for i := range d.Items {
		if d.Items[i].Qty <= 0 {
			d.Items[i].Qty = 1
		}
		if d.Items[i].UnitPrice < 0 {
			d.Items[i].UnitPrice = 0
		}
		d.Items[i].Subtotal = d.Items[i].Qty * d.Items[i].UnitPrice
		subtotal += d.Items[i].Subtotal
	}
	total := subtotal - d.Discount
	if total < 0 {
		total = 0
	}
	d.TotalAmount = total
	if d.Status == "" {
		d.Status = "draft"
	}
	if d.Items == nil {
		d.Items = []DevDocItem{}
	}
	if d.Terms == nil {
		d.Terms = []string{}
	}
}

func (m *Manager) ListDevDocuments(ownerUserID int64, includeAll bool, kind string) ([]DevDocument, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var rows *sql.Rows
	var err error
	if includeAll {
		if kind != "" {
			rows, err = m.db.Query(`SELECT `+devDocCols+` FROM dev_documents WHERE kind = $1 ORDER BY id DESC LIMIT 200`, kind)
		} else {
			rows, err = m.db.Query(`SELECT ` + devDocCols + ` FROM dev_documents ORDER BY id DESC LIMIT 200`)
		}
	} else {
		if kind != "" {
			rows, err = m.db.Query(`SELECT `+devDocCols+` FROM dev_documents WHERE owner_user_id = $1 AND kind = $2 ORDER BY id DESC LIMIT 200`, ownerUserID, kind)
		} else {
			rows, err = m.db.Query(`SELECT `+devDocCols+` FROM dev_documents WHERE owner_user_id = $1 ORDER BY id DESC LIMIT 200`, ownerUserID)
		}
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DevDocument{}
	for rows.Next() {
		item, scanErr := scanDevDoc(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		if item != nil {
			out = append(out, *item)
		}
	}
	return out, nil
}

func (m *Manager) GetDevDocument(id int64) (*DevDocument, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	return scanDevDoc(m.db.QueryRow(`SELECT `+devDocCols+` FROM dev_documents WHERE id = $1`, id))
}

func (m *Manager) GetDevDocumentByToken(token string) (*DevDocument, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	return scanDevDoc(m.db.QueryRow(`SELECT `+devDocCols+` FROM dev_documents WHERE public_token = $1`, token))
}

func (m *Manager) NextDevDocSequence(ownerUserID int64, kind string) int64 {
	if !m.IsConnected() {
		return 1
	}
	var count int64
	_ = m.db.QueryRow(`SELECT COUNT(*) FROM dev_documents WHERE owner_user_id = $1 AND kind = $2`, ownerUserID, kind).Scan(&count)
	return count + 1
}

func (m *Manager) CreateDevDocument(d *DevDocument) (*DevDocument, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	normalizeDevDoc(d)
	itemsB, _ := json.Marshal(d.Items)
	termsB, _ := json.Marshal(d.Terms)
	err := m.db.QueryRow(`
		INSERT INTO dev_documents (
			owner_user_id, kind, doc_number, public_token,
			client_name, client_company, client_contact, title, summary,
			currency, items_json, discount, dp_percent, total_amount,
			paid_amount, status, issue_date, due_date, valid_until,
			terms_json, payment_info, wa_message, source_notes, linked_doc_id, share_checklist
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
		RETURNING id, created_at, updated_at`,
		d.OwnerUserID, d.Kind, d.DocNumber, d.PublicToken,
		d.ClientName, d.ClientCompany, d.ClientContact, d.Title, d.Summary,
		d.Currency, string(itemsB), d.Discount, d.DPPercent, d.TotalAmount,
		d.PaidAmount, d.Status, d.IssueDate, d.DueDate, d.ValidUntil,
		string(termsB), d.PaymentInfo, d.WAMessage, d.SourceNotes, d.LinkedDocID, d.ShareChecklist,
	).Scan(&d.ID, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return d, nil
}

func (m *Manager) UpdateDevDocument(d *DevDocument) (*DevDocument, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	normalizeDevDoc(d)
	itemsB, _ := json.Marshal(d.Items)
	termsB, _ := json.Marshal(d.Terms)
	err := m.db.QueryRow(`
		UPDATE dev_documents SET
			kind = $2, doc_number = $3, public_token = $4,
			client_name = $5, client_company = $6, client_contact = $7, title = $8, summary = $9,
			currency = $10, items_json = $11, discount = $12, dp_percent = $13, total_amount = $14,
			paid_amount = $15, status = $16, issue_date = $17, due_date = $18, valid_until = $19,
			terms_json = $20, payment_info = $21, wa_message = $22, source_notes = $23,
			linked_doc_id = $24, share_checklist = $25, updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at`,
		d.ID, d.Kind, d.DocNumber, d.PublicToken,
		d.ClientName, d.ClientCompany, d.ClientContact, d.Title, d.Summary,
		d.Currency, string(itemsB), d.Discount, d.DPPercent, d.TotalAmount,
		d.PaidAmount, d.Status, d.IssueDate, d.DueDate, d.ValidUntil,
		string(termsB), d.PaymentInfo, d.WAMessage, d.SourceNotes, d.LinkedDocID, d.ShareChecklist,
	).Scan(&d.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return d, nil
}

func (m *Manager) DeleteDevDocument(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, _ = m.db.Exec(`DELETE FROM dev_todos WHERE doc_id = $1`, id)
	_, err := m.db.Exec(`DELETE FROM dev_documents WHERE id = $1`, id)
	return err
}

func (m *Manager) ListDevTodos(ownerUserID int64, includeAll bool, docID *int64) ([]DevTodo, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var rows *sql.Rows
	var err error
	if docID != nil {
		if includeAll {
			rows, err = m.db.Query(`SELECT id, owner_user_id, doc_id, title, notes, status, priority, due_date, sort_order, created_at, updated_at FROM dev_todos WHERE doc_id = $1 ORDER BY sort_order ASC, id ASC`, *docID)
		} else {
			rows, err = m.db.Query(`SELECT id, owner_user_id, doc_id, title, notes, status, priority, due_date, sort_order, created_at, updated_at FROM dev_todos WHERE owner_user_id = $1 AND doc_id = $2 ORDER BY sort_order ASC, id ASC`, ownerUserID, *docID)
		}
	} else if includeAll {
		rows, err = m.db.Query(`SELECT id, owner_user_id, doc_id, title, notes, status, priority, due_date, sort_order, created_at, updated_at FROM dev_todos ORDER BY status = 'done' ASC, doc_id DESC, sort_order ASC, id DESC LIMIT 300`)
	} else {
		rows, err = m.db.Query(`SELECT id, owner_user_id, doc_id, title, notes, status, priority, due_date, sort_order, created_at, updated_at FROM dev_todos WHERE owner_user_id = $1 ORDER BY status = 'done' ASC, doc_id DESC, sort_order ASC, id DESC LIMIT 300`, ownerUserID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DevTodo{}
	for rows.Next() {
		var t DevTodo
		if err := rows.Scan(&t.ID, &t.OwnerUserID, &t.DocID, &t.Title, &t.Notes, &t.Status, &t.Priority, &t.DueDate, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}

func (m *Manager) GetDevTodo(id int64) (*DevTodo, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var t DevTodo
	err := m.db.QueryRow(`SELECT id, owner_user_id, doc_id, title, notes, status, priority, due_date, sort_order, created_at, updated_at FROM dev_todos WHERE id = $1`, id).
		Scan(&t.ID, &t.OwnerUserID, &t.DocID, &t.Title, &t.Notes, &t.Status, &t.Priority, &t.DueDate, &t.SortOrder, &t.CreatedAt, &t.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (m *Manager) CreateDevTodo(t *DevTodo) (*DevTodo, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	if t.Status == "" {
		t.Status = "todo"
	}
	if t.Priority == "" {
		t.Priority = "medium"
	}
	err := m.db.QueryRow(`
		INSERT INTO dev_todos (owner_user_id, doc_id, title, notes, status, priority, due_date, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, updated_at`,
		t.OwnerUserID, t.DocID, t.Title, t.Notes, t.Status, t.Priority, t.DueDate, t.SortOrder,
	).Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return t, nil
}

func (m *Manager) UpdateDevTodo(t *DevTodo) (*DevTodo, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	err := m.db.QueryRow(`
		UPDATE dev_todos SET doc_id = $2, title = $3, notes = $4, status = $5, priority = $6, due_date = $7, sort_order = $8, updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at`,
		t.ID, t.DocID, t.Title, t.Notes, t.Status, t.Priority, t.DueDate, t.SortOrder,
	).Scan(&t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return t, nil
}

func (m *Manager) DeleteDevTodo(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM dev_todos WHERE id = $1`, id)
	return err
}
