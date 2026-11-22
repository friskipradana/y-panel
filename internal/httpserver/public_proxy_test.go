package httpserver

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

type publicFixture struct {
	*hostingFixture
}

func newPublicFixture(t *testing.T) *publicFixture {
	t.Helper()
	f := newHostingFixture(t)
	// the web ports are picked by the system, so the tests never need the real ones
	t.Setenv("PANEL_PUBLIC_HTTP_ADDR", "127.0.0.1:0")
	t.Setenv("PANEL_PUBLIC_HTTPS_ADDR", "127.0.0.1:0")
	f.s.cfg.BindAddr = "0.0.0.0:8787"
	t.Cleanup(f.s.stopPublicProxy)
	return &publicFixture{f}
}

func (f *publicFixture) do(handler http.HandlerFunc, method, path, body, id string) (int, string) {
	req := asUser(httptest.NewRequest(method, path, strings.NewReader(body)), f.super)
	if id != "" {
		req.SetPathValue("id", id)
	}
	rec := httptest.NewRecorder()
	handler(rec, req)
	return rec.Code, rec.Body.String()
}

func (f *publicFixture) createRoute(t *testing.T, body string) database.PublicRoute {
	t.Helper()
	code, text := f.do(f.s.handleCreatePublicRoute, http.MethodPost, "/api/v1/public-proxy/routes", body, "")
	if code != http.StatusCreated {
		t.Fatalf("create %s: %d %s", body, code, text)
	}
	var view publicRouteView
	if err := json.Unmarshal([]byte(text), &view); err != nil {
		t.Fatal(err)
	}
	return view.PublicRoute
}

