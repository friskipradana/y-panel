package httpserver

import (
	"bytes"
	"context"
	_ "embed"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
)

// Adminer for the user databases. One sidecar container (host network, loopback only) serves
// the web client; the panel proxies it under /adminer/ behind the panel session and signs the
// owner in with the database credentials, so opening it is a single click.

const (
	adminerContainer = "reneo-adminer"
	adminerImage     = "adminer:4"
)

func adminerPort() int {
	if v, err := strconv.Atoi(strings.TrimSpace(os.Getenv("PANEL_ADMINER_PORT"))); err == nil && v > 1024 && v < 65536 {
		return v
	}
	return 18080
}

func dockerOutput(ctx context.Context, args ...string) (string, error) {
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.WaitDelay = 500 * time.Millisecond
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func adminerReachable() bool {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(adminerPort())), 400*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

// ensureAdminer starts the sidecar when it is missing or stopped and waits until it answers.
func ensureAdminer(ctx context.Context) error {
	if adminerReachable() {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()

	state, err := dockerOutput(ctx, "inspect", "-f", "{{.State.Status}}", adminerContainer)
	switch {
	case err != nil:
		port := strconv.Itoa(adminerPort())
		if out, runErr := dockerOutput(ctx, "run", "-d", "--name", adminerContainer, "--label", "reneo.kind=database-control", "--restart", "unless-stopped",
			"--network", "host", adminerImage, "php", "-S", "127.0.0.1:"+port, "-t", "/var/www/html"); runErr != nil {
			return fmt.Errorf("could not start Adminer: %s", firstOutputLine(out))
		}
	case state != "running":
		if out, startErr := dockerOutput(ctx, "start", adminerContainer); startErr != nil {
			return fmt.Errorf("could not start Adminer: %s", firstOutputLine(out))
		}
	}
	for i := 0; i < 50; i++ {
		if adminerReachable() {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(300 * time.Millisecond):
		}
	}
	return fmt.Errorf("Adminer did not become ready")
}

func firstOutputLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	if s == "" {
		return "unknown error"
	}
	return s
}

// handleDatabaseAdminer answers with a page that signs the owner in to Adminer.
func (s *Server) handleDatabaseAdminer(w http.ResponseWriter, r *http.Request) {
	// the address carries an opaque key, never the numeric ID
	owner := userFromCtx(r)
	found := s.databaseByAccessKey(owner, r.PathValue("key"))
	if found == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "database not found"})
		return
	}
	r.SetPathValue("id", strconv.FormatInt(found.ID, 10))
	conn, item, u, ok := s.databaseConn(w, r)
	if !ok || !requireSQL(s, w, conn) {
		return
	}
	if err := ensureAdminer(r.Context()); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	driver := "server"
	if conn.Engine.ID == "postgres" {
		driver = "pgsql"
	}
	s.auditSensitiveAction(r, u, "database.adminer", "ok", map[string]any{"id": item.ID})

	field := func(name, value string) string {
		return fmt.Sprintf(`<input type="hidden" name="%s" value="%s">`, html.EscapeString(name), html.EscapeString(value))
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	// same-origin: with no-referrer the browser sends "Origin: null" and the panel would refuse the sign-in
	w.Header().Set("Referrer-Policy", "same-origin")
	_, _ = fmt.Fprintf(w, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Adminer</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem">
<form id="f" method="post" action="/adminer/%s/">%s%s%s%s%s<noscript><button type="submit">Open Adminer</button></noscript></form>
<script>document.getElementById('f').submit()</script>
</body></html>`,
		html.EscapeString(s.databaseAccessKey(item.ID)),
		field("auth[driver]", driver),
		field("auth[server]", net.JoinHostPort(userDatabaseHost, strconv.Itoa(item.HostPort))),
		field("auth[username]", conn.User),
		field("auth[password]", conn.Password),
		field("auth[db]", conn.Database),
	)
}

// handlePanelDatabaseAdminer signs superadmin into Adminer for Reneo's own PostgreSQL database.
func (s *Server) handlePanelDatabaseAdminer(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil || !auth.HasRole(u.Role, auth.SuperadminRole) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "superadmin only"})
		return
	}
	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "panel database is not connected"})
		return
	}
	host, port, dbname, user, password, ok := s.database.ConnectionDetails()
	if !ok {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "panel database credentials unavailable"})
		return
	}
	if err := ensureAdminer(r.Context()); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "database.panel_adminer", "ok", map[string]any{"database": dbname})

	field := func(name, value string) string {
		return fmt.Sprintf(`<input type="hidden" name="%s" value="%s">`, html.EscapeString(name), html.EscapeString(value))
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "same-origin")
	_, _ = fmt.Fprintf(w, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Adminer — Reneo Panel</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem">
<form id="f" method="post" action="/adminer/panel/">%s%s%s%s%s<noscript><button type="submit">Open Adminer</button></noscript></form>
<script>document.getElementById('f').submit()</script>
</body></html>`,
		field("auth[driver]", "pgsql"),
		field("auth[server]", net.JoinHostPort(host, port)),
		field("auth[username]", user),
		field("auth[password]", password),
		field("auth[db]", dbname),
	)
}

