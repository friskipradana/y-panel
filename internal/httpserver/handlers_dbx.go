package httpserver

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/userdb"
)

// DBX (t8y2/dbx) for user databases. One managed sidecar container (host network, loopback only, behind a password only the
// panel knows) serves the modern web client for every account; the panel proxies it under /dbx/ behind the panel session, and
// dbx_gate.go decides what each account may ask of it.

const (
	dbxContainer  = "reneo-dbx"
	dbxImage      = "t8y2/dbx:latest"
	dbxDataVolume = "reneo-dbx-data"
	// dbxSetupLabel says how the container was made; one made another way (an older version of the panel started it open
	// on every address and without a password) is replaced
	dbxSetupLabel = "reneo.dbx.setup"
	dbxSetup      = "2-loopback-password"
)

var dbxEnsureMu sync.Mutex

func dbxPort() int {
	if v, err := strconv.Atoi(strings.TrimSpace(os.Getenv("PANEL_DBX_PORT"))); err == nil && v > 1024 && v < 65536 {
		return v
	}
	return 14224
}

func dbxReachable() bool {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(dbxPort())), 400*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

// dbxPassword is the password of the DBX container, made from the key of the panel: the panel logs in with it, nobody else
// has it
func (s *Server) dbxPassword() string {
	mac := hmac.New(sha256.New, []byte(s.cfg.EncryptionKey))
	mac.Write([]byte("reneo-dbx-password"))
	return hex.EncodeToString(mac.Sum(nil))[:40]
}

// retireOpenDbx removes a DBX container made by an older version of the panel, which listened on every address without a
// password, as soon as the agent starts, so it is not left open until somebody opens DBX again
func (s *Server) retireOpenDbx() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	setup, err := dockerOutput(ctx, "inspect", "-f", `{{index .Config.Labels "`+dbxSetupLabel+`"}}`, dbxContainer)
	if err != nil || strings.TrimSpace(setup) == dbxSetup {
		return
	}
	dbxEnsureMu.Lock()
	defer dbxEnsureMu.Unlock()
	if _, err := dockerOutput(ctx, "rm", "-f", dbxContainer); err == nil {
		log.Printf("[dbx] removed a DBX container that was open on every address; it is made again, closed, when DBX is opened")
	}
}

// ensureDbx starts the DBX sidecar when it is missing, stopped or made the old way, and waits until it answers.
func (s *Server) ensureDbx(ctx context.Context) error {
	dbxEnsureMu.Lock()
	defer dbxEnsureMu.Unlock()

	ctx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()

	state, err := dockerOutput(ctx, "inspect", "-f", "{{.State.Status}}", dbxContainer)
	if err == nil {
		setup, _ := dockerOutput(ctx, "inspect", "-f", `{{index .Config.Labels "`+dbxSetupLabel+`"}}`, dbxContainer)
		if strings.TrimSpace(setup) != dbxSetup {
			// the data volume only holds what DBX saves for itself, which the panel never uses
			if out, rmErr := dockerOutput(ctx, "rm", "-f", dbxContainer); rmErr != nil {
				return fmt.Errorf("could not replace DBX: %s", firstOutputLine(out))
			}
			err = errors.New("replaced")
			s.dbxForgetSession()
		}
	}
	switch {
	case err != nil:
		port := strconv.Itoa(dbxPort())
		args := []string{
			"run", "-d",
			"--name", dbxContainer,
			"--label", "reneo.kind=database-control",
			"--label", dbxSetupLabel + "=" + dbxSetup,
			"--restart", "unless-stopped",
			"--network", "host",
			"-v", dbxDataVolume + ":/app/data",
			"-e", "DBX_PORT=" + port,
			"-e", "DBX_BIND_ADDR=127.0.0.1",
			"-e", "DBX_PUBLIC_BASE_PATH=/dbx",
			"-e", "DBX_PASSWORD=" + s.dbxPassword(),
			dbxImage,
		}
		if out, runErr := dockerOutput(ctx, args...); runErr != nil {
			return fmt.Errorf("could not start DBX: %s", firstOutputLine(out))
		}
	case state != "running":
		if out, startErr := dockerOutput(ctx, "start", dbxContainer); startErr != nil {
			return fmt.Errorf("could not start DBX: %s", firstOutputLine(out))
		}
	}
	for i := 0; i < 50; i++ {
		if dbxReachable() {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(300 * time.Millisecond):
		}
	}
	return fmt.Errorf("DBX did not become ready")
}

// The panel's own session with DBX: the browser never holds it.
var (
	dbxSessionMu     sync.Mutex
	dbxSessionCookie string
)

