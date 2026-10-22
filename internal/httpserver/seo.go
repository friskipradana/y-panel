package httpserver

import (
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/runtimepath"
)

// Search engines and AI crawlers: robots.txt, sitemap.xml, llms.txt, raw markdown for
// public articles, and per-page meta tags plus readable fallback content injected into
// the SPA shell (many AI crawlers do not run JavaScript).

const (
	siteName        = "Reneo Panel"
	siteTagline     = "Pembaruan kendali untuk server"
	siteDescription = "Reneo Panel adalah panel kontrol server Linux bergaya desktop: Docker, project, database, file, terminal, Cloudflare, pengguna, dan agen AI lewat MCP, dalam satu ruang kerja."
)

type seoPage struct {
	Title       string
	Description string
	Path        string
	Type        string // website | article
	Updated     time.Time
	Body        string // plain text fallback content
	Keywords    string
	Sections    []seoSection // headed blocks of the fallback content, for pages with more to say than a paragraph
	JSONLD      map[string]any
	// Boot is script markup that gives the page its first data (see bootPayload)
	Boot string
}

// publicBaseURL is the address crawlers should use: RENEO_PUBLIC_URL when set,
// otherwise the scheme and host the request arrived with.
func publicBaseURL(r *http.Request) string {
	if configured := strings.TrimRight(runtimepath.Getenv("PUBLIC_URL"), "/"); configured != "" {
		return configured
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

// orderBaseURL is the address put in the links a buyer gets (the page of the order): RENEO_PUBLIC_URL when set, else the main
// hosting domain, which is where buyers find the landing page, and only without one the address the form was opened from.
// A form opened from the main domain itself, or from a name under it, keeps the address it was opened from.
func (s *Server) orderBaseURL(r *http.Request) string {
	if configured := strings.TrimRight(runtimepath.Getenv("PUBLIC_URL"), "/"); configured != "" {
		return configured
	}
	if s.database != nil && s.database.IsConnected() {
		if main := s.mainHostingDomain(); main != nil && main.Name != "" {
			host := strings.ToLower(r.Host)
			if i := strings.LastIndex(host, ":"); i > 0 && !strings.Contains(host[i:], "]") {
				host = host[:i]
			}
			name := strings.ToLower(main.Name)
			if host == name || strings.HasSuffix(host, "."+name) {
				return publicBaseURL(r)
			}
			return "https://" + name
		}
	}
	return publicBaseURL(r)
}

// robotsTxtClosed keeps every well behaved crawler out
const robotsTxtClosed = "# Reneo: nothing here is for search engines or AI crawlers\nUser-agent: *\nDisallow: /\n"

func robotsTxt(base string) string {
	var b strings.Builder
	b.WriteString("# Reneo: public pages are open to search engines and AI crawlers\n")
	for _, agent := range []string{"*", "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Amazonbot", "DuckAssistBot", "MistralAI-User", "Meta-ExternalAgent"} {
		fmt.Fprintf(&b, "User-agent: %s\nAllow: /\nDisallow: /api/\nDisallow: /home\nDisallow: /login\n\n", agent)
	}
	fmt.Fprintf(&b, "Sitemap: %s/sitemap.xml\n", base)
	return b.String()
}

func sitemapXML(base string, docs []database.Doc, now time.Time) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	add := func(path string, mod time.Time, freq string) {
		fmt.Fprintf(&b, "  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq></url>\n",
			html.EscapeString(base+path), mod.UTC().Format("2006-01-02"), freq)
	}
	add("/", now, "weekly")
	add("/docs/mcp", now, "monthly")
	add("/articles", now, "daily")
	add("/terms", now, "yearly")
	add("/privacy", now, "yearly")
	for _, d := range docs {
		add("/articles/"+d.Slug, d.UpdatedAt, "monthly")
	}
	b.WriteString("</urlset>\n")
	return b.String()
}

func llmsTxt(base string, docs []database.Doc) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n> %s\n\n", siteName, siteDescription)
	b.WriteString("Reneo is a self-hosted server control panel (Go agent + React desktop UI). It manages Docker, projects, databases, files, terminals, Cloudflare tunnels and users, and exposes the same operations to AI agents through the Model Context Protocol (MCP).\n\n")
	b.WriteString(landingBriefing(base))
	b.WriteString("## Product\n\n")
	fmt.Fprintf(&b, "- [Home](%s/): overview, install command and demo account\n", base)
	fmt.Fprintf(&b, "- [MCP guide](%s/docs/mcp): connect Hermes, Claude Desktop, Cursor or cURL to the panel\n", base)
	fmt.Fprintf(&b, "- [Articles](%s/articles): guides and notes\n", base)
	fmt.Fprintf(&b, "- [Terms and Conditions](%s/terms): the rules for using a panel\n", base)
	fmt.Fprintf(&b, "- [Privacy Policy](%s/privacy): what a panel stores and where it is sent\n", base)
	if len(docs) > 0 {
		b.WriteString("\n## Articles\n\n")
		for _, d := range docs {
			line := fmt.Sprintf("- [%s](%s/articles/%s.md)", d.Title, base, d.Slug)
			if d.Excerpt != "" {
				line += ": " + oneLine(d.Excerpt, 160)
			}
			b.WriteString(line + "\n")
		}
	}
	b.WriteString("\n## Optional\n\n")
	b.WriteString("- [Source code and releases](https://github.com/friskipradana/y-panel)\n")
	return b.String()
}

