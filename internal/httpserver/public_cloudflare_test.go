package httpserver

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
)

// A domain of the seller can get its DNS record at Cloudflare in one press: an A record for the address of this server, in the zone
// that holds the domain, never over another record. Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationRouteGetsItsDNSRecordAtCloudflare(t *testing.T) {
	f := newPublicFixture(t)
	var mu sync.Mutex
	var created []string
	records := map[string]string{} // name -> JSON array of the records that exist
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		mu.Lock()
		defer mu.Unlock()
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/zones":
			_, _ = w.Write([]byte(`{"success":true,"errors":[],"result":[{"id":"z-short","name":"example.com"},{"id":"z-long","name":"blog.example.com"},{"id":"z-other","name":"other.org"}]}`))
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/dns_records"):
			existing := records[r.URL.Query().Get("name")]
			if existing == "" {
				existing = "[]"
			}
			_, _ = w.Write([]byte(`{"success":true,"errors":[],"result":` + existing + `}`))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/dns_records"):
			created = append(created, r.URL.Path+" "+string(body))
			_, _ = w.Write([]byte(`{"success":true,"errors":[],"result":{"id":"r1","type":"A","name":"x","content":"203.0.113.10"}}`))
		default:
			w.WriteHeader(404)
			_, _ = w.Write([]byte(`{"success":false,"errors":[{"code":1,"message":"unexpected"}]}`))
		}
	}))
	defer srv.Close()
	f.s.testCloudflare = cloudflareapi.NewClient("token", "acct", "").WithBaseURL(srv.URL)

	route := f.createRoute(t, `{"hostname":"www.blog.example.com","kind":"panel"}`)
	elsewhere := f.createRoute(t, `{"hostname":"site.unknown.net","kind":"panel"}`)
	taken := f.createRoute(t, `{"hostname":"taken.example.com","kind":"panel"}`)
	mu.Lock()
	records["taken.example.com"] = `[{"id":"old","type":"CNAME","name":"taken.example.com","content":"somewhere.else.com"}]`
	mu.Unlock()
	dnsCall := func(id int64) (int, string) {
		return f.do(f.s.handleRouteCloudflareDNS, http.MethodPost, "/", "", strconv.FormatInt(id, 10))
	}
	createdCount := func() int {
		mu.Lock()
		defer mu.Unlock()
		return len(created)
	}

	// no address yet, and none of the machine is public
	if code, text := dnsCall(route.ID); code != http.StatusConflict || !strings.Contains(text, "set the address") {
		t.Fatalf("without an address: %d %s", code, text)
	}
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"target":"203.0.113.10"}`, ""); code != http.StatusOK {
		t.Fatalf("the address: %d %s", code, text)
	}

	code, text := dnsCall(route.ID)
	if code != http.StatusOK || !strings.Contains(text, `"created":true`) || !strings.Contains(text, `"type":"A"`) || !strings.Contains(text, `"zone":"blog.example.com"`) {
		t.Fatalf("the record is made in the zone with the longest name: %d %s", code, text)
	}
	mu.Lock()
	first := created[0]
	mu.Unlock()
	for _, want := range []string{"/zones/z-long/dns_records", `"content":"203.0.113.10"`, `"proxied":false`, `"name":"www.blog.example.com"`} {
		if !strings.Contains(first, want) {
			t.Fatalf("what was sent lacks %s: %s", want, first)
		}
	}
	// the record is there now: pressing again makes nothing
	mu.Lock()
	records["www.blog.example.com"] = `[{"id":"r1","type":"A","name":"www.blog.example.com","content":"203.0.113.10"}]`
	mu.Unlock()
	if code, text := dnsCall(route.ID); code != http.StatusOK || !strings.Contains(text, `"created":false`) || createdCount() != 1 {
		t.Fatalf("a second press: %d %s", code, text)
	}
	// another record at the name is never overwritten
	if code, text := dnsCall(taken.ID); code != http.StatusConflict || !strings.Contains(text, "already used by another DNS record") || createdCount() != 1 {
		t.Fatalf("another record: %d %s", code, text)
	}
	// a domain that is not in the account
	if code, text := dnsCall(elsewhere.ID); code != http.StatusConflict || !strings.Contains(text, "not in your Cloudflare account") {
		t.Fatalf("a domain outside the account: %d %s", code, text)
	}
	// a name as the address makes a CNAME
	if code, _ := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"target":"server.example.org"}`, ""); code != http.StatusOK {
		t.Fatal("the address as a name")
	}
	mu.Lock()
	records["www.blog.example.com"] = ""
	mu.Unlock()
	code, text = dnsCall(route.ID)
	mu.Lock()
	last := created[len(created)-1]
	mu.Unlock()
	if code != http.StatusOK || !strings.Contains(text, `"type":"CNAME"`) || !strings.Contains(last, `"content":"server.example.org"`) {
		t.Fatalf("a name: %d %s %s", code, text, last)
	}
	// without a Cloudflare account the answer says so
	f.s.testCloudflare = nil
	if code, text := dnsCall(route.ID); code != http.StatusConflict || !strings.Contains(text, "Cloudflare") {
		t.Fatalf("no account: %d %s", code, text)
	}
}