//go:embed adminer_theme.css
var adminerModernThemeCSS []byte

//go:embed adminer_theme.js
var adminerModernThemeJS []byte

var adminerDefaultCSSRe = regexp.MustCompile(`(?i)<link[^>]+href=["'][^"']*default\.css[^"']*["'][^>]*>`)

func injectAdminerTheme(page []byte, cssHref, jsHref string) []byte {
	// Strip Adminer's legacy 2008 default.css so the Reneo workstation theme owns the entire layout cleanly.
	page = adminerDefaultCSSRe.ReplaceAll(page, nil)
	tags := []byte(`<link rel="stylesheet" href="` + cssHref + `"><script src="` + jsHref + `"></script>`)
	lower := bytes.ToLower(page)
	if idx := bytes.Index(lower, []byte("</head>")); idx >= 0 {
		out := make([]byte, 0, len(page)+len(tags))
		out = append(out, page[:idx]...)
		out = append(out, tags...)
		out = append(out, page[idx:]...)
		return out
	}
	if idx := bytes.Index(lower, []byte("<body")); idx >= 0 {
		out := make([]byte, 0, len(page)+len(tags))
		out = append(out, page[:idx]...)
		out = append(out, tags...)
		out = append(out, page[idx:]...)
		return out
	}
	return append(page, tags...)
}