func (s *Server) dbxForgetSession() {
	dbxSessionMu.Lock()
	dbxSessionCookie = ""
	dbxSessionMu.Unlock()
}

func (s *Server) dbxSession(ctx context.Context, base string) (string, error) {
	dbxSessionMu.Lock()
	defer dbxSessionMu.Unlock()
	if dbxSessionCookie != "" {
		return dbxSessionCookie, nil
	}
	payload, _ := json.Marshal(map[string]string{"password": s.dbxPassword()})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/dbx/api/auth/login", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
	for _, c := range resp.Cookies() {
		if c.Name == "dbx_session" && c.Value != "" {
			dbxSessionCookie = c.Value
			return dbxSessionCookie, nil
		}
	}
	return "", fmt.Errorf("DBX did not accept the panel (status %d)", resp.StatusCode)
}

// dbxType is the name DBX gives an engine
func dbxType(engine string) string {
	switch engine {
	case "postgres":
		return "postgres"
	case "mysql", "mariadb":
		return "mysql"
	case "mongodb":
		return "mongodb"
	case "redis":
		return "redis"
	}
	return ""
}

// dbxConnections are the databases of the account that DBX may open: its own, made and running
func (s *Server) dbxConnections(u *database.User) []dbxConn {
	if u == nil || s.database == nil {
		return nil
	}
	items, err := s.database.ListManagedDatabases(u.ID, false)
	if err != nil {
		return nil
	}
	out := make([]dbxConn, 0, len(items))
	for _, item := range items {
		if item.Status != "ready" || userdb.State(item.ID) != "running" || dbxType(item.Engine) == "" {
			continue
		}
		password, err := crypto.Decrypt(s.cfg.EncryptionKey, item.PasswordEncrypted)
		if err != nil {
			continue
		}
		conn := dbxConn{
			ID: dbxConnectionID(item.ID), Name: item.Name, Type: dbxType(item.Engine), Host: userDatabaseHost, Port: item.HostPort,
			User: item.Username, Password: password, Database: item.DatabaseName,
		}
		if item.Engine == "mongodb" {
			conn.Params = "authSource=admin"
		}
		if item.Engine == "redis" {
			conn.User, conn.Database = "", ""
		}
		out = append(out, conn)
	}
	return out
}

// the nodes of the tree the page opens by itself after it connects, down to the tables
func dbxOpenSteps(engine, databaseName string) []string {
	switch engine {
	case "postgres":
		return []string{databaseName, "public", "Tables"}
	case "mysql", "mariadb":
		return []string{databaseName, "Tables"}
	case "mongodb":
		return []string{databaseName}
	}
	return nil
}

// handleDatabaseDbx prepares DBX and sends the browser to /dbx/ with the database to open.
func (s *Server) handleDatabaseDbx(w http.ResponseWriter, r *http.Request) {
	owner := userFromCtx(r)
	found := s.databaseByAccessKey(owner, r.PathValue("key"))
	if found == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "database not found"})
		return
	}
	r.SetPathValue("id", strconv.FormatInt(found.ID, 10))
	_, item, u, ok := s.databaseConn(w, r)
	if !ok {
		return
	}
	if dbxType(item.Engine) == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "DBX does not open this engine"})
		return
	}
	if err := s.ensureDbx(r.Context()); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "database.dbx", "ok", map[string]any{"id": item.ID})

	open, _ := json.Marshal(map[string]any{"name": item.Name, "steps": dbxOpenSteps(item.Engine, item.DatabaseName)})
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, "/dbx/?reneo_open="+url.QueryEscape(string(open)), http.StatusFound)
}

// the page opens what the query asks for: it connects to the database and opens the tree down to its tables, once
const dbxOpenScript = `<script>(function(){try{var q=new URLSearchParams(location.search);var raw=q.get("reneo_open");if(!raw)return;var cfg=JSON.parse(raw);history.replaceState(null,"",location.pathname);var steps=[cfg.name].concat(cfg.steps||[]);var i=0,start=Date.now();function leaf(text){var all=document.querySelectorAll("span,div,a,button,p");for(var n=0;n<all.length;n++){var e=all[n];if(!e.children.length&&e.textContent.trim()===text)return e}return null}var timer=setInterval(function(){if(i>=steps.length||Date.now()-start>30000){clearInterval(timer);return}var el=leaf(steps[i]);if(el){el.click();i++;start=Date.now()}},600)}catch(e){}})()</script>`

// dbxProxy forwards /dbx/ to the DBX container on loopback, request by request, as dbxDecide allows.
func (s *Server) dbxProxy() http.Handler {
	base := "http://" + net.JoinHostPort("127.0.0.1", strconv.Itoa(dbxPort()))
	return s.newDbxProxy(func() string { return base }, s.dbxConnections, true)
}

