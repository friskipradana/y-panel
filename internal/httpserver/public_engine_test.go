package httpserver

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"errors"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeWebHost stands in for the machine: which web servers are installed, what the commands answer, and what certbot leaves behind
type fakeWebHost struct {
	mu       sync.Mutex
	calls    []string
	installs map[string]string
	failures map[string]string
	liveDir  string
}

func (h *fakeWebHost) run(_ context.Context, name string, args ...string) (string, error) {
	line := strings.TrimSpace(name + " " + strings.Join(args, " "))
	h.mu.Lock()
	defer h.mu.Unlock()
	h.calls = append(h.calls, line)
	for prefix, out := range h.failures {
		if strings.HasPrefix(line, prefix) {
			return out, errors.New("exit status 1")
		}
	}
	switch {
	case name == "which":
		if path, ok := h.installs[args[0]]; ok {
			return path + "\n", nil
		}
		return "", errors.New("not found")
	case line == "/usr/sbin/nginx -v":
		return "nginx version: nginx/1.24.0\n", nil
	case line == "/usr/sbin/nginx -t", strings.HasPrefix(line, "systemctl reload"):
		return "ok", nil
	case line == "systemctl is-active nginx":
		return "active\n", nil
	case line == "/usr/sbin/apache2ctl -v":
		return "Server version: Apache/2.4.58\n", nil
	case line == "/usr/sbin/apache2ctl -M":
		return " proxy_module proxy_http_module proxy_wstunnel_module rewrite_module headers_module ssl_module setenvif_module\n", nil
	case name == "certbot":
		if !strings.Contains(line, "--dry-run") {
			// the real run leaves the certificate where the web server reads it
			host := args[indexOf(args, "-d")+1]
			dir := filepath.Join(h.liveDir, host)
			_ = os.MkdirAll(dir, 0o755)
			key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
			der, _ := x509.CreateCertificate(rand.Reader, &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "R11"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(80 * 24 * time.Hour)},
				&x509.Certificate{SerialNumber: big.NewInt(2), Subject: pkix.Name{CommonName: "R11"}}, &key.PublicKey, key)
			_ = os.WriteFile(filepath.Join(dir, "fullchain.pem"), pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o644)
			_ = os.WriteFile(filepath.Join(dir, "privkey.pem"), []byte("key"), 0o600)
		}
		return "ok", nil
	}
	return "", errors.New("unexpected command: " + line)
}

func indexOf(list []string, want string) int {
	for i, v := range list {
		if v == want {
			return i
		}
	}
	return -1
}

func (h *fakeWebHost) count(prefix string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, c := range h.calls {
		if strings.HasPrefix(c, prefix) {
			n++
		}
	}
	return n
}

func (h *fakeWebHost) fail(prefix, out string) {
	h.mu.Lock()
	h.failures[prefix] = out
	h.mu.Unlock()
}

func (h *fakeWebHost) heal(prefix string) {
	h.mu.Lock()
	delete(h.failures, prefix)
	h.mu.Unlock()
}

