package httpserver

import (
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

const testIndex = `<!doctype html><html><head><meta name="description" content="old" /><title>Reneo</title></head><body><div id="root"></div></body></html>`

func TestRobotsAllowsAIAndHidesApp(t *testing.T) {
	out := robotsTxt("https://panel.example.com")
	for _, want := range []string{"User-agent: GPTBot", "User-agent: ClaudeBot", "Disallow: /api/", "Disallow: /home", "Sitemap: https://panel.example.com/sitemap.xml"} {
		if !strings.Contains(out, want) {
			t.Errorf("robots.txt missing %q", want)
		}
	}
}

func TestSitemapListsPublicArticles(t *testing.T) {
	docs := []database.Doc{{Slug: "panduan-awal", UpdatedAt: time.Date(2026, 10, 12, 0, 0, 0, 0, time.UTC)}}
	out := sitemapXML("https://p.example", docs, time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC))
	for _, want := range []string{"<loc>https://p.example/</loc>", "<loc>https://p.example/articles/panduan-awal</loc>", "<lastmod>2026-10-12</lastmod>", "<loc>https://p.example/docs/mcp</loc>"} {
		if !strings.Contains(out, want) {
			t.Errorf("sitemap missing %q:\n%s", want, out)
		}
	}
}

func TestLlmsTxtPointsToMarkdown(t *testing.T) {
	out := llmsTxt("https://p.example", []database.Doc{{Title: "Panduan awal", Slug: "panduan-awal", Excerpt: "Langkah pertama"}})
	if !strings.HasPrefix(out, "# Reneo") || !strings.Contains(out, "(https://p.example/articles/panduan-awal.md): Langkah pertama") {
		t.Fatalf("unexpected llms.txt:\n%s", out)
	}
}

func TestInjectSEOEscapesAndAddsStructuredData(t *testing.T) {
	page := seoPage{
		Title:       `Judul <script>alert(1)</script>`,
		Description: `Deskripsi "berkutip"`,
		Path:        "/articles/x",
		Type:        "article",
		Body:        "baris satu\n<img src=x onerror=alert(1)>",
		JSONLD:      map[string]any{"@type": "Article", "headline": "</script><b>"},
	}
	out := injectSEO(testIndex, page, "https://p.example")
	if strings.Contains(out, "<script>alert(1)") || strings.Contains(out, "<img src=x") {
		t.Fatalf("user content must be escaped:\n%s", out)
	}
	for _, want := range []string{`<link rel="canonical" href="https://p.example/articles/x" />`, `og:type" content="article"`, `application/ld+json`, `<div id="root"><main data-seo>`, `<title>Judul &lt;script&gt;`} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in:\n%s", want, out)
		}
	}
	if strings.Count(out, "</script>") != 2 {
		t.Fatalf("JSON-LD must not be able to close the script early:\n%s", out)
	}
}

func TestPublicPageHasNoSplashAndABlockingStylesheet(t *testing.T) {
	index := `<html lang="en"><head><title>Reneo</title><link rel="stylesheet" crossorigin href="/assets/a.css" media="print" data-app-css onload="this.media=&quot;all&quot;"></head><body><div id="boot-splash" aria-hidden="true"><div class="b"><div class="t"></div></div></div>
<div id="root"></div></body></html>`
	out := injectSEO(index, seoPage{Title: "T", Description: "D", Path: "/", Type: "website", Body: "x"}, "https://p.example")
	if strings.Contains(out, "boot-splash\"") || strings.Contains(out, "data-app-css") || strings.Contains(out, "media=\"print\"") {
		t.Fatalf("no loading screen and no deferred stylesheet on a public page:\n%s", out)
	}
	if !strings.Contains(out, `<link rel="stylesheet" crossorigin href="/assets/a.css">`) || !strings.Contains(out, `data-theme`) {
		t.Fatalf("the stylesheet blocks and the theme is set early:\n%s", out)
	}
}
