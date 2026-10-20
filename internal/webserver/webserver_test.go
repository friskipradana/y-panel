package webserver

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeHost answers the commands of the tests and remembers them
type fakeHost struct {
	mu       sync.Mutex
	calls    []string
	answers  map[string]string
	failures map[string]string
}

func newHost() *fakeHost {
	return &fakeHost{answers: map[string]string{}, failures: map[string]string{}}
}

func (h *fakeHost) run(_ context.Context, name string, args ...string) (string, error) {
	line := strings.TrimSpace(name + " " + strings.Join(args, " "))
	h.mu.Lock()
	defer h.mu.Unlock()
	h.calls = append(h.calls, line)
	for prefix, out := range h.failures {
		if strings.HasPrefix(line, prefix) {
			return out, errors.New("exit status 1")
		}
	}
	for prefix, out := range h.answers {
		if strings.HasPrefix(line, prefix) {
			return out, nil
		}
	}
	return "", errors.New("not found: " + line)
}

func (h *fakeHost) called(prefix string) int {
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

func (h *fakeHost) index(prefix string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	for i, c := range h.calls {
		if strings.HasPrefix(c, prefix) {
			return i
		}
	}
	return -1
}

func (h *fakeHost) reset() {
	h.mu.Lock()
	h.calls = nil
	h.mu.Unlock()
}

func nginxManager(t *testing.T) (*Manager, *fakeHost, string) {
	t.Helper()
	host := newHost()
	host.answers["which nginx"] = "/usr/sbin/nginx\n"
	host.answers["which certbot"] = "/usr/bin/certbot\n"
	host.answers["/usr/sbin/nginx -v"] = "nginx version: nginx/1.24.0\n"
	host.answers["/usr/sbin/nginx -t"] = "ok"
	host.answers["systemctl is-active nginx"] = "active\n"
	host.answers["systemctl reload nginx"] = ""
	dir := t.TempDir()
	return New(Options{Kind: Nginx, Run: host.run, ConfDir: dir, Webroot: filepath.Join(t.TempDir(), "acme"), LiveDir: filepath.Join(t.TempDir(), "live"), Email: "owner@example.com"}), host, dir
}

func apacheManager(t *testing.T, debian bool) (*Manager, *fakeHost, string, string) {
	t.Helper()
	host := newHost()
	host.answers["which apache2ctl"] = "/usr/sbin/apache2ctl\n"
	host.answers["which certbot"] = "/usr/bin/certbot\n"
	host.answers["/usr/sbin/apache2ctl -v"] = "Server version: Apache/2.4.58 (Ubuntu)\nServer built: x\n"
	host.answers["/usr/sbin/apache2ctl -M"] = " proxy_module (shared)\n proxy_http_module (shared)\n proxy_wstunnel_module (shared)\n rewrite_module (shared)\n headers_module (shared)\n ssl_module (shared)\n setenvif_module (shared)\n"
	host.answers["/usr/sbin/apache2ctl -t"] = "Syntax OK"
	host.answers["systemctl is-active apache2"] = "active\n"
	host.answers["systemctl reload apache2"] = ""
	root := t.TempDir()
	available, enabled := filepath.Join(root, "sites-available"), ""
	if debian {
		enabled = filepath.Join(root, "sites-enabled")
	}
	return New(Options{Kind: Apache, Run: host.run, ConfDir: available, EnabledDir: enabled, Webroot: filepath.Join(t.TempDir(), "acme"), LiveDir: filepath.Join(t.TempDir(), "live")}), host, available, enabled
}

func TestDetectNginx(t *testing.T) {
	m, host, _ := nginxManager(t)
	info := m.Detect(context.Background())
	if !info.Installed || info.Binary != "/usr/sbin/nginx" || info.Version != "nginx/1.24.0" || !info.Running || !info.Certbot {
		t.Fatalf("nginx: %+v", info)
	}
	delete(host.answers, "which nginx")
	delete(host.answers, "which certbot")
	delete(host.answers, "systemctl is-active nginx")
	if info := m.Detect(context.Background()); info.Installed || info.Running || info.Certbot {
		t.Fatalf("nothing installed: %+v", info)
	}
}

func TestDetectApacheNamesTheMissingModules(t *testing.T) {
	m, host, _, _ := apacheManager(t, true)
	info := m.Detect(context.Background())
	if !info.Installed || info.Version != "Apache/2.4.58 (Ubuntu)" || !info.Running || len(info.Missing) != 0 {
		t.Fatalf("apache: %+v", info)
	}
	host.answers["/usr/sbin/apache2ctl -M"] = " proxy_module (shared)\n ssl_module (shared)\n"
	info = m.Detect(context.Background())
	if strings.Join(info.Missing, ",") != "proxy_http,proxy_wstunnel,rewrite,headers,setenvif" {
		t.Fatalf("missing: %v", info.Missing)
	}
}

func TestPrepare(t *testing.T) {
	ctx := context.Background()
	m, host, _ := nginxManager(t)
	if err := m.Prepare(ctx); err != nil {
		t.Fatalf("a ready nginx: %v", err)
	}
	if _, err := os.Stat(m.webroot()); err != nil {
		t.Fatal("the folder of the challenges is made")
	}
	delete(host.answers, "which certbot")
	if err := m.Prepare(ctx); err == nil || !strings.Contains(err.Error(), "certbot is not installed") {
		t.Fatalf("without certbot: %v", err)
	}
	delete(host.answers, "which nginx")
	if err := m.Prepare(ctx); !errors.Is(err, ErrNotInstalled) {
		t.Fatalf("without nginx: %v", err)
	}

	a, ahost, _, _ := apacheManager(t, true)
	ahost.answers["/usr/sbin/apache2ctl -M"] = " proxy_module (shared)\n ssl_module (shared)\n"
	if err := a.Prepare(ctx); err == nil || !strings.Contains(err.Error(), "missing the modules") {
		t.Fatalf("apache without a2enmod names the modules: %v", err)
	}
	ahost.answers["which a2enmod"] = "/usr/sbin/a2enmod\n"
	ahost.answers["a2enmod "] = "enabled"
	if err := a.Prepare(ctx); err != nil {
		t.Fatalf("with a2enmod the modules are enabled: %v", err)
	}
	if ahost.called("a2enmod proxy_http proxy_wstunnel rewrite headers setenvif") != 1 {
		t.Fatalf("a2enmod: %v", ahost.calls)
	}
}

func TestRenderNginx(t *testing.T) {
	m, _, _ := nginxManager(t)
	files, err := m.render([]Site{
		{Host: "blog.example.com", Port: 31001, Secure: true},
		{Host: "new.example.com", Port: 31002},
		{Host: "idle.example.com", Port: 0, Secure: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(files["reneo-00-websocket.conf"], "map $http_upgrade $reneo_connection_upgrade") {
		t.Fatal("the websocket map")
	}
	secure := files["reneo-blog.example.com.conf"]
	for _, want := range []string{
		"server_name blog.example.com;", "location ^~ /.well-known/acme-challenge/", "return 301 https://$host$request_uri;",
		"listen 443 ssl;", "/blog.example.com/fullchain.pem", "/blog.example.com/privkey.pem", "proxy_pass http://127.0.0.1:31001;",
		`proxy_set_header Forwarded "";`, `proxy_set_header CF-Connecting-IP "";`, `proxy_set_header True-Client-IP "";`,
		"proxy_set_header X-Forwarded-For $remote_addr;", "proxy_set_header X-Real-IP $remote_addr;", "proxy_set_header X-Forwarded-Proto https;",
		"proxy_set_header Upgrade $http_upgrade;", "proxy_set_header Connection $reneo_connection_upgrade;", "Managed by Reneo",
	} {
		if !strings.Contains(secure, want) {
			t.Errorf("the https site lacks %q\n%s", want, secure)
		}
	}
	if strings.Contains(secure, "$http_x_forwarded_for") || strings.Contains(secure, "$proxy_add_x_forwarded_for") {
		t.Error("what the visitor sent in X-Forwarded-For must not be forwarded")
	}
	pending := files["reneo-new.example.com.conf"]
	if strings.Contains(pending, "443") || strings.Contains(pending, "proxy_pass") || !strings.Contains(pending, "return 404;") || !strings.Contains(pending, "acme-challenge") {
		t.Errorf("a domain without a certificate only answers the challenge:\n%s", pending)
	}
	if idle := files["reneo-idle.example.com.conf"]; strings.Contains(idle, "proxy_pass") || !strings.Contains(idle, "return 502;") {
		t.Errorf("a domain whose port is not known answers 502:\n%s", idle)
	}
}

func TestRenderApache(t *testing.T) {
	m, _, _, _ := apacheManager(t, true)
	files, err := m.render([]Site{{Host: "blog.example.com", Port: 31001, Secure: true}, {Host: "new.example.com", Port: 31002}})
	if err != nil {
		t.Fatal(err)
	}
	secure := files["reneo-blog.example.com.conf"]
	for _, want := range []string{
		"<VirtualHost *:80>", "ServerName blog.example.com", "Alias /.well-known/acme-challenge/", "RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]",
		"<VirtualHost *:443>", "SSLEngine on", "/blog.example.com/fullchain.pem", "ProxyPass / http://127.0.0.1:31001/", "ProxyPassReverse / http://127.0.0.1:31001/",
		"RequestHeader unset Forwarded", "RequestHeader unset CF-Connecting-IP", "RequestHeader unset True-Client-IP", "RequestHeader unset X-Forwarded-For",
		`RequestHeader set X-Forwarded-Proto "https"`, "RewriteRule ^/(.*) ws://127.0.0.1:31001/$1 [P,L]", "ProxyPreserveHost On",
	} {
		if !strings.Contains(secure, want) {
			t.Errorf("the https site lacks %q\n%s", want, secure)
		}
	}
	pending := files["reneo-new.example.com.conf"]
	if strings.Contains(pending, "443") || strings.Contains(pending, "ProxyPass") || !strings.Contains(pending, "R=404") {
		t.Errorf("a domain without a certificate only answers the challenge:\n%s", pending)
	}
}

func TestRenderRefusesWhatIsNotADomain(t *testing.T) {
	m, _, _ := nginxManager(t)
	for _, host := range []string{"", "a b.com", "../etc/passwd", "x;y.com", "x.com\nserver {", "-x.com", "UPPER.com", "a..b.com"} {
		if _, err := m.render([]Site{{Host: host, Port: 80}}); err == nil {
			t.Errorf("%q must be refused", host)
		}
	}
}

func TestApplyWritesTestsAndReloads(t *testing.T) {
	ctx := context.Background()
	m, host, dir := nginxManager(t)
	// a file that is not Reneo's is never touched
	foreign := filepath.Join(dir, "default.conf")
	if err := os.WriteFile(foreign, []byte("server { listen 8080; }"), 0o644); err != nil {
		t.Fatal(err)
	}
	sites := []Site{{Host: "blog.example.com", Port: 31001, Secure: true}, {Host: "shop.example.com", Port: 31002}}
	changed, err := m.Apply(ctx, sites)
	if err != nil || !changed {
		t.Fatalf("apply: %v %v", changed, err)
	}
	for _, name := range []string{"reneo-00-websocket.conf", "reneo-blog.example.com.conf", "reneo-shop.example.com.conf"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("%s was not written", name)
		}
	}
	if test, reload := host.index("/usr/sbin/nginx -t"), host.index("systemctl reload nginx"); test < 0 || reload < 0 || test > reload {
		t.Fatalf("the configuration is tested before it is reloaded: %v", host.calls)
	}
	// nothing changed: nothing is run
	host.reset()
	if changed, err := m.Apply(ctx, sites); err != nil || changed || len(host.calls) != 0 {
		t.Fatalf("a second apply: %v %v %v", changed, err, host.calls)
	}
	// a domain that is gone loses its file
	if changed, err := m.Apply(ctx, sites[:1]); err != nil || !changed {
		t.Fatalf("removing: %v %v", changed, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "reneo-shop.example.com.conf")); !os.IsNotExist(err) {
		t.Fatal("the file of a domain that is gone is removed")
	}
	if data, _ := os.ReadFile(foreign); string(data) != "server { listen 8080; }" {
		t.Fatalf("the file of someone else changed: %q", data)
	}
}

func TestApplyPutsEverythingBackWhenTheTestFails(t *testing.T) {
	ctx := context.Background()
	m, host, dir := nginxManager(t)
	if _, err := m.Apply(ctx, []Site{{Host: "blog.example.com", Port: 31001, Secure: true}}); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(filepath.Join(dir, "reneo-blog.example.com.conf"))
	host.failures["/usr/sbin/nginx -t"] = "nginx: [emerg] unexpected end of file in /etc/nginx/conf.d/reneo-new.example.com.conf:9\nnginx: configuration file test failed"
	host.reset()
	_, err := m.Apply(ctx, []Site{{Host: "blog.example.com", Port: 31009, Secure: true}, {Host: "new.example.com", Port: 31002}})
	if err == nil || !strings.Contains(err.Error(), "nothing was changed") || !strings.Contains(err.Error(), "configuration file test failed") {
		t.Fatalf("a failed test is reported with its output: %v", err)
	}
	after, _ := os.ReadFile(filepath.Join(dir, "reneo-blog.example.com.conf"))
	if string(after) != string(before) {
		t.Fatal("the changed file is put back")
	}
	if _, err := os.Stat(filepath.Join(dir, "reneo-new.example.com.conf")); !os.IsNotExist(err) {
		t.Fatal("the new file is removed")
	}
	if host.called("systemctl reload") != 0 {
		t.Fatal("nothing is reloaded after a failed test")
	}
}

func TestApplyReportsAReloadThatFailed(t *testing.T) {
	m, host, dir := nginxManager(t)
	host.failures["systemctl reload nginx"] = "Job for nginx.service failed"
	host.failures["/usr/sbin/nginx -s reload"] = "nginx: [error] invalid PID number"
	changed, err := m.Apply(context.Background(), []Site{{Host: "blog.example.com", Port: 31001}})
	if err == nil || !changed || !strings.Contains(err.Error(), "did not reload") {
		t.Fatalf("a failed reload: %v %v", changed, err)
	}
	if _, statErr := os.Stat(filepath.Join(dir, "reneo-blog.example.com.conf")); statErr != nil {
		t.Fatal("the tested configuration stays in place")
	}
}

func TestApplyApacheLinksTheEnabledSites(t *testing.T) {
	ctx := context.Background()
	m, host, available, enabled := apacheManager(t, true)
	if _, err := m.Apply(ctx, []Site{{Host: "blog.example.com", Port: 31001, Secure: true}}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(available, "reneo-blog.example.com.conf")); err != nil {
		t.Fatal("written to the available sites")
	}
	if _, err := os.Stat(filepath.Join(enabled, "reneo-blog.example.com.conf")); err != nil {
		t.Fatal("enabled")
	}
	if host.called("/usr/sbin/apache2ctl -t") != 1 || host.called("systemctl reload apache2") != 1 {
		t.Fatalf("tested and reloaded: %v", host.calls)
	}
	if _, err := m.Apply(ctx, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(enabled, "reneo-blog.example.com.conf")); !os.IsNotExist(err) {
		t.Fatal("the link of a domain that is gone is removed")
	}
	// a failed test takes the link back too
	if _, err := m.Apply(ctx, []Site{{Host: "blog.example.com", Port: 31001}}); err != nil {
		t.Fatal(err)
	}
	host.failures["/usr/sbin/apache2ctl -t"] = "AH00526: Syntax error"
	if _, err := m.Apply(ctx, []Site{{Host: "blog.example.com", Port: 31001}, {Host: "bad.example.com", Port: 31002}}); err == nil {
		t.Fatal("the test fails")
	}
	if _, err := os.Lstat(filepath.Join(enabled, "reneo-bad.example.com.conf")); !os.IsNotExist(err) {
		t.Fatal("the link of the file that was put back is removed")
	}
}

func TestIssue(t *testing.T) {
	ctx := context.Background()
	m, host, _ := nginxManager(t)
	host.answers["certbot "] = "Successfully received certificate"
	if err := m.Issue(ctx, "blog.example.com", true); err != nil {
		t.Fatal(err)
	}
	dry := host.calls[len(host.calls)-1]
	for _, want := range []string{"certonly --webroot -w", "-d blog.example.com", "--cert-name blog.example.com", "--non-interactive", "--agree-tos", "-m owner@example.com", "--dry-run"} {
		if !strings.Contains(dry, want) {
			t.Errorf("the test run lacks %q: %s", want, dry)
		}
	}
	if strings.Contains(dry, "--deploy-hook") {
		t.Error("a test run keeps nothing, so it needs no hook")
	}
	if err := m.Issue(ctx, "blog.example.com", false); err != nil {
		t.Fatal(err)
	}
	real := host.calls[len(host.calls)-1]
	if strings.Contains(real, "--dry-run") || !strings.Contains(real, "--deploy-hook systemctl reload nginx") {
		t.Errorf("the real run reloads the web server after a renewal: %s", real)
	}
	host.failures["certbot "] = "Challenge failed for domain blog.example.com\nTimeout during connect (likely firewall problem)"
	if err := m.Issue(ctx, "blog.example.com", true); err == nil || !strings.Contains(err.Error(), "firewall problem") {
		t.Fatalf("what certbot says is the error: %v", err)
	}
	if err := m.Issue(ctx, "x;rm -rf", true); err == nil {
		t.Fatal("a name that is not a domain never reaches certbot")
	}
	// without an email certbot is told so
	noEmail := New(Options{Kind: Nginx, Run: host.run, ConfDir: t.TempDir(), Webroot: t.TempDir(), LiveDir: t.TempDir()})
	delete(host.failures, "certbot ")
	if err := noEmail.Issue(ctx, "blog.example.com", true); err != nil || !strings.Contains(host.calls[len(host.calls)-1], "--register-unsafely-without-email") {
		t.Fatalf("no email: %v %v", err, host.calls[len(host.calls)-1])
	}
}

func TestCertificateFiles(t *testing.T) {
	m, _, _ := nginxManager(t)
	if m.HasCert("blog.example.com") {
		t.Fatal("no certificate yet")
	}
	if info, err := m.CertInfo("blog.example.com"); err != nil || info != nil {
		t.Fatalf("none yet: %v %v", info, err)
	}
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	der, err := x509.CreateCertificate(rand.Reader, &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "R11"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(60 * 24 * time.Hour),
	}, &x509.Certificate{SerialNumber: big.NewInt(2), Subject: pkix.Name{CommonName: "R11"}}, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(m.opts.LiveDir, "blog.example.com")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(dir, "fullchain.pem"), pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o644)
	if m.HasCert("blog.example.com") {
		t.Fatal("a certificate needs its key as well")
	}
	_ = os.WriteFile(filepath.Join(dir, "privkey.pem"), []byte("key"), 0o600)
	if !m.HasCert("blog.example.com") {
		t.Fatal("the certificate and its key")
	}
	info, err := m.CertInfo("blog.example.com")
	if err != nil || info == nil || info.Issuer != "R11" || info.NotAfter.Before(time.Now().Add(50*24*time.Hour)) {
		t.Fatalf("what the certificate says: %+v %v", info, err)
	}
}

func TestFingerprintIgnoresOrder(t *testing.T) {
	a := []Site{{Host: "a.example.com", Port: 1}, {Host: "b.example.com", Port: 2, Secure: true}}
	b := []Site{a[1], a[0]}
	if Fingerprint(a) != Fingerprint(b) {
		t.Fatal("the same sites, in another order")
	}
	if Fingerprint(a) == Fingerprint([]Site{{Host: "a.example.com", Port: 1}, {Host: "b.example.com", Port: 3, Secure: true}}) {
		t.Fatal("another port is another set")
	}
	if Fingerprint(a) == Fingerprint([]Site{{Host: "a.example.com", Port: 1, Secure: true}, a[1]}) {
		t.Fatal("a certificate that arrived is a change")
	}
}
