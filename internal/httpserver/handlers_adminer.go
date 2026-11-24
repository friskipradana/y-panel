package httpserver

import (
	"bytes"
	"context"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
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
	out, err := exec.CommandContext(ctx, "docker", args...).CombinedOutput()
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

// Modern Reneo CSS served as /adminer/<key>/reneo-theme.css (same-origin, so Adminer's CSP allows it).
const adminerModernThemeCSS = `
:root{--rn-bg:#f8fafc;--rn-surface:#ffffff;--rn-border:#e2e8f0;--rn-text:#0f172a;--rn-muted:#475569;--rn-primary:#2563eb;--rn-primary-hover:#1d4ed8;--rn-row:#f8fafc;--rn-soft:#eff6ff}
*{box-sizing:border-box}
html,body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif !important;font-size:13px !important;line-height:1.5 !important;background:var(--rn-bg) !important;color:var(--rn-text) !important;margin:0 !important;padding:0 !important}
a{color:var(--rn-primary) !important;text-decoration:none !important}
a:hover{text-decoration:underline !important}
#lang{position:fixed !important;top:0 !important;left:0 !important;width:256px !important;height:44px !important;padding:8px 14px !important;background:var(--rn-surface) !important;border-right:1px solid var(--rn-border) !important;border-bottom:1px solid var(--rn-border) !important;z-index:20 !important;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--rn-muted)}
#lang select{padding:3px 6px !important;font-size:12px !important;border-radius:6px !important}
#menu{position:fixed !important;top:44px !important;left:0 !important;bottom:0 !important;width:256px !important;margin:0 !important;padding:14px !important;background:var(--rn-surface) !important;border-right:1px solid var(--rn-border) !important;overflow-y:auto !important}
#menu h1{background:none !important;border:0 !important;border-bottom:1px solid var(--rn-border) !important;padding:0 0 10px 0 !important;margin:0 0 12px 0 !important;font-size:16px !important;font-weight:700 !important;color:var(--rn-text) !important;font-style:normal !important}
#menu h1 a{color:var(--rn-text) !important}
#menu .version{font-size:11px !important;font-weight:500 !important;color:var(--rn-muted) !important;margin-left:4px}
#menu p,#menu .links{margin:10px 0 !important;padding:0 !important;border:0 !important}
#menu .links a{display:inline-flex !important;align-items:center;padding:5px 9px !important;margin:0 4px 6px 0 !important;border-radius:6px !important;background:var(--rn-bg) !important;border:1px solid var(--rn-border) !important;color:var(--rn-text) !important;font-size:12px !important;font-weight:500 !important}
#menu .links a:hover{background:var(--rn-soft) !important;border-color:#bfdbfe !important;color:var(--rn-primary) !important;text-decoration:none !important}
#tables{list-style:none !important;padding:0 !important;margin:10px 0 0 0 !important}
#tables li{padding:2px 0 !important;margin:0 !important}
#tables a{display:inline-block;padding:3px 6px;border-radius:6px;color:var(--rn-text) !important;font-size:12.5px}
#tables a:hover{background:var(--rn-soft) !important;color:var(--rn-primary) !important;text-decoration:none !important}
#content{margin:0 0 0 256px !important;padding:64px 28px 32px 28px !important;background:var(--rn-bg) !important;min-height:100vh}
#breadcrumb{position:fixed !important;top:0 !important;left:256px !important;right:0 !important;height:44px !important;line-height:44px !important;padding:0 24px !important;margin:0 !important;background:var(--rn-surface) !important;border-bottom:1px solid var(--rn-border) !important;font-size:12.5px !important;color:var(--rn-muted) !important;z-index:15 !important}
.logout{position:fixed !important;top:6px !important;right:20px !important;margin:0 !important;z-index:25 !important}
.logout input[type=submit]{background:var(--rn-surface) !important;color:var(--rn-text) !important;border:1px solid var(--rn-border) !important;padding:5px 12px !important;border-radius:6px !important;font-size:12px !important;font-weight:500 !important}
.logout input[type=submit]:hover{background:#fee2e2 !important;color:#b91c1c !important;border-color:#fecaca !important}
h2{font-size:20px !important;font-weight:700 !important;background:none !important;border:0 !important;border-bottom:1px solid var(--rn-border) !important;color:var(--rn-text) !important;padding:0 0 12px 0 !important;margin:0 0 16px 0 !important}
h3{font-size:14px !important;font-weight:600 !important;color:var(--rn-text) !important;margin:20px 0 8px 0 !important}
p.links{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px 0 !important}
p.links a{display:inline-flex;align-items:center;padding:6px 12px;border-radius:7px;background:var(--rn-surface);border:1px solid var(--rn-border);color:var(--rn-text) !important;font-size:12.5px;font-weight:500}
p.links a:hover{background:var(--rn-soft);border-color:#bfdbfe;color:var(--rn-primary) !important;text-decoration:none !important}
table{border-collapse:collapse !important;background:var(--rn-surface) !important;border:1px solid var(--rn-border) !important;border-radius:8px;overflow:hidden;margin:12px 0 !important;box-shadow:0 1px 2px rgba(15,23,42,.04)}
th,thead td{background:#f1f5f9 !important;color:var(--rn-muted) !important;font-weight:600 !important;font-size:12px !important;text-align:left;padding:9px 12px !important;border:1px solid var(--rn-border) !important}
td{padding:8px 12px !important;border:1px solid var(--rn-border) !important;vertical-align:top}
tbody tr:nth-child(even) td{background:var(--rn-row) !important}
tbody tr:hover td{background:var(--rn-soft) !important}
input[type=text],input[type=password],input[type=search],input[type=number],select,textarea{font-family:inherit !important;font-size:13px !important;padding:6px 10px !important;border:1px solid #cbd5e1 !important;border-radius:6px !important;background:#fff !important;color:var(--rn-text) !important}
input:focus,select:focus,textarea:focus{outline:2px solid #93c5fd !important;outline-offset:1px;border-color:var(--rn-primary) !important}
textarea.sqlarea,pre,code{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace !important;font-size:12.5px !important}
input[type=submit],button{background:var(--rn-primary) !important;color:#fff !important;border:1px solid var(--rn-primary) !important;border-radius:6px !important;padding:6px 14px !important;font-size:12.5px !important;font-weight:600 !important;cursor:pointer}
input[type=submit]:hover,button:hover{background:var(--rn-primary-hover) !important}
.message{background:#ecfdf5 !important;color:#065f46 !important;border:1px solid #a7f3d0 !important;border-radius:8px !important;padding:10px 14px !important;margin:12px 0 !important;font-size:12.5px}
.error{background:#fef2f2 !important;color:#991b1b !important;border:1px solid #fecaca !important;border-radius:8px !important;padding:10px 14px !important;margin:12px 0 !important;font-size:12.5px}
fieldset{border:1px solid var(--rn-border) !important;border-radius:8px !important;background:var(--rn-surface) !important;padding:14px 16px !important;margin:12px 0 !important}
legend{font-weight:600;color:var(--rn-muted);padding:0 6px}
@media(max-width:768px){#lang,#menu,#breadcrumb,.logout{position:static !important;width:100% !important;height:auto !important;border-right:0 !important}#content{margin-left:0 !important;padding:14px !important}}
`

func injectAdminerTheme(page []byte, cssHref string) []byte {
	linkTag := []byte(`<link rel="stylesheet" href="` + cssHref + `">`)
	lower := bytes.ToLower(page)
	if idx := bytes.Index(lower, []byte("</head>")); idx >= 0 {
		out := make([]byte, 0, len(page)+len(linkTag))
		out = append(out, page[:idx]...)
		out = append(out, linkTag...)
		out = append(out, page[idx:]...)
		return out
	}
	if idx := bytes.Index(lower, []byte("<body")); idx >= 0 {
		out := make([]byte, 0, len(page)+len(linkTag))
		out = append(out, page[:idx]...)
		out = append(out, linkTag...)
		out = append(out, page[idx:]...)
		return out
	}
	return append(page, linkTag...)
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
		bound := s.databaseByAccessKey(u, key)
		if bound == nil {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path == "/adminer/"+key {
			http.Redirect(w, r, "/adminer/"+key+"/", http.StatusPermanentRedirect)
			return
		}
		if rest == "reneo-theme.css" {
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
			w.Header().Set("Cache-Control", "public, max-age=3600")
			_, _ = w.Write([]byte(adminerModernThemeCSS))
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
				if server != net.JoinHostPort(userDatabaseHost, strconv.Itoa(bound.HostPort)) {
					http.Error(w, "this address belongs to another database", http.StatusForbidden)
					return
				}
			}
			r.Body = io.NopCloser(bytes.NewReader(raw))
			r.ContentLength = int64(len(raw))
		}

		cssHref := "/adminer/" + key + "/reneo-theme.css"
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
				if strings.HasPrefix(resp.Header.Get("Content-Type"), "text/html") && resp.Header.Get("Content-Encoding") == "" {
					page, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
					_ = resp.Body.Close()
					if err != nil {
						return err
					}
					page = injectAdminerTheme(page, cssHref)
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

// adminerSplitPath turns /adminer/<key>/rest into (key, rest).
func adminerSplitPath(p string) (key, rest string) {
	trimmed := strings.TrimPrefix(p, "/adminer/")
	key, rest, _ = strings.Cut(trimmed, "/")
	return key, rest
}

func adminerRestPath(p string) string {
	_, rest := adminerSplitPath(p)
	return rest
}
