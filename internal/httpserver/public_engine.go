package httpserver

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"os/exec"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/publicproxy"
	"github.com/friskipradana/panel-desktop-ui/internal/runtimepath"
	"github.com/friskipradana/panel-desktop-ui/internal/webserver"
)

// What serves the registered domains of a server that has a public address: the proxy of Reneo itself, or the nginx or Apache
// that the install already runs. The domains and the certificates are the same either way; only who listens on the web ports
// and who writes the configuration differs.

const (
	engineBuiltin = "builtin"
	engineNginx   = "nginx"
	engineApache  = "apache"
)

// publicEngine is what the rest of the server needs of whoever serves the domains
type publicEngine interface {
	Start() error
	Stop()
	Running() bool
	Addrs() (httpAddr, httpsAddr string)
	CheckDomain(ctx context.Context, host string) error
	Obtain(ctx context.Context, host string) error
	CertInfo(ctx context.Context, host string) (*publicproxy.Certificate, error)
	// Refresh says that the routes changed: an engine with files to write writes them again
	Refresh()
	// Status says who serves and, for a web server, where its files are and how the last write went
	Status() engineStatus
}

type engineStatus struct {
	Name    string `json:"name"`
	ConfDir string `json:"confDir,omitempty"`
	// LastError is why the last write of the configuration failed; empty when it went well
	LastError string `json:"lastError,omitempty"`
}

func validEngine(name string) bool {
	return name == engineBuiltin || name == engineNginx || name == engineApache
}

// ─── The proxy of Reneo ──────────────────────────────────────────────────────

type builtinEngine struct{ *publicproxy.Proxy }

var (
	_ publicEngine = builtinEngine{}
	_ publicEngine = (*webEngine)(nil)
	_ certIssuer   = (publicEngine)(nil)
)

func (builtinEngine) Refresh() {}

func (builtinEngine) Status() engineStatus { return engineStatus{Name: engineBuiltin} }

// ─── nginx and Apache ────────────────────────────────────────────────────────

// execRunner runs the commands of the web server; "which" is looked up here so it works wherever the binaries are
func execRunner(ctx context.Context, name string, args ...string) (string, error) {
	if name == "which" && len(args) == 1 {
		path, err := exec.LookPath(args[0])
		return path, err
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	return string(out), err
}

const webEngineReconcile = 30 * time.Second

type webEngine struct {
	kind   webserver.Kind
	mgr    *webserver.Manager
	routes func() map[string]publicproxy.Route

	mu      sync.Mutex
	running bool
	lastFP  string
	lastErr string
	stop    chan struct{}
	kick    chan struct{}
	done    chan struct{}
}

func newWebEngine(kind webserver.Kind, mgr *webserver.Manager, routes func() map[string]publicproxy.Route) *webEngine {
	return &webEngine{kind: kind, mgr: mgr, routes: routes}
}

func (w *webEngine) Start() error {
	w.mu.Lock()
	if w.running {
		w.mu.Unlock()
		return publicproxy.ErrRunning
	}
	w.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := w.mgr.Prepare(ctx); err != nil {
		return err
	}
	if err := w.syncNow(ctx, true); err != nil {
		return err
	}
	w.mu.Lock()
	w.running = true
	w.stop, w.kick, w.done = make(chan struct{}), make(chan struct{}, 1), make(chan struct{})
	stop, kick, done := w.stop, w.kick, w.done
	w.mu.Unlock()
	go w.loop(stop, kick, done)
	return nil
}

func (w *webEngine) Stop() {
	w.mu.Lock()
	was, stop, done := w.running, w.stop, w.done
	w.running = false
	w.mu.Unlock()
	if !was {
		return
	}
	close(stop)
	<-done
	// the files stay: the domains keep being served by the web server even while the panel is down, and are rewritten when it
	// starts again
}

func (w *webEngine) Running() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.running
}

func (w *webEngine) Addrs() (string, string) { return "", "" }

func (w *webEngine) Refresh() {
	w.mu.Lock()
	kick := w.kick
	running := w.running
	w.mu.Unlock()
	if !running {
		return
	}
	select {
	case kick <- struct{}{}:
	default:
	}
}

func (w *webEngine) Status() engineStatus {
	w.mu.Lock()
	defer w.mu.Unlock()
	return engineStatus{Name: string(w.kind), ConfDir: w.mgr.ConfDir(), LastError: w.lastErr}
}

