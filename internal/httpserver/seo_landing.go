package httpserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
)

// What the public landing page says about itself, written for readers that do not run JavaScript: search engines and the
// crawlers of AI assistants. The text is injected into the page shell (seo.go) and offered again in llms.txt.

const (
	landingTitle       = "Reneo: panel homelab dan server Linux bergaya desktop (self-hosted, Docker, MCP)"
	landingDescription = "Reneo adalah panel self-hosted untuk homelab, home server, dan VPS Linux: kelola Docker, project, database, file, terminal, dan domain Cloudflare dari satu desktop di browser, dengan akses AI agent lewat MCP. Pasang dengan satu perintah."
	landingKeywords    = "homelab, home server, panel homelab, panel server Linux, server control panel, self-hosted, Docker, Cloudflare Tunnel, MCP, AI agent, VPS, mini PC, hosting"
	installCommand     = "curl -fsSL https://panel.reneo.my.id/install | sudo bash"
	sourceURL          = "https://github.com/friskipradana/y-panel"
)

type seoSection struct {
	Heading string
	Text    []string
	Items   []string
}

type faqEntry struct{ Question, Answer string }

// landingFAQ repeats the questions of the landing page (landing.faq.* in lib/locales/id.ts); a test keeps the two equal
var landingFAQ = []faqEntry{
	{"Reneo itu apa?", "Panel server Linux bergaya desktop. Docker, project, terminal, file, database, domain, dan log dibuka sebagai jendela di satu ruang kerja, dan semuanya bisa dikendalikan juga oleh AI agent lewat MCP."},
	{"Apakah Reneo gratis?", "Reneo bebas dipakai untuk belajar, internal, maupun komersial di server Anda sendiri, menurut Reneo Public Use License. Mengubah repositori resmi dan menerbitkan rilis resmi tetap memerlukan izin pemilik proyek."},
	{"Apakah saya perlu IP publik?", "Tidak. Di belakang router rumah atau CGNAT, domain bisa terbit lewat Cloudflare Tunnel tanpa membuka port. Bila server punya IP publik, Reneo juga bisa melayani domain langsung lewat proxy sendiri, nginx, atau Apache, setelah superadmin mengonfirmasinya."},
	{"Server saya kecil atau lama, apakah cocok?", "Cocok. Agent-nya satu program Go yang memakai puluhan megabyte RAM saat diam, dan installer tersedia untuk amd64 dan arm64. Mini PC, laptop lama, dan VPS kecil adalah sasaran utamanya."},
	{"Apakah Reneo mengunci konfigurasi Linux saya?", "Tidak. Docker compose, file, dan database tetap di lokasi standar Linux dan bisa diurus lewat SSH kapan saja. Anda tidak terkunci di dalam panel."},
	{"Apakah aman memberi akses ke AI agent?", "Agent memakai token API dengan aturan peran yang sama seperti pengguna, jadi ia hanya melihat dan mengubah apa yang boleh diubah akunnya. Aksi yang mengubah atau menghapus ditandai agar klien dapat meminta konfirmasi, dan token bisa dicabut kapan saja."},
	{"Bisakah saya menjual sebagian sumber daya server?", "Bisa. Mode hosting menyediakan paket, pesanan, voucher, faktur, dan perpanjangan, dengan pembayaran lewat transfer ke rekening Anda atau gateway. Subdomain dan domain pembeli butuh Cloudflare atau IP publik."},
	{"Data saya dikirim ke mana?", "Tidak ada analitik dan data pemakaian tidak dikirim ke proyek Reneo. Panel hanya menghubungi GitHub untuk versi dan artikel, dan layanan yang Anda aktifkan sendiri. Rinciannya ada di Kebijakan Privasi."},
	{"Bagaimana cara memasangnya?", "Tempel satu perintah di terminal server Linux Anda: " + installCommand + ". Langkah lengkap dan opsi lain ada di halaman pemasangan."},
	{"Ke mana saya melapor bila ada masalah?", "Untuk bug dan usulan fitur, buka isu di repositori GitHub proyek. Untuk akun atau pesanan di sebuah panel, hubungi penyelenggara panel itu."},
}