// The domains can be served by the nginx (or Apache) that the install already runs: Reneo writes a file per domain, tests the
// configuration before it reloads, gets the certificate with certbot, and writes the https side once it exists. Skipped without
// REN_TEST_DATABASE_URL.
func TestIntegrationDomainsServedThroughNginx(t *testing.T) {
	f := newPublicFixture(t)
	confDir, liveDir := t.TempDir(), t.TempDir()
	t.Setenv("PANEL_WEB_CONF_DIR", confDir)
	t.Setenv("PANEL_WEB_LIVE_DIR", liveDir)
	f.s.cfg.StateDir = t.TempDir()
	host := &fakeWebHost{installs: map[string]string{"nginx": "/usr/sbin/nginx", "certbot": "/usr/bin/certbot"}, failures: map[string]string{}, liveDir: liveDir}
	f.s.testWebRunner = host.run
	dns := stubDNS(t)

	status := func() map[string]any {
		code, text := f.do(f.s.handlePublicProxyStatus, http.MethodGet, "/", "", "")
		if code != http.StatusOK {
			t.Fatalf("status: %d %s", code, text)
		}
		var out map[string]any
		_ = json.Unmarshal([]byte(text), &out)
		return out
	}
	conf := func(name string) string {
		data, _ := os.ReadFile(filepath.Join(confDir, name))
		return string(data)
	}

	// the engines the page offers
	_, text := f.do(f.s.handlePublicEngines, http.MethodGet, "/api/v1/public-proxy/engines", "", "")
	for _, want := range []string{`"name":"builtin"`, `"name":"nginx"`, `"installed":true`, `"name":"apache"`, `"certbot":true`, `"version":"nginx/1.24.0"`} {
		if !strings.Contains(text, want) {
			t.Fatalf("the engines lack %s: %s", want, text)
		}
	}

	// a web server that is not installed is not a way to serve
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"engine":"apache","enabled":true,"confirmPublicIp":true}`, ""); code != http.StatusConflict || !strings.Contains(text, "not installed") {
		t.Fatalf("apache is not installed: %d %s", code, text)
	}
	if st := status(); st["enabled"] != false || st["running"] != false || st["engine"] != "apache" {
		t.Fatalf("it stays off, and the choice is kept: %v", st)
	}
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"engine":"caddy"}`, ""); code != http.StatusBadRequest {
		t.Fatalf("an engine that does not exist: %d %s", code, text)
	}

	// nginx: nothing is opened by Reneo, and the confirmation still counts
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"engine":"nginx","enabled":true}`, ""); code != http.StatusBadRequest || !strings.Contains(text, "confirm") {
		t.Fatalf("without the confirmation: %d %s", code, text)
	}
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"engine":"nginx","enabled":true,"confirmPublicIp":true}`, ""); code != http.StatusOK {
		t.Fatalf("on through nginx: %d %s", code, text)
	}
	st := status()
	if st["running"] != true || st["engine"] != "nginx" || st["http"] != "" || st["https"] != "" {
		t.Fatalf("running through nginx, no ports of its own: %v", st)
	}
	if engineState, _ := st["engineStatus"].(map[string]any); engineState["name"] != "nginx" || engineState["confDir"] != confDir {
		t.Fatalf("the engine says where its files are: %v", st["engineStatus"])
	}
	if !strings.Contains(conf("reneo-00-websocket.conf"), "$reneo_connection_upgrade") {
		t.Fatal("the first write is made when it starts")
	}
	if host.count("/usr/sbin/nginx -t") < 1 || host.count("systemctl reload nginx") < 1 {
		t.Fatalf("tested and reloaded: %v", host.calls)
	}

	// a domain: its plain address answers the challenge and nothing else until it has a certificate
	route := f.createRoute(t, `{"hostname":"panel.example.com","kind":"panel"}`)
	eventually(t, "the file of the domain", func() bool {
		return strings.Contains(conf("reneo-panel.example.com.conf"), "server_name panel.example.com")
	})
	pending := conf("reneo-panel.example.com.conf")
	if strings.Contains(pending, "listen 443") || strings.Contains(pending, "proxy_pass") || !strings.Contains(pending, "acme-challenge") || !strings.Contains(pending, "return 404") {
		t.Fatalf("before the certificate:\n%s", pending)
	}

	// the check: DNS, then a test certificate from certbot
	dns.set(nil, map[string][]string{"panel.example.com": {"203.0.113.10"}})
	code, text := f.do(f.s.handleCheckPublicRoute, http.MethodPost, "/", "", strconv.FormatInt(route.ID, 10))
	if code != http.StatusOK || !strings.Contains(text, `"ok":true`) {
		t.Fatalf("the check through certbot: %d %s", code, text)
	}
	if host.count("certbot certonly --webroot") != 1 {
		t.Fatalf("one test run: %v", host.calls)
	}
	if _, err := os.Stat(filepath.Join(liveDir, "panel.example.com", "fullchain.pem")); err == nil {
		t.Fatal("a test run keeps no certificate")
	}

	// the real certificate: certbot, then the https side is written, with the proxy to the panel
	engine := f.s.runningPublicProxy()
	if err := engine.Obtain(context.Background(), "panel.example.com"); err != nil {
		t.Fatalf("obtain: %v", err)
	}
	secure := conf("reneo-panel.example.com.conf")
	for _, want := range []string{"listen 443 ssl;", "return 301 https://$host$request_uri;", "proxy_pass http://127.0.0.1:8787;", "/panel.example.com/fullchain.pem"} {
		if !strings.Contains(secure, want) {
			t.Fatalf("after the certificate the file lacks %q:\n%s", want, secure)
		}
	}
	if _, text := f.do(f.s.handlePublicRoutesTable, http.MethodGet, "/", "", ""); !strings.Contains(text, `"state":"issued"`) || !strings.Contains(text, `"certIssuer":"R11"`) {
		t.Fatalf("the table shows the certificate that certbot made: %s", text)
	}

	// a configuration that nginx refuses is not left in place, and the page can say so
	host.fail("/usr/sbin/nginx -t", "nginx: [emerg] unknown directive")
	f.createRoute(t, `{"hostname":"shop.example.com","kind":"port","port":5000}`)
	eventually(t, "the error of the failed write", func() bool {
		engineState, _ := status()["engineStatus"].(map[string]any)
		msg, _ := engineState["lastError"].(string)
		return strings.Contains(msg, "nothing was changed")
	})
	if _, err := os.Stat(filepath.Join(confDir, "reneo-shop.example.com.conf")); !os.IsNotExist(err) {
		t.Fatal("the file that nginx refused is gone")
	}
	if !strings.Contains(conf("reneo-panel.example.com.conf"), "proxy_pass") {
		t.Fatal("what worked before keeps working")
	}
	host.heal("/usr/sbin/nginx -t")
	f.s.forgetPublicRoutes()
	eventually(t, "the write after the fix", func() bool {
		return strings.Contains(conf("reneo-shop.example.com.conf"), "server_name shop.example.com")
	})
	eventually(t, "the error to clear", func() bool {
		engineState, _ := status()["engineStatus"].(map[string]any)
		msg, _ := engineState["lastError"].(string)
		return msg == ""
	})

	// a domain that is deleted loses its file
	if code, _ := f.do(f.s.handleDeletePublicRoute, http.MethodDelete, "/", "", strconv.FormatInt(route.ID, 10)); code != http.StatusOK {
		t.Fatal("delete")
	}
	eventually(t, "the file of the deleted domain to go", func() bool {
		_, err := os.Stat(filepath.Join(confDir, "reneo-panel.example.com.conf"))
		return os.IsNotExist(err)
	})

	// back to the proxy of Reneo, which binds its own ports
	if code, text := f.do(f.s.handleSetPublicProxy, http.MethodPut, "/", `{"engine":"builtin"}`, ""); code != http.StatusOK {
		t.Fatalf("back to builtin: %d %s", code, text)
	}
	if st := status(); st["running"] != true || st["engine"] != "builtin" || st["https"] == "" {
		t.Fatalf("builtin: %v", st)
	}
}

// The ports of the proxy of Reneo that someone else holds are named, so a person who has nginx on 80 is pointed to it
func TestIntegrationEnginesNameTheBusyPorts(t *testing.T) {
	f := newPublicFixture(t)
	busy, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer busy.Close()
	t.Setenv("PANEL_PUBLIC_HTTP_ADDR", busy.Addr().String())
	f.s.testWebRunner = (&fakeWebHost{installs: map[string]string{}, failures: map[string]string{}}).run
	_, text := f.do(f.s.handlePublicEngines, http.MethodGet, "/", "", "")
	if !strings.Contains(text, `"portsBusy":["`+busy.Addr().String()+`"]`) {
		t.Fatalf("the busy port is named: %s", text)
	}
	if !strings.Contains(text, `"name":"nginx","installed":false`) {
		t.Fatalf("nothing installed: %s", text)
	}
}
