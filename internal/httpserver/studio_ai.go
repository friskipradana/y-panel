package httpserver

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/ai"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

type aiGeneratedStudioPage struct {
	Slug           string                   `json:"slug"`
	Title          string                   `json:"title"`
	Subtitle       string                   `json:"subtitle"`
	BrandName      string                   `json:"brandName"`
	ThemeTone      string                   `json:"themeTone"`
	SEODescription string                   `json:"seoDescription"`
	CTALabel       string                   `json:"ctaLabel"`
	CTAURL         string                   `json:"ctaUrl"`
	Sections       []database.StudioSection `json:"sections"`
	MarkdownBody   string                   `json:"markdownBody"`
}

var studioSlugBadRe = regexp.MustCompile(`[^a-z0-9-]+`)
var studioSlugDashRe = regexp.MustCompile(`-{2,}`)

func sanitizeStudioSlug(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, "_", "-")
	s = strings.ReplaceAll(s, " ", "-")
	s = studioSlugBadRe.ReplaceAllString(s, "-")
	s = studioSlugDashRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 80 {
		s = strings.Trim(s[:80], "-")
	}
	return s
}

func parseGeneratedStudioPage(raw string, kind string) (*aiGeneratedStudioPage, error) {
	cleanJSON := ai.ExtractJSONObject(raw)
	if cleanJSON == "" {
		return nil, fmt.Errorf("AI mengembalikan respons kosong")
	}
	var root map[string]any
	if err := json.Unmarshal([]byte(cleanJSON), &root); err != nil {
		snippet := strings.TrimSpace(raw)
		if len(snippet) > 160 {
			snippet = snippet[:160] + "..."
		}
		return nil, fmt.Errorf("format JSON dari AI tidak dapat dibaca (%v). Cuplikan respons: %s", err, snippet)
	}
	for _, wrapper := range []string{"page", "landing", "docs", "result", "data"} {
		if inner, ok := root[wrapper].(map[string]any); ok && firstStringField(root, "title") == "" {
			root = inner
			break
		}
	}

	out := &aiGeneratedStudioPage{
		Slug:           sanitizeStudioSlug(firstStringField(root, "slug")),
		Title:          stripEmDash(firstStringField(root, "title", "headline")),
		Subtitle:       stripEmDash(firstStringField(root, "subtitle", "subheadline", "summary", "excerpt")),
		BrandName:      stripEmDash(firstStringField(root, "brandName", "brand_name", "brand")),
		ThemeTone:      strings.ToLower(firstStringField(root, "themeTone", "theme_tone", "tone")),
		SEODescription: stripEmDash(firstStringField(root, "seoDescription", "seo_description", "metaDescription")),
		CTALabel:       stripEmDash(firstStringField(root, "ctaLabel", "cta_label")),
		CTAURL:         strings.TrimSpace(firstStringField(root, "ctaUrl", "cta_url")),
		Sections:       []database.StudioSection{},
		MarkdownBody:   stripEmDash(firstStringField(root, "markdownBody", "markdown_body", "content", "markdown")),
	}
	if out.ThemeTone != "blue" && out.ThemeTone != "emerald" && out.ThemeTone != "slate" && out.ThemeTone != "amber" {
		out.ThemeTone = "blue"
	}

	if rawSections, ok := firstAnyField(root, "sections", "blocks").([]any); ok {
		for idx, entry := range rawSections {
			m, ok := entry.(map[string]any)
			if !ok {
				continue
			}
			secType := strings.ToLower(firstStringField(m, "type", "kind"))
			switch secType {
			case "features", "pricing", "steps", "testimonials", "stats", "faq", "cta":
			default:
				secType = "features"
			}
			sec := database.StudioSection{
				ID:         fmt.Sprintf("sec-%d", idx+1),
				Type:       secType,
				Heading:    stripEmDash(firstStringField(m, "heading", "title")),
				Subheading: stripEmDash(firstStringField(m, "subheading", "subtitle", "description")),
				Items:      []database.StudioSectionItem{},
			}
			if rawItems, ok := firstAnyField(m, "items", "cards", "entries", "plans").([]any); ok {
				for _, itemRaw := range rawItems {
					im, ok := itemRaw.(map[string]any)
					if !ok {
						continue
					}
					itemTitle := stripEmDash(firstStringField(im, "title", "name", "question"))
					itemDesc := stripEmDash(firstStringField(im, "description", "answer", "desc", "summary"))
					if itemTitle == "" && itemDesc == "" {
						continue
					}
					var bullets []string
					if rawBullets, ok := firstAnyField(im, "bullets", "features", "points").([]any); ok {
						for _, b := range rawBullets {
							if s, ok := b.(string); ok {
								if clean := stripEmDash(s); clean != "" {
									bullets = append(bullets, clean)
								}
							}
						}
					}
					highlight, _ := firstAnyField(im, "highlight", "highlighted", "featured").(bool)
					sec.Items = append(sec.Items, database.StudioSectionItem{
						Title:       itemTitle,
						Description: itemDesc,
						Price:       stripEmDash(firstStringField(im, "price", "priceLabel", "price_label")),
						Badge:       stripEmDash(firstStringField(im, "badge", "tag")),
						Bullets:     bullets,
						Highlight:   highlight,
					})
				}
			}
			if sec.Heading != "" || len(sec.Items) > 0 {
				out.Sections = append(out.Sections, sec)
			}
		}
	}

	if out.Slug == "" && out.Title != "" {
		out.Slug = sanitizeStudioSlug(out.Title)
	}
	if out.SEODescription == "" {
		out.SEODescription = out.Subtitle
	}
	if kind == "docs" && out.MarkdownBody == "" && len(out.Sections) > 0 {
		// Fallback: convert sections to clean Markdown if model returned sections instead of markdownBody
		var sb strings.Builder
		for _, sec := range out.Sections {
			if sec.Heading != "" {
				sb.WriteString("## " + sec.Heading + "\n\n")
			}
			if sec.Subheading != "" {
				sb.WriteString(sec.Subheading + "\n\n")
			}
			for _, it := range sec.Items {
				sb.WriteString("### " + it.Title + "\n\n" + it.Description + "\n\n")
			}
		}
		out.MarkdownBody = strings.TrimSpace(sb.String())
	}

	if out.Title == "" && len(out.Sections) == 0 && out.MarkdownBody == "" {
		return nil, fmt.Errorf("AI tidak menghasilkan isi halaman. Coba perjelas brief atau ganti model AI.")
	}
	return out, nil
}

type studioChatAIResult struct {
	Reply string
	Page  *aiGeneratedStudioPage
}

// parseStudioChatResponse extracts both the assistant's short change summary and updated page payload.
func parseStudioChatResponse(raw string, kind string) (*studioChatAIResult, error) {
	cleanJSON := ai.ExtractJSONObject(raw)
	if cleanJSON == "" {
		return nil, fmt.Errorf("AI mengembalikan respons kosong")
	}
	var root map[string]any
	if err := json.Unmarshal([]byte(cleanJSON), &root); err != nil {
		return nil, fmt.Errorf("format JSON chat AI tidak valid: %v", err)
	}
	reply := stripEmDash(firstStringField(root, "reply", "summary", "message", "changes"))
	pageJSON := cleanJSON
	if inner, ok := root["page"].(map[string]any); ok {
		if b, err := json.Marshal(inner); err == nil {
			pageJSON = string(b)
		}
	}
	page, err := parseGeneratedStudioPage(pageJSON, kind)
	if err != nil {
		return nil, err
	}
	if reply == "" {
		reply = "Halaman telah diperbarui sesuai instruksi."
	}
	return &studioChatAIResult{Reply: reply, Page: page}, nil
}
