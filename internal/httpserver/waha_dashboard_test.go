package httpserver

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
)

// The dashboard of WAHA: it answers on an address of its own, for the superadmin only, through a link that works once.
// Skipped without REN_TEST_DATABASE_URL.

func dashRequest(f *notifyFixture, host, path string, cookie *http.Cookie, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "http://"+host+path, nil)
	req.Host = host
	req.RemoteAddr = "198.51.100.30:5000"
	if cookie != nil {
		req.AddCookie(cookie)
	}
	for k, v := range headers {
		// a browser sends its other cookies together with this one
		if k == "Cookie" {
			req.Header.Add(k, v)
			continue
		}
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	f.s.ServeHTTP(rec, req)
	return rec
}

func sessionCookie(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == wahaDashCookie && c.MaxAge > 0 {
			return c
		}
	}
	return nil
}

func TestIntegrationTheWahaDashboardIsForTheSuperadminThroughAOneTimeLink(t *testing.T) {
	f := newNotifyFixture(t)
	stub := withWaha(t, f)
	user, _ := f.db.CreateUser("rani", "rani@example.com", "hash", auth.UserRole, "Rani")

	// without an address there is nothing to open
	if rec := f.call(f.s.handleWahaDashboardLink, "POST", "/", "", f.super); rec.Code != 409 {
		t.Fatalf("no address, no link: %d %s", rec.Code, rec.Body.String())
	}
	// the address is only an address
	for _, bad := range []string{"https://waha.example.com", "waha.example.com/dashboard", "waha example.com", "-bad.com", "a.com:99999999"} {
		body, _ := json.Marshal(map[string]string{"host": bad})
		if rec := f.call(f.s.handleSetWahaDashboardHost, "PUT", "/", string(body), f.super); rec.Code != 400 {
			t.Fatalf("%q is not an address: %d", bad, rec.Code)
		}
	}
	// and not the one the panel is being used on
	req := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(`{"host":"panel.example.com"}`))
	req.Host = "panel.example.com"
	rec := httptest.NewRecorder()
	f.s.handleSetWahaDashboardHost(rec, asUser(req, f.super))
	if rec.Code != 400 {
		t.Fatalf("the address of the panel itself cannot be the dashboard's: %d", rec.Code)
	}
	if rec := f.call(f.s.handleSetWahaDashboardHost, "PUT", "/", `{"host":"Waha.Example.com"}`, f.super); rec.Code != 200 {
		t.Fatalf("save: %d %s", rec.Code, rec.Body.String())
	}
	const host = "waha.example.com"

	// at that address nothing answers without the cookie, and WAHA is not even asked
	callsBefore := stub.calls
	for _, path := range []string{"/", "/dashboard/", "/api/sessions", "/api/v1/me", "/login"} {
		if rec := dashRequest(f, host, path, nil, nil); rec.Code != 403 {
			t.Fatalf("%s without the cookie: %d", path, rec.Code)
		}
	}
	if stub.calls != callsBefore {
		t.Fatal("a request without the cookie must not reach WAHA")
	}

	// the link comes from inside the panel, from the superadmin
	rec = f.call(f.s.handleWahaDashboardLink, "POST", "/", "", f.super)
	var link struct{ URL string }
	_ = json.Unmarshal(rec.Body.Bytes(), &link)
	u, err := url.Parse(link.URL)
	if rec.Code != 200 || err != nil || u.Host != host || u.Path != wahaDashEnterPath || u.Query().Get("t") == "" {
		t.Fatalf("the link: %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(link.URL, "key_") || strings.Contains(link.URL, stub.key) {
		t.Fatalf("no key is in the link: %s", link.URL)
	}
	token := u.Query().Get("t")

	// a link that is changed, made for someone who is not the superadmin, or already out of time, is refused
	if rec := dashRequest(f, host, wahaDashEnterPath+"?t="+url.QueryEscape(token+"x"), nil, nil); rec.Code != 403 {
		t.Fatalf("a changed link: %d", rec.Code)
	}
	if rec := dashRequest(f, host, wahaDashEnterPath+"?t="+url.QueryEscape(f.s.wahaDashMint("enter", user.ID, time.Minute)), nil, nil); rec.Code != 403 {
		t.Fatalf("a link of an ordinary account: %d", rec.Code)
	}
	if rec := dashRequest(f, host, wahaDashEnterPath+"?t="+url.QueryEscape(f.s.wahaDashMint("enter", f.super.ID, -time.Second)), nil, nil); rec.Code != 403 {
		t.Fatalf("a link out of time: %d", rec.Code)
	}
	if rec := dashRequest(f, host, wahaDashEnterPath+"?t="+url.QueryEscape(f.s.wahaDashMint("session", f.super.ID, time.Minute)), nil, nil); rec.Code != 403 {
		t.Fatalf("a session value is not a link: %d", rec.Code)
	}
	if rec := dashRequest(f, host, wahaDashEnterPath, nil, nil); rec.Code != 403 {
		t.Fatalf("no link at all: %d", rec.Code)
	}

	// the good link starts a session, and works only once
	rec = dashRequest(f, host, wahaDashEnterPath+"?t="+url.QueryEscape(token), nil, nil)
	cookie := sessionCookie(rec)
	if rec.Code != 302 || rec.Header().Get("Location") != "/dashboard/" || cookie == nil || !cookie.HttpOnly {
		t.Fatalf("the link opens the dashboard with a cookie only the browser holds: %d %v", rec.Code, rec.Header())
	}
	if rec := dashRequest(f, host, wahaDashEnterPath+"?t="+url.QueryEscape(token), nil, nil); rec.Code != 403 {
		t.Fatalf("a link works once: %d", rec.Code)
	}

	// with the cookie WAHA answers, and it is the panel that speaks to it: its own key and its own login, nothing of the browser
	rec = dashRequest(f, host, "/dashboard/", cookie, map[string]string{"Authorization": "Bearer attacker", "X-Api-Key": "attacker-key", "Cookie": "reneo_session=secret"})
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "WAHA dashboard") {
		t.Fatalf("the dashboard: %d %s", rec.Code, rec.Body.String())
	}
	stub.mu.Lock()
	h := stub.lastHeader
	stub.mu.Unlock()
	base, key, dashUser, dashPass, _ := f.s.notify.WahaProxyTarget()
	_ = base
	wantBasic := "Basic " + base64.StdEncoding.EncodeToString([]byte(dashUser+":"+dashPass))
	if h.Get("X-Api-Key") != key || h.Get("Authorization") != wantBasic {
		t.Fatalf("the panel speaks with WAHA's own credentials: key=%q auth=%q", h.Get("X-Api-Key"), h.Get("Authorization"))
	}
	if strings.Contains(h.Get("Cookie"), "reneo_session") || strings.Contains(h.Get("Cookie"), wahaDashCookie) {
		t.Fatalf("no cookie of the panel reaches WAHA: %q", h.Get("Cookie"))
	}
	rec = dashRequest(f, host, "/api/sessions", cookie, map[string]string{"X-Api-Key": "attacker-key"})
	if rec.Code != 200 {
		t.Fatalf("the API of the dashboard works with the panel's key, whatever the browser sent: %d", rec.Code)
	}
	stub.mu.Lock()
	apiAuth := stub.lastHeader.Get("Authorization")
	stub.mu.Unlock()
	if apiAuth != "" {
		t.Fatalf("a call of the API carries the key, not the login: %q", apiAuth)
	}
	if rec := dashRequest(f, host, "/", cookie, nil); rec.Code != 302 || rec.Header().Get("Location") != "/dashboard/" {
		t.Fatalf("the front of the address is the dashboard: %d", rec.Code)
	}
	// the panel itself is not reachable here: what looks like its API is WAHA's, which has no such thing
	if rec := dashRequest(f, host, "/api/v1/me", cookie, nil); strings.Contains(rec.Body.String(), "rani") || strings.Contains(rec.Body.String(), "owner") {
		t.Fatalf("the panel API must not answer on the dashboard address: %s", rec.Body.String())
	}

	// a cookie made for an ordinary account, a cookie that was changed, and a cookie of a superadmin who was suspended: no
	forged := &http.Cookie{Name: wahaDashCookie, Value: f.s.wahaDashMint("session", user.ID, time.Hour)}
	if rec := dashRequest(f, host, "/dashboard/", forged, nil); rec.Code != 403 {
		t.Fatalf("an ordinary account is not let in: %d", rec.Code)
	}
	if rec := dashRequest(f, host, "/dashboard/", &http.Cookie{Name: wahaDashCookie, Value: cookie.Value + "0"}, nil); rec.Code != 403 {
		t.Fatalf("a changed cookie: %d", rec.Code)
	}
	if rec := dashRequest(f, host, "/dashboard/", &http.Cookie{Name: wahaDashCookie, Value: f.s.wahaDashMint("session", f.super.ID, -time.Second)}, nil); rec.Code != 403 {
		t.Fatalf("a cookie out of time: %d", rec.Code)
	}
	_ = f.db.UpdateUser(f.super.ID, map[string]any{"status": "suspended"})
	if rec := dashRequest(f, host, "/dashboard/", cookie, nil); rec.Code != 403 {
		t.Fatalf("a suspended superadmin is out at once: %d", rec.Code)
	}
	_ = f.db.UpdateUser(f.super.ID, map[string]any{"status": "active"})
	if rec := dashRequest(f, host, "/dashboard/", cookie, nil); rec.Code != 200 {
		t.Fatalf("and back in when active again: %d", rec.Code)
	}

	// leaving, and another host is not touched
	if rec := dashRequest(f, host, wahaDashExitPath, cookie, nil); rec.Code != 200 {
		t.Fatalf("exit: %d", rec.Code)
	}
	if f.s.wahaDashboardRequest(httptest.NewRequest(http.MethodGet, "http://panel.example.com/", nil)) {
		t.Fatal("only the address of the dashboard is the dashboard")
	}

	// switching the address off closes it
	if rec := f.call(f.s.handleSetWahaDashboardHost, "PUT", "/", `{"host":""}`, f.super); rec.Code != 200 {
		t.Fatalf("off: %d", rec.Code)
	}
	if f.s.notify.WahaDashboardHost() != "" {
		t.Fatal("the address is cleared")
	}
}

func TestThePanelPortIsWhatARouteToTheDashboardLeadsTo(t *testing.T) {
	for bind, want := range map[string]int{"0.0.0.0:8787": 8787, "127.0.0.1:9000": 9000, "[::]:8800": 8800, ":8787": 8787, "nonsense": 0, "": 0} {
		s := &Server{}
		s.cfg.BindAddr = bind
		if got := s.panelPort(); got != want {
			t.Errorf("%q: got %d want %d", bind, got, want)
		}
	}
}
