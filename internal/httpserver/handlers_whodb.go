package httpserver

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
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

// WhoDB (clidey/whodb) lightweight web client for user databases (~35 MB Go + React).
// One sidecar container bound to loopback serves every account behind /whodb/<key>/;
// the panel signs into WhoDB with the exact database credentials and enforces that
// requests under /whodb/<key>/ can only target that single database.

const (
	whodbContainer = "reneo-whodb"
	whodbImage     = "clidey/whodb:latest"
)

var whodbEnsureMu sync.Mutex

func whodbPort() int {
	if v, err := strconv.Atoi(strings.TrimSpace(os.Getenv("PANEL_WHODB_PORT"))); err == nil && v > 1024 && v < 65536 {
		return v
	}
	return 18088
}

func whodbReachable() bool {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(whodbPort())), 400*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func (s *Server) whodbEncryptionKey() string {
	mac := hmac.New(sha256.New, []byte(s.cfg.EncryptionKey))
	mac.Write([]byte("reneo-whodb-encryption-key"))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *Server) ensureWhodb(ctx context.Context) error {
	if whodbReachable() {
		return nil
	}
	whodbEnsureMu.Lock()
	defer whodbEnsureMu.Unlock()
	if whodbReachable() {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()

	state, err := dockerOutput(ctx, "inspect", "-f", "{{.State.Status}}", whodbContainer)
	switch {
	case err != nil:
		port := strconv.Itoa(whodbPort())
		args := []string{
			"run", "-d",
			"--name", whodbContainer,
			"--label", "reneo.kind=database-control",
			"--restart", "unless-stopped",
			"--network", "host",
			"-e", "PORT=" + port,
			"-e", "WHODB_ENCRYPTION_KEY=" + s.whodbEncryptionKey(),
			whodbImage,
		}
		if out, runErr := dockerOutput(ctx, args...); runErr != nil {
			return fmt.Errorf("could not start WhoDB: %s", firstOutputLine(out))
		}
	case state != "running":
		if out, startErr := dockerOutput(ctx, "start", whodbContainer); startErr != nil {
			return fmt.Errorf("could not start WhoDB: %s", firstOutputLine(out))
		}
	}

	for i := 0; i < 50; i++ {
		if whodbReachable() {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(300 * time.Millisecond):
		}
	}
	return fmt.Errorf("WhoDB did not become ready")
}

func whodbType(engine string) string {
	switch engine {
	case "postgres":
		return "Postgres"
	case "mysql":
		return "MySQL"
	case "mariadb":
		return "MariaDB"
	case "mongodb":
		return "MongoDB"
	case "redis":
		return "Redis"
	}
	return ""
}

// whodbLogin performs a server-side GraphQL Login against WhoDB and returns any session cookies.
func whodbLogin(ctx context.Context, base, dbType, host string, port int, user, password, dbName string) []*http.Cookie {
	advanced := []map[string]string{
		{"Key": "Port", "Value": strconv.Itoa(port)},
	}
	if dbType == "Postgres" {
		advanced = append(advanced, map[string]string{"Key": "SSL Mode", "Value": "disable"})
	}
	gql := map[string]any{
		"operationName": "Login",
		"variables": map[string]any{
			"credentials": map[string]any{
				"Type":     dbType,
				"Hostname": host,
				"Username": user,
				"Password": password,
				"Database": dbName,
				"Advanced": advanced,
			},
		},
		"query": `mutation Login($credentials: LoginCredentials!) { Login(credentials: $credentials) { Status } }`,
	}
	payload, _ := json.Marshal(gql)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/api/query", bytes.NewReader(payload))
	if err != nil {
		return nil
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 8 * time.Second}).Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode != http.StatusOK {
		return nil
	}
	return resp.Cookies()
}

// handleDatabaseWhodb ensures WhoDB is running, signs into the selected database, and redirects to /whodb/<key>/.
func (s *Server) handleDatabaseWhodb(w http.ResponseWriter, r *http.Request) {
	owner := userFromCtx(r)
	found := s.databaseByAccessKey(owner, r.PathValue("key"))
	if found == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "database not found"})
		return
	}
	r.SetPathValue("id", strconv.FormatInt(found.ID, 10))
	conn, item, u, ok := s.databaseConn(w, r)
	if !ok {
		return
	}
	dbType := whodbType(item.Engine)
	if dbType == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "WhoDB does not support this engine"})
		return
	}
	if err := s.ensureWhodb(r.Context()); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "database.whodb", "ok", map[string]any{"id": item.ID})

	key := s.databaseAccessKey(item.ID)
	base := "http://" + net.JoinHostPort("127.0.0.1", strconv.Itoa(whodbPort()))
	cookies := whodbLogin(r.Context(), base, dbType, userDatabaseHost, item.HostPort, conn.User, conn.Password, conn.Database)
	secure := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	for _, c := range cookies {
		http.SetCookie(w, &http.Cookie{
			Name:     c.Name,
			Value:    c.Value,
			Path:     "/whodb/" + key,
			HttpOnly: c.HttpOnly,
			SameSite: http.SameSiteLaxMode,
			Secure:   secure,
		})
	}
	w.Header().Set("Cache-Control", "no-store")
	if len(cookies) > 0 {
		http.Redirect(w, r, "/whodb/"+key+"/storage-unit", http.StatusFound)
		return
	}
	http.Redirect(w, r, "/whodb/"+key+"/", http.StatusFound)
}

