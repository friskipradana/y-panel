package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/publicproxy"
)

type fakeIssuer struct {
	mu                  sync.Mutex
	checks, obtains     []string
	checkErr, obtainErr error
}

func (f *fakeIssuer) CheckDomain(_ context.Context, host string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.checks = append(f.checks, host)
	return f.checkErr
}

func (f *fakeIssuer) Obtain(_ context.Context, host string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.obtains = append(f.obtains, host)
	return f.obtainErr
}

func (f *fakeIssuer) counts() (int, int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.checks), len(f.obtains)
}

// dnsStub answers the lookups of the tests
type dnsStub struct {
	mu    sync.Mutex
	txt   map[string][]string
	hosts map[string][]string
}

func (d *dnsStub) set(txt map[string][]string, hosts map[string][]string) {
	d.mu.Lock()
	d.txt, d.hosts = txt, hosts
	d.mu.Unlock()
}

func stubDNS(t *testing.T) *dnsStub {
	t.Helper()
	d := &dnsStub{txt: map[string][]string{}, hosts: map[string][]string{}}
	oldTXT, oldHost := lookupTXT, lookupHost
	lookupTXT = func(name string) ([]string, error) {
		d.mu.Lock()
		defer d.mu.Unlock()
		if v, ok := d.txt[name]; ok {
			return v, nil
		}
		return nil, errors.New("no such record")
	}
	lookupHost = func(name string) ([]string, error) {
		d.mu.Lock()
		defer d.mu.Unlock()
		if v, ok := d.hosts[name]; ok {
			return v, nil
		}
		return nil, errors.New("no such host")
	}
	t.Cleanup(func() { lookupTXT, lookupHost = oldTXT, oldHost })
	return d
}