var landingFeatures = []string{
	"Docker: container, image, network, volume, template, dan log langsung",
	"Project: situs statis, Node.js, Python, dan PHP yang dijaga tetap hidup",
	"Database milik pengguna: PostgreSQL, MySQL, MariaDB, MongoDB, dan Redis",
	"File Manager dengan editor kode, dan terminal di browser",
	"Cloudflare: tunnel, DNS, dan domain tanpa membuka port router",
	"IP publik: domain dilayani langsung lewat proxy sendiri, nginx, atau Apache dengan sertifikat Let's Encrypt",
	"Pengguna, peran, kuota, dan mode hosting untuk menjual sebagian sumber daya (paket, pesanan, voucher, faktur)",
	"Pemantauan server, speed test, dan widget desktop",
	"MCP: AI agent seperti Claude Desktop dan Cursor mengendalikan server lewat token API",
}

var landingAudience = []string{
	"Homelab dan home server di belakang router rumah atau CGNAT",
	"Mini PC, laptop lama, dan VPS kecil dengan Linux amd64 atau arm64",
	"Orang yang ingin satu panel untuk Docker, domain, database, dan file tanpa menghapal banyak alat",
	"Pemilik server dengan sumber daya lebih yang ingin menjual hosting kecil",
	"Tim yang ingin AI agent membantu mengurus server dengan batas peran yang jelas",
}

// bootPayload gathers what the public pages ask for on load (site switches, demo account, plans, version), by running the
// same handlers the API uses, so the page can start with them and does not wait on four requests. A handler that
// refuses (the public pages are off for this address) leaves its key out.
func (s *Server) bootPayload(r *http.Request) map[string]json.RawMessage {
	boot := map[string]json.RawMessage{}
	add := func(key string, handler http.HandlerFunc) {
		rec := httptest.NewRecorder()
		// the handlers read the host to decide whether the landing page belongs to this address
		handler(rec, r.Clone(r.Context()))
		if rec.Code != http.StatusOK {
			return
		}
		if body := strings.TrimSpace(rec.Body.String()); json.Valid([]byte(body)) {
			boot[key] = json.RawMessage(body)
		}
	}
	add("site", s.handlePublicSite)
	add("demo", s.handlePublicDemo)
	add("hosting", s.requireLanding(s.handlePublicHosting))
	add("revision", s.handleFrontendRevision)
	return boot
}

func bootScript(boot map[string]json.RawMessage) string {
	if len(boot) == 0 {
		return ""
	}
	raw, err := json.Marshal(boot)
	if err != nil {
		return ""
	}
	// keep the document from being closed early by "</script>" in the data
	safe := strings.ReplaceAll(string(raw), "</", `<\/`)
	return `<script>window.__REN_BOOT__=` + safe + `</script>` + "\n"
}

type bootPlan struct {
	Name        string `json:"name"`
	Tagline     string `json:"tagline"`
	PriceAmount int64  `json:"priceAmount"`
	Period      string `json:"period"`
}

func bootPlans(boot map[string]json.RawMessage) []bootPlan {
	var hosting struct {
		Enabled bool       `json:"enabled"`
		Plans   []bootPlan `json:"plans"`
	}
	if raw, ok := boot["hosting"]; ok && json.Unmarshal(raw, &hosting) == nil && hosting.Enabled {
		return hosting.Plans
	}
	return nil
}

func periodWord(period string) string {
	switch period {
	case "yearly":
		return "per tahun"
	case "once":
		return "sekali bayar"
	}
	return "per bulan"
}