func whodbShimScript(prefix string) string {
	return fmt.Sprintf(`<script>(function(){var P=%q;var f=window.fetch;if(f){window.fetch=function(u,o){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(P)){u=P+u}return f.call(this,u,o)}}var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string"&&u.startsWith("/")&&!u.startsWith(P)){arguments[1]=P+u}return xo.apply(this,arguments)}})()</script>`, prefix)
}

func whodbSplitPath(p string) (key, rest string) {
	trimmed := strings.TrimPrefix(p, "/whodb/")
	key, rest, _ = strings.Cut(trimmed, "/")
	return key, rest
}

// whodbProxy forwards /whodb/<key>/ to the local WhoDB sidecar with strict per-database isolation.
func (s *Server) whodbProxy() http.Handler {
	target := &url.URL{Scheme: "http", Host: net.JoinHostPort("127.0.0.1", strconv.Itoa(whodbPort()))}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := userFromCtx(r)
		if u == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		key, rest := whodbSplitPath(r.URL.Path)
		bound := s.databaseByAccessKey(u, key)
		if bound == nil {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path == "/whodb/"+key {
			http.Redirect(w, r, "/whodb/"+key+"/", http.StatusPermanentRedirect)
			return
		}

		// Guard GraphQL Login mutations so a user cannot pivot to another host/port
		if r.Method == http.MethodPost && rest == "api/query" && r.Body != nil {
			raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4<<20))
			if err != nil {
				http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
				return
			}
			var gql struct {
				OperationName string         `json:"operationName"`
				Query         string         `json:"query"`
				Variables     map[string]any `json:"variables"`
			}
			if json.Unmarshal(raw, &gql) == nil && (strings.Contains(strings.ToLower(gql.OperationName), "login") || strings.Contains(gql.Query, "Login(")) {
				if creds, ok := gql.Variables["credentials"].(map[string]any); ok {
					host, _ := creds["Hostname"].(string)
					if host != "" && host != userDatabaseHost {
						http.Error(w, "this address belongs to another database", http.StatusForbidden)
						return
					}
					if adv, ok := creds["Advanced"].([]any); ok {
						for _, item := range adv {
							if m, ok := item.(map[string]any); ok && strings.EqualFold(fmt.Sprint(m["Key"]), "port") {
								if strings.TrimSpace(fmt.Sprint(m["Value"])) != strconv.Itoa(bound.HostPort) {
									http.Error(w, "this port belongs to another database", http.StatusForbidden)
									return
								}
							}
						}
					}
				}
			}
			r.Body = io.NopCloser(bytes.NewReader(raw))
			r.ContentLength = int64(len(raw))
			r.Header.Set("Content-Length", strconv.Itoa(len(raw)))
		}

		prefix := "/whodb/" + key
		proxy := &httputil.ReverseProxy{
			Rewrite: func(pr *httputil.ProxyRequest) {
				pr.Out.URL.Scheme = target.Scheme
				pr.Out.URL.Host = target.Host
				pr.Out.Host = target.Host
				pr.Out.URL.Path = "/" + rest
				pr.Out.URL.RawPath = ""
				pr.Out.Header.Del("Authorization")
				if !strings.HasPrefix(rest, "assets/") && !strings.HasPrefix(rest, "api/") {
					pr.Out.Header.Del("Accept-Encoding")
				}
			},
			ModifyResponse: func(resp *http.Response) error {
				// Scope WhoDB cookies to /whodb/<key>
				if setCookies := resp.Header.Values("Set-Cookie"); len(setCookies) > 0 {
					resp.Header.Del("Set-Cookie")
					for _, sc := range setCookies {
						sc = strings.ReplaceAll(sc, "Path=/;", "Path="+prefix+";")
						sc = strings.ReplaceAll(sc, "path=/;", "Path="+prefix+";")
						resp.Header.Add("Set-Cookie", sc)
					}
				}
				if strings.HasPrefix(resp.Header.Get("Content-Type"), "text/html") && resp.Header.Get("Content-Encoding") == "" {
					page, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
					_ = resp.Body.Close()
					if err != nil {
						return err
					}
					page = bytes.ReplaceAll(page, []byte(`src="/`), []byte(`src="`+prefix+`/`))
					page = bytes.ReplaceAll(page, []byte(`href="/`), []byte(`href="`+prefix+`/`))
					page = bytes.Replace(page, []byte("<head>"), []byte("<head>"+whodbShimScript(prefix)), 1)
					resp.Body = io.NopCloser(bytes.NewReader(page))
					resp.ContentLength = int64(len(page))
					resp.Header.Set("Content-Length", strconv.Itoa(len(page)))
					resp.Header.Set("Cache-Control", "no-store")
				}
				return nil
			},
			ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
				http.Error(w, "WhoDB is not running. Open it again from the Database window.", http.StatusBadGateway)
			},
		}
		proxy.ServeHTTP(w, r)
	})
}