// A buyer's own domain served by this server: the owner is proven by a TXT record, the domain must point at the server, the
// certificate is tried at the test service and then made, and only then it is live. Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationBuyerDomainServedByTheServer(t *testing.T) {
	f := newPublicFixture(t)
	dns := stubDNS(t)
	issuer := &fakeIssuer{}
	f.s.testIssuer = issuer
	directRefreshedAt.Range(func(k, _ any) bool { directRefreshedAt.Delete(k); return true })
	directCertTriedAt.Range(func(k, _ any) bool { directCertTriedAt.Delete(k); return true })

	plan := f.plan(t, "pro", 75000, 0, 0)
	buyer, err := f.db.CreateUser("dewi", "dewi@example.com", "hash", "user", "Dewi")
	if err != nil {
		t.Fatal(err)
	}
	until := time.Now().Add(30 * 24 * time.Hour)
	if err := f.db.SetUserPlan(buyer.ID, plan.ID, &until); err != nil {
		t.Fatal(err)
	}

	call := func(handler http.HandlerFunc, method, path, body, id string, user *database.User) (int, string) {
		req := asUser(httptest.NewRequest(method, path, strings.NewReader(body)), user)
		req.RemoteAddr = "203.0.113.60:5000"
		if id != "" {
			req.SetPathValue("id", id)
		}
		rec := httptest.NewRecorder()
		handler(rec, req)
		return rec.Code, rec.Body.String()
	}
	create := func() (database.HostingCustomDomain, int, string) {
		code, text := call(f.s.handleCreateMyCustomDomain, http.MethodPost, "/api/v1/me/custom-domains", `{"hostname":"Toko-Dewi.com"}`, "", buyer)
		var row database.HostingCustomDomain
		_ = json.Unmarshal([]byte(text), &row)
		return row, code, text
	}

	// nothing is set up: neither Cloudflare nor the server
	if _, code, text := create(); code != http.StatusConflict || !strings.Contains(text, "not set up") {
		t.Fatalf("nothing set up: %d %s", code, text)
	}

	// the seller turns the proxy on (with the confirmation) and sets the address buyers point at
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"enabled":true,"confirmPublicIp":true}`, ""); code != http.StatusOK {
		t.Fatalf("proxy on: %d %s", code, text)
	}
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"buyerDomains":true}`, ""); code != http.StatusBadRequest || !strings.Contains(text, "address buyers point") {
		t.Fatalf("buyer domains need an address: %d %s", code, text)
	}
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"target":"not an address!"}`, ""); code != http.StatusBadRequest {
		t.Fatalf("a bad address: %d %s", code, text)
	}
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"target":"203.0.113.10","buyerDomains":true}`, ""); code != http.StatusOK || !strings.Contains(text, `"buyerDomains":true`) {
		t.Fatalf("buyer domains on: %d %s", code, text)
	}

	// the list says how a new domain is served now
	_, text := call(f.s.handleListMyCustomDomains, http.MethodGet, "/", "", "", buyer)
	if !strings.Contains(text, `"provider":"direct"`) || !strings.Contains(text, `"target":"203.0.113.10"`) || !strings.Contains(text, `"ready":true`) {
		t.Fatalf("the buyer's view: %s", text)
	}

	row, code, text := create()
	if code != http.StatusCreated || row.Hostname != "toko-dewi.com" || row.Provider != "direct" || row.Status != "pending" || len(row.VerifyToken) < 16 || row.VerifiedAt != nil {
		t.Fatalf("a direct domain starts pending, with a token: %d %s", code, text)
	}
	if code, text := call(f.s.handleCheckCustomDomain, http.MethodGet, "/?hostname=other.example.org", "", "", buyer); code != http.StatusOK || !strings.Contains(text, `"provider":"direct"`) || !strings.Contains(text, `"available":true`) {
		t.Fatalf("availability goes through the server: %d %s", code, text)
	}
	if _, code, text := create(); code != http.StatusForbidden || !strings.Contains(text, "quota") {
		t.Fatalf("the plan has room for one domain: %d %s", code, text)
	}
	// nothing is served for it, and no certificate can be asked for, before its owner is proven
	f.s.forgetPublicRoutes()
	if _, ok := f.s.publicRoute("toko-dewi.com"); ok {
		t.Fatal("an unproven domain is not served")
	}

	state := func() database.HostingCustomDomain {
		got, _ := f.db.GetHostingCustomDomain(row.ID)
		return *got
	}
	refresh := func() database.HostingCustomDomain {
		code, text := call(f.s.handleRefreshMyCustomDomain, http.MethodPost, "/", "", strconv.FormatInt(row.ID, 10), buyer)
		if code != http.StatusOK {
			t.Fatalf("refresh: %d %s", code, text)
		}
		return state()
	}

	// 1: no TXT record yet
	if got := refresh(); got.Status != "pending" || got.Note != noteTXTMissing || got.VerifiedAt != nil {
		t.Fatalf("waiting for the TXT record: %+v", got)
	}
	// someone else's token is not proof
	dns.set(map[string][]string{"_reneo-verify.toko-dewi.com": {"reneo-verify=somebody-else"}}, nil)
	if got := refresh(); got.VerifiedAt != nil {
		t.Fatalf("a wrong token proves nothing: %+v", got)
	}

	// 2: the TXT record is right, the domain points nowhere
	dns.set(map[string][]string{"_reneo-verify.toko-dewi.com": {"reneo-verify=" + row.VerifyToken}}, nil)
	got := refresh()
	if got.VerifiedAt == nil || got.Status != "pending" || got.Note != noteDNSMissing {
		t.Fatalf("proven, but no address: %+v", got)
	}
	if checks, _ := issuer.counts(); checks != 0 {
		t.Fatal("no certificate is asked for while the domain does not point here")
	}
	f.s.forgetPublicRoutes()
	if route, ok := f.s.publicRoute("toko-dewi.com"); !ok || route.Kind != publicproxy.KindPanel {
		t.Fatalf("a proven domain may be served: %+v %v", route, ok)
	}

	// 3: it points at another address
	dns.set(map[string][]string{"_reneo-verify.toko-dewi.com": {"reneo-verify=" + row.VerifyToken}}, map[string][]string{"toko-dewi.com": {"198.51.100.7"}})
	if got := refresh(); got.Note != noteDNSWrong+"198.51.100.7" {
		t.Fatalf("pointing elsewhere: %+v", got)
	}

	// 4: it points here, the test certificate fails: tried again only after a while (a forced check goes at once)
	dns.set(map[string][]string{"_reneo-verify.toko-dewi.com": {"reneo-verify=" + row.VerifyToken}}, map[string][]string{"toko-dewi.com": {"203.0.113.10"}})
	issuer.checkErr = errors.New("port 80 is closed")
	got = refresh()
	if got.Status != "pending" || got.SSLStatus != "error" || got.Note != noteCertFailed+"port 80 is closed" {
		t.Fatalf("the test certificate failed: %+v", got)
	}
	if checks, obtains := issuer.counts(); checks != 1 || obtains != 0 {
		t.Fatalf("the real certificate is not asked for after a failed test: %d %d", checks, obtains)
	}
	// a poll within the wait does not ask again
	f.s.refreshDirectCustomDomain(state(), false)
	if checks, _ := issuer.counts(); checks != 1 {
		t.Fatalf("a poll does not hammer the service: %d", checks)
	}

	// 5: fixed: the test passes, the real certificate is made, the domain is live and its owner is told
	issuer.checkErr = nil
	got = refresh()
	if got.Status != "active" || got.SSLStatus != "active" || got.Note != "" {
		t.Fatalf("live: %+v", got)
	}
	if checks, obtains := issuer.counts(); checks != 2 || obtains != 1 || issuer.obtains[0] != "toko-dewi.com" {
		t.Fatalf("the test, then the real one: %d %d", checks, obtains)
	}
	if note := lastNotification(t, f.db, buyer.ID); !strings.Contains(note, "toko-dewi.com") {
		t.Fatalf("the owner is told: %q", note)
	}
	// and it is the address of the buyer's panel, for the buyer only
	forgetHostingHosts()
	if owner := f.s.hostingHostOwner("toko-dewi.com"); owner != buyer.ID {
		t.Fatalf("the domain belongs to its buyer: %d", owner)
	}

	// the tunnel never carries it
	if rules := f.s.customIngress("http://127.0.0.1:8787", true); len(rules) != 0 {
		t.Fatalf("not a tunnel rule: %+v", rules)
	}
	// the proxy does not take a domain that the buyer registers for the panel of the server
	if _, err := f.db.CreatePublicRoute(database.PublicRoute{Hostname: "taken.example.org", Kind: "panel", Enabled: true}, 0); err != nil {
		t.Fatal(err)
	}
	if reason := f.s.customDomainAvailability("taken.example.org", "203.0.113.10"); !strings.Contains(reason, "in use") {
		t.Fatalf("a domain the seller registered: %q", reason)
	}

	// a suspended account is not served
	if err := f.db.UpdateUser(buyer.ID, map[string]any{"status": "suspended"}); err != nil {
		t.Fatal(err)
	}
	f.s.forgetPublicRoutes()
	if _, ok := f.s.publicRoute("toko-dewi.com"); ok {
		t.Fatal("the domain of a suspended account is not served")
	}
	if err := f.db.UpdateUser(buyer.ID, map[string]any{"status": "active"}); err != nil {
		t.Fatal(err)
	}

	// removing it
	if code, _ := call(f.s.handleDeleteMyCustomDomain, http.MethodDelete, "/", "", strconv.FormatInt(row.ID, 10), buyer); code != http.StatusOK {
		t.Fatalf("delete: %d", code)
	}
	f.s.forgetPublicRoutes()
	if _, ok := f.s.publicRoute("toko-dewi.com"); ok {
		t.Fatal("a deleted domain is not served")
	}

	// when the proxy stops, new domains no longer go through the server
	f.s.stopPublicProxy()
	f.s.testIssuer = nil
	if _, code, text := create(); code != http.StatusConflict || !strings.Contains(text, "not set up") {
		t.Fatalf("with the proxy off: %d %s", code, text)
	}
}