func oneLine(text string, max int) string {
	text = strings.Join(strings.Fields(text), " ")
	if len(text) > max {
		text = text[:max] + "..."
	}
	return text
}

func plainText(markdown string) string {
	var out []string
	for _, line := range strings.Split(markdown, "\n") {
		line = strings.TrimSpace(line)
		line = strings.TrimLeft(line, "#>*-` ")
		if line != "" {
			out = append(out, line)
		}
	}
	return strings.Join(out, "\n")
}

// injectSEO writes the head tags and the no-JavaScript fallback into the SPA shell.
func injectSEO(index string, page seoPage, base string) string {
	canonical := base + page.Path
	title := html.EscapeString(page.Title)
	desc := html.EscapeString(oneLine(page.Description, 300))
	image := base + "/brand/og-image.png"

	var head strings.Builder
	fmt.Fprintf(&head, `<link rel="canonical" href="%s" />`+"\n", html.EscapeString(canonical))
	if page.Keywords != "" {
		fmt.Fprintf(&head, `<meta name="keywords" content="%s" />`+"\n", html.EscapeString(page.Keywords))
	}
	head.WriteString(page.Boot)
	fmt.Fprintf(&head, `<meta property="og:site_name" content="%s" />`+"\n", siteName)
	fmt.Fprintf(&head, `<meta property="og:type" content="%s" />`+"\n", page.Type)
	fmt.Fprintf(&head, `<meta property="og:title" content="%s" />`+"\n", title)
	fmt.Fprintf(&head, `<meta property="og:description" content="%s" />`+"\n", desc)
	fmt.Fprintf(&head, `<meta property="og:url" content="%s" />`+"\n", html.EscapeString(canonical))
	fmt.Fprintf(&head, `<meta property="og:image" content="%s" />`+"\n", html.EscapeString(image))
	head.WriteString(`<meta property="og:image:width" content="1200" />` + "\n")
	head.WriteString(`<meta property="og:image:height" content="630" />` + "\n")
	head.WriteString(`<meta name="twitter:card" content="summary_large_image" />` + "\n")
	fmt.Fprintf(&head, `<meta name="twitter:title" content="%s" />`+"\n", title)
	fmt.Fprintf(&head, `<meta name="twitter:description" content="%s" />`+"\n", desc)
	if page.JSONLD != nil {
		if raw, err := json.Marshal(page.JSONLD); err == nil {
			// keep the document from being closed early by "</script>" in the data
			safe := strings.ReplaceAll(string(raw), "</", `<\/`)
			fmt.Fprintf(&head, `<script type="application/ld+json">%s</script>`+"\n", safe)
		}
	}

	out := index
	out = replaceFirst(out, `<html lang="en">`, `<html lang="id">`)
	if strings.Contains(out, "<title>Reneo Panel</title>") {
		out = replaceFirst(out, "<title>Reneo Panel</title>", "<title>"+title+"</title>")
	} else {
		out = replaceFirst(out, "<title>Reneo</title>", "<title>"+title+"</title>")
	}
	out = replaceMetaDescription(out, desc)
	out = strings.Replace(out, "</head>", head.String()+"</head>", 1)

	var body strings.Builder
	fmt.Fprintf(&body, "<main><h1>%s</h1><p>%s</p>", title, desc)
	for _, para := range strings.Split(page.Body, "\n") {
		if para = strings.TrimSpace(para); para != "" {
			fmt.Fprintf(&body, "<p>%s</p>", html.EscapeString(para))
		}
	}
	for _, section := range page.Sections {
		fmt.Fprintf(&body, "<section><h2>%s</h2>", html.EscapeString(section.Heading))
		for _, text := range section.Text {
			fmt.Fprintf(&body, "<p>%s</p>", html.EscapeString(text))
		}
		if len(section.Items) > 0 {
			body.WriteString("<ul>")
			for _, item := range section.Items {
				fmt.Fprintf(&body, "<li>%s</li>", html.EscapeString(item))
			}
			body.WriteString("</ul>")
		}
		body.WriteString("</section>")
	}
	body.WriteString(`<nav><a href="/">Reneo</a> <a href="/articles">Articles</a> <a href="/docs/mcp">MCP guide</a></nav></main>`)
	out = strings.Replace(out, `<div id="root"></div>`, `<div id="root">`+body.String()+`</div>`, 1)
	return out
}