// Registering a domain: a real domain name, not one that is already a buyer's panel address, and a target that exists.
// Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationPublicRoutesAreChecked(t *testing.T) {
	f := newPublicFixture(t)
	project, err := f.db.CreateProject(f.super.ID, "Blog", "blog", "", "static", "", "", true, 31001)
	if err != nil {
		t.Fatal(err)
	}
	buyer, err := f.db.CreateUser("dewi", "dewi@example.com", "hash", "user", "Dewi")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.CreateHostingSubdomain(buyer.ID, "dewi", "z1", "reneo.my.id", "dewi.reneo.my.id", true); err != nil {
		t.Fatal(err)
	}
	forgetHostingHosts()

	for name, c := range map[string]struct{ body, want string }{
		"empty":             {`{"hostname":"","kind":"panel"}`, "enter the domain"},
		"an address":        {`{"hostname":"203.0.113.9","kind":"panel"}`, "an IP address is not a domain"},
		"with a scheme":     {`{"hostname":"https://site.example.com","kind":"panel"}`, "without https://"},
		"a local name":      {`{"hostname":"nas.local","kind":"panel"}`, "cannot be used"},
		"a buyer's panel":   {`{"hostname":"dewi.reneo.my.id","kind":"panel"}`, "panel address of a buyer"},
		"no kind":           {`{"hostname":"site.example.com"}`, "leads to the panel, a project or a port"},
		"a project unset":   {`{"hostname":"site.example.com","kind":"project"}`, "pick a project"},
		"a missing project": {`{"hostname":"site.example.com","kind":"project","projectId":99999}`, "does not exist"},
		"port zero":         {`{"hostname":"site.example.com","kind":"port","port":0}`, "1 to 65535"},
		"port too high":     {`{"hostname":"site.example.com","kind":"port","port":70000}`, "1 to 65535"},
		"a long note":       {`{"hostname":"site.example.com","kind":"panel","note":"` + strings.Repeat("x", 201) + `"}`, "at most 200"},
	} {
		if code, text := f.do(f.s.handleCreatePublicRoute, http.MethodPost, "/", c.body, ""); code != http.StatusBadRequest || !strings.Contains(text, c.want) {
			t.Errorf("%s: %d %s, want %q", name, code, text, c.want)
		}
	}

	// the panel needs a loopback address to be reached at
	f.s.cfg.BindAddr = "192.168.1.5:8787"
	if code, text := f.do(f.s.handleCreatePublicRoute, http.MethodPost, "/", `{"hostname":"panel.example.com","kind":"panel"}`, ""); code != http.StatusBadRequest || !strings.Contains(text, "loopback") {
		t.Errorf("a panel that does not listen on loopback: %d %s", code, text)
	}
	f.s.cfg.BindAddr = "0.0.0.0:8787"

	// the port of the proxy itself is not a target
	f.s.stopPublicProxy()
	t.Setenv("PANEL_PUBLIC_HTTPS_ADDR", "127.0.0.1:8443")
	if code, text := f.do(f.s.handleCreatePublicRoute, http.MethodPost, "/", `{"hostname":"loop.example.com","kind":"port","port":8443}`, ""); code != http.StatusBadRequest || !strings.Contains(text, "public proxy itself") {
		t.Errorf("the port of the proxy: %d %s", code, text)
	}

	panel := f.createRoute(t, `{"hostname":"Panel.Example.COM","kind":"panel"}`)
	if panel.Hostname != "panel.example.com" || !panel.Enabled {
		t.Fatalf("the domain is kept in lower case and starts on: %+v", panel)
	}
	if code, text := f.do(f.s.handleCreatePublicRoute, http.MethodPost, "/", `{"hostname":"panel.example.com","kind":"panel"}`, ""); code != http.StatusConflict || !strings.Contains(text, "already registered") {
		t.Errorf("the same domain twice: %d %s", code, text)
	}
	blog := f.createRoute(t, `{"hostname":"blog.example.com","kind":"project","projectId":`+strconv.FormatInt(project.ID, 10)+`}`)
	nas := f.createRoute(t, `{"hostname":"nas.example.com","kind":"port","port":5000,"enabled":false}`)

	// what the proxy asks for: the port each leads to, and nothing for a domain that is off
	f.s.forgetPublicRoutes()
	if route, ok := f.s.publicRoute("PANEL.example.com"); !ok || route.Port != 8787 {
		t.Errorf("the panel: %+v %v", route, ok)
	}
	if route, ok := f.s.publicRoute("blog.example.com"); !ok || route.Port != 31001 {
		t.Errorf("a project leads to its own port: %+v %v", route, ok)
	}
	if _, ok := f.s.publicRoute("nas.example.com"); ok {
		t.Error("a domain that is switched off is not answered")
	}
	if !f.s.isKnownWorkloadHost("panel.example.com") || !f.s.isHostAllowed("panel.example.com") {
		t.Error("the panel accepts its own public domain")
	}
	if f.s.isPublicPanelHost("blog.example.com") || f.s.isKnownWorkloadHost("blog.example.com") {
		t.Error("only the domain of the panel is a host of the panel")
	}

	// switching it on, and changing where it leads, takes effect and clears the last check
	if err := f.db.SetPublicRouteCheck(nas.ID, false, "no certificate"); err != nil {
		t.Fatal(err)
	}
	code, text := f.do(f.s.handleUpdatePublicRoute, http.MethodPatch, "/", `{"hostname":"ignored.example.com","kind":"port","port":5000,"enabled":true}`, strconv.FormatInt(nas.ID, 10))
	if code != http.StatusOK || !strings.Contains(text, `"hostname":"nas.example.com"`) || !strings.Contains(text, `"checkError":"no certificate"`) {
		t.Fatalf("switch on, same target keeps the check: %d %s", code, text)
	}
	code, text = f.do(f.s.handleUpdatePublicRoute, http.MethodPatch, "/", `{"kind":"port","port":5001,"enabled":true}`, strconv.FormatInt(nas.ID, 10))
	if code != http.StatusOK || !strings.Contains(text, `"checkError":""`) || !strings.Contains(text, `"target":"127.0.0.1:5001"`) {
		t.Fatalf("a new target clears the check: %d %s", code, text)
	}
	f.s.forgetPublicRoutes()
	if route, ok := f.s.publicRoute("nas.example.com"); !ok || route.Port != 5001 {
		t.Errorf("the changed route: %+v %v", route, ok)
	}

	// deleting
	if code, _ := f.do(f.s.handleDeletePublicRoute, http.MethodDelete, "/", "", strconv.FormatInt(blog.ID, 10)); code != http.StatusOK {
		t.Fatalf("delete: %d", code)
	}
	if code, _ := f.do(f.s.handleDeletePublicRoute, http.MethodDelete, "/", "", strconv.FormatInt(blog.ID, 10)); code != http.StatusNotFound {
		t.Fatalf("delete twice: %d", code)
	}
	// a project that is deleted takes its routes with it
	other, _ := f.db.CreateProject(f.super.ID, "Shop", "shop", "", "static", "", "", true, 31002)
	shop := f.createRoute(t, `{"hostname":"shop.example.com","kind":"project","projectId":`+strconv.FormatInt(other.ID, 10)+`}`)
	if _, err := f.db.DB().Exec(`DELETE FROM projects WHERE id = $1`, other.ID); err != nil {
		t.Fatal(err)
	}
	if gone, _ := f.db.GetPublicRoute(shop.ID); gone != nil {
		t.Fatal("the route of a deleted project is gone")
	}
}

