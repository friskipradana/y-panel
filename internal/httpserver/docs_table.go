package httpserver

import (
	"net/http"
	"sort"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
)

// The articles of the Docs window as a spreadsheet. Local articles and the official ones come in one list, so
// the count, the search and the filters agree with what is on screen.

type docTableRow struct {
	database.Doc
	// Source is "official" for an article synced from the project repository (read-only), "local" for one written here
	Source string `json:"source"`
}

func docVisibility(d docTableRow) string {
	switch {
	case d.Source == "official":
		return "official"
	case d.Status != "published":
		return d.Status
	case d.IsPublic:
		return "public"
	}
	return "private"
}

func docSpec() listquery.Spec[docTableRow] {
	return listquery.Spec[docTableRow]{
		Columns: []listquery.Column[docTableRow]{
			{Key: "title", Value: func(d docTableRow) string { return d.Title }},
			// what a reader sees: official, public, private (published but not shared), draft, archived
			{Key: "status", Value: docVisibility},
			{Key: "updated", Value: func(d docTableRow) string { return d.UpdatedAt.Format("2006-01") }, Compare: func(a, b docTableRow) int {
				switch {
				case a.UpdatedAt.Before(b.UpdatedAt):
					return -1
				case a.UpdatedAt.After(b.UpdatedAt):
					return 1
				}
				return 0
			}},
		},
		Search: func(d docTableRow) string {
			return strings.ToLower(d.Title + " " + d.Slug + " " + d.Excerpt + " " + d.Content)
		},
		// newest first when nothing else is asked
		Tiebreak: func(a, b docTableRow) int {
			switch {
			case a.UpdatedAt.After(b.UpdatedAt):
				return -1
			case a.UpdatedAt.Before(b.UpdatedAt):
				return 1
			}
			return int(a.ID - b.ID)
		},
	}
}

func (s *Server) handleDocsTable(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	limit, offset, err := parseLimitOffset(r, 50, 200)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	includeDrafts := auth.IsAdmin(u.Role)

	var local []database.Doc
	for page := 0; page < 50; page++ {
		part, total, err := s.database.ListDocs("", 100, page*100, includeDrafts)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		local = append(local, part...)
		if int64(len(local)) >= total || len(part) == 0 {
			break
		}
	}
	rows := make([]docTableRow, 0, len(local))
	taken := make(map[string]bool, len(local))
	for _, d := range local {
		taken[d.Slug] = true
		rows = append(rows, docTableRow{Doc: d, Source: "local"})
	}
	// official articles get negative ids, as in the official list; a local article with the same slug wins
	for i, d := range s.officialDocs(r.Context()) {
		if taken[d.Slug] {
			continue
		}
		d.ID = int64(-(i + 1))
		rows = append(rows, docTableRow{Doc: d, Source: "official"})
	}

	// newest first until a column is asked to order the list
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].UpdatedAt.After(rows[j].UpdatedAt) })

	res := tableResponse(rows, docSpec(), r.URL.Query())
	end := offset + limit
	if offset > len(res.Items) {
		offset = len(res.Items)
	}
	if end > len(res.Items) {
		end = len(res.Items)
	}
	res.Items = res.Items[offset:end]
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": res.Items, "total": res.Total, "all": res.All, "facets": res.Facets, "limit": limit, "offset": offset})
}
