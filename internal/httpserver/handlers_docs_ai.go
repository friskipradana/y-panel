package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/ai"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

type docAIGenerateRequest struct {
	Kind         string `json:"kind"` // doc | article
	Topic        string `json:"topic"`
	Instructions string `json:"instructions"`
	Language     string `json:"language"`
	AutoSave     bool   `json:"autoSave"`
	Publish      bool   `json:"publish"`
	IsPublic     bool   `json:"isPublic"`
	// the Reneo feature to write about; "" lets the topic (or the first uncovered feature) decide
	Feature string `json:"feature"`
	// pictures to place in the text
	Images []aiImageRef `json:"images"`
	// the article as it is now: when set, the AI revises it instead of writing a new one
	Current *docCurrentDraft `json:"current"`
}

type docCurrentDraft struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

// handleGenerateDocWithAI uses the configured AI provider to draft either a Reneo documentation
// guide ("doc") or a Reneo article ("article"), avoiding duplicates of existing docs.
func (s *Server) handleGenerateDocWithAI(w http.ResponseWriter, r *http.Request) {
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
	var req docAIGenerateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	kind := "article"
	if strings.ToLower(strings.TrimSpace(req.Kind)) == "doc" {
		kind = "doc"
	}
	lang := "Bahasa Indonesia"
	if strings.ToLower(strings.TrimSpace(req.Language)) == "en" {
		lang = "English"
	}

	// Collect existing docs (local + official) so AI avoids repeating topics
	var local []database.Doc
	if s.database != nil && s.database.IsConnected() {
		local, _ = s.allLocalDocs(true)
	}
	official := s.officialDocs(r.Context())
	var existingLines []string
	for _, d := range local {
		existingLines = append(existingLines, fmt.Sprintf("- [%s] %s (slug: %s)", d.Kind, d.Title, d.Slug))
	}
	for _, d := range official {
		existingLines = append(existingLines, fmt.Sprintf("- [doc/official] %s (slug: %s)", d.Title, d.Slug))
	}
	existingBlock := strings.Join(existingLines, "\n")
	if existingBlock == "" {
		existingBlock = "(belum ada dokumen atau artikel)"
	}

	// what the post is about: the chosen feature, else what the topic names, else the next feature nobody has written about
	langKey := "id"
	if lang == "English" {
		langKey = "en"
	}
	var features []*docFeature
	if f := findDocFeature(strings.TrimSpace(req.Feature)); f != nil {
		features = []*docFeature{f}
	} else if about := strings.TrimSpace(req.Topic + " " + req.Instructions); about != "" {
		features = matchDocFeatures(about)
	} else if f := firstUncoveredDocFeature(docCoverageOf(langKey, local, official)); f != nil {
		features = []*docFeature{f}
	}
	featureKey := ""
	if len(features) > 0 {
		featureKey = features[0].Key
	}

	var roleDesc, structureGuide string
	if kind == "doc" {
		roleDesc = "You are a technical documentation author for Reneo (Desktop Linux Server Control Panel). Write a clear, structured operator documentation guide."
		structureGuide = "Use ## headings, ### subheadings, prerequisites, numbered step-by-step instructions inside Reneo, exact field/command examples in fenced code blocks, and a Troubleshooting section."
	} else {
		roleDesc = "You are a practical blog & article author for Reneo (Desktop Linux Server Control Panel). Write an insightful, actionable article about server operations, workflows, or use cases with Reneo."
		structureGuide = "Write an engaging introduction, 4+ well-structured ## sections with concrete real-world examples, best practices, and a clear takeaway conclusion."
	}

	sysPrompt := roleDesc + `
Return ONLY one valid JSON object matching this exact schema (no markdown prose outside JSON):
{
  "title": "Clear, concrete title",
  "slug": "url-friendly-slug",
  "excerpt": "1-2 concise sentences summarizing this post (under 180 chars)",
  "content": "## Pendahuluan\n\nFull Markdown content..."
}
Rules:
- Language: ` + lang + `.
- ` + structureGuide + `
- Never use em dashes or empty marketing fluff (seamless, cutting-edge, revolutionary, all-in-one, dengan mulus).
- Stay strictly accurate to Reneo's real features and DO NOT duplicate an existing title or slug.` + docGroundingRules

	topic := strings.TrimSpace(req.Topic)
	topicLine := "Requested topic: " + topic
	if topic == "" && len(features) > 0 {
		topicLine = "Write about the Reneo feature \"" + features[0].Name.in(langKey) + "\": what it is for and how to do its main tasks."
	} else if topic == "" {
		if kind == "doc" {
			topicLine = "No topic specified: analyze the existing Reneo documentation list and pick the most important MISSING documentation guide to write."
		} else {
			topicLine = "No topic specified: pick a fresh, high-value Reneo article topic not yet covered in the existing list."
		}
	}
	extraLine := ""
	if instr := strings.TrimSpace(req.Instructions); instr != "" {
		extraLine = "\nAdditional instructions: " + instr
	}

	userPrompt := fmt.Sprintf("Post type: %s\n%s%s\n\n%s\n\nExisting documentation and articles (DO NOT duplicate):\n%s",
		kind, topicLine, extraLine, docKnowledgeBlock(features, langKey, official), existingBlock)
	revising := req.Current != nil && strings.TrimSpace(req.Current.Content) != ""
	if revising {
		userPrompt = fmt.Sprintf("Revise this %s according to the instruction. Keep everything the instruction does not ask to change, including every existing image line, and return the COMPLETE updated post.\nInstruction: %s\nCurrent title: %s\nCurrent content:\n%s",
			kind, strings.TrimSpace(req.Instructions), req.Current.Title, req.Current.Content)
		if len(features) > 0 {
			userPrompt += "\n\nMaterial about the product, for anything you add:\n" + docKnowledgeBlock(features, langKey, official)
		}
	}
	userPrompt += aiImagesPrompt(cleanAIImages(req.Images), true)

	raw, err := ai.CompleteWithMaxTokens(r.Context(), *aiCfg, 6144, sysPrompt, userPrompt)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	parsed, err := parseGeneratedStudioPage(raw, "docs")
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	content := strings.TrimSpace(parsed.MarkdownBody)
	if content == "" {
		s.writeError(w, http.StatusUnprocessableEntity, errors.New("AI tidak menghasilkan isi konten Markdown"))
		return
	}
	if !revising {
		content = withFeatureShot(content, features, langKey)
	}
	slug := slugify(parsed.Slug)
	if slug == "" {
		slug = slugify(parsed.Title)
	}
	excerpt := strings.TrimSpace(parsed.Subtitle)
	if excerpt == "" {
		excerpt = strings.TrimSpace(parsed.SEODescription)
	}

	// a revision goes back to the editor; the author decides whether to save it
	if req.AutoSave && !revising {
		status := "draft"
		if req.Publish {
			status = "published"
		}
		// Ensure unique slug in docs table
		uniqueSlug := slug
		for n := 2; n <= 50; n++ {
			ex, gErr := s.database.GetDocBySlug(uniqueSlug, true)
			if gErr != nil || ex == nil {
				break
			}
			uniqueSlug = fmt.Sprintf("%s-%d", slug, n)
		}
		payload := docPayload{
			Kind:     kind,
			Title:    parsed.Title,
			Slug:     uniqueSlug,
			Excerpt:  excerpt,
			Content:  content,
			Status:   status,
			IsPublic: req.IsPublic,
		}
		if err := normalizeDocPayload(&payload); err != nil {
			s.writeError(w, http.StatusUnprocessableEntity, err)
			return
		}
		created, cErr := s.database.CreateDoc(&u.ID, payload.Kind, payload.Title, payload.Slug, payload.Excerpt, payload.Content, payload.Status, payload.IsPublic)
		if cErr != nil {
			s.writeError(w, http.StatusInternalServerError, cErr)
			return
		}
		s.saveDocFeature(created, &featureKey)
		s.writeJSON(w, http.StatusCreated, jsonResponse{"doc": created})
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"draft": jsonResponse{
			"kind":    kind,
			"title":   parsed.Title,
			"slug":    slug,
			"excerpt": excerpt,
			"content":    content,
			"featureKey": featureKey,
		},
	})
}