// adminerProxy forwards /adminer/<key>/ to the sidecar. The key selects one of the caller's own
// databases and a sign-in may only name exactly that database's server, so Adminer cannot be
// pointed at anything else on the host.
func (s *Server) adminerProxy() http.Handler {
	target := &url.URL{Scheme: "http", Host: net.JoinHostPort("127.0.0.1", strconv.Itoa(adminerPort()))}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := userFromCtx(r)
		if u == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		key, rest := adminerSplitPath(r.URL.Path)
		var allowedServer string
		if key == "panel" {
			if !auth.HasRole(u.Role, auth.SuperadminRole) || s.database == nil || !s.database.IsConnected() {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			pHost, pPort, _, _, _, ok := s.database.ConnectionDetails()
			if !ok {
				http.NotFound(w, r)
				return
			}
			allowedServer = net.JoinHostPort(pHost, pPort)
		} else {
			bound := s.databaseByAccessKey(u, key)
			if bound == nil {
				http.NotFound(w, r)
				return
			}
			allowedServer = net.JoinHostPort(userDatabaseHost, strconv.Itoa(bound.HostPort))
		}
		if r.URL.Path == "/adminer/"+key {
			http.Redirect(w, r, "/adminer/"+key+"/", http.StatusPermanentRedirect)
			return
		}
		if rest == "reneo-theme.css" {
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			_, _ = w.Write(adminerModernThemeCSS)
			return
		}
		if rest == "reneo-theme.js" {
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			_, _ = w.Write(adminerModernThemeJS)
			return
		}
		// Only inspect URL-encoded form posts (sign-in) so multipart .sql file imports are streamed without a 1 MB cap.
		if r.Method == http.MethodPost && strings.HasPrefix(r.Header.Get("Content-Type"), "application/x-www-form-urlencoded") {
			raw, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
			if err != nil {
				http.Error(w, "bad request", http.StatusBadRequest)
				return
			}
			form, _ := url.ParseQuery(string(raw))
			if server := form.Get("auth[server]"); server != "" {
				if server != allowedServer {
					http.Error(w, "this address belongs to another database", http.StatusForbidden)
					return
				}
			}
			r.Body = io.NopCloser(bytes.NewReader(raw))
			r.ContentLength = int64(len(raw))
		}

		cssHref := "/adminer/" + key + "/reneo-theme.css?v=2"
		jsHref := "/adminer/" + key + "/reneo-theme.js?v=2"
		proxy := &httputil.ReverseProxy{
			Rewrite: func(pr *httputil.ProxyRequest) {
				pr.Out.URL.Scheme = target.Scheme
				pr.Out.URL.Host = target.Host
				pr.Out.Host = target.Host
				pr.Out.URL.Path = "/" + rest
				pr.Out.URL.RawPath = ""
				pr.Out.Header.Del("Authorization")
				pr.Out.Header.Del("Accept-Encoding")
			},
			ModifyResponse: func(resp *http.Response) error {
				scopeSetCookiesToPrefix(resp.Header, "/adminer/"+key+"/")
				if strings.HasPrefix(resp.Header.Get("Content-Type"), "text/html") && resp.Header.Get("Content-Encoding") == "" {
					// Relax CSP only to allow Google Fonts + same-origin theme assets cleanly
					resp.Header.Del("Content-Security-Policy")
					page, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
					_ = resp.Body.Close()
					if err != nil {
						return err
					}
					page = injectAdminerTheme(page, cssHref, jsHref)
					resp.Body = io.NopCloser(bytes.NewReader(page))
					resp.ContentLength = int64(len(page))
					resp.Header.Set("Content-Length", strconv.Itoa(len(page)))
				}
				return nil
			},
			ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
				http.Error(w, "Adminer is not running. Open it again from the Database window.", http.StatusBadGateway)
			},
		}
		proxy.ServeHTTP(w, r)
	})
}

// scopeSetCookiesToPrefix rewrites every Set-Cookie Path attribute to scopePath (e.g. /adminer/<key>/)
// so opening multiple databases concurrently in different tabs never overwrites each other's session cookies.
func scopeSetCookiesToPrefix(header http.Header, scopePath string) {
	setCookies := header.Values("Set-Cookie")
	if len(setCookies) == 0 {
		return
	}
	if !strings.HasSuffix(scopePath, "/") {
		scopePath += "/"
	}
	header.Del("Set-Cookie")
	for _, sc := range setCookies {
		parts := strings.Split(sc, ";")
		replaced := false
		for i := 1; i < len(parts); i++ {
			trimmed := strings.TrimSpace(parts[i])
			if strings.HasPrefix(strings.ToLower(trimmed), "path=") {
				parts[i] = " Path=" + scopePath
				replaced = true
			}
		}
		if !replaced {
			parts = append(parts, " Path="+scopePath)
		}
		header.Add("Set-Cookie", strings.Join(parts, ";"))
	}
}

// adminerSplitPath turns /adminer/<key>/rest into (key, rest).
func adminerSplitPath(p string) (key, rest string) {
	trimmed := strings.TrimPrefix(p, "/adminer/")
	key, rest, _ = strings.Cut(trimmed, "/")
	return key, rest
}