func replaceFirst(s, old, new string) string { return strings.Replace(s, old, new, 1) }

func replaceMetaDescription(index, desc string) string {
	const marker = `<meta name="description" content="`
	start := strings.Index(index, marker)
	if start < 0 {
		return strings.Replace(index, "</head>", `<meta name="description" content="`+desc+`" />`+"\n</head>", 1)
	}
	valueStart := start + len(marker)
	end := strings.Index(index[valueStart:], `"`)
	if end < 0 {
		return index
	}
	return index[:valueStart] + desc + index[valueStart+end:]
}

func (s *Server) seoPageFor(r *http.Request, base string, boot map[string]json.RawMessage) (seoPage, bool) {
	path := strings.TrimRight(r.URL.Path, "/")
	switch {
	case path == "":
		return s.landingPage(base, boot), true
	case path == "/docs/mcp":
		return seoPage{
			Title:       "Hubungkan agen AI ke Reneo (MCP) | " + siteName,
			Description: "Panduan menghubungkan Hermes, Claude Desktop, Cursor atau cURL ke Reneo lewat Model Context Protocol: token API, konfigurasi, dan katalog tool.",
			Path:        "/docs/mcp",
			Type:        "article",
			Body:        "Buat token API di Settings, tambahkan server MCP Reneo ke klien Anda, lalu minta agen memeriksa server, Docker, file, dan Cloudflare.",
		}, true
	case path == "/terms":
		return seoPage{
			Title:       "Syarat dan Ketentuan | " + siteName,
			Description: "Aturan memakai panel Reneo: akun, pemakaian yang diizinkan, paket dan pembayaran, masa berlaku, dan penghentian.",
			Path:        "/terms",
			Type:        "article",
			Body:        "Setiap panel dijalankan oleh penyelenggaranya. Syarat ini mengatur akun, pemakaian, pesanan, pembayaran, masa berlaku, dan penghentian.",
		}, true
	case path == "/privacy":
		return seoPage{
			Title:       "Kebijakan Privasi | " + siteName,
			Description: "Data apa yang disimpan panel Reneo, untuk apa dipakai, layanan pihak ketiga yang dihubungi, dan berapa lama data disimpan.",
			Path:        "/privacy",
			Type:        "article",
			Body:        "Tidak ada analitik atau pelacak iklan. Panel hanya menghubungi GitHub dan layanan yang diaktifkan penyelenggara.",
		}, true
	case path == "/articles":
		docs := s.publicArticles()
		lines := make([]string, 0, len(docs))
		for _, d := range docs {
			lines = append(lines, d.Title+": "+oneLine(d.Excerpt, 140))
		}
		return seoPage{
			Title:       "Artikel | " + siteName,
			Description: "Panduan dan catatan Reneo yang terbuka untuk umum.",
			Path:        "/articles",
			Type:        "website",
			Body:        strings.Join(lines, "\n"),
		}, true
	case strings.HasPrefix(path, "/articles/"):
		slug := strings.TrimPrefix(path, "/articles/")
		if !publicSlugRe.MatchString(slug) {
			return seoPage{}, false
		}
		doc := s.findPublicDoc(r.Context(), slug)
		if doc == nil {
			return seoPage{}, false
		}
		return seoPage{
			Title:       doc.Title + " | " + siteName,
			Description: doc.Excerpt,
			Path:        "/articles/" + doc.Slug,
			Type:        "article",
			Updated:     doc.UpdatedAt,
			Body:        plainText(doc.Content),
			JSONLD: map[string]any{
				"@context":         "https://schema.org",
				"@type":            "Article",
				"headline":         doc.Title,
				"description":      doc.Excerpt,
				"dateModified":     doc.UpdatedAt.UTC().Format(time.RFC3339),
				"datePublished":    doc.CreatedAt.UTC().Format(time.RFC3339),
				"mainEntityOfPage": base + "/articles/" + doc.Slug,
				"publisher":        map[string]any{"@type": "Organization", "name": siteName},
			},
		}, true
	}
	return seoPage{}, false
}

