package httpserver

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// Generated from the panel's own screen texts by scripts/gen-doc-knowledge.ts; the documentation AI writes from this, not from memory.
//
//go:embed doc_knowledge.json
var docKnowledgeJSON []byte

type localized struct {
	ID string `json:"id"`
	EN string `json:"en"`
}

func (l localized) in(lang string) string {
	if lang == "en" {
		return l.EN
	}
	return l.ID
}

type docFeature struct {
	Key         string    `json:"key"`
	Access      string    `json:"access"`
	Name        localized `json:"name"`
	Description localized `json:"description"`
	Keywords    []string  `json:"keywords"`
	Official    []string  `json:"official"`
	Labels      struct {
		ID []string `json:"id"`
		EN []string `json:"en"`
	} `json:"labels"`
}

var docFeatures = func() []docFeature {
	var out []docFeature
	if err := json.Unmarshal(docKnowledgeJSON, &out); err != nil {
		panic("doc_knowledge.json: " + err.Error())
	}
	return out
}()

func findDocFeature(key string) *docFeature {
	for i := range docFeatures {
		if docFeatures[i].Key == key {
			return &docFeatures[i]
		}
	}
	return nil
}

// matchDocFeatures finds the features a free topic is about (at most two), by name and keywords.
func matchDocFeatures(topic string) []*docFeature {
	topic = " " + strings.ToLower(topic) + " "
	var first, second *docFeature
	var firstScore, secondScore int
	for i := range docFeatures {
		f := &docFeatures[i]
		score := 0
		for _, word := range append([]string{f.Name.ID, f.Name.EN, f.Key}, f.Keywords...) {
			if word != "" && strings.Contains(topic, strings.ToLower(word)) {
				score += len(word)
			}
		}
		switch {
		case score > firstScore:
			second, secondScore = first, firstScore
			first, firstScore = f, score
		case score > secondScore:
			second, secondScore = f, score
		}
	}
	var out []*docFeature
	for _, f := range []*docFeature{first, second} {
		if f != nil {
			out = append(out, f)
		}
	}
	return out
}

func docFeatureCatalog(lang string) string {
	var b strings.Builder
	b.WriteString("Reneo features (these are all the windows; nothing else exists):\n")
	for _, f := range docFeatures {
		fmt.Fprintf(&b, "- %s: %s\n", f.Name.in(lang), f.Description.in(lang))
	}
	return b.String()
}

// docKnowledgeBlock is the material a guide is written from: the real screen texts of the features, plus the official article if one exists.
func docKnowledgeBlock(features []*docFeature, lang string, official []database.Doc) string {
	if len(features) == 0 {
		return docFeatureCatalog(lang)
	}
	var b strings.Builder
	for _, f := range features {
		labels := f.Labels.ID
		if lang == "en" {
			labels = f.Labels.EN
		}
		access := map[string]string{"all": "every account", "admin": "admin and superadmin", "superadmin": "superadmin only"}[f.Access]
		fmt.Fprintf(&b, "\nFEATURE: %s (opened from the Applications menu)\nWhat it does: %s\nWho can use it: %s\nTexts shown on its screens (button names, field labels, hints, messages):\n",
			f.Name.in(lang), f.Description.in(lang), access)
		for _, label := range labels {
			b.WriteString("  " + label + "\n")
		}
		for _, slug := range f.Official {
			for _, d := range official {
				if d.Slug == slug {
					fmt.Fprintf(&b, "Official article about it (accurate, do not repeat it word for word):\n%s\n", clipText(d.Content, 6000))
				}
			}
		}
	}
	return b.String()
}

const docGroundingRules = `
- Write only about what the material shows. Use window, button and field names EXACTLY as they appear in the screen texts, in **bold**.
- Never invent menus, buttons, settings, commands, ports, file paths or features. If the material does not say how something works, leave it out instead of guessing.
- Screen texts with {placeholders} are templates: write the meaning, not the braces.`

type docCoverage struct {
	Key         string          `json:"key"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Access      string          `json:"access"`
	Posts       []docCoveredRef `json:"posts"`
}

type docCoveredRef struct {
	ID     int64  `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
}

// docCoverageOf lists every feature with the posts that explain it; official articles carry the negative ids of the docs table.
func docCoverageOf(lang string, local, official []database.Doc) []docCoverage {
	taken := make(map[string]bool, len(local))
	for _, d := range local {
		taken[d.Slug] = true
	}
	out := make([]docCoverage, 0, len(docFeatures))
	for _, f := range docFeatures {
		c := docCoverage{Key: f.Key, Name: f.Name.in(lang), Description: f.Description.in(lang), Access: f.Access, Posts: []docCoveredRef{}}
		for _, d := range local {
			if d.FeatureKey == f.Key {
				c.Posts = append(c.Posts, docCoveredRef{ID: d.ID, Title: d.Title, Status: d.Status})
			}
		}
		for i, d := range official {
			if taken[d.Slug] {
				continue
			}
			for _, slug := range f.Official {
				if d.Slug == slug {
					c.Posts = append(c.Posts, docCoveredRef{ID: int64(-(i + 1)), Title: d.Title, Status: "official"})
				}
			}
		}
		out = append(out, c)
	}
	return out
}

// firstUncoveredDocFeature is the next feature without any post, in catalog order.
func firstUncoveredDocFeature(coverage []docCoverage) *docFeature {
	for _, c := range coverage {
		if len(c.Posts) == 0 {
			return findDocFeature(c.Key)
		}
	}
	return nil
}

func (s *Server) allLocalDocs(includeDrafts bool) ([]database.Doc, error) {
	var out []database.Doc
	for page := 0; page < 50; page++ {
		part, total, err := s.database.ListDocs("", 100, page*100, includeDrafts)
		if err != nil {
			return nil, err
		}
		out = append(out, part...)
		if int64(len(out)) >= total || len(part) == 0 {
			break
		}
	}
	return out, nil
}

func (s *Server) handleDocFeatures(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	local, err := s.allLocalDocs(auth.IsAdmin(u.Role))
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"features": docCoverageOf(r.URL.Query().Get("lang"), local, s.officialDocs(r.Context()))})
}
