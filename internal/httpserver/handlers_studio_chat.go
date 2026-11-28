package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/ai"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func studioChatSystemPrompt(kind string, lang string, isCreate bool) string {
	action := "Iteratively refine the existing page JSON based on the user's latest instruction. Preserve existing sections and details that the user did not ask to change."
	if isCreate {
		action = "Create a complete, polished first version of the page from the user's prompt."
	}
	if kind == "docs" {
		return `You are an expert technical writer inside Reneo Page Studio (Lovable-style interactive builder).
` + action + `
Return ONLY one valid JSON object matching this exact schema (no markdown prose outside JSON):
{
  "reply": "1-2 concise sentences summarizing what you built or changed",
  "page": {
    "slug": "url-friendly-slug",
    "title": "Clear Documentation Guide Title",
    "subtitle": "1-2 sentence summary",
    "brandName": "Product or organization name",
    "themeTone": "blue",
    "seoDescription": "Concise meta description under 155 characters",
    "markdownBody": "## Pendahuluan\n\nStructured markdown guide with ## headings, ### subheadings, numbered steps, lists, and code blocks."
  }
}
Rules:
- Language: ` + lang + `.
- Never use em dashes or empty marketing hype words.
- Keep documentation practical, structured, and immediately actionable.`
	}

	return `You are a high-craft web designer and conversion copywriter inside Reneo Page Studio (Lovable-style interactive builder).
` + action + `
Return ONLY one valid JSON object matching this exact schema (no markdown prose outside JSON):
{
  "reply": "1-2 concise sentences summarizing what you built or changed",
  "page": {
    "slug": "url-friendly-slug",
    "title": "Concrete, benefit-focused hero headline (6-12 words)",
    "subtitle": "2 concrete sentences explaining what the product/service does and who it helps",
    "brandName": "Brand or business name",
    "themeTone": "blue",
    "seoDescription": "Concise meta description under 155 characters",
    "ctaLabel": "Concrete action verb CTA (e.g. Hubungi via WhatsApp, Pesan Sekarang)",
    "ctaUrl": "https://wa.me/62... or #pricing",
    "sections": [
      {
        "type": "stats",
        "heading": "Bukti Singkat",
        "items": [
          {"title": "500+", "description": "Klien aktif di seluruh Indonesia"}
        ]
      },
      {
        "type": "features",
        "heading": "Keunggulan Utama",
        "subheading": "Alasan pelanggan memilih kami",
        "items": [
          {"title": "Keunggulan 1", "description": "Manfaat nyata dan spesifik"}
        ]
      },
      {
        "type": "steps",
        "heading": "Cara Kerja",
        "items": [
          {"title": "Langkah 1", "description": "Penjelasan ringkas"}
        ]
      },
      {
        "type": "pricing",
        "heading": "Paket & Harga",
        "items": [
          {"title": "Starter", "price": "Rp 1.500.000", "description": "Cocok untuk usaha baru", "bullets": ["Poin 1", "Poin 2"], "highlight": false},
          {"title": "Bisnis", "price": "Rp 3.500.000", "badge": "Populer", "description": "Paket lengkap siap pakai", "bullets": ["Poin 1", "Poin 2"], "highlight": true}
        ]
      },
      {
        "type": "testimonials",
        "heading": "Kata Pelanggan",
        "items": [
          {"title": "Rina Putri", "badge": "Pemilik Kedai Kopi", "description": "Kutipan singkat pengalaman nyata."}
        ]
      },
      {
        "type": "faq",
        "heading": "Pertanyaan Umum",
        "items": [
          {"title": "Berapa lama pengerjaan?", "description": "Jawaban konkret dan jelas."}
        ]
      }
    ]
  }
}
Rules:
- Language: ` + lang + `.
- Allowed themeTone: blue, emerald, slate, amber.
- Allowed section types: stats, features, steps, pricing, testimonials, faq, cta.
- Never use em dashes or empty buzzwords (seamless, cutting-edge, revolutionary, all-in-one, dengan mulus).
- Keep customer-facing copy concrete and free of internal server jargon unless requested.`
}

func snapshotStudioVersion(page *database.StudioPage, summary string) database.StudioPageVersion {
	secCopy := make([]database.StudioSection, len(page.Sections))
	copy(secCopy, page.Sections)
	if len(summary) > 90 {
		summary = summary[:87] + "..."
	}
	return database.StudioPageVersion{
		ID:             fmt.Sprintf("v-%d", time.Now().UnixNano()),
		Summary:        summary,
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		Title:          page.Title,
		Subtitle:       page.Subtitle,
		BrandName:      page.BrandName,
		ThemeTone:      page.ThemeTone,
		SEODescription: page.SEODescription,
		CTALabel:       page.CTALabel,
		CTAURL:         page.CTAURL,
		Sections:       secCopy,
		MarkdownBody:   page.MarkdownBody,
	}
}

