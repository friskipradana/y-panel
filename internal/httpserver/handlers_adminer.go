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

// adminerProxy forwards /adminer/<key>/ to the sidecar. The key selects one of the caller's own
// databases and a sign-in may only name exactly that database's server, so Adminer cannot be
// pointed at anything else on the host.
func (s *Server) adminerProxy() http.Handler {
	target := &url.URL{Scheme: "http", Host: net.JoinHostPort("127.0.0.1", strconv.Itoa(adminerPort()))}
	proxy := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Scheme = target.Scheme
			pr.Out.URL.Host = target.Host
			pr.Out.Host = target.Host
			pr.Out.URL.Path = "/" + adminerRestPath(pr.In.URL.Path)
			pr.Out.URL.RawPath = ""
			pr.Out.Header.Del("Authorization")
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
			http.Error(w, "Adminer is not running. Open it again from the Database window.", http.StatusBadGateway)
		},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := userFromCtx(r)
		if u == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		key, _ := adminerSplitPath(r.URL.Path)
		bound := s.databaseByAccessKey(u, key)
		if bound == nil {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path == "/adminer/"+key {
			http.Redirect(w, r, "/adminer/"+key+"/", http.StatusPermanentRedirect)
			return
		}
		if r.Method == http.MethodPost {
			raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
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
