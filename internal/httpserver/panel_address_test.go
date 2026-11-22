package httpserver

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// The panel address of a buyer comes with every plan and is not one of the plan's subdomains.
// Skipped without REN_TEST_DATABASE_URL.

func TestIntegrationTheMainDomainIsWherePanelAddressesAreMade(t *testing.T) {
	f := newHostingFixture(t)
	if f.s.mainHostingDomain() != nil {
		t.Fatal("no domain is offered yet")
	}
	// the first domain offered is the main one
	_ = f.db.SetHostingDomain("z-a", "alfa.test", true)
	_ = f.db.SetHostingDomain("z-b", "beta.test", true)
	if m := f.s.mainHostingDomain(); m == nil || m.Name != "alfa.test" {
		t.Fatalf("the first one offered is main: %+v", m)
	}
	// the owner can choose another, but only one that is offered
	if err := f.db.SetMainHostingDomain("z-b"); err != nil {
		t.Fatal(err)
	}
	if m := f.s.mainHostingDomain(); m.Name != "beta.test" {
		t.Fatalf("chosen: %+v", m)
	}
	if err := f.db.SetMainHostingDomain("z-nope"); err == nil {
		t.Fatal("a domain that is not offered cannot be main")
	}
	domains, _ := f.db.ListHostingDomains()
	mains := 0
	for _, d := range domains {
		if d.IsMain {
			mains++
		}
	}
	if mains != 1 {
		t.Fatalf("exactly one main domain, got %d", mains)
	}
	// stopping to offer the main domain hands the place to the one that is left
	_ = f.db.SetHostingDomain("z-b", "beta.test", false)
	if m := f.s.mainHostingDomain(); m == nil || m.Name != "alfa.test" {
		t.Fatalf("the place goes to the other offered domain: %+v", m)
	}
	_ = f.db.SetHostingDomain("z-a", "alfa.test", false)
	if f.s.mainHostingDomain() != nil {
		t.Fatal("nothing is offered, nothing is main")
	}
	// offering one again makes it main
	_ = f.db.SetHostingDomain("z-b", "beta.test", true)
	if m := f.s.mainHostingDomain(); m == nil || m.Name != "beta.test" {
		t.Fatalf("offered again: %+v", m)
	}
}

func TestIntegrationThePanelAddressDoesNotUseTheQuotaOfSubdomains(t *testing.T) {
	f := newHostingFixture(t)
	_ = f.db.SetHostingDomain("z1", "reneo.my.id", true)
	plan := f.plan(t, "kecil", 25000, 1, 0)
	u, _ := f.db.CreateUser("sari", "sari@example.com", "hash", auth.UserRole, "Sari")
	if err := f.s.applyUserPlan(u.ID, plan, nil); err != nil {
		t.Fatal(err)
	}
	// the address of the panel, made with the order
	order := &database.HostingOrder{ID: 1, SubLabel: "sari", SubZoneID: "z1", SubDomain: "reneo.my.id", SubHostname: "sari.reneo.my.id"}
	f.s.giveOrderSubdomain(order, u)
	if has, _ := f.db.HasPanelAddress(u.ID); !has {
		t.Fatal("the account has its panel address")
	}
	if n, _ := f.db.CountHostingSubdomains(u.ID); n != 0 {
		t.Fatalf("the panel address is not one of the plan's subdomains, got %d", n)
	}
	// giving it twice makes one
	f.s.giveOrderSubdomain(order, u)
	rows, _ := f.db.ListHostingSubdomains(u.ID)
	if len(rows) != 1 || !rows[0].Panel {
		t.Fatalf("one address, marked as the panel's: %+v", rows)
	}

	// the plan's one subdomain is still free for an application
	if _, err := f.db.CreateHostingSubdomain(u.ID, "app", "z1", "reneo.my.id", "app.reneo.my.id", false); err != nil {
		t.Fatal(err)
	}
	if n, _ := f.db.CountHostingSubdomains(u.ID); n != 1 {
		t.Fatalf("one used of the plan's one, got %d", n)
	}
	// a second panel address for the same account is refused by the database
	if _, err := f.db.CreateHostingSubdomain(u.ID, "lagi", "z1", "reneo.my.id", "lagi.reneo.my.id", true); err == nil {
		t.Fatal("an account has one panel address")
	}

	// the list the buyer sees counts only what the plan counts, and shows both
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	f.s.handleListMySubdomains(rec, asUser(req, u))
	body := rec.Body.String()
	if !strings.Contains(body, `"limit":1`) || !strings.Contains(body, `"used":1`) || !strings.Contains(body, `"panel":true`) || !strings.Contains(body, "sari.reneo.my.id") {
		t.Fatalf("the list: %s", body)
	}

	// the buyer cannot remove the address they sign in with, the owner can
	items, _ := f.db.ListHostingSubdomains(u.ID)
	var panelID int64
	for _, it := range items {
		if it.Panel {
			panelID = it.ID
		}
	}
	del := httptest.NewRequest(http.MethodDelete, "/", nil)
	del.SetPathValue("id", itoa(panelID))
	out := httptest.NewRecorder()
	f.s.handleDeleteMySubdomain(out, asUser(del, u))
	if out.Code != http.StatusForbidden {
		t.Fatalf("the panel address stays: %d %s", out.Code, out.Body.String())
	}
	if still, _ := f.db.GetHostingSubdomain(panelID); still == nil {
		t.Fatal("it was removed")
	}
}

func TestIntegrationThePublicPageOffersOnlyTheMainDomain(t *testing.T) {
	f := newHostingFixture(t)
	f.plan(t, "kecil", 25000, 0, 0)
	_ = f.db.SetHostingDomain("z-a", "alfa.test", true)
	_ = f.db.SetHostingDomain("z-b", "beta.test", true)
	_ = f.db.SetMainHostingDomain("z-b")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/public/hosting", nil)
	rec := httptest.NewRecorder()
	f.s.handlePublicHosting(rec, req)
	body := rec.Body.String()
	if !strings.Contains(body, "beta.test") || strings.Contains(body, "alfa.test") {
		t.Fatalf("only the main domain is shown on the landing page: %s", body)
	}
}
