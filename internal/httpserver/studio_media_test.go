package httpserver

import (
	"strings"
	"testing"
)

func TestCleanAIImagesKeepsOnlySafeAddresses(t *testing.T) {
	stored := "/api/v1/public/doc-images/" + strings.Repeat("a", 40) + ".png"
	got := cleanAIImages([]aiImageRef{
		{URL: stored, Name: "toko\n\"depan\""},
		{URL: "https://cdn.example.com/a.jpg"},
		{URL: "javascript:alert(1)"},
		{URL: "http://example.com/a.png"},
		{URL: "/api/v1/users"},
		{URL: `https://x.test/a.png"><script>`},
	})
	if len(got) != 2 || got[0].URL != stored || got[1].URL != "https://cdn.example.com/a.jpg" {
		t.Fatalf("unexpected images: %+v", got)
	}
	if strings.ContainsAny(got[0].Name, "\n\"") {
		t.Fatalf("name not cleaned: %q", got[0].Name)
	}
	if !strings.Contains(aiImagesPrompt(got, false), stored) || !strings.Contains(aiImagesPrompt(got, true), "![") {
		t.Fatal("prompt misses the images")
	}
	if aiImagesPrompt(nil, true) != "" {
		t.Fatal("no images, no prompt text")
	}
}

func TestEnsureCompleteHTML(t *testing.T) {
	if err := ensureCompleteHTML("<!DOCTYPE html><html><body><h1>ok</h1></body></html>"); err != nil {
		t.Fatalf("complete page refused: %v", err)
	}
	if err := ensureCompleteHTML("<!DOCTYPE html><html><body><section>"); err == nil {
		t.Fatal("a cut-off page must be refused")
	}
	if err := ensureCompleteHTML(""); err != nil {
		t.Fatalf("no HTML is not an error here: %v", err)
	}
}
