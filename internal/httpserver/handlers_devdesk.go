package httpserver

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/ai"
	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func generatePublicDocToken() string {
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func formatDevDocNumber(kind string, seq int64) string {
	now := time.Now()
	prefix := "PNW"
	if kind == "invoice" {
		prefix = "INV"
	}
	return fmt.Sprintf("%s/RN/%04d/%02d/%03d", prefix, now.Year(), int(now.Month()), seq)
}

func canAccessDevDesk(u *database.User) bool {
	if u == nil {
		return false
	}
	return u.Role == auth.SuperadminRole || u.Role == auth.AdminRole
}

func (s *Server) canManageDevDoc(u *database.User, ownerID int64) bool {
	if u == nil {
		return false
	}
	return u.Role == auth.SuperadminRole || u.ID == ownerID
}

func (s *Server) handleDevDeskOverview(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	isSuper := u.Role == auth.SuperadminRole
	docs, err := s.database.ListDevDocuments(u.ID, isSuper, strings.TrimSpace(r.URL.Query().Get("kind")))
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	todos, err := s.database.ListDevTodos(u.ID, isSuper, nil)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	aiCfg, _ := s.loadAIConfigForUser(u.ID, true)
	aiReady := aiCfg != nil && aiCfg.Enabled && (aiCfg.APIKey != "" || aiCfg.Provider == "ollama" || aiCfg.Provider == "custom")

	sellerName := strings.TrimSpace(u.DisplayName)
	if sellerName == "" {
		sellerName = u.Username
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"docs":       docs,
		"todos":      todos,
		"aiReady":    aiReady,
		"aiProvider": func() string { if aiCfg != nil { return aiCfg.Provider }; return "" }(),
		"aiModel":    func() string { if aiCfg != nil { return aiCfg.Model }; return "" }(),
		"seller": jsonResponse{
			"name":    sellerName,
			"brand":   "Reneo",
			"website": "https://reneo.my.id",
		},
	})
}

type devDocPayload struct {
	Kind           string                `json:"kind"`
	DocNumber      string                `json:"docNumber"`
	ClientName     string                `json:"clientName"`
	ClientCompany  string                `json:"clientCompany"`
	ClientContact  string                `json:"clientContact"`
	Title          string                `json:"title"`
	Summary        string                `json:"summary"`
	Currency       string                `json:"currency"`
	Items          []database.DevDocItem `json:"items"`
	Discount       int64                 `json:"discount"`
	DPPercent      int                   `json:"dpPercent"`
	PaidAmount     int64                 `json:"paidAmount"`
	Status         string                `json:"status"`
	IssueDate      string                `json:"issueDate"`
	DueDate        string                `json:"dueDate"`
	ValidUntil     string                `json:"validUntil"`
	Terms          []string              `json:"terms"`
	PaymentInfo    string                `json:"paymentInfo"`
	WAMessage      string                `json:"waMessage"`
	SourceNotes    string                `json:"sourceNotes"`
	LinkedDocID    int64                 `json:"linkedDocId"`
	ShareChecklist bool                  `json:"shareChecklist"`
	InitialTodos   []struct {
		Title    string `json:"title"`
		Notes    string `json:"notes"`
		Priority string `json:"priority"`
	} `json:"initialTodos"`
}

func (s *Server) handleCreateDevDoc(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	var req devDocPayload
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	kind := "quotation"
	if req.Kind == "invoice" {
		kind = "invoice"
	}
	docNumber := strings.TrimSpace(req.DocNumber)
	if docNumber == "" {
		docNumber = formatDevDocNumber(kind, s.database.NextDevDocSequence(u.ID, kind))
	}
	issueDate := strings.TrimSpace(req.IssueDate)
	if issueDate == "" {
		issueDate = time.Now().Format("2006-01-02")
	}
	dueDate := strings.TrimSpace(req.DueDate)
	if dueDate == "" && kind == "invoice" {
		dueDate = time.Now().AddDate(0, 0, 7).Format("2006-01-02")
	}
	validUntil := strings.TrimSpace(req.ValidUntil)
	if validUntil == "" && kind == "quotation" {
		validUntil = time.Now().AddDate(0, 0, 14).Format("2006-01-02")
	}

	doc := &database.DevDocument{
		OwnerUserID:    u.ID,
		Kind:           kind,
		DocNumber:      docNumber,
		PublicToken:    generatePublicDocToken(),
		ClientName:     strings.TrimSpace(req.ClientName),
		ClientCompany:  strings.TrimSpace(req.ClientCompany),
		ClientContact:  strings.TrimSpace(req.ClientContact),
		Title:          strings.TrimSpace(req.Title),
		Summary:        strings.TrimSpace(req.Summary),
		Currency:       strings.TrimSpace(req.Currency),
		Items:          req.Items,
		Discount:       req.Discount,
		DPPercent:      req.DPPercent,
		PaidAmount:     req.PaidAmount,
		Status:         strings.TrimSpace(req.Status),
		IssueDate:      issueDate,
		DueDate:        dueDate,
		ValidUntil:     validUntil,
		Terms:          req.Terms,
		PaymentInfo:    strings.TrimSpace(req.PaymentInfo),
		WAMessage:      strings.TrimSpace(req.WAMessage),
		SourceNotes:    strings.TrimSpace(req.SourceNotes),
		LinkedDocID:    req.LinkedDocID,
		ShareChecklist: req.ShareChecklist,
	}
	created, err := s.database.CreateDevDocument(doc)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	createdTodos := []database.DevTodo{}
	for idx, td := range req.InitialTodos {
		title := strings.TrimSpace(td.Title)
		if title == "" {
			continue
		}
		item, tErr := s.database.CreateDevTodo(&database.DevTodo{
			OwnerUserID: u.ID,
			DocID:       created.ID,
			Title:       title,
			Notes:       strings.TrimSpace(td.Notes),
			Status:      "todo",
			Priority:    strings.TrimSpace(td.Priority),
			SortOrder:   idx,
		})
		if tErr == nil && item != nil {
			createdTodos = append(createdTodos, *item)
		}
	}
	s.writeJSON(w, http.StatusCreated, jsonResponse{"doc": created, "todos": createdTodos})
}

