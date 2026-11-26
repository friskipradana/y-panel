package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/ai"
	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func (s *Server) handleStudioListPages(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	isSuper := u.Role == auth.SuperadminRole
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	pages, err := s.database.ListStudioPages(u.ID, isSuper, kind)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	aiCfg, _ := s.loadAIConfigForUser(u.ID, true)
	aiReady := aiCfg != nil && aiCfg.Enabled && (aiCfg.APIKey != "" || aiCfg.Provider == "ollama" || aiCfg.Provider == "custom")
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"pages":      pages,
		"aiReady":    aiReady,
		"aiProvider": func() string { if aiCfg != nil { return aiCfg.Provider }; return "" }(),
		"aiModel":    func() string { if aiCfg != nil { return aiCfg.Model }; return "" }(),
	})
}

type studioPagePayload struct {
	Kind           string                   `json:"kind"`
	Slug           string                   `json:"slug"`
	Title          string                   `json:"title"`
	Subtitle       string                   `json:"subtitle"`
	Status         string                   `json:"status"`
	ShowInDocs     bool                     `json:"showInDocs"`
	BrandName      string                   `json:"brandName"`
	ThemeTone      string                   `json:"themeTone"`
	SEODescription string                   `json:"seoDescription"`
	CTALabel       string                   `json:"ctaLabel"`
	CTAURL         string                   `json:"ctaUrl"`
	Sections       []database.StudioSection `json:"sections"`
	MarkdownBody   string                   `json:"markdownBody"`
	SourcePrompt   string                   `json:"sourcePrompt"`
}

