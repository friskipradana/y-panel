package httpserver

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// DBX (t8y2/dbx) for user databases. Runs as a managed sidecar container (host network, loopback only)
// serving the modern web client; the panel proxies it under /dbx/ behind the panel session.

const (
	dbxContainer  = "reneo-dbx"
	dbxImage      = "t8y2/dbx:latest"
	dbxDataVolume = "reneo-dbx-data"
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

// ensureDbx starts the DBX sidecar when it is missing or stopped and waits until it answers.
func ensureDbx(ctx context.Context) error {
	if dbxReachable() {
		return nil
	}
	dbxEnsureMu.Lock()
	defer dbxEnsureMu.Unlock()
	if dbxReachable() {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()

	state, err := dockerOutput(ctx, "inspect", "-f", "{{.State.Status}}", dbxContainer)
	switch {
	case err != nil:
		port := strconv.Itoa(dbxPort())
		args := []string{
			"run", "-d",
			"--name", dbxContainer,
			"--label", "reneo.kind=database-control",
			"--restart", "unless-stopped",
			"--network", "host",
			"-v", dbxDataVolume + ":/app/data",
			"-e", "DBX_PORT=" + port,
			"-e", "DBX_PUBLIC_BASE_PATH=/dbx",
			"-e", "DBX_DISABLE_PASSWORD=true",
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

// handleDatabaseDbx prepares DBX and redirects the browser to /dbx/.
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
	if err := ensureDbx(r.Context()); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "database.dbx", "ok", map[string]any{"id": item.ID})

	http.Redirect(w, r, "/dbx/", http.StatusFound)
}

// dbxProxy forwards /dbx/ to the DBX container on loopback.
func (s *Server) dbxProxy() http.Handler {
	target := &url.URL{Scheme: "http", Host: net.JoinHostPort("127.0.0.1", strconv.Itoa(dbxPort()))}
	proxy := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Scheme = target.Scheme
			pr.Out.URL.Host = target.Host
			pr.Out.Host = target.Host
			pr.Out.URL.Path = pr.In.URL.Path
			pr.Out.URL.RawPath = pr.In.URL.RawPath
			pr.SetXForwarded()
			pr.Out.Header.Del("Authorization")
		},
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
			http.Error(w, "DBX is not running. Open it again from the Database window.", http.StatusBadGateway)
		},
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
		if !dbxReachable() {
			if err := ensureDbx(r.Context()); err != nil {
				http.Error(w, "DBX could not be started: "+err.Error(), http.StatusBadGateway)
				return
			}
		}
		proxy.ServeHTTP(w, r)
	})
}