func (s *Server) handleUpdateDevDoc(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid document id"))
		return
	}
	existing, err := s.database.GetDevDocument(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("document not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	var req devDocPayload
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	if req.Kind == "quotation" || req.Kind == "invoice" {
		existing.Kind = req.Kind
	}
	if strings.TrimSpace(req.DocNumber) != "" {
		existing.DocNumber = strings.TrimSpace(req.DocNumber)
	}
	existing.ClientName = strings.TrimSpace(req.ClientName)
	existing.ClientCompany = strings.TrimSpace(req.ClientCompany)
	existing.ClientContact = strings.TrimSpace(req.ClientContact)
	existing.Title = strings.TrimSpace(req.Title)
	existing.Summary = strings.TrimSpace(req.Summary)
	if strings.TrimSpace(req.Currency) != "" {
		existing.Currency = strings.TrimSpace(req.Currency)
	}
	if req.Items != nil {
		existing.Items = req.Items
	}
	existing.Discount = req.Discount
	existing.DPPercent = req.DPPercent
	existing.PaidAmount = req.PaidAmount
	if strings.TrimSpace(req.Status) != "" {
		existing.Status = strings.TrimSpace(req.Status)
	}
	existing.IssueDate = strings.TrimSpace(req.IssueDate)
	existing.DueDate = strings.TrimSpace(req.DueDate)
	existing.ValidUntil = strings.TrimSpace(req.ValidUntil)
	if req.Terms != nil {
		existing.Terms = req.Terms
	}
	existing.PaymentInfo = strings.TrimSpace(req.PaymentInfo)
	existing.WAMessage = strings.TrimSpace(req.WAMessage)
	existing.SourceNotes = strings.TrimSpace(req.SourceNotes)
	existing.ShareChecklist = req.ShareChecklist

	updated, err := s.database.UpdateDevDocument(existing)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteDevDoc(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid document id"))
		return
	}
	existing, err := s.database.GetDevDocument(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("document not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	if err := s.database.DeleteDevDocument(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleRotateDevDocToken(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid document id"))
		return
	}
	existing, err := s.database.GetDevDocument(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("document not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	existing.PublicToken = generatePublicDocToken()
	updated, err := s.database.UpdateDevDocument(existing)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleConvertDevDocToInvoice(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid document id"))
		return
	}
	src, err := s.database.GetDevDocument(id)
	if err != nil || src == nil {
		s.writeError(w, http.StatusNotFound, errors.New("document not found"))
		return
	}
	if !s.canManageDevDoc(u, src.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	inv := &database.DevDocument{
		OwnerUserID:    u.ID,
		Kind:           "invoice",
		DocNumber:      formatDevDocNumber("invoice", s.database.NextDevDocSequence(u.ID, "invoice")),
		PublicToken:    generatePublicDocToken(),
		ClientName:     src.ClientName,
		ClientCompany:  src.ClientCompany,
		ClientContact:  src.ClientContact,
		Title:          src.Title,
		Summary:        src.Summary,
		Currency:       src.Currency,
		Items:          src.Items,
		Discount:       src.Discount,
		DPPercent:      src.DPPercent,
		Status:         "sent",
		IssueDate:      time.Now().Format("2006-01-02"),
		DueDate:        time.Now().AddDate(0, 0, 7).Format("2006-01-02"),
		Terms:          src.Terms,
		PaymentInfo:    src.PaymentInfo,
		WAMessage:      src.WAMessage,
		SourceNotes:    src.SourceNotes,
		LinkedDocID:    src.ID,
		ShareChecklist: src.ShareChecklist,
	}
	created, err := s.database.CreateDevDocument(inv)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	// Copy linked checklist items into the new invoice so developer tracking continues seamlessly.
	srcTodos, _ := s.database.ListDevTodos(u.ID, u.Role == auth.SuperadminRole, &src.ID)
	for _, td := range srcTodos {
		_, _ = s.database.CreateDevTodo(&database.DevTodo{
			OwnerUserID: u.ID,
			DocID:       created.ID,
			Title:       td.Title,
			Notes:       td.Notes,
			Status:      td.Status,
			Priority:    td.Priority,
			DueDate:     td.DueDate,
			SortOrder:   td.SortOrder,
		})
	}
	src.Status = "accepted"
	_, _ = s.database.UpdateDevDocument(src)
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleDevDeskAIGenerate(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	aiCfg, err := s.loadAIConfigForUser(u.ID, true)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if aiCfg == nil || !aiCfg.Enabled {
		s.writeError(w, http.StatusPreconditionRequired, errors.New("AI integration is not configured or disabled in Settings > AI Integration"))
		return
	}
	var req struct {
		Kind          string `json:"kind"`
		ClientName    string `json:"clientName"`
		ClientCompany string `json:"clientCompany"`
		BudgetHint    string `json:"budgetHint"`
		Notes         string `json:"notes"`
		Language      string `json:"language"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	if strings.TrimSpace(req.Notes) == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("client notes or brief are required"))
		return
	}
	kind := "quotation"
	if req.Kind == "invoice" {
		kind = "invoice"
	}
	lang := "Bahasa Indonesia"
	if req.Language == "en" {
		lang = "English"
	}

	sysPrompt := `You are a practical software studio billing and project planner for Reneo.
Return ONLY one valid JSON object matching this exact schema, with no markdown prose outside the JSON:
{
  "title": "concise project document title",
  "summary": "2-3 concrete sentences summarizing deliverables in business language",
  "dpPercent": 50,
  "items": [
    {"title": "Item name", "description": "clear business scope", "qty": 1, "unit": "Paket", "unitPrice": 2900000}
  ],
  "terms": ["clear payment, revision, warranty, and timeline term 1", "term 2", "term 3"],
  "waMessage": "short friendly WhatsApp cover message ready to send to the client",
  "todos": [
    {"title": "concrete developer checklist step", "notes": "brief technical detail", "priority": "high"}
  ]
}
Rules:
- Language: ` + lang + `.
- Never use em dashes (—) or marketing buzzwords (seamless, revolutionary, cutting-edge, all-in-one).
- Prices must be integer numbers in IDR (Rupiah) matching any budget breakdown given by the user.
- Provide 4 to 8 actionable developer checklist todos.`

	userPrompt := fmt.Sprintf("Document type: %s\nClient: %s (%s)\nBudget/deal hint: %s\nNotes / chat:\n%s",
		kind, req.ClientName, req.ClientCompany, req.BudgetHint, req.Notes)

	raw, err := ai.Complete(r.Context(), *aiCfg, sysPrompt, userPrompt)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	cleanJSON := ai.ExtractJSONObject(raw)
	var generated struct {
		Title     string                `json:"title"`
		Summary   string                `json:"summary"`
		DPPercent int                   `json:"dpPercent"`
		Items     []database.DevDocItem `json:"items"`
		Terms     []string              `json:"terms"`
		WAMessage string                `json:"waMessage"`
		Todos     []struct {
			Title    string `json:"title"`
			Notes    string `json:"notes"`
			Priority string `json:"priority"`
		} `json:"todos"`
	}
	if err := json.Unmarshal([]byte(cleanJSON), &generated); err != nil {
		s.writeError(w, http.StatusBadGateway, fmt.Errorf("AI returned unreadable JSON: %w", err))
		return
	}
	// Strip any accidental em dashes from generated text.
	stripEm := func(s string) string { return strings.ReplaceAll(s, "—", ",") }
	generated.Title = stripEm(generated.Title)
	generated.Summary = stripEm(generated.Summary)
	generated.WAMessage = stripEm(generated.WAMessage)
	for i := range generated.Items {
		generated.Items[i].Title = stripEm(generated.Items[i].Title)
		generated.Items[i].Description = stripEm(generated.Items[i].Description)
		if generated.Items[i].Qty <= 0 {
			generated.Items[i].Qty = 1
		}
		generated.Items[i].Subtotal = generated.Items[i].Qty * generated.Items[i].UnitPrice
	}
	for i := range generated.Terms {
		generated.Terms[i] = stripEm(generated.Terms[i])
	}
	s.writeJSON(w, http.StatusOK, generated)
}

func (s *Server) handleCreateDevTodo(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	var req struct {
		DocID    int64  `json:"docId"`
		Title    string `json:"title"`
		Notes    string `json:"notes"`
		Priority string `json:"priority"`
		DueDate  string `json:"dueDate"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	if strings.TrimSpace(req.Title) == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("todo title is required"))
		return
	}
	created, err := s.database.CreateDevTodo(&database.DevTodo{
		OwnerUserID: u.ID,
		DocID:       req.DocID,
		Title:       strings.TrimSpace(req.Title),
		Notes:       strings.TrimSpace(req.Notes),
		Status:      "todo",
		Priority:    strings.TrimSpace(req.Priority),
		DueDate:     strings.TrimSpace(req.DueDate),
	})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateDevTodo(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid todo id"))
		return
	}
	existing, err := s.database.GetDevTodo(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("todo not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	var req struct {
		DocID    *int64  `json:"docId"`
		Title    *string `json:"title"`
		Notes    *string `json:"notes"`
		Status   *string `json:"status"`
		Priority *string `json:"priority"`
		DueDate  *string `json:"dueDate"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	if req.DocID != nil {
		existing.DocID = *req.DocID
	}
	if req.Title != nil && strings.TrimSpace(*req.Title) != "" {
		existing.Title = strings.TrimSpace(*req.Title)
	}
	if req.Notes != nil {
		existing.Notes = strings.TrimSpace(*req.Notes)
	}
	if req.Status != nil && (*req.Status == "todo" || *req.Status == "doing" || *req.Status == "done") {
		existing.Status = *req.Status
	}
	if req.Priority != nil && (*req.Priority == "low" || *req.Priority == "medium" || *req.Priority == "high") {
		existing.Priority = *req.Priority
	}
	if req.DueDate != nil {
		existing.DueDate = strings.TrimSpace(*req.DueDate)
	}
	updated, err := s.database.UpdateDevTodo(existing)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteDevTodo(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid todo id"))
		return
	}
	existing, err := s.database.GetDevTodo(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("todo not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	if err := s.database.DeleteDevTodo(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// handlePublicDevDoc serves a sanitized quotation or invoice by its unguessable public token without panel login.
func (s *Server) handlePublicDevDoc(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.PathValue("token"))
	if len(token) < 16 || len(token) > 64 {
		s.writeError(w, http.StatusNotFound, errors.New("document not found"))
		return
	}
	doc, err := s.database.GetDevDocumentByToken(token)
	if err != nil || doc == nil {
		s.writeError(w, http.StatusNotFound, errors.New("document not found"))
		return
	}
	type publicTodo struct {
		ID       int64  `json:"id"`
		Title    string `json:"title"`
		Status   string `json:"status"`
		Priority string `json:"priority"`
		DueDate  string `json:"dueDate,omitempty"`
	}
	checklist := []publicTodo{}
	if doc.ShareChecklist {
		todos, tErr := s.database.ListDevTodos(doc.OwnerUserID, true, &doc.ID)
		if tErr == nil {
			for _, td := range todos {
				checklist = append(checklist, publicTodo{
					ID:       td.ID,
					Title:    td.Title,
					Status:   td.Status,
					Priority: td.Priority,
					DueDate:  td.DueDate,
				})
			}
		}
	}
	sellerName := "Renaldi, Reneo"
	if owner, oErr := s.database.GetUserByID(doc.OwnerUserID); oErr == nil && owner != nil {
		if strings.TrimSpace(owner.DisplayName) != "" {
			sellerName = owner.DisplayName + ", Reneo"
		}
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"doc": jsonResponse{
			"kind":           doc.Kind,
			"docNumber":      doc.DocNumber,
			"clientName":     doc.ClientName,
			"clientCompany":  doc.ClientCompany,
			"clientContact":  doc.ClientContact,
			"title":          doc.Title,
			"summary":        doc.Summary,
			"currency":       doc.Currency,
			"items":          doc.Items,
			"discount":       doc.Discount,
			"dpPercent":      doc.DPPercent,
			"totalAmount":    doc.TotalAmount,
			"paidAmount":     doc.PaidAmount,
			"status":         doc.Status,
			"issueDate":      doc.IssueDate,
			"dueDate":        doc.DueDate,
			"validUntil":     doc.ValidUntil,
			"terms":          doc.Terms,
			"paymentInfo":    doc.PaymentInfo,
			"shareChecklist": doc.ShareChecklist,
			"updatedAt":      doc.UpdatedAt,
		},
		"checklist": checklist,
		"seller": jsonResponse{
			"name":    sellerName,
			"brand":   "RENEO",
			"website": "https://reneo.my.id",
		},
	})
}