func (s *Server) ensureUniqueStudioSlug(base string, excludeID int64) string {
	slug := sanitizeStudioSlug(base)
	if slug == "" {
		slug = "halaman"
	}
	candidate := slug
	for n := 2; n <= 50; n++ {
		existing, err := s.database.GetStudioPageBySlug(candidate)
		if err != nil || existing == nil || existing.ID == excludeID {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", slug, n)
	}
	return fmt.Sprintf("%s-%d", slug, excludeID+1)
}

// syncStudioPageToDocsWindow mirrors published documentation pages into the `docs` table so they
// automatically appear in Reneo's Documentation window and /articles/:slug.
func (s *Server) syncStudioPageToDocsWindow(ownerID int64, page *database.StudioPage) {
	if page == nil || s.database == nil || !s.database.IsConnected() {
		return
	}
	shouldPublish := page.Kind == "docs" && page.ShowInDocs && page.Status == "published"
	excerpt := page.Subtitle
	if excerpt == "" {
		excerpt = page.SEODescription
	}
	content := page.MarkdownBody
	if strings.TrimSpace(content) == "" {
		content = "# " + page.Title + "\n\n" + excerpt
	}
	if shouldPublish {
		if page.LinkedDocID > 0 {
			if updated, err := s.database.UpdateDoc(page.LinkedDocID, page.Title, page.Slug, excerpt, content, "published", true); err == nil && updated != nil {
				return
			}
		}
		if existing, err := s.database.GetDocBySlug(page.Slug, true); err == nil && existing != nil {
			if updated, uErr := s.database.UpdateDoc(existing.ID, page.Title, page.Slug, excerpt, content, "published", true); uErr == nil && updated != nil {
				page.LinkedDocID = updated.ID
				_, _ = s.database.UpdateStudioPage(page)
				return
			}
		}
		author := ownerID
		if created, err := s.database.CreateDoc(&author, page.Title, page.Slug, excerpt, content, "published", true); err == nil && created != nil {
			page.LinkedDocID = created.ID
			_, _ = s.database.UpdateStudioPage(page)
		}
		return
	}
	if page.LinkedDocID > 0 {
		_, _ = s.database.UpdateDoc(page.LinkedDocID, page.Title, page.Slug, excerpt, content, "draft", false)
	}
}

func (s *Server) handleStudioCreatePage(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	var req studioPagePayload
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	if strings.TrimSpace(req.Title) == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("page title is required"))
		return
	}
	slugBase := req.Slug
	if strings.TrimSpace(slugBase) == "" {
		slugBase = req.Title
	}
	page := &database.StudioPage{
		OwnerUserID:    u.ID,
		Kind:           req.Kind,
		Slug:           s.ensureUniqueStudioSlug(slugBase, 0),
		Title:          req.Title,
		Subtitle:       req.Subtitle,
		Status:         req.Status,
		ShowInDocs:     req.ShowInDocs,
		BrandName:      req.BrandName,
		ThemeTone:      req.ThemeTone,
		SEODescription: req.SEODescription,
		CTALabel:       req.CTALabel,
		CTAURL:         req.CTAURL,
		Sections:       req.Sections,
		MarkdownBody:   req.MarkdownBody,
		SourcePrompt:   req.SourcePrompt,
	}
	created, err := s.database.CreateStudioPage(page)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.syncStudioPageToDocsWindow(u.ID, created)
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleStudioUpdatePage(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid page id"))
		return
	}
	existing, err := s.database.GetStudioPage(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("page not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	var req studioPagePayload
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	if req.Kind == "landing" || req.Kind == "docs" {
		existing.Kind = req.Kind
	}
	if strings.TrimSpace(req.Slug) != "" {
		existing.Slug = s.ensureUniqueStudioSlug(req.Slug, existing.ID)
	}
	if strings.TrimSpace(req.Title) != "" {
		existing.Title = req.Title
	}
	existing.Subtitle = req.Subtitle
	if req.Status == "draft" || req.Status == "published" {
		existing.Status = req.Status
	}
	existing.ShowInDocs = req.ShowInDocs
	existing.BrandName = req.BrandName
	existing.ThemeTone = req.ThemeTone
	existing.SEODescription = req.SEODescription
	existing.CTALabel = req.CTALabel
	existing.CTAURL = req.CTAURL
	if req.Sections != nil {
		existing.Sections = req.Sections
	}
	existing.MarkdownBody = req.MarkdownBody
	existing.SourcePrompt = req.SourcePrompt

	updated, err := s.database.UpdateStudioPage(existing)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.syncStudioPageToDocsWindow(u.ID, updated)
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleStudioTogglePublish(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid page id"))
		return
	}
	existing, err := s.database.GetStudioPage(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("page not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	var req struct {
		Published bool `json:"published"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14)).Decode(&req); err != nil {
		req.Published = existing.Status != "published"
	}
	if req.Published {
		existing.Status = "published"
	} else {
		existing.Status = "draft"
	}
	updated, err := s.database.UpdateStudioPage(existing)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.syncStudioPageToDocsWindow(u.ID, updated)
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleStudioDeletePage(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid page id"))
		return
	}
	existing, err := s.database.GetStudioPage(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("page not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	if existing.LinkedDocID > 0 {
		_ = s.database.DeleteDoc(existing.LinkedDocID)
	}
	if err := s.database.DeleteStudioPage(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleStudioAIGenerate(w http.ResponseWriter, r *http.Request) {
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
		Kind      string `json:"kind"`
		BrandName string `json:"brandName"`
		Audience  string `json:"audience"`
		CTAURL    string `json:"ctaUrl"`
		ThemeTone string `json:"themeTone"`
		Prompt    string `json:"prompt"`
		Language  string `json:"language"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("page brief or prompt is required"))
		return
	}
	kind := "landing"
	if req.Kind == "docs" {
		kind = "docs"
	}
	lang := "Bahasa Indonesia"
	if req.Language == "en" {
		lang = "English"
	}

	var sysPrompt string
	if kind == "docs" {
		sysPrompt = `You are a clear, practical technical writer.
Return ONLY one valid JSON object matching this exact schema (no markdown prose outside JSON):
{
  "slug": "url-friendly-slug",
  "title": "Clear Documentation Guide Title",
  "subtitle": "1-2 sentence summary of what this documentation covers",
  "brandName": "Product or organization name",
  "themeTone": "blue",
  "seoDescription": "Concise meta description under 155 characters",
  "markdownBody": "## Pendahuluan\n\nClear markdown documentation with ## headings, ### subheadings, bullet lists, numbered steps, and code blocks where helpful."
}
Rules:
- Language: ` + lang + `.
- Never use em dashes (—) or empty marketing hype words.
- Write thorough, structured, actionable documentation with at least 4 clear ## sections.`
	} else {
		sysPrompt = `You are a direct, high-craft product copywriter and landing page architect.
Return ONLY one valid JSON object matching this exact schema (no markdown prose outside JSON):
{
  "slug": "url-friendly-slug",
  "title": "Concrete, benefit-focused hero headline (6-12 words)",
  "subtitle": "2 concrete sentences explaining what the product/service does and who it helps",
  "brandName": "Brand or business name",
  "themeTone": "blue",
  "seoDescription": "Concise meta description under 155 characters",
  "ctaLabel": "Concrete action verb CTA (e.g. Hubungi via WhatsApp, Mulai Sekarang)",
  "ctaUrl": "https://wa.me/62... or #pricing",
  "sections": [
    {
      "type": "features",
      "heading": "Section heading",
      "subheading": "Short context",
      "items": [
        {"title": "Feature 1", "description": "Concrete benefit"}
      ]
    },
    {
      "type": "steps",
      "heading": "Cara Kerja",
      "subheading": "3 langkah jelas",
      "items": [
        {"title": "Langkah 1", "description": "Penjelasan ringkas"}
      ]
    },
    {
      "type": "pricing",
      "heading": "Paket & Harga",
      "subheading": "Transparan tanpa biaya tersembunyi",
      "items": [
        {"title": "Starter", "price": "Rp 1.500.000", "description": "Cocok untuk usaha baru", "bullets": ["Poin 1", "Poin 2"], "highlight": false},
        {"title": "Bisnis", "price": "Rp 3.500.000", "badge": "Populer", "description": "Paket lengkap siap pakai", "bullets": ["Poin 1", "Poin 2"], "highlight": true}
      ]
    },
    {
      "type": "faq",
      "heading": "Pertanyaan Umum",
      "items": [
        {"title": "Berapa lama proses pengerjaan?", "description": "Jawaban konkret dan jelas."}
      ]
    }
  ]
}
Rules:
- Language: ` + lang + `.
- Never use em dashes (—) or empty buzzwords (seamless, cutting-edge, revolutionary, all-in-one, dengan mulus).
- Avoid internal technical jargon in customer-facing copy unless the brief specifically asks for a developer tool.
- Allowed section types: features, steps, pricing, faq, cta.`
	}

	userPrompt := fmt.Sprintf("Page kind: %s\nBrand: %s\nTarget audience: %s\nCTA URL: %s\nPreferred tone: %s\nBrief:\n%s",
		kind, req.BrandName, req.Audience, req.CTAURL, req.ThemeTone, req.Prompt)

	raw, err := ai.Complete(r.Context(), *aiCfg, sysPrompt, userPrompt)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	generated, parseErr := parseGeneratedStudioPage(raw, kind)
	if parseErr != nil {
		s.writeError(w, http.StatusUnprocessableEntity, parseErr)
		return
	}
	if strings.TrimSpace(req.BrandName) != "" && generated.BrandName == "" {
		generated.BrandName = strings.TrimSpace(req.BrandName)
	}
	if strings.TrimSpace(req.CTAURL) != "" {
		generated.CTAURL = strings.TrimSpace(req.CTAURL)
	}
	if req.ThemeTone == "blue" || req.ThemeTone == "emerald" || req.ThemeTone == "slate" || req.ThemeTone == "amber" {
		generated.ThemeTone = req.ThemeTone
	}
	s.writeJSON(w, http.StatusOK, generated)
}

func (s *Server) handlePublicStudioPage(w http.ResponseWriter, r *http.Request) {
	slug := sanitizeStudioSlug(r.PathValue("slug"))
	if slug == "" {
		s.writeError(w, http.StatusNotFound, errors.New("page not found"))
		return
	}
	page, err := s.database.GetStudioPageBySlug(slug)
	if err != nil || page == nil {
		s.writeError(w, http.StatusNotFound, errors.New("page not found"))
		return
	}
	if page.Status != "published" {
		// Allow signed-in owner/admin to preview draft pages via ?preview=1
		u := s.currentUserRecord(r)
		if r.URL.Query().Get("preview") != "1" || !s.canManageDevDoc(u, page.OwnerUserID) {
			s.writeError(w, http.StatusNotFound, errors.New("page not found"))
			return
		}
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"page": jsonResponse{
			"kind":           page.Kind,
			"slug":           page.Slug,
			"title":          page.Title,
			"subtitle":       page.Subtitle,
			"status":         page.Status,
			"brandName":      page.BrandName,
			"themeTone":      page.ThemeTone,
			"seoDescription": page.SEODescription,
			"ctaLabel":       page.CTALabel,
			"ctaUrl":         page.CTAURL,
			"sections":       page.Sections,
			"markdownBody":   page.MarkdownBody,
			"updatedAt":      page.UpdatedAt,
		},
	})
}
