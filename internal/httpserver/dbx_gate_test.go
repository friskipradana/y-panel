package httpserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

var dbxTestConns = []dbxConn{
	{ID: "rdb-1", Name: "Shop", Type: "postgres", Host: "127.0.0.1", Port: 15001, User: "shop", Password: "real-secret", Database: "shopdb"},
}

func decide(method, path, rawQuery, body string) dbxVerdict {
	q, _ := url.ParseQuery(rawQuery)
	var b []byte
	if body != "" {
		b = []byte(body)
	}
	return dbxDecide(method, path, q, b, dbxTestConns)
}

func TestDbxGateForwardsOnlyWhatBelongsToTheAccount(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		query  string
		body   string
		want   dbxAction
		status int
	}{
		{"page asset", "GET", "/assets/app.js", "", "", dbxForward, 0},
		{"page cannot be written", "POST", "/assets/app.js", "", "", dbxAnswer, 403},
		{"own schema", "GET", "/api/schema/databases", "connection_id=rdb-1", "", dbxForward, 0},
		{"someone else's schema", "GET", "/api/schema/databases", "connection_id=rdb-2", "", dbxAnswer, 403},
		{"schema of nothing", "GET", "/api/schema/databases", "", "", dbxAnswer, 403},
		{"own query", "POST", "/api/query/execute", "", `{"connectionId":"rdb-1","sql":"select 1"}`, dbxForward, 0},
		{"foreign query", "POST", "/api/query/execute", "", `{"connectionId":"rdb-2","sql":"select 1"}`, dbxAnswer, 403},
		{"foreign id written with escapes", "POST", "/api/query/execute", "", `{"connectionId":"rdb-2","note":"rdb-1"}`, dbxAnswer, 403},
		{"own id next to a foreign one", "POST", "/api/query/execute", "", `{"connectionId":"rdb-1","other":"rdb-2"}`, dbxAnswer, 403},
		{"a connection the panel does not know", "POST", "/api/query/execute", "", `{"connectionId":"evil","x":"rdb-1"}`, dbxAnswer, 403},
		{"query without a connection", "POST", "/api/query/execute", "", `{"sql":"select 1"}`, dbxAnswer, 403},
		{"builders need no connection", "POST", "/api/query/build-table-select-sql", "", `{"table":"t"}`, dbxForward, 0},
		{"own cache", "GET", "/api/schema/cache", "cache_key=rdb-1%3Adatabases-v3", "", dbxForward, 0},
		{"foreign cache", "GET", "/api/schema/cache", "cache_key=rdb-2%3Adatabases-v3", "", dbxAnswer, 403},
		{"saving a connection", "POST", "/api/connection/save", "", `{"configs":[{"id":"x","host":"10.0.0.5"}]}`, dbxAnswer, 403},
		{"testing a connection", "POST", "/api/connection/test", "", `{"config":{"host":"10.0.0.5"}}`, dbxAnswer, 403},
		{"plugin files", "POST", "/api/plugins/filesystem/read", "", `{"path":"/etc/passwd"}`, dbxAnswer, 403},
		{"history of everyone", "GET", "/api/history/list", "", "", dbxAnswer, 403},
		{"ai keys", "POST", "/api/ai/config", "", `{}`, dbxAnswer, 403},
		{"import and export", "POST", "/api/mongo/export", "", `{"connectionId":"rdb-1"}`, dbxAnswer, 403},
		{"large value download", "GET", "/api/query/large-value/download/abc", "connection_id=rdb-1", "", dbxAnswer, 403},
		{"reading the settings the page shows", "GET", "/api/version", "", "", dbxForward, 0},
		{"writing them", "POST", "/api/version", "", "", dbxAnswer, 403},
		{"layout is saved nowhere", "POST", "/api/layout/sidebar", "", `{"x":1}`, dbxAnswer, 200},
		{"login of DBX", "POST", "/api/auth/login", "", `{"password":"x"}`, dbxAnswer, 403},
		{"auth check", "GET", "/api/auth/check", "", "", dbxAnswer, 200},
		{"events", "GET", "/api/connection/liveness-events", "", "", dbxStream, 0},
		{"health of own", "POST", "/api/connection/check-health", "", `{"connectionId":"rdb-1"}`, dbxForward, 0},
		{"health of foreign", "POST", "/api/connection/check-health", "", `{"connectionId":"rdb-2"}`, dbxAnswer, 403},
	}
	for _, c := range cases {
		got := decide(c.method, c.path, c.query, c.body)
		if got.Action != c.want || (c.want == dbxAnswer && got.Status != c.status) {
			t.Errorf("%s: action %v status %d, want %v %d", c.name, got.Action, got.Status, c.want, c.status)
		}
	}
	_ = http.StatusOK
}