// Turning the proxy on binds the ports and remembers it; a port that is taken names itself and leaves the proxy off.
// Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationPublicProxySwitch(t *testing.T) {
	f := newPublicFixture(t)
	status := func() map[string]any {
		code, text := f.do(f.s.handlePublicProxyStatus, http.MethodGet, "/api/v1/public-proxy", "", "")
		if code != http.StatusOK {
			t.Fatalf("status: %d %s", code, text)
		}
		var out map[string]any
		_ = json.Unmarshal([]byte(text), &out)
		return out
	}
	if st := status(); st["enabled"] != false || st["running"] != false {
		t.Fatalf("off at first: %v", st)
	}

	// a port that is taken
	busy, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer busy.Close()
	t.Setenv("PANEL_PUBLIC_HTTPS_ADDR", busy.Addr().String())

	// nothing opens before the superadmin has said that the server has a public address
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"enabled":true}`, ""); code != http.StatusBadRequest || !strings.Contains(text, "confirm that this server has a public IP") {
		t.Fatalf("without the confirmation: %d %s", code, text)
	}
	if st := status(); st["enabled"] != false || st["running"] != false || st["confirmedAt"] != nil {
		t.Fatalf("it stays off, and nothing is recorded: %v", st)
	}
	code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"enabled":true,"confirmPublicIp":true}`, "")
	if code != http.StatusConflict || !strings.Contains(text, "cannot listen on "+busy.Addr().String()) {
		t.Fatalf("a taken port: %d %s", code, text)
	}
	if st := status(); st["enabled"] != false || st["running"] != false {
		t.Fatalf("it stays off, and is not remembered as on: %v", st)
	}

	t.Setenv("PANEL_PUBLIC_HTTPS_ADDR", "127.0.0.1:0")
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"enabled":true,"email":"owner@example.com","confirmPublicIp":true}`, ""); code != http.StatusOK {
		t.Fatalf("on: %d %s", code, text)
	}
	st := status()
	if st["enabled"] != true || st["running"] != true || st["email"] != "owner@example.com" || st["http"] == "" || st["https"] == "" {
		t.Fatalf("on: %v", st)
	}
	if settings := f.s.loadSiteSettings(); !settings.PublicProxyEnabled || settings.PublicProxyConfirmedBy != "owner" || settings.PublicProxyConfirmedAt == nil {
		t.Fatalf("remembered as on, with who confirmed it and when: %+v", settings)
	}
	if st["confirmedBy"] != "owner" || st["confirmedAt"] == nil {
		t.Fatalf("the status says who confirmed: %v", st)
	}
	// changing the email while it is on is not a new decision to open the ports
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"email":"other@example.com"}`, ""); code != http.StatusOK || status()["running"] != true {
		t.Fatalf("a new email while on: %d %s", code, text)
	}
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"email":"not an email"}`, ""); code != http.StatusBadRequest || !strings.Contains(text, "invalid email") {
		t.Fatalf("a bad email: %d %s", code, text)
	}

	// a domain is listed as waiting for its certificate, and a check without DNS says so
	route := f.createRoute(t, `{"hostname":"nodns.example.invalid","kind":"panel"}`)
	if code, text := f.do(f.s.handlePublicRoutesTable, http.MethodGet, "/api/v1/public-proxy/routes", "", ""); code != http.StatusOK || !strings.Contains(text, `"state":"waiting"`) {
		t.Fatalf("table: %d %s", code, text)
	}
	code, text = f.do(f.s.handleCheckPublicRoute, http.MethodPost, "/", "", strconv.FormatInt(route.ID, 10))
	if code != http.StatusOK || !strings.Contains(text, `"ok":false`) || !strings.Contains(text, "no DNS record") {
		t.Fatalf("a check of a domain that has no DNS: %d %s", code, text)
	}
	if after, _ := f.db.GetPublicRoute(route.ID); after.CheckedAt == nil || after.CheckOK || after.CheckError == "" {
		t.Fatalf("the check is kept: %+v", after)
	}
	if code, text := f.do(f.s.handlePublicRoutesTable, http.MethodGet, "/", "", ""); !strings.Contains(text, `"state":"error"`) {
		t.Fatalf("a failed check shows as an error: %d %s", code, text)
	}

	// off again: nothing listens and the routes say so
	if code, _ := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"enabled":false}`, ""); code != http.StatusOK {
		t.Fatal("off")
	}
	if st := status(); st["running"] != false || st["enabled"] != false {
		t.Fatalf("off: %v", st)
	}
	if code, text := f.do(f.s.handleCheckPublicRoute, http.MethodPost, "/", "", strconv.FormatInt(route.ID, 10)); code != http.StatusConflict || !strings.Contains(text, "not running") {
		t.Fatalf("a check while off: %d %s", code, text)
	}
	if _, text := f.do(f.s.handlePublicRoutesTable, http.MethodGet, "/", "", ""); !strings.Contains(text, `"state":"off"`) {
		t.Fatalf("a domain while the proxy is off: %s", text)
	}
}