// seoFrontend wraps the frontend file server with the crawler-facing routes.
func (s *Server) seoFrontend(next http.Handler, frontendDir string) http.Handler {
	indexPath := filepath.Join(frontendDir, "index.html")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			next.ServeHTTP(w, r)
			return
		}
		base := publicBaseURL(r)
		path := r.URL.Path

		// switched off from Settings: nothing is offered to crawlers
		if !s.indexingAllowed() {
			w.Header().Set("X-Robots-Tag", "noindex, nofollow")
			switch path {
			case "/robots.txt":
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				_, _ = w.Write([]byte(robotsTxtClosed))
				return
			case "/sitemap.xml", "/llms.txt":
				http.NotFound(w, r)
				return
			}
		}

		switch {
		case path == "/robots.txt":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte(robotsTxt(base)))
			return
		case path == "/sitemap.xml":
			w.Header().Set("Content-Type", "application/xml; charset=utf-8")
			_, _ = w.Write([]byte(sitemapXML(base, s.publicArticles(), time.Now())))
			return
		case path == "/llms.txt":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte(llmsTxt(base, s.publicArticles())))
			return
		case strings.HasPrefix(path, "/articles/") && strings.HasSuffix(path, ".md"):
			slug := strings.TrimSuffix(strings.TrimPrefix(path, "/articles/"), ".md")
			if !publicSlugRe.MatchString(slug) {
				http.NotFound(w, r)
				return
			}
			doc := s.findPublicDoc(r.Context(), slug)
			if doc == nil {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
			fmt.Fprintf(w, "# %s\n\n%s\n", doc.Title, doc.Content)
			return
		}

		var boot map[string]json.RawMessage
		if acceptsHTML(r) {
			boot = s.bootPayload(r)
		}
		if page, ok := s.seoPageFor(r, base, boot); ok && acceptsHTML(r) {
			raw, err := os.ReadFile(indexPath)
			if err == nil {
				page.Boot = bootScript(boot)
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Header().Set("Cache-Control", "no-cache")
				writeMaybeGzipped(w, r, []byte(injectSEO(string(raw), page, base)))
				return
			}
		}

		// the signed-in app and the login form are not for search results
		if path == "/home" || path == "/login" || strings.HasPrefix(path, "/home/") {
			w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		}
		next.ServeHTTP(w, r)
	})
}