func TestDbxGateAnswersTheListWithoutPasswords(t *testing.T) {
	got := decide("GET", "/api/connection/list", "", "")
	body := string(got.Body)
	if got.Action != dbxAnswer || !strings.Contains(body, `"rdb-1"`) || !strings.Contains(body, `"Shop"`) {
		t.Fatalf("the account's database is listed: %s", body)
	}
	if strings.Contains(body, "real-secret") || strings.Contains(body, "rdb-2") {
		t.Fatalf("no real password and nothing of others: %s", body)
	}
}

func TestDbxGateConnectsWithTheRecordsOfThePanel(t *testing.T) {
	got := decide("POST", "/api/connection/connect", "", `{"config":{"id":"rdb-1","name":"x","db_type":"mysql","host":"10.9.9.9","port":3306,"username":"root","password":"guess","transport_layers":[{"type":"ssh"}],"init_script":"ATTACH"}}`)
	if got.Action != dbxForward || got.NewBody == nil {
		t.Fatalf("connect is forwarded with a new body: %+v", got)
	}
	body := string(got.NewBody)
	for _, want := range []string{`"host":"127.0.0.1"`, `"port":15001`, `"username":"shop"`, `"password":"real-secret"`, `"db_type":"postgres"`, `"database":"shopdb"`} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %s in %s", want, body)
		}
	}
	for _, bad := range []string{"10.9.9.9", "guess", "transport_layers", "ATTACH"} {
		if strings.Contains(body, bad) {
			t.Errorf("%s must be dropped from %s", bad, body)
		}
	}
	for _, id := range []string{"rdb-2", "evil", ""} {
		if v := decide("POST", "/api/connection/connect", "", `{"config":{"id":"`+id+`"}}`); v.Action != dbxAnswer || v.Status != 403 {
			t.Errorf("connect to %q must be refused: %+v", id, v)
		}
	}
}

func TestDbxProxyGivesDbxItsOwnSessionAndNothingOfTheBrowser(t *testing.T) {
	var seen []string
	var cookies []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Method+" "+r.URL.Path)
		cookies = append(cookies, r.Header.Get("Cookie"))
		switch r.URL.Path {
		case "/dbx/api/auth/login":
			http.SetCookie(w, &http.Cookie{Name: "dbx_session", Value: "panel-session", Path: "/dbx"})
		case "/dbx/":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("<html><body><div id=app></div></body></html>"))
		default:
			http.SetCookie(w, &http.Cookie{Name: "dbx_session", Value: "other"})
			_, _ = w.Write([]byte(`{"ok":true}`))
		}
	}))
	defer upstream.Close()

	s := &Server{}
	s.dbxForgetSession()
	handler := s.newDbxProxy(func() string { return upstream.URL }, func(*database.User) []dbxConn { return nil }, false)
	serve := func(method, target string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, nil)
		req.Header.Set("Cookie", "panel_session=secret-of-the-panel")
		req = req.WithContext(context.WithValue(req.Context(), ctxUser, &database.User{ID: 1}))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	if rec := serve("GET", "/dbx/api/version"); rec.Code != 200 || rec.Header().Get("Set-Cookie") != "" {
		t.Fatalf("a read is forwarded and DBX cannot set cookies in the browser: %d %v", rec.Code, rec.Header())
	}
	last := cookies[len(cookies)-1]
	if last != "dbx_session=panel-session" {
		t.Fatalf("DBX gets the session of the panel and not the cookies of the browser, got %q", last)
	}
	before := len(seen)
	if rec := serve("GET", "/dbx/api/connection/list"); rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != "[]" || len(seen) != before {
		t.Fatalf("the list is answered by the panel: %d %q (upstream saw %v)", rec.Code, rec.Body.String(), seen[before:])
	}
	if rec := serve("POST", "/dbx/api/plugins/filesystem/read"); rec.Code != 403 || len(seen) != before {
		t.Fatalf("file access is refused before it reaches DBX: %d", rec.Code)
	}
	if rec := serve("GET", "/dbx/../../etc/passwd"); rec.Code == 200 {
		t.Fatalf("a path out of /dbx is not forwarded: %d", rec.Code)
	}
	page := serve("GET", "/dbx/")
	if !strings.Contains(page.Body.String(), "reneo_open") || !strings.Contains(page.Body.String(), "</body>") {
		t.Fatalf("the page carries the script that opens the database: %s", page.Body.String())
	}
}
