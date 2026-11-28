package httpserver

import (
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestDocKnowledgeIsUsable(t *testing.T) {
	if len(docFeatures) < 20 {
		t.Fatalf("only %d features", len(docFeatures))
	}
	for _, f := range docFeatures {
		if f.Name.ID == "" || f.Name.EN == "" || len(f.Labels.ID) == 0 || len(f.Labels.EN) == 0 {
			t.Errorf("feature %q has no name or no screen texts", f.Key)
		}
	}
	got := matchDocFeatures("cara membuka port di firewall ufw")
	if len(got) == 0 || got[0].Key != "firewall" {
		t.Fatalf("topic did not match the firewall: %+v", got)
	}
	block := docKnowledgeBlock(got[:1], "id", nil)
	if !strings.Contains(block, "FEATURE: "+got[0].Name.ID) || !strings.Contains(block, got[0].Labels.ID[0]) {
		t.Fatalf("knowledge block misses the screen texts:\n%.300s", block)
	}
}

func TestDocCoverage(t *testing.T) {
	local := []database.Doc{{ID: 3, Title: "Panduan Docker", Slug: "panduan-docker", Status: "published", FeatureKey: "docker"}}
	official := []database.Doc{{Title: "Database", Slug: "mengelola-database"}}
	coverage := docCoverageOf("id", local, official)
	posts := map[string][]docCoveredRef{}
	for _, c := range coverage {
		posts[c.Key] = c.Posts
	}
	if len(posts["docker"]) != 1 || len(posts["database"]) != 1 || posts["database"][0].ID != -1 {
		t.Fatalf("unexpected coverage: docker=%+v database=%+v", posts["docker"], posts["database"])
	}
	next := firstUncoveredDocFeature(coverage)
	if next == nil || next.Key == "docker" || next.Key == "database" {
		t.Fatalf("next uncovered feature is wrong: %+v", next)
	}
}