func (s *Server) newDbxProxy(baseURL func() string, connections func(*database.User) []dbxConn, ensure bool) http.Handler {
	proxyFor := func(cookie string) *httputil.ReverseProxy {
		target, _ := url.Parse(baseURL())
		return &httputil.ReverseProxy{
			Rewrite: func(pr *httputil.ProxyRequest) {
				pr.Out.URL.Scheme = target.Scheme
				pr.Out.URL.Host = target.Host
				pr.Out.Host = target.Host
				pr.Out.URL.Path = pr.In.URL.Path
				pr.Out.URL.RawPath = ""
				pr.SetXForwarded()
				// what the browser holds (the cookies of the panel) is not for DBX; DBX gets the session of the panel
				pr.Out.Header.Del("Authorization")
				pr.Out.Header.Del("Cookie")
				pr.Out.Header.Set("Cookie", "dbx_session="+cookie)
				if pr.In.Method == http.MethodGet && (pr.In.URL.Path == "/dbx/" || pr.In.URL.Path == "/dbx/index.html") {
					pr.Out.Header.Del("Accept-Encoding")
				}
			},
			FlushInterval: -1,
			ModifyResponse: func(resp *http.Response) error {
				resp.Header.Del("Set-Cookie")
				if resp.StatusCode == http.StatusUnauthorized {
					s.dbxForgetSession()
				}
				if resp.Request.Method == http.MethodGet && (resp.Request.URL.Path == "/dbx/" || resp.Request.URL.Path == "/dbx/index.html") &&
					strings.HasPrefix(resp.Header.Get("Content-Type"), "text/html") && resp.Header.Get("Content-Encoding") == "" {
					page, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
					_ = resp.Body.Close()
					if err != nil {
						return err
					}
					page = bytes.Replace(page, []byte("</body>"), []byte(dbxOpenScript+"</body>"), 1)
					resp.Body = io.NopCloser(bytes.NewReader(page))
					resp.ContentLength = int64(len(page))
					resp.Header.Set("Content-Length", strconv.Itoa(len(page)))
					resp.Header.Set("Cache-Control", "no-store")
				}
				return nil
			},
			ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
				http.Error(w, "DBX is not running. Open it again from the Database window.", http.StatusBadGateway)
			},
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := userFromCtx(r)
		if u == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if r.URL.Path == "/dbx" {
			http.Redirect(w, r, "/dbx/", http.StatusPermanentRedirect)
			return
		}
		// one clean path is what is judged and what is forwarded: no dots, no doubled slashes
		clean := path.Clean(r.URL.Path)
		if r.URL.Path == "/dbx/" {
			clean = "/dbx/"
		}
		if !strings.HasPrefix(clean, "/dbx/") {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		r.URL.Path = clean
		inner := strings.TrimPrefix(clean, "/dbx")
		if inner == "/" {
			inner = "/"
		}

		var body []byte
		if r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodHead {
			var err error
			body, err = io.ReadAll(http.MaxBytesReader(w, r.Body, 8<<20))
			if err != nil {
				http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
				return
			}
		}
		// the page itself and its scripts are not judged like the API, but still only read
		verdict := dbxDecide(r.Method, inner, r.URL.Query(), body, connections(u))
		switch verdict.Action {
		case dbxAnswer:
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(verdict.Status)
			_, _ = w.Write(verdict.Body)
			return
		case dbxStream:
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(http.StatusOK)
			flusher, _ := w.(http.Flusher)
			ticker := time.NewTicker(25 * time.Second)
			defer ticker.Stop()
			for {
				_, _ = w.Write([]byte(": keep-alive\n\n"))
				if flusher != nil {
					flusher.Flush()
				}
				select {
				case <-r.Context().Done():
					return
				case <-ticker.C:
				}
			}
		}
		if verdict.NewBody != nil {
			body = verdict.NewBody
		}
		if body != nil {
			r.Body = io.NopCloser(bytes.NewReader(body))
			r.ContentLength = int64(len(body))
			r.Header.Set("Content-Length", strconv.Itoa(len(body)))
		}

		if ensure && !dbxReachable() {
			if err := s.ensureDbx(r.Context()); err != nil {
				http.Error(w, "DBX could not be started: "+err.Error(), http.StatusBadGateway)
				return
			}
		}
		cookie, err := s.dbxSession(r.Context(), baseURL())
		if err != nil {
			http.Error(w, "DBX could not be reached: "+err.Error(), http.StatusBadGateway)
			return
		}
		proxyFor(cookie).ServeHTTP(w, r)
	})
}
