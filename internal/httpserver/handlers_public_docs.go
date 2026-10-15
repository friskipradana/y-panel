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
	UpdatedAt time.Time `json:"updatedAt"`
}

func (s *Server) handlePublicDocsList(w http.ResponseWriter, _ *http.Request) {
	docs, err := s.database.ListPublicDocs(100)
	if err != nil {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "articles are unavailable"})
		return
	}
	items := make([]publicDocSummary, 0, len(docs))
	for _, d := range docs {
		items = append(items, publicDocSummary{Title: d.Title, Slug: d.Slug, Excerpt: d.Excerpt, UpdatedAt: d.UpdatedAt})
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
	doc, err := s.database.GetPublicDocBySlug(slug)
	if err != nil {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "articles are unavailable"})
		return
	}
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