// handleStudioChatCreate creates a brand-new page directly from one Lovable-style prompt.
func (s *Server) handleStudioChatCreate(w http.ResponseWriter, r *http.Request) {
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
		Kind     string `json:"kind"`
		Prompt   string `json:"prompt"`
		Language string `json:"language"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("prompt is required"))
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

	raw, err := ai.Complete(r.Context(), *aiCfg, studioChatSystemPrompt(kind, lang, true), "User request:\n"+prompt)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	res, err := parseStudioChatResponse(raw, kind)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	nowStr := time.Now().UTC().Format(time.RFC3339)
	slugBase := res.Page.Slug
	if slugBase == "" {
		slugBase = res.Page.Title
	}
	page := &database.StudioPage{
		OwnerUserID:    u.ID,
		Kind:           kind,
		Slug:           s.ensureUniqueStudioSlug(slugBase, 0),
		Title:          res.Page.Title,
		Subtitle:       res.Page.Subtitle,
		Status:         "draft",
		ShowInDocs:     kind == "docs",
		BrandName:      res.Page.BrandName,
		ThemeTone:      res.Page.ThemeTone,
		SEODescription: res.Page.SEODescription,
		CTALabel:       res.Page.CTALabel,
		CTAURL:         res.Page.CTAURL,
		Sections:       res.Page.Sections,
		MarkdownBody:   res.Page.MarkdownBody,
		SourcePrompt:   prompt,
		ChatHistory: []database.StudioChatMessage{
			{Role: "user", Content: prompt, CreatedAt: nowStr},
			{Role: "assistant", Content: res.Reply, CreatedAt: nowStr},
		},
	}
	created, err := s.database.CreateStudioPage(page)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, jsonResponse{"page": created, "reply": res.Reply})
}

// handleStudioPageChat iteratively edits an existing page via chat while keeping undo snapshots.
func (s *Server) handleStudioPageChat(w http.ResponseWriter, r *http.Request) {
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
		Message  string `json:"message"`
		Language string `json:"language"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	msg := strings.TrimSpace(req.Message)
	if msg == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("message is required"))
		return
	}
	lang := "Bahasa Indonesia"
	if req.Language == "en" {
		lang = "English"
	}

	curJSON, _ := json.Marshal(aiGeneratedStudioPage{
		Slug:           existing.Slug,
		Title:          existing.Title,
		Subtitle:       existing.Subtitle,
		BrandName:      existing.BrandName,
		ThemeTone:      existing.ThemeTone,
		SEODescription: existing.SEODescription,
		CTALabel:       existing.CTALabel,
		CTAURL:         existing.CTAURL,
		Sections:       existing.Sections,
		MarkdownBody:   existing.MarkdownBody,
	})
	var histBuilder strings.Builder
	startIdx := 0
	if len(existing.ChatHistory) > 6 {
		startIdx = len(existing.ChatHistory) - 6
	}
	for _, h := range existing.ChatHistory[startIdx:] {
		histBuilder.WriteString(h.Role + ": " + h.Content + "\n")
	}

	userPrompt := fmt.Sprintf("Current page JSON:\n%s\n\nRecent conversation:\n%s\nNew instruction:\n%s",
		string(curJSON), histBuilder.String(), msg)

	raw, err := ai.Complete(r.Context(), *aiCfg, studioChatSystemPrompt(existing.Kind, lang, false), userPrompt)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	res, err := parseStudioChatResponse(raw, existing.Kind)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}

	// Snapshot current page before applying edits so user can restore any version
	existing.Versions = append(existing.Versions, snapshotStudioVersion(existing, "Sebelum: "+msg))
	if res.Page.Title != "" {
		existing.Title = res.Page.Title
	}
	existing.Subtitle = res.Page.Subtitle
	if res.Page.BrandName != "" {
		existing.BrandName = res.Page.BrandName
	}
	existing.ThemeTone = res.Page.ThemeTone
	if res.Page.SEODescription != "" {
		existing.SEODescription = res.Page.SEODescription
	}
	if res.Page.CTALabel != "" {
		existing.CTALabel = res.Page.CTALabel
	}
	if res.Page.CTAURL != "" {
		existing.CTAURL = res.Page.CTAURL
	}
	if existing.Kind == "docs" {
		if res.Page.MarkdownBody != "" {
			existing.MarkdownBody = res.Page.MarkdownBody
		}
	} else if len(res.Page.Sections) > 0 {
		existing.Sections = res.Page.Sections
	}

	nowStr := time.Now().UTC().Format(time.RFC3339)
	existing.ChatHistory = append(existing.ChatHistory,
		database.StudioChatMessage{Role: "user", Content: msg, CreatedAt: nowStr},
		database.StudioChatMessage{Role: "assistant", Content: res.Reply, CreatedAt: nowStr},
	)

	updated, err := s.database.UpdateStudioPage(existing)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.syncStudioPageToDocsWindow(u.ID, updated)
	s.writeJSON(w, http.StatusOK, jsonResponse{"page": updated, "reply": res.Reply})
}

// handleStudioRestoreVersion rolls a page back to one of its saved snapshots.
func (s *Server) handleStudioRestoreVersion(w http.ResponseWriter, r *http.Request) {
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
		VersionID string `json:"versionId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14)).Decode(&req); err != nil || strings.TrimSpace(req.VersionID) == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("versionId is required"))
		return
	}
	var target *database.StudioPageVersion
	for i := range existing.Versions {
		if existing.Versions[i].ID == req.VersionID {
			v := existing.Versions[i]
			target = &v
			break
		}
	}
	if target == nil {
		s.writeError(w, http.StatusNotFound, errors.New("version not found"))
		return
	}
	existing.Versions = append(existing.Versions, snapshotStudioVersion(existing, "Sebelum pemulihan versi"))
	existing.Title = target.Title
	existing.Subtitle = target.Subtitle
	existing.BrandName = target.BrandName
	existing.ThemeTone = target.ThemeTone
	existing.SEODescription = target.SEODescription
	existing.CTALabel = target.CTALabel
	existing.CTAURL = target.CTAURL
	existing.Sections = target.Sections
	existing.MarkdownBody = target.MarkdownBody

	updated, err := s.database.UpdateStudioPage(existing)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.syncStudioPageToDocsWindow(u.ID, updated)
	s.writeJSON(w, http.StatusOK, jsonResponse{"page": updated})
}
