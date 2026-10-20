package httpserver

import (
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"testing"
)

// the questions in the page shell must say what the landing page says
func TestLandingFAQMatchesTheLocale(t *testing.T) {
	raw, err := os.ReadFile("../../src/lib/locales/id.ts")
	if err != nil {
		t.Skip("locale file not available")
	}
	locale := string(raw)
	for i, f := range landingFAQ {
		for key, want := range map[string]string{"q": f.Question, "a": f.Answer} {
			line := "'landing.faq." + key + strconv.Itoa(i+1) + "': " + strconv.Quote(want)
			if !strings.Contains(locale, line) {
				t.Errorf("landing.faq.%s%d differs from the text in seo_landing.go: want %s", key, i+1, want)
			}
		}
	}
}

func TestLandingPageCarriesTextPlansAndStructuredData(t *testing.T) {
	boot := map[string]json.RawMessage{
		"hosting":  json.RawMessage(`{"enabled":true,"plans":[{"name":"Starter","tagline":"Satu situs","priceAmount":15000,"period":"monthly"}]}`),
		"revision": json.RawMessage(`{"revision":"x","version":"v1.2.3"}`),
	}
	page := (&Server{}).landingPage("https://p.example", boot)
	out := injectSEO(testIndex, page, "https://p.example")
	for _, want := range []string{
		`name="keywords"`, "homelab", "Starter: Rp 15.000 per bulan", "Pertanyaan umum",
		`"@type":"FAQPage"`, `"@type":"SoftwareApplication"`, `"softwareVersion":"1.2.3"`, "<h2>Fitur</h2>",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %q in the landing page shell", want)
		}
	}
	if strings.Count(out, "</script>") != 2 {
		t.Fatalf("structured data must stay in its own script block")
	}
	script := bootScript(map[string]json.RawMessage{"site": json.RawMessage(`{"landing":true,"x":"</script>"}`)})
	if strings.Count(script, "</script>") != 1 || !strings.HasPrefix(script, "<script>window.__REN_BOOT__=") {
		t.Fatalf("boot data must not be able to close the script early: %s", script)
	}
}
