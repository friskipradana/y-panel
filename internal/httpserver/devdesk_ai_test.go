package httpserver

import "testing"

func TestParseGeneratedDevDocHandlesRealWorldLLMOutput(t *testing.T) {
	raw := `<think>Let me break down the 4 juta budget: domain 300rb, vps 800rb, jasa 2.9jt.</think>
Here is the requested JSON:
` + "```json" + `
{
  "client_name": "Budi Santoso",
  "client_company": "Restoran Nusantara",
  "title": "Website Restoran & Reservasi — Paket Lengkap",
  "summary": "Pembuatan website restoran dengan menu digital dan reservasi meja.",
  "dp_percent": "50%",
  "discount": "Rp 0",
  "items": [
    {"title": "Domain .com (1 Tahun)", "description": "Registrasi domain", "qty": "1", "unit": "Tahun", "unit_price": "Rp 300.000"},
    {"title": "Server & Hosting", "description": "VPS 1 tahun", "qty": 1.0, "unit": "Tahun", "price": "800rb"},
    {"title": "Jasa Pembuatan Website", "description": "Desain & pengembangan", "qty": 1, "unit": "Paket", "unitPrice": 2900000},
  ],
  "terms": [
    "DP 50% dibayarkan sebelum pengerjaan dimulai",
    "Garansi perbaikan bug 30 hari",
  ],
  "wa_message": "Halo Pak Budi,
Berikut penawaran website restoran sesuai diskusi kita.",
  "todos": [
    {"title": "Setup domain & DNS", "notes": "Arahkan ke server", "priority": "high"},
    "Desain halaman menu dan reservasi",
  ],
}
` + "```"

	doc, err := parseGeneratedDevDoc(raw)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	if doc.ClientName != "Budi Santoso" || doc.ClientCompany != "Restoran Nusantara" {
		t.Fatalf("unexpected client info: %+v", doc)
	}
	if doc.DPPercent != 50 {
		t.Fatalf("expected dpPercent 50, got %d", doc.DPPercent)
	}
	if len(doc.Items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(doc.Items))
	}
	if doc.Items[0].UnitPrice != 300000 || doc.Items[1].UnitPrice != 800000 || doc.Items[2].UnitPrice != 2900000 {
		t.Fatalf("unexpected item prices: %+v", doc.Items)
	}
	if len(doc.Todos) != 2 || doc.Todos[1].Priority != "medium" {
		t.Fatalf("unexpected todos: %+v", doc.Todos)
	}
	if doc.WAMessage == "" {
		t.Fatal("expected multiline waMessage to be preserved")
	}
}

func TestParseGeneratedDevDocUnwrapsEnvelopeAndRejectsEmpty(t *testing.T) {
	wrapped := `{"document": {"title": "Maintenance Server", "items": [{"title": "Monitoring", "unitPrice": 500000}]}}`
	doc, err := parseGeneratedDevDoc(wrapped)
	if err != nil {
		t.Fatalf("expected wrapped doc to parse, got: %v", err)
	}
	if doc.Title != "Maintenance Server" || len(doc.Items) != 1 || doc.Items[0].Subtotal != 500000 {
		t.Fatalf("unexpected wrapped parse result: %+v", doc)
	}

	if _, err := parseGeneratedDevDoc(`{}`); err == nil {
		t.Fatal("expected empty object to return an error")
	}
}
