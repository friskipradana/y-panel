package httpserver

import (
	"context"
	"net/http"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// Official articles come from the project repository (internal/docsync), so every
// installation shows the same documentation. Articles written on this panel stay in
// its own database; a local article with the same slug wins over the official one.

func (s *Server) officialDocs(ctx context.Context) []database.Doc {
	if s.docsSync == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	items, _ := s.docsSync.Articles(ctx, false)
	docs := make([]database.Doc, 0, len(items))
	for _, a := range items {
		docs = append(docs, database.Doc{
			Title:     a.Title,
			Slug:      a.Slug,
			Excerpt:   a.Excerpt,
			Content:   a.Content,
			Status:    "published",
			IsPublic:  true,
			CreatedAt: a.UpdatedAt,
			UpdatedAt: a.UpdatedAt,
		})
	}
	return docs
}

// publicArticles merges the public local articles with the official ones.
func (s *Server) publicArticles() []database.Doc {
	var local []database.Doc
	if s.database != nil && s.database.IsConnected() {
		if docs, err := s.database.ListPublicDocs(200); err == nil {
			local = docs
		}
	}
	taken := make(map[string]bool, len(local))
	for _, d := range local {
		taken[d.Slug] = true
	}
	merged := append([]database.Doc(nil), local...)
	for _, d := range s.officialDocs(context.Background()) {
		if !taken[d.Slug] {
			merged = append(merged, d)
		}
	}
	return merged
}

// findPublicDoc looks a slug up locally first, then in the official set.
func (s *Server) findPublicDoc(ctx context.Context, slug string) *database.Doc {
	if s.database != nil && s.database.IsConnected() {
		if doc, err := s.database.GetPublicDocBySlug(slug); err == nil && doc != nil {
			return doc
		}
	}
	for _, d := range s.officialDocs(ctx) {
		if d.Slug == slug {
			doc := d
			return &doc
		}
	}
	return nil
}

// handleListOfficialDocs serves the official set to signed-in users (with content).
func (s *Server) handleListOfficialDocs(w http.ResponseWriter, r *http.Request) {
	force := r.URL.Query().Get("refresh") == "1"
	if force && s.docsSync != nil {
		_, _ = s.docsSync.Articles(r.Context(), true)
	}
	docs := s.officialDocs(r.Context())
	for i := range docs {
		docs[i].ID = int64(-(i + 1))
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": docs, "source": "github", "enabled": s.docsSync != nil})
}