func (w *webEngine) loop(stop, kick, done chan struct{}) {
	defer close(done)
	tick := time.NewTicker(webEngineReconcile)
	defer tick.Stop()
	for {
		select {
		case <-stop:
			return
		case <-tick.C:
		case <-kick:
			// several changes in a row are one write
			select {
			case <-time.After(700 * time.Millisecond):
			case <-stop:
				return
			}
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		if err := w.syncNow(ctx, false); err != nil {
			log.Printf("[publicproxy] %s: %v", w.kind, err)
		}
		cancel()
	}
}

// sites is the routes as the web server needs them: a domain is served over https once its certificate exists
func (w *webEngine) sites() []webserver.Site {
	routes := w.routes()
	out := make([]webserver.Site, 0, len(routes))
	for host, route := range routes {
		out = append(out, webserver.Site{Host: host, Port: route.Port, Secure: w.mgr.HasCert(host)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Host < out[j].Host })
	return out
}

// syncNow writes the configuration when the sites changed (or always, with force), and keeps how it went
func (w *webEngine) syncNow(ctx context.Context, force bool) error {
	sites := w.sites()
	fp := webserver.Fingerprint(sites)
	w.mu.Lock()
	same := !force && fp == w.lastFP
	w.mu.Unlock()
	if same {
		return nil
	}
	_, err := w.mgr.Apply(ctx, sites)
	w.mu.Lock()
	defer w.mu.Unlock()
	if err != nil {
		w.lastErr = err.Error()
		return err
	}
	w.lastFP, w.lastErr = fp, ""
	return nil
}

func (w *webEngine) registered(host string) error {
	if _, ok := w.routes()[host]; !ok {
		return fmt.Errorf("%s is not a registered domain", host)
	}
	return nil
}

// CheckDomain asks certbot for a test certificate, which proves that the domain leads here and that the web server answers on
// port 80. The plain address of the domain must already answer the challenge, so the configuration is written first.
func (w *webEngine) CheckDomain(ctx context.Context, host string) error {
	if !w.Running() {
		return errors.New("the public proxy is not running")
	}
	if err := w.registered(host); err != nil {
		return err
	}
	if err := w.syncNow(ctx, false); err != nil {
		return err
	}
	return w.mgr.Issue(ctx, host, true)
}

// Obtain asks certbot for the real certificate, then writes the https side of the domain
func (w *webEngine) Obtain(ctx context.Context, host string) error {
	if !w.Running() {
		return errors.New("the public proxy is not running")
	}
	if err := w.registered(host); err != nil {
		return err
	}
	if err := w.mgr.Issue(ctx, host, false); err != nil {
		return err
	}
	return w.syncNow(ctx, false)
}

func (w *webEngine) CertInfo(_ context.Context, host string) (*publicproxy.Certificate, error) {
	info, err := w.mgr.CertInfo(host)
	if err != nil || info == nil {
		return nil, err
	}
	return &publicproxy.Certificate{NotBefore: info.NotBefore, NotAfter: info.NotAfter, Issuer: info.Issuer}, nil
}

// ─── Choosing and describing ─────────────────────────────────────────────────

// newEngine makes the engine the settings ask for
func (s *Server) newEngine(name, email string) (publicEngine, error) {
	switch name {
	case "", engineBuiltin:
		httpAddr, httpsAddr := s.publicProxyAddrs()
		dir := filepath.Join(s.cfg.StateDir, "public-tls")
		return builtinEngine{publicproxy.New(publicproxy.Options{
			HTTPAddr: httpAddr, HTTPSAddr: httpsAddr,
			CacheDir: filepath.Join(dir, "production"), StagingCacheDir: filepath.Join(dir, "staging"),
			Email: email, Resolve: s.publicRoute,
		})}, nil
	case engineNginx, engineApache:
		kind := webserver.Nginx
		if name == engineApache {
			kind = webserver.Apache
		}
		// the places of the files can be told for a distribution that keeps them elsewhere
		mgr := webserver.New(webserver.Options{
			Kind: kind, Run: s.webRunner(), Email: email,
			Webroot: filepath.Join(s.cfg.StateDir, "acme"),
			ConfDir: runtimepath.Getenv("WEB_CONF_DIR"), EnabledDir: runtimepath.Getenv("WEB_ENABLED_DIR"), LiveDir: runtimepath.Getenv("WEB_LIVE_DIR"),
		})
		return newWebEngine(kind, mgr, s.publicRoutesSnapshot), nil
	}
	return nil, fmt.Errorf("%q is not a way to serve domains", name)
}

// webRunner is where the commands of the web server run; a test answers instead
func (s *Server) webRunner() webserver.Runner {
	if s.testWebRunner != nil {
		return s.testWebRunner
	}
	return execRunner
}

// engineReport is what the page shows of each way to serve: what is installed, and for the proxy of Reneo whether its ports are free
type engineReport struct {
	Name      string   `json:"name"`
	Installed bool     `json:"installed"`
	Version   string   `json:"version,omitempty"`
	Running   bool     `json:"running"`
	ConfDir   string   `json:"confDir,omitempty"`
	Certbot   bool     `json:"certbot"`
	Missing   []string `json:"missing,omitempty"`
	// PortsBusy lists the web ports someone else holds right now (for the proxy of Reneo)
	PortsBusy []string `json:"portsBusy,omitempty"`
}

func (s *Server) engineReports(ctx context.Context) []engineReport {
	httpAddr, httpsAddr := s.publicProxyAddrs()
	builtin := engineReport{Name: engineBuiltin, Installed: true, Certbot: true}
	if s.runningPublicProxy() == nil || s.loadSiteSettings().PublicEngine != engineBuiltin && s.loadSiteSettings().PublicEngine != "" {
		for _, addr := range []string{httpAddr, httpsAddr} {
			if ln, err := net.Listen("tcp", addr); err != nil {
				builtin.PortsBusy = append(builtin.PortsBusy, addr)
			} else {
				_ = ln.Close()
			}
		}
	}
	reports := []engineReport{builtin}
	for _, kind := range []webserver.Kind{webserver.Nginx, webserver.Apache} {
		info := webserver.New(webserver.Options{Kind: kind, Run: s.webRunner()}).Detect(ctx)
		reports = append(reports, engineReport{
			Name: string(kind), Installed: info.Installed, Version: info.Version, Running: info.Running,
			ConfDir: info.ConfDir, Certbot: info.Certbot, Missing: info.Missing,
		})
	}
	return reports
}
