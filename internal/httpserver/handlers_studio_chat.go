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
	if kind == "docs" {
		action := "Iteratively refine the existing documentation JSON based on the user's latest instruction. Preserve existing sections and details that the user did not ask to change."
		if isCreate {
			action = "Create a complete, polished documentation guide or article from the user's prompt."
		}
		return `You are an expert technical writer.
` + action + `
Return ONLY one valid JSON object matching this exact schema (no markdown prose outside JSON):
{
  "reply": "1-2 concise sentences summarizing what you built or changed",
  "page": {
    "slug": "url-friendly-slug",
    "title": "Clear Documentation Guide Title",
    "subtitle": "1-2 sentence summary",
    "brandName": "Product or organization name mentioned by the user (or leave short/relevant)",
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

	action := "Iteratively update the existing standalone HTML/CSS/JS document according to the user's latest instruction. Preserve existing sections, styling, and interactivity that the user did not ask to change, and return the COMPLETE updated HTML document."
	if isCreate {
		action = "Build a complete, original, production-ready standalone web page or interactive web application from scratch based on the user's request."
	}
	return `You are an unrestricted full-stack web designer and frontend engineer (like Lovable).
` + action + `

You have COMPLETE creative and technical freedom:
- Build ANY kind of page or interactive web app the user asks for: business landing pages, restaurants, clinics, portfolios, SaaS sites, e-commerce catalogs, event/wedding invitations, dashboards, interactive calculators, booking/order forms, quizzes, pricing toggles, galleries, dark/light editorial layouts, or anything else.
- NEVER force any specific platform brand (such as Reneo) or rigid template unless the user explicitly asks for it. Use the exact brand, tone, aesthetic, palette, typography, and layout that best fits the user's request.
- Use complete standalone HTML5 (<!DOCTYPE html>) with responsive mobile-first design.
- You may load Tailwind CSS Play CDN (<script src="https://cdn.tailwindcss.com"></script>) and Google Fonts (<link href="https://fonts.googleapis.com/css2?..." rel="stylesheet">) plus your own <style> block and inline <script> for rich, real working interactivity (tabs, filters, modals, calculators, mobile nav menu, smooth scroll, form handling, theme toggles, etc.).
- Use crisp inline SVG icons where helpful. When the user attached images, use them (hero, gallery, cards) with their exact src. Never invent image addresses: without an attached or user-given image, use clean styled layouts, inline SVG graphics, or CSS visuals. Keep existing <img> sources unless asked to change them.
- Make it genuinely interactive and alive: working navigation, buttons and forms that give feedback, tasteful transitions and scroll reveals. No walls of plain text; do not lay the page out like a rendered markdown document.
- Keep the code compact enough to finish: the document must end with </html>.
- Write clear, natural, concrete copy in ` + lang + ` (no em dashes, no generic AI filler).

Output format MUST follow these exact two markers with no extra prose before or after:
---META---
{"reply":"1-2 concise sentences summarizing what you built or changed","slug":"url-friendly-slug","title":"Page Title","brandName":"Brand or Project Name","seoDescription":"Concise SEO meta description under 155 chars"}
---HTML---
<!DOCTYPE html>
<html lang="id">
...complete standalone HTML document...
</html>`
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
		HTMLCode:       page.HTMLCode,
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
		Kind     string       `json:"kind"`
		Prompt   string       `json:"prompt"`
		Language string       `json:"language"`
		Images   []aiImageRef `json:"images"`
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

	maxTokens := 12288
	if kind == "docs" {
		maxTokens = 6144
	}
	images := cleanAIImages(req.Images)
	raw, err := ai.CompleteWithMaxTokens(r.Context(), *aiCfg, maxTokens, studioChatSystemPrompt(kind, lang, true), "User request:\n"+prompt+aiImagesPrompt(images, kind == "docs"))
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	res, err := parseStudioChatResponse(raw, kind)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	if err := ensureCompleteHTML(res.Page.HTMLCode); err != nil {
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
		HTMLCode:       res.Page.HTMLCode,
		SourcePrompt:   prompt,
		ChatHistory: []database.StudioChatMessage{
			{Role: "user", Content: prompt, CreatedAt: nowStr, Images: aiImageURLs(images)},
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
		Message  string            `json:"message"`
		Language string            `json:"language"`
		Images   []aiImageRef      `json:"images"`
		Element  *studioElementRef `json:"element"`
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

	var histBuilder strings.Builder
	startIdx := 0
	if len(existing.ChatHistory) > 6 {
		startIdx = len(existing.ChatHistory) - 6
	}
	for _, h := range existing.ChatHistory[startIdx:] {
		histBuilder.WriteString(h.Role + ": " + h.Content + "\n")
	}

	var userPrompt string
	maxTokens := 12288
	if existing.Kind == "docs" {
		maxTokens = 6144
		curJSON, _ := json.Marshal(aiGeneratedStudioPage{
			Slug:           existing.Slug,
			Title:          existing.Title,
			Subtitle:       existing.Subtitle,
			BrandName:      existing.BrandName,
			ThemeTone:      existing.ThemeTone,
			SEODescription: existing.SEODescription,
			MarkdownBody:   existing.MarkdownBody,
		})
		userPrompt = fmt.Sprintf("Current documentation JSON:\n%s\n\nRecent conversation:\n%s\nNew instruction:\n%s",
			string(curJSON), histBuilder.String(), msg)
	} else if strings.TrimSpace(existing.HTMLCode) != "" {
		userPrompt = fmt.Sprintf("Current page metadata: title=%q, brand=%q, slug=%q\n\nCurrent HTML/CSS/JS code:\n%s\n\nRecent conversation:\n%s\nNew instruction:\n%s",
			existing.Title, existing.BrandName, existing.Slug, existing.HTMLCode, histBuilder.String(), msg)
	} else {
		curJSON, _ := json.Marshal(aiGeneratedStudioPage{
			Slug:           existing.Slug,
			Title:          existing.Title,
			Subtitle:       existing.Subtitle,
			BrandName:      existing.BrandName,
			SEODescription: existing.SEODescription,
			CTALabel:       existing.CTALabel,
			CTAURL:         existing.CTAURL,
			Sections:       existing.Sections,
		})
		userPrompt = fmt.Sprintf("Current page draft data (convert and upgrade into complete standalone HTML/CSS/JS):\n%s\n\nRecent conversation:\n%s\nNew instruction:\n%s",
			string(curJSON), histBuilder.String(), msg)
	}

	images := cleanAIImages(req.Images)
	userPrompt += studioElementPrompt(req.Element) + aiImagesPrompt(images, existing.Kind == "docs")

	raw, err := ai.CompleteWithMaxTokens(r.Context(), *aiCfg, maxTokens, studioChatSystemPrompt(existing.Kind, lang, false), userPrompt)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	res, err := parseStudioChatResponse(raw, existing.Kind)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	if existing.Kind != "docs" {
		if err := ensureCompleteHTML(res.Page.HTMLCode); err != nil {
			s.writeError(w, http.StatusUnprocessableEntity, err)
			return
		}
	}

	// Snapshot current page before applying edits so user can restore any version
	existing.Versions = append(existing.Versions, snapshotStudioVersion(existing, "Sebelum: "+msg))
	if res.Page.Title != "" {
		existing.Title = res.Page.Title
	}
	if res.Page.Subtitle != "" {
		existing.Subtitle = res.Page.Subtitle
	}
	if res.Page.BrandName != "" {
		existing.BrandName = res.Page.BrandName
	}
	if res.Page.ThemeTone != "" {
		existing.ThemeTone = res.Page.ThemeTone
	}
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
	} else {
		if res.Page.HTMLCode != "" {
			existing.HTMLCode = res.Page.HTMLCode
		}
		if len(res.Page.Sections) > 0 {
			existing.Sections = res.Page.Sections
		}
	}

	nowStr := time.Now().UTC().Format(time.RFC3339)
	existing.ChatHistory = append(existing.ChatHistory,
		database.StudioChatMessage{Role: "user", Content: msg, CreatedAt: nowStr, Images: aiImageURLs(images)},
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
	existing.HTMLCode = target.HTMLCode

	updated, err := s.database.UpdateStudioPage(existing)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.syncStudioPageToDocsWindow(u.ID, updated)
	s.writeJSON(w, http.StatusOK, jsonResponse{"page": updated})
}
