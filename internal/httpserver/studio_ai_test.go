package httpserver

import (
	"testing"
	"time"
)

func TestParseGeneratedStudioPageLanding(t *testing.T) {
	raw := "```json\n" + `{
		"slug": "Kopi Nusantara!",
		"title": "Kopi Segar Langsung dari Petani — Tanpa Perantara",
		"subtitle": "Pesan biji kopi pilihan untuk kafe Anda.",
		"brandName": "Kopi Nusantara",
		"themeTone": "emerald",
		"ctaLabel": "Pesan Sekarang",
		"ctaUrl": "https://wa.me/6281234567890",
		"sections": [
			{
				"type": "stats",
				"heading": "Angka Kami",
				"items": [{"title": "120+", "description": "Kafe mitra"}]
			},
			{
				"type": "pricing",
				"heading": "Paket Harga",
				"items": [
					{"title": "Starter", "price": "Rp 500.000", "bullets": ["5 kg biji", "Gratis ongkir"], "highlight": true}
				]
			}
		]
	}` + "\n```"

	page, err := parseGeneratedStudioPage(raw, "landing")
	if err != nil {
		t.Fatalf("expected valid parse, got error: %v", err)
	}
	if page.Slug != "kopi-nusantara" {
		t.Fatalf("unexpected slug: %q", page.Slug)
	}
	if page.ThemeTone != "emerald" {
		t.Fatalf("unexpected theme tone: %q", page.ThemeTone)
	}
	if len(page.Sections) != 2 || page.Sections[0].Type != "stats" || page.Sections[1].Type != "pricing" {
		t.Fatalf("unexpected sections: %+v", page.Sections)
	}
}

func TestParseStudioChatResponse(t *testing.T) {
	raw := `{
		"reply": "Warna diubah ke emerald dan testimoni pelanggan ditambahkan.",
		"page": {
			"slug": "resto-kita",
			"title": "Restoran Keluarga Hangat",
			"subtitle": "Menu tradisional dimasak segar setiap hari.",
			"brandName": "Resto Kita",
			"themeTone": "emerald",
			"sections": [
				{"type": "testimonials", "heading": "Kata Pelanggan", "items": [{"title": "Budi", "badge": "Pelanggan", "description": "Makanannya enak."}]}
			]
		}
	}`
	res, err := parseStudioChatResponse(raw, "landing")
	if err != nil {
		t.Fatalf("expected valid chat parse, got: %v", err)
	}
	if res.Reply == "" || res.Page.ThemeTone != "emerald" || len(res.Page.Sections) != 1 || res.Page.Sections[0].Type != "testimonials" {
		t.Fatalf("unexpected result: %+v", res)
	}
}

func TestComputeNextStudioRunAndPickTopic(t *testing.T) {
	now := time.Date(2026, 11, 28, 10, 30, 0, 0, time.UTC)
	daily := computeNextStudioRun(now, "daily", 9, 1)
	if daily.Day() != 29 || daily.Hour() != 9 {
		t.Fatalf("expected tomorrow 09:00, got %v", daily)
	}
	hourly := computeNextStudioRun(now, "hourly", 9, 1)
	if !hourly.Equal(time.Date(2026, 11, 28, 11, 0, 0, 0, time.UTC)) {
		t.Fatalf("expected 11:00, got %v", hourly)
	}
	next := pickNextScheduleTopic([]string{"Docker Static IP", "Backup Otomatis"}, []string{"docker static ip"})
	if next != "Backup Otomatis" {
		t.Fatalf("expected Backup Otomatis, got %q", next)
	}
}