func (s *Server) landingPage(base string, boot map[string]json.RawMessage) seoPage {
	plans := bootPlans(boot)
	version := ""
	var revision struct {
		Version string `json:"version"`
	}
	if raw, ok := boot["revision"]; ok && json.Unmarshal(raw, &revision) == nil {
		version = strings.TrimPrefix(strings.TrimSpace(revision.Version), "v")
	}

	sections := []seoSection{
		{Heading: "Apa itu Reneo", Text: []string{
			"Reneo adalah panel server Linux bergaya desktop untuk homelab, home server, mini PC, dan VPS kecil. Docker, project, terminal, file, database, domain Cloudflare, dan log dibuka sebagai jendela di satu ruang kerja di browser. Semua operasi yang sama bisa dikendalikan AI agent lewat Model Context Protocol (MCP).",
			"Reneo dibaca re-ne-o. Agent-nya satu program Go yang ringan; antarmukanya React.",
		}},
		{Heading: "Cocok untuk", Items: landingAudience},
		{Heading: "Fitur", Items: landingFeatures},
		{Heading: "Cara memasang", Text: []string{
			"Tempel satu perintah di terminal server Linux (amd64 atau arm64): " + installCommand,
			"Langkah lengkap ada di " + base + "/install. Kode sumber dan rilis ada di " + sourceURL + ".",
		}},
	}
	if len(plans) > 0 {
		items := make([]string, 0, len(plans))
		for _, p := range plans {
			line := p.Name + ": " + rupiah(p.PriceAmount) + " " + periodWord(p.Period)
			if p.Tagline != "" {
				line += ". " + p.Tagline
			}
			items = append(items, line)
		}
		sections = append(sections, seoSection{Heading: "Paket hosting di panel ini", Items: items})
	}
	faqText := make([]string, 0, len(landingFAQ)*2)
	for _, f := range landingFAQ {
		faqText = append(faqText, f.Question, f.Answer)
	}
	sections = append(sections, seoSection{Heading: "Pertanyaan umum", Text: faqText})

	questions := make([]map[string]any, 0, len(landingFAQ))
	for _, f := range landingFAQ {
		questions = append(questions, map[string]any{
			"@type": "Question", "name": f.Question,
			"acceptedAnswer": map[string]any{"@type": "Answer", "text": f.Answer},
		})
	}
	app := map[string]any{
		"@type":                  "SoftwareApplication",
		"@id":                    base + "/#software",
		"name":                   siteName,
		"alternateName":          "Reneo server panel",
		"applicationCategory":    "DeveloperApplication",
		"applicationSubCategory": "Server control panel, homelab",
		"operatingSystem":        "Linux",
		"description":            landingDescription,
		"url":                    base + "/",
		"installUrl":             base + "/install",
		"featureList":            landingFeatures,
		"keywords":               landingKeywords,
		"inLanguage":             []string{"id", "en"},
		"license":                sourceURL + "/blob/HEAD/LICENSE",
		"sameAs":                 []string{sourceURL},
		"offers":                 map[string]any{"@type": "Offer", "price": "0", "priceCurrency": "USD"},
	}
	if version != "" {
		app["softwareVersion"] = version
	}
	return seoPage{
		Title:       landingTitle,
		Description: landingDescription,
		Keywords:    landingKeywords,
		Path:        "/",
		Type:        "website",
		Sections:    sections,
		JSONLD: map[string]any{
			"@context": "https://schema.org",
			"@graph": []any{
				app,
				map[string]any{"@type": "WebSite", "@id": base + "/#website", "name": siteName, "url": base + "/", "inLanguage": []string{"id", "en"}},
				map[string]any{"@type": "FAQPage", "@id": base + "/#faq", "mainEntity": questions},
			},
		},
	}
}

// landingBriefing is the plain version of the page for llms.txt
func landingBriefing(base string) string {
	var b strings.Builder
	b.WriteString("## What it is\n\n")
	b.WriteString("Reneo is a self-hosted, desktop-style control panel for homelabs, home servers, mini PCs and small VPSes running Linux (amd64 and arm64). One browser workspace opens Docker, projects (static, Node.js, Python, PHP), user databases (PostgreSQL, MySQL, MariaDB, MongoDB, Redis), a file manager with a code editor, a terminal, Cloudflare tunnels and DNS, and public domains served by its own proxy, nginx or Apache. The same operations are available to AI agents (Claude Desktop, Cursor and other MCP clients) through an API token with role limits.\n\n")
	b.WriteString("## Good fit when\n\n")
	for _, item := range landingAudience {
		b.WriteString("- " + item + "\n")
	}
	b.WriteString("\n## Install\n\n")
	fmt.Fprintf(&b, "One command on the Linux server: `%s`. Full steps: %s/install. Source and releases: %s.\n\n", installCommand, base, sourceURL)
	b.WriteString("## Questions and answers\n\n")
	for _, f := range landingFAQ {
		fmt.Fprintf(&b, "**%s** %s\n\n", f.Question, f.Answer)
	}
	return b.String()
}
