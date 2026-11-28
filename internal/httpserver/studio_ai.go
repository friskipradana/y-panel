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
	HTMLCode       string                   `json:"htmlCode"`
}

var studioSlugBadRe = regexp.MustCompile(`[^a-z0-9-]+`)
var studioSlugDashRe = regexp.MustCompile(`-{2,}`)
var htmlTitleRe = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
var htmlFenceRe = regexp.MustCompile("(?is)```(?:html|htm)?\\s*(.*?)\\s*```")

func cleanStudioHTML(raw string) string {
	s := strings.TrimSpace(raw)
	if m := htmlFenceRe.FindStringSubmatch(s); len(m) > 1 {
		s = strings.TrimSpace(m[1])
	}
	lower := strings.ToLower(s)
	if idx := strings.Index(lower, "<!doctype"); idx >= 0 {
		if idx > 0 {
			s = strings.TrimSpace(s[idx:])
		}
	} else if idx := strings.Index(lower, "<html"); idx > 0 {
		s = strings.TrimSpace(s[idx:])
	}
	return s
}

func extractHTMLTitle(html string) string {
	if m := htmlTitleRe.FindStringSubmatch(html); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

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
		HTMLCode:       cleanStudioHTML(firstStringField(root, "htmlCode", "html_code", "html")),
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

	if out.Title == "" && out.HTMLCode != "" {
		out.Title = extractHTMLTitle(out.HTMLCode)
	}
	if out.Slug == "" && out.Title != "" {
		out.Slug = sanitizeStudioSlug(out.Title)
	}
	if out.Title == "" && len(out.Sections) == 0 && out.MarkdownBody == "" && out.HTMLCode == "" {
		return nil, fmt.Errorf("AI tidak menghasilkan isi halaman. Coba perjelas brief atau ganti model AI.")
	}
	return out, nil
}

type studioChatAIResult struct {
	Reply string
	Page  *aiGeneratedStudioPage
}

// parseStudioChatResponse extracts both the assistant's short change summary and updated page payload.
// Supports ---META--- / ---HTML--- delimited full-code responses, raw HTML documents, and JSON payloads.
func parseStudioChatResponse(raw string, kind string) (*studioChatAIResult, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, fmt.Errorf("AI mengembalikan respons kosong")
	}

	// 1. Primary format for unrestricted web builder: ---META--- (optional JSON) + ---HTML--- (raw HTML/CSS/JS)
	if kind != "docs" {
		if idx := strings.Index(trimmed, "---HTML---"); idx != -1 {
			metaPart := strings.TrimSpace(trimmed[:idx])
			metaPart = strings.TrimPrefix(metaPart, "---META---")
			htmlCode := cleanStudioHTML(trimmed[idx+len("---HTML---"):])
			if htmlCode != "" {
				page := &aiGeneratedStudioPage{ThemeTone: "blue", HTMLCode: htmlCode}
				reply := ""
				if cleanMeta := ai.ExtractJSONObject(metaPart); cleanMeta != "" {
					var m map[string]any
					if json.Unmarshal([]byte(cleanMeta), &m) == nil {
						reply = stripEmDash(firstStringField(m, "reply", "summary", "message", "changes"))
						page.Slug = sanitizeStudioSlug(firstStringField(m, "slug"))
						page.Title = stripEmDash(firstStringField(m, "title", "headline"))
						page.Subtitle = stripEmDash(firstStringField(m, "subtitle", "summary"))
						page.BrandName = stripEmDash(firstStringField(m, "brandName", "brand_name", "brand"))
						page.SEODescription = stripEmDash(firstStringField(m, "seoDescription", "seo_description", "metaDescription"))
					}
				}
				if page.Title == "" {
					page.Title = extractHTMLTitle(htmlCode)
				}
				if page.Title == "" {
					page.Title = "Halaman Web"
				}
				if page.Slug == "" {
					page.Slug = sanitizeStudioSlug(page.Title)
				}
				if page.SEODescription == "" {
					page.SEODescription = page.Subtitle
				}
				if reply == "" {
					reply = "Halaman telah diperbarui sesuai instruksi."
				}
				return &studioChatAIResult{Reply: reply, Page: page}, nil
			}
		}

		// 2. Fallback: raw standalone HTML document (with or without ```html fence)
		lowerTrim := strings.ToLower(trimmed)
		if strings.Contains(lowerTrim, "<!doctype html") || (strings.Contains(lowerTrim, "<html") && strings.Contains(lowerTrim, "</html>")) {
			// Avoid hijacking JSON that embeds <!DOCTYPE html> inside a string field
			if !strings.HasPrefix(trimmed, "{") {
				htmlCode := cleanStudioHTML(trimmed)
				title := extractHTMLTitle(htmlCode)
				if title == "" {
					title = "Halaman Web"
				}
				return &studioChatAIResult{
					Reply: "Halaman web telah dibangun sesuai instruksi.",
					Page: &aiGeneratedStudioPage{
						Slug:      sanitizeStudioSlug(title),
						Title:     title,
						ThemeTone: "blue",
						HTMLCode:  htmlCode,
					},
				}, nil
			}
		}
	}

	// 3. JSON payload (used for docs Markdown and legacy structured pages)
	cleanJSON := ai.ExtractJSONObject(trimmed)
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
