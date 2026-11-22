package httpserver

import (
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Public articles: docs marked published and public are readable without a session,
// the same way the landing page is. Nothing else about docs becomes public.

var publicSlugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,118}$`)

type publicDocSummary struct {
	Title     string    `json:"title"`
	Slug      string    `json:"slug"`
	Excerpt   string    `json:"excerpt"`
	// Cover is the first image of the article (a store URL, an https URL or img/<file>)
	Cover     string    `json:"cover,omitempty"`
	UpdatedAt time.Time `json:"updatedAt"`
}

var firstImageRe = regexp.MustCompile(`!\[[^\]\n]*\]\(([^)\s]+)\)`)

func firstImageURL(content string) string {
	if m := firstImageRe.FindStringSubmatch(content); len(m) == 2 {
		return m[1]
	}
	return ""
}

func (s *Server) handlePublicDocsList(w http.ResponseWriter, _ *http.Request) {
	docs := s.publicArticles()
	items := make([]publicDocSummary, 0, len(docs))
	for _, d := range docs {
		items = append(items, publicDocSummary{Title: d.Title, Slug: d.Slug, Excerpt: d.Excerpt, Cover: firstImageURL(d.Content), UpdatedAt: d.UpdatedAt})
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}

func (s *Server) handlePublicDocGet(w http.ResponseWriter, r *http.Request) {
	slug := strings.ToLower(strings.TrimSpace(r.PathValue("slug")))
	if !publicSlugRe.MatchString(slug) {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "article not found"})
		return
	}
	doc := s.findPublicDoc(r.Context(), slug)
	if doc == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "article not found"})
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	// the author's account id and internal fields stay out of the public payload
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"title":     doc.Title,
		"slug":      doc.Slug,
		"excerpt":   doc.Excerpt,
		"content":   doc.Content,
		"updatedAt": doc.UpdatedAt,
	})
}
