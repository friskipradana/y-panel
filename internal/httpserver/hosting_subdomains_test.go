package httpserver

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestValidateSubdomainLabel(t *testing.T) {
	for _, ok := range []string{"abc", "toko-saya", "budi2026", "a1b", strings.Repeat("a", 32)} {
		if err := validateSubdomainLabel(ok); err != nil {
			t.Errorf("%q must be accepted: %v", ok, err)
		}
	}
	for name, bad := range map[string]string{
		"too short":        "ab",
		"too long":         strings.Repeat("a", 33),
		"uppercase":        "Toko",
		"space":            "my shop",
		"underscore":       "my_shop",
		"dot":              "a.b.c",
		"leading dash":     "-abc",
		"trailing dash":    "abc-",
		"double dash":      "ab--cd",
		"punycode":         "xn--e1afmkfd",
		"slash":            "a/b",
		"unicode":          "tökö",
		"reserved admin":   "admin",
		"reserved www":     "www",
		"reserved mail":    "mail",
		"reserved panel":   "panel",
		"reserved reneo":   "reneo",
		"reserved support": "support",
		"empty":            "",
	} {
		if validateSubdomainLabel(bad) == nil {
			t.Errorf("%s (%q) must be rejected", name, bad)
		}
	}
}

func TestPanelService(t *testing.T) {
	for bind, want := range map[string]string{"0.0.0.0:8787": "http://localhost:8787", "127.0.0.1:9000": "http://localhost:9000", ":8080": "http://localhost:8080", "": "http://localhost:8787"} {
		if got := panelService(bind); got != want {
			t.Errorf("%q: got %q want %q", bind, got, want)
		}
	}
}

func TestPlanHostingRoutes(t *testing.T) {
	rows := []database.HostingSubdomain{
		{ID: 1, UserID: 10, Hostname: "b.example.com", Status: subdomainActive},
		{ID: 2, UserID: 10, Hostname: "a.example.com", Status: subdomainPending},
		{ID: 3, UserID: 10, Hostname: "c.example.com", Status: subdomainSuspended},
		{ID: 4, UserID: 11, Hostname: "d.example.com", Status: subdomainActive},
		{ID: 7, UserID: 10, Hostname: "g.example.com", Status: subdomainError},
	}
	owners := map[int64]bool{10: true, 11: false}
	const panel = "http://localhost:8787"

	served, skipped := planHostingRoutes(rows, true, owners, panel)
	var hosts []string
	for _, route := range served {
		hosts = append(hosts, route.subdomain.Hostname+"="+route.service)
	}
	want := "a.example.com=" + panel + ",b.example.com=" + panel + ",g.example.com=" + panel
	if strings.Join(hosts, ",") != want {
		t.Fatalf("served routes (sorted, retrying errors):\n got %v\nwant %s", hosts, want)
	}
	if skipped[3] != "" || skipped[4] == "" {
		t.Fatalf("a suspended row is skipped silently, a row of an inactive owner with a reason: %v", skipped)
	}
	if _, wrongly := skipped[1]; wrongly {
		t.Fatal("an active row of an active owner must be served")
	}

	// hosting mode off: nothing is served and no row gets a reason that changes its status
	none, all := planHostingRoutes(rows, false, owners, panel)
	if len(none) != 0 || len(all) != len(rows) {
		t.Fatalf("hosting off must serve nothing: %d served, %d skipped", len(none), len(all))
	}
	for id, reason := range all {
		if reason != "" {
			t.Errorf("row %d: hosting off must not write a reason, got %q", id, reason)
		}
	}
}

func TestIngressAndRulesKey(t *testing.T) {
	served, _ := planHostingRoutes([]database.HostingSubdomain{
		{ID: 1, UserID: 1, Hostname: "z.example.com", Status: subdomainActive},
		{ID: 2, UserID: 1, Hostname: "a.example.com", Status: subdomainActive},
	}, true, map[int64]bool{1: true}, "http://localhost:4100")
	rules := ingressFor(served)
	if len(rules) != 2 || rules[0].Hostname != "a.example.com" || rules[0].Service != "http://localhost:4100" {
		t.Fatalf("rules must follow the sorted hostnames: %+v", rules)
	}
	if rulesKey(rules) != "a.example.com>http://localhost:4100|z.example.com>http://localhost:4100" {
		t.Fatalf("unexpected key %q", rulesKey(rules))
	}
	if rulesKey(nil) != "" {
		t.Fatal("no rules, empty key")
	}
}

func TestJudgeDNS(t *testing.T) {
	const content = "tunnel-1.cfargotunnel.com"
	ours := cloudflareapi.DNSRecord{Type: "CNAME", Content: content}
	if judgeDNS(nil, content) != dnsFree {
		t.Fatal("no record means the name is free")
	}
	if judgeDNS([]cloudflareapi.DNSRecord{ours}, content) != dnsOurs {
		t.Fatal("our CNAME is ours")
	}
	if judgeDNS([]cloudflareapi.DNSRecord{{Type: "CNAME", Content: "TUNNEL-1.cfargotunnel.com."}}, content) != dnsOurs {
		t.Fatal("case and a trailing dot must not matter")
	}
	for name, record := range map[string]cloudflareapi.DNSRecord{
		"A record":       {Type: "A", Content: "203.0.113.5"},
		"MX record":      {Type: "MX", Content: "mail.example.com"},
		"TXT record":     {Type: "TXT", Content: "v=spf1"},
		"other tunnel":   {Type: "CNAME", Content: "tunnel-2.cfargotunnel.com"},
		"external CNAME": {Type: "CNAME", Content: "shops.example.net"},
	} {
		if judgeDNS([]cloudflareapi.DNSRecord{record}, content) != dnsTaken {
			t.Errorf("%s must count as taken", name)
		}
	}
	if judgeDNS([]cloudflareapi.DNSRecord{ours, {Type: "TXT", Content: "x"}}, content) != dnsTaken {
		t.Fatal("any foreign record at the name makes it taken")
	}
}

func TestHostnameFor(t *testing.T) {
	if got := hostnameFor("toko", " Example.COM "); got != "toko.example.com" {
		t.Fatalf("got %q", got)
	}
}

func TestSubdomainEndpointsNeedHostingMode(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	for name, call := range map[string]func(http.ResponseWriter, *http.Request){
		"create":   s.handleCreateMySubdomain,
		"check":    s.handleCheckSubdomain,
		"domain":   s.handleSetHostingDomain,
	} {
		rec := httptest.NewRecorder()
		call(rec, httptest.NewRequest(http.MethodPost, "/x", strings.NewReader("{}")))
		if rec.Code != http.StatusConflict {
			t.Errorf("%s with hosting off must answer 409, got %d", name, rec.Code)
		}
	}
}

func TestCleanOrderMessage(t *testing.T) {
	got, err := cleanOrderMessage("  Halo,\r\nsaya mau {plan}\x00\x07  ")
	if err != nil || got != "Halo,\nsaya mau {plan}" {
		t.Fatalf("got %q err=%v", got, err)
	}
	if _, err := cleanOrderMessage(strings.Repeat("a", maxOrderMessageLen+1)); err == nil {
		t.Fatal("a message over the limit must be refused")
	}
	if got, err := cleanOrderMessage(""); err != nil || got != "" {
		t.Fatalf("an empty message means the default: %q %v", got, err)
	}
}
