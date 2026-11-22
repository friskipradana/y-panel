// Package webserver lets an install that already runs nginx or Apache serve its domains through it. Reneo writes one file
// per domain in the config directory of the web server, tests the configuration before it reloads, puts everything back when the
// test fails, and gets the certificates with certbot. It touches only the files it made (reneo-*.conf), never the rest of the
// configuration of the web server.
package webserver

import (
	"context"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Kind is the web server
type Kind string

const (
	Nginx  Kind = "nginx"
	Apache Kind = "apache"
)

// ErrNotInstalled is returned when the web server is not on this machine
var ErrNotInstalled = errors.New("the web server is not installed on this machine")

// Runner runs a command and returns what it printed (both streams); a variable of the manager so a test can answer instead
type Runner func(ctx context.Context, name string, args ...string) (string, error)

// Site is one domain the web server answers for
type Site struct {
	Host string
	// Port is the port on 127.0.0.1 the domain leads to; 0 means nothing runs there yet
	Port int
	// Secure: a certificate exists, so the domain is served over https and the plain address redirects to it
	Secure bool
}

// Options sets up a manager
type Options struct {
	Kind Kind
	Run  Runner
	// ConfDir is where the files go; EnabledDir is the directory of the enabled sites on a Debian style Apache, where each file
	// is linked. Both are found when empty.
	ConfDir    string
	EnabledDir string
	// Webroot holds the challenges of Let's Encrypt, LiveDir the certificates certbot made
	Webroot string
	LiveDir string
	// Email is told by Let's Encrypt when a certificate is about to run out; it may be empty
	Email string
}

// Manager writes the configuration of one web server
type Manager struct {
	opts Options
	info Info
}

// Info is what is known of the web server on this machine
type Info struct {
	Kind      Kind     `json:"kind"`
	Installed bool     `json:"installed"`
	Binary    string   `json:"binary"`
	Version   string   `json:"version"`
	Running   bool     `json:"running"`
	ConfDir   string   `json:"confDir"`
	Certbot   bool     `json:"certbot"`
	Missing   []string `json:"missing"`
}

const fileMarker = "# Managed by Reneo: this file is rewritten, change the domain in the panel instead.\n"

var (
	fileRe = regexp.MustCompile(`^reneo-[a-z0-9.\-]+\.conf$`)
	hostRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9.\-]{0,251}[a-z0-9])?$`)
)

// New makes a manager; nothing is read or written yet
func New(opts Options) *Manager {
	if opts.LiveDir == "" {
		opts.LiveDir = "/etc/letsencrypt/live"
	}
	return &Manager{opts: opts}
}

func (m *Manager) kind() Kind { return m.opts.Kind }

// ConfDir is where the files of Reneo go for this web server
func (m *Manager) ConfDir() string { return m.confDir() }

// binary names to look for, in order
func binaries(kind Kind) []string {
	if kind == Nginx {
		return []string{"nginx"}
	}
	return []string{"apache2ctl", "apachectl", "httpd"}
}

func (m *Manager) run(ctx context.Context, name string, args ...string) (string, error) {
	return m.opts.Run(ctx, name, args...)
}

// which finds the first of the binaries that answers; the runner is asked for "which" so a test controls what is installed
func (m *Manager) which(ctx context.Context, names ...string) string {
	for _, name := range names {
		if out, err := m.run(ctx, "which", name); err == nil && strings.TrimSpace(out) != "" {
			return strings.TrimSpace(strings.Split(strings.TrimSpace(out), "\n")[0])
		}
	}
	return ""
}

var apacheModules = []string{"proxy_module", "proxy_http_module", "proxy_wstunnel_module", "rewrite_module", "headers_module", "ssl_module", "setenvif_module"}

// Detect reads what is on this machine: the binary, its version, whether it runs, where its files go, whether certbot is there,
// and for Apache which modules are missing
func (m *Manager) Detect(ctx context.Context) Info {
	info := Info{Kind: m.kind(), Missing: []string{}}
	binary := m.which(ctx, binaries(m.kind())...)
	if binary == "" {
		m.info = info
		return info
	}
	info.Installed, info.Binary = true, binary
	switch m.kind() {
	case Nginx:
		out, _ := m.run(ctx, binary, "-v")
		info.Version = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(out), "nginx version:"))
		info.Running = m.isActive(ctx, "nginx")
	case Apache:
		out, _ := m.run(ctx, binary, "-v")
		for _, line := range strings.Split(out, "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "Server version:") {
				info.Version = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "Server version:"))
			}
		}
		info.Running = m.isActive(ctx, "apache2") || m.isActive(ctx, "httpd")
		if modules, err := m.run(ctx, binary, "-M"); err == nil {
			for _, name := range apacheModules {
				if !strings.Contains(modules, name) {
					info.Missing = append(info.Missing, strings.TrimSuffix(name, "_module"))
				}
			}
		}
	}
	info.ConfDir = m.confDir()
	info.Certbot = m.which(ctx, "certbot") != ""
	m.info = info
	return info
}

func (m *Manager) isActive(ctx context.Context, unit string) bool {
	out, err := m.run(ctx, "systemctl", "is-active", unit)
	return err == nil && strings.TrimSpace(out) == "active"
}

// confDir is where the files of Reneo go
func (m *Manager) confDir() string {
	if m.opts.ConfDir != "" {
		return m.opts.ConfDir
	}
	candidates := []string{"/etc/nginx/conf.d"}
	if m.kind() == Apache {
		candidates = []string{"/etc/apache2/sites-available", "/etc/httpd/conf.d"}
	}
	for _, dir := range candidates {
		if st, err := os.Stat(dir); err == nil && st.IsDir() {
			return dir
		}
	}
	return candidates[0]
}

// enabledDir is where a Debian style Apache looks for the sites it serves
func (m *Manager) enabledDir() string {
	if m.opts.EnabledDir != "" {
		return m.opts.EnabledDir
	}
	if m.kind() == Apache && strings.HasSuffix(m.confDir(), "sites-available") {
		return filepath.Join(filepath.Dir(m.confDir()), "sites-enabled")
	}
	return ""
}

// Prepare checks that the web server can be used, and makes what it needs: for Apache on Debian the modules, always the folder of
// the challenges. It names what is missing instead of guessing.
func (m *Manager) Prepare(ctx context.Context) error {
	info := m.Detect(ctx)
	if !info.Installed {
		return ErrNotInstalled
	}
	if !info.Certbot {
		return errors.New("certbot is not installed: it gets the certificates of Let's Encrypt (install the certbot package)")
	}
	if len(info.Missing) > 0 {
		// Debian has a command that enables a module; elsewhere the person has to install it
		if m.which(ctx, "a2enmod") != "" {
			if out, err := m.run(ctx, "a2enmod", info.Missing...); err != nil {
				return fmt.Errorf("could not enable the Apache modules %s: %s", strings.Join(info.Missing, ", "), tail(out))
			}
		} else {
			return fmt.Errorf("Apache is missing the modules %s", strings.Join(info.Missing, ", "))
		}
	}
	return os.MkdirAll(m.webroot(), 0o755)
}

func (m *Manager) webroot() string {
	if m.opts.Webroot != "" {
		return m.opts.Webroot
	}
	return "/var/lib/reneo/acme"
}

// ─── Files ───────────────────────────────────────────────────────────────────

func fileName(host string) string { return "reneo-" + host + ".conf" }

// render makes the files of the sites: one per domain, and for nginx the map that tells a websocket from a plain request
func (m *Manager) render(sites []Site) (map[string]string, error) {
	files := map[string]string{}
	if m.kind() == Nginx {
		files["reneo-00-websocket.conf"] = fileMarker + "map $http_upgrade $reneo_connection_upgrade {\n    default upgrade;\n    ''      close;\n}\n"
	}
	for _, site := range sites {
		if !hostRe.MatchString(site.Host) || strings.Contains(site.Host, "..") {
			return nil, fmt.Errorf("%q is not a domain name", site.Host)
		}
		var text string
		if m.kind() == Nginx {
			text = m.nginxSite(site)
		} else {
			text = m.apacheSite(site)
		}
		files[fileName(site.Host)] = fileMarker + text
	}
	return files, nil
}

func (m *Manager) liveFile(host, name string) string {
	return filepath.ToSlash(filepath.Join(m.opts.LiveDir, host, name))
}

func (m *Manager) nginxSite(site Site) string {
	var b strings.Builder
	root := filepath.ToSlash(m.webroot())
	fmt.Fprintf(&b, "server {\n    listen 80;\n    listen [::]:80;\n    server_name %s;\n\n", site.Host)
	fmt.Fprintf(&b, "    location ^~ /.well-known/acme-challenge/ {\n        root %s;\n        default_type text/plain;\n    }\n\n", root)
	if site.Secure {
		b.WriteString("    location / {\n        return 301 https://$host$request_uri;\n    }\n}\n")
	} else {
		b.WriteString("    location / {\n        return 404;\n    }\n}\n")
		return b.String()
	}
	fmt.Fprintf(&b, "\nserver {\n    listen 443 ssl;\n    listen [::]:443 ssl;\n    server_name %s;\n\n", site.Host)
	fmt.Fprintf(&b, "    ssl_certificate %s;\n    ssl_certificate_key %s;\n    ssl_protocols TLSv1.2 TLSv1.3;\n\n", m.liveFile(site.Host, "fullchain.pem"), m.liveFile(site.Host, "privkey.pem"))
	b.WriteString("    client_max_body_size 0;\n\n")
	if site.Port <= 0 {
		b.WriteString("    location / {\n        return 502;\n    }\n}\n")
		return b.String()
	}
	fmt.Fprintf(&b, "    location / {\n        proxy_pass http://127.0.0.1:%d;\n", site.Port)
	b.WriteString(`        proxy_http_version 1.1;
        proxy_set_header Host $host;
        # what the visitor sent is dropped; only these say who the visitor is
        proxy_set_header Forwarded "";
        proxy_set_header CF-Connecting-IP "";
        proxy_set_header True-Client-IP "";
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $reneo_connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
`)
	return b.String()
}

func (m *Manager) apacheSite(site Site) string {
	var b strings.Builder
	root := filepath.ToSlash(m.webroot())
	fmt.Fprintf(&b, "<VirtualHost *:80>\n    ServerName %s\n\n", site.Host)
	fmt.Fprintf(&b, "    Alias /.well-known/acme-challenge/ %s/.well-known/acme-challenge/\n", root)
	fmt.Fprintf(&b, "    <Directory \"%s/.well-known/acme-challenge/\">\n        Require all granted\n    </Directory>\n\n", root)
	b.WriteString("    RewriteEngine On\n    RewriteCond %{REQUEST_URI} !^/\\.well-known/acme-challenge/\n")
	if site.Secure {
		b.WriteString("    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]\n</VirtualHost>\n")
	} else {
		b.WriteString("    RewriteRule ^ - [R=404,L]\n</VirtualHost>\n")
		return b.String()
	}
	fmt.Fprintf(&b, "\n<VirtualHost *:443>\n    ServerName %s\n\n    SSLEngine on\n", site.Host)
	fmt.Fprintf(&b, "    SSLCertificateFile %s\n    SSLCertificateKeyFile %s\n\n", m.liveFile(site.Host, "fullchain.pem"), m.liveFile(site.Host, "privkey.pem"))
	if site.Port <= 0 {
		b.WriteString("    RewriteEngine On\n    RewriteRule ^ - [R=502,L]\n</VirtualHost>\n")
		return b.String()
	}
	fmt.Fprintf(&b, `    ProxyPreserveHost On
    ProxyTimeout 3600
    # what the visitor sent is dropped; only these say who the visitor is
    RequestHeader unset Forwarded
    RequestHeader unset CF-Connecting-IP
    RequestHeader unset True-Client-IP
    RequestHeader unset X-Forwarded-For
    SetEnvIf Remote_Addr "(.*)" reneo_client=$1
    RequestHeader set X-Real-IP "%%{reneo_client}e"
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Host "%%{HTTP_HOST}e"

    RewriteEngine On
    RewriteCond %%{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/(.*) ws://127.0.0.1:%d/$1 [P,L]
    ProxyPass / http://127.0.0.1:%d/
    ProxyPassReverse / http://127.0.0.1:%d/
</VirtualHost>
`, site.Port, site.Port, site.Port)
	return b.String()
}

// ─── Apply ───────────────────────────────────────────────────────────────────

// change is a file that Apply wrote or removed, with what it held before, to put it back when the test fails
type change struct {
	name   string
	before []byte
	had    bool
}

// Apply makes the files for the sites, removes the ones of domains that are gone, tests the configuration and reloads. When the test
// fails everything is put back as it was and the output of the test is the error. It does nothing when nothing changed.
func (m *Manager) Apply(ctx context.Context, sites []Site) (changed bool, err error) {
	desired, err := m.render(sites)
	if err != nil {
		return false, err
	}
	dir := m.confDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false, err
	}
	existing := map[string][]byte{}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false, err
	}
	for _, entry := range entries {
		if !entry.IsDir() && fileRe.MatchString(entry.Name()) {
			if data, err := os.ReadFile(filepath.Join(dir, entry.Name())); err == nil {
				existing[entry.Name()] = data
			}
		}
	}
	var done []change
	names := make([]string, 0, len(desired))
	for name := range desired {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		before, had := existing[name]
		if had && string(before) == desired[name] {
			continue
		}
		if err := os.WriteFile(filepath.Join(dir, name), []byte(desired[name]), 0o644); err != nil {
			m.restore(dir, done)
			return false, err
		}
		done = append(done, change{name, before, had})
	}
	for name, before := range existing {
		if _, wanted := desired[name]; !wanted {
			if err := os.Remove(filepath.Join(dir, name)); err != nil && !os.IsNotExist(err) {
				m.restore(dir, done)
				return false, err
			}
			done = append(done, change{name, before, true})
		}
	}
	if len(done) == 0 {
		return false, nil
	}
	m.syncEnabled(dir, desired)
	if out, err := m.test(ctx); err != nil {
		m.restore(dir, done)
		m.syncEnabled(dir, existingFiles(existing))
		return false, fmt.Errorf("the web server did not accept the configuration, so nothing was changed: %s", tail(out))
	}
	if out, err := m.reload(ctx); err != nil {
		return true, fmt.Errorf("the configuration is in place but the web server did not reload: %s", tail(out))
	}
	return true, nil
}

func existingFiles(existing map[string][]byte) map[string]string {
	out := map[string]string{}
	for name, data := range existing {
		out[name] = string(data)
	}
	return out
}

// restore puts the files back as they were: written again when they existed, removed when they did not
func (m *Manager) restore(dir string, items []change) {
	for i := len(items) - 1; i >= 0; i-- {
		item := items[i]
		path := filepath.Join(dir, item.name)
		if item.had {
			_ = os.WriteFile(path, item.before, 0o644)
		} else {
			_ = os.Remove(path)
		}
	}
}

// syncEnabled links the files in the directory of enabled sites (Debian style Apache) and drops the links of files that are gone
func (m *Manager) syncEnabled(dir string, wanted map[string]string) {
	enabled := m.enabledDir()
	if enabled == "" {
		return
	}
	_ = os.MkdirAll(enabled, 0o755)
	entries, _ := os.ReadDir(enabled)
	for _, entry := range entries {
		if fileRe.MatchString(entry.Name()) {
			if _, ok := wanted[entry.Name()]; !ok {
				_ = os.Remove(filepath.Join(enabled, entry.Name()))
			}
		}
	}
	for name := range wanted {
		link := filepath.Join(enabled, name)
		if _, err := os.Lstat(link); err != nil {
			if err := os.Symlink(filepath.Join(dir, name), link); err != nil {
				// a copy works as well where links are not allowed
				if data, rerr := os.ReadFile(filepath.Join(dir, name)); rerr == nil {
					_ = os.WriteFile(link, data, 0o644)
				}
			}
		}
	}
}

func (m *Manager) test(ctx context.Context) (string, error) {
	return m.run(ctx, m.binary(ctx), "-t")
}

func (m *Manager) reload(ctx context.Context) (string, error) {
	unit := "nginx"
	if m.kind() == Apache {
		unit = "apache2"
		if m.confDirIsRHEL() {
			unit = "httpd"
		}
	}
	if out, err := m.run(ctx, "systemctl", "reload", unit); err == nil {
		return out, nil
	}
	if m.kind() == Nginx {
		return m.run(ctx, m.binary(ctx), "-s", "reload")
	}
	return m.run(ctx, m.binary(ctx), "-k", "graceful")
}

// binary is the command of the web server: the one that was found, else the usual name
func (m *Manager) binary(ctx context.Context) string {
	if m.info.Binary != "" {
		return m.info.Binary
	}
	if b := m.which(ctx, binaries(m.kind())...); b != "" {
		return b
	}
	return binaries(m.kind())[0]
}

func (m *Manager) confDirIsRHEL() bool { return strings.Contains(m.confDir(), "httpd") }

// ─── Certificates ────────────────────────────────────────────────────────────

// HasCert says whether certbot made a certificate for the domain
func (m *Manager) HasCert(host string) bool {
	_, err1 := os.Stat(filepath.Join(m.opts.LiveDir, host, "fullchain.pem"))
	_, err2 := os.Stat(filepath.Join(m.opts.LiveDir, host, "privkey.pem"))
	return err1 == nil && err2 == nil
}

// Issue asks certbot for the certificate of a domain whose plain address already serves the challenge. dryRun uses the test
// service of Let's Encrypt and keeps nothing.
func (m *Manager) Issue(ctx context.Context, host string, dryRun bool) error {
	if !hostRe.MatchString(host) {
		return fmt.Errorf("%q is not a domain name", host)
	}
	args := []string{"certonly", "--webroot", "-w", m.webroot(), "-d", host, "--cert-name", host, "--non-interactive", "--agree-tos", "--keep-until-expiring"}
	if m.opts.Email != "" {
		args = append(args, "-m", m.opts.Email)
	} else {
		args = append(args, "--register-unsafely-without-email")
	}
	if dryRun {
		args = append(args, "--dry-run")
	} else {
		// the web server picks up a renewed certificate by itself
		args = append(args, "--deploy-hook", m.reloadHook())
	}
	if out, err := m.run(ctx, "certbot", args...); err != nil {
		return errors.New(tail(out))
	}
	return nil
}

func (m *Manager) reloadHook() string {
	if m.kind() == Nginx {
		return "systemctl reload nginx"
	}
	if m.confDirIsRHEL() {
		return "systemctl reload httpd"
	}
	return "systemctl reload apache2"
}

// Certificate is what the certificate of a domain says
type Certificate struct {
	NotBefore time.Time
	NotAfter  time.Time
	Issuer    string
}

// CertInfo reads the certificate certbot made for a domain; nil when there is none
func (m *Manager) CertInfo(host string) (*Certificate, error) {
	data, err := os.ReadFile(filepath.Join(m.opts.LiveDir, host, "fullchain.pem"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, nil
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, err
	}
	return &Certificate{NotBefore: cert.NotBefore, NotAfter: cert.NotAfter, Issuer: cert.Issuer.CommonName}, nil
}

// Fingerprint identifies a set of sites, so a change of ports or certificates is noticed without comparing files
func Fingerprint(sites []Site) string {
	sorted := append([]Site(nil), sites...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Host < sorted[j].Host })
	h := sha256.New()
	for _, s := range sorted {
		fmt.Fprintf(h, "%s|%d|%t\n", s.Host, s.Port, s.Secure)
	}
	return hex.EncodeToString(h.Sum(nil))
}

// tail keeps the end of a command's output: the last lines say what went wrong
func tail(out string) string {
	out = strings.TrimSpace(out)
	lines := strings.Split(out, "\n")
	if len(lines) > 6 {
		lines = lines[len(lines)-6:]
	}
	text := strings.Join(lines, "\n")
	if len(text) > 800 {
		text = text[len(text)-800:]
	}
	return text
}
