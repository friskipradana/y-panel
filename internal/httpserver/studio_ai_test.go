package httpserver

import "testing"

func TestParseGeneratedStudioLandingPage(t *testing.T) {
	raw := `<think>Drafting a restaurant landing page.</think>
` + "```json" + `
{
  "slug": "Kopi Nusantara Jakarta!",
  "title": "Kopi Specialty Sangrai Segar — Setiap Pagi",
  "subtitle": "Pesan biji kopi pilihan langsung dari roastery kami di Jakarta.",
  "brand_name": "Kopi Nusantara",
  "theme_tone": "emerald",
  "cta_label": "Pesan via WhatsApp",
  "cta_url": "https://wa.me/6281234567890",
  "sections": [
    {
      "type": "features",
      "heading": "Keunggulan Kami",
      "items": [
        {"title": "Sangrai Harian", "description": "Dikirim maksimal 24 jam setelah sangrai."},
      ],
    },
    {
      "type": "pricing",
      "heading": "Paket Langganan",
      "items": [
        {"title": "Hemat", "price": "Rp 185.000", "bullets": ["250g Arabika", "Gratis ongkir"], "highlight": true},
      ],
    },
  ],
}
` + "```"

	page, err := parseGeneratedStudioPage(raw, "landing")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if page.Slug != "kopi-nusantara-jakarta" {
		t.Fatalf("unexpected slug: %q", page.Slug)
	}
	if page.ThemeTone != "emerald" || page.BrandName != "Kopi Nusantara" {
		t.Fatalf("unexpected brand/tone: %+v", page)
	}
	if len(page.Sections) != 2 || len(page.Sections[1].Items) != 1 || !page.Sections[1].Items[0].Highlight {
		t.Fatalf("unexpected sections: %+v", page.Sections)
	}
}

func TestParseGeneratedStudioDocsFallback(t *testing.T) {
	raw := `{"title": "Panduan Deploy Aplikasi", "subtitle": "Langkah lengkap deploy ke server.", "markdown_body": "## Persiapan\n\nSiapkan server Linux.\n\n## Deploy\n\nJalankan perintah."}`
	page, err := parseGeneratedStudioPage(raw, "docs")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if page.Slug != "panduan-deploy-aplikasi" || page.MarkdownBody == "" {
		t.Fatalf("unexpected docs page: %+v", page)
	}
}