// When this server and Cloudflare are both set up, a buyer can pick the way; either one alone is the only way. Skipped without
// REN_TEST_DATABASE_URL.
func TestIntegrationBuyerPicksTheWayToConnectADomain(t *testing.T) {
	f := newPublicFixture(t)
	stubDNS(t)
	plan := f.plan(t, "pro", 75000, 0, 0)
	buyer, err := f.db.CreateUser("dewi", "dewi@example.com", "hash", "user", "Dewi")
	if err != nil {
		t.Fatal(err)
	}
	until := time.Now().Add(30 * 24 * time.Hour)
	if err := f.db.SetUserPlan(buyer.ID, plan.ID, &until); err != nil {
		t.Fatal(err)
	}
	f.s.testIssuer = &fakeIssuer{}
	call := func(handler http.HandlerFunc, method, path, body string) (int, string) {
		req := asUser(httptest.NewRequest(method, path, strings.NewReader(body)), buyer)
		req.RemoteAddr = "203.0.113.61:5000"
		rec := httptest.NewRecorder()
		handler(rec, req)
		return rec.Code, rec.Body.String()
	}
	view := func() string {
		_, text := call(f.s.handleListMyCustomDomains, http.MethodGet, "/", "")
		return text
	}

	// Cloudflare only
	if err := f.db.SetHostingState(customZoneStateKey, "zone-1"); err != nil {
		t.Fatal(err)
	}
	if err := f.db.SetHostingState(customTargetStateKey, "cname.reneo.my.id"); err != nil {
		t.Fatal(err)
	}
	if text := view(); !strings.Contains(text, `"providers":["cloudflare"]`) || !strings.Contains(text, `"provider":"cloudflare"`) {
		t.Fatalf("Cloudflare only: %s", text)
	}
	if code, text := call(f.s.handleCreateMyCustomDomain, http.MethodPost, "/", `{"hostname":"a.example.org","provider":"direct"}`); code != http.StatusConflict {
		t.Fatalf("this server is not set up for it: %d %s", code, text)
	}

	// both
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"enabled":true,"confirmPublicIp":true,"target":"203.0.113.10","buyerDomains":true}`, ""); code != http.StatusOK {
		t.Fatalf("this server on: %d %s", code, text)
	}
	text := view()
	if !strings.Contains(text, `"providers":["direct","cloudflare"]`) || !strings.Contains(text, `"provider":"direct"`) || !strings.Contains(text, `"cnameTarget":"cname.reneo.my.id"`) || !strings.Contains(text, `"directTarget":"203.0.113.10"`) {
		t.Fatalf("both: %s", text)
	}
	if code, text := call(f.s.handleCheckCustomDomain, http.MethodGet, "/?hostname=b.example.org&provider=cloudflare", ""); code != http.StatusOK || !strings.Contains(text, `"target":"cname.reneo.my.id"`) || !strings.Contains(text, `"provider":"cloudflare"`) {
		t.Fatalf("the check for Cloudflare: %d %s", code, text)
	}
	if code, text := call(f.s.handleCheckCustomDomain, http.MethodGet, "/?hostname=b.example.org", ""); code != http.StatusOK || !strings.Contains(text, `"target":"203.0.113.10"`) || !strings.Contains(text, `"provider":"direct"`) {
		t.Fatalf("the check by default: %d %s", code, text)
	}
	if code, text := call(f.s.handleCreateMyCustomDomain, http.MethodPost, "/", `{"hostname":"c.example.org","provider":"carrier-pigeon"}`); code != http.StatusBadRequest {
		t.Fatalf("a way that does not exist: %d %s", code, text)
	}
	// Cloudflare picked, but the account of the seller is not connected
	if code, text := call(f.s.handleCreateMyCustomDomain, http.MethodPost, "/", `{"hostname":"d.example.org","provider":"cloudflare"}`); code != http.StatusServiceUnavailable {
		t.Fatalf("Cloudflare picked without an account: %d %s", code, text)
	}
	// this server picked
	if code, text := call(f.s.handleCreateMyCustomDomain, http.MethodPost, "/", `{"hostname":"e.example.org","provider":"direct"}`); code != http.StatusCreated || !strings.Contains(text, `"provider":"direct"`) {
		t.Fatalf("this server picked: %d %s", code, text)
	}
}
