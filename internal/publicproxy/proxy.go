// Package publicproxy lets a server that has a public address serve its sites to the internet itself: it listens on the web
// ports, gets a certificate from Let's Encrypt for each registered domain, and forwards the traffic to what runs on the
// machine (the panel, a project, a local port). It is for installs that are not behind a tunnel; everything it serves
// stays bound to 127.0.0.1, and only the domains that were registered ask for a certificate.
package publicproxy

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/acme"
	"golang.org/x/crypto/acme/autocert"
)

// What a registered domain leads to
const (
	KindPanel   = "panel"
	KindProject = "project"
	KindPort    = "port"
)

const (
	productionDirectory = acme.LetsEncryptURL
	stagingDirectory    = "https://acme-staging-v02.api.letsencrypt.org/directory"
	checkTimeout        = 90 * time.Second
	acmeALPN            = "acme-tls/1"
)

// Route is a registered domain and the local port its traffic goes to
type Route struct {
	Host string
	Kind string
	// Port is the port on 127.0.0.1; 0 means there is nothing to forward to yet (a project that is not running)
	Port int
}

// Resolver finds the route of a domain, or says there is none
type Resolver func(host string) (Route, bool)

// Options sets up a proxy
type Options struct {
	// HTTPAddr and HTTPSAddr are where it listens; ":80" and ":443" when empty
	HTTPAddr  string
	HTTPSAddr string
	// CacheDir keeps the certificates; StagingCacheDir the ones made for a check
	CacheDir        string
	StagingCacheDir string
	// Email is told by Let's Encrypt when a certificate is about to run out; it may be empty
	Email   string
	Resolve Resolver

	// the next two exist for tests
	// TLSConfig replaces the certificates of Let's Encrypt
	TLSConfig *tls.Config
	// Production and Staging replace the ACME directories
	Production string
	Staging    string
}

// Proxy is the listener of the public ports
type Proxy struct {
	opts Options
	prod *autocert.Manager
	stg  *autocert.Manager

	mu       sync.Mutex
	httpLn   net.Listener
	httpsLn  net.Listener
	httpSrv  *http.Server
	httpsSrv *http.Server
	running  bool

	checkMu  sync.Mutex
	checking map[string]bool
}

// New makes a proxy that is not listening yet
func New(opts Options) *Proxy {
	if opts.HTTPAddr == "" {
		opts.HTTPAddr = ":80"
	}
	if opts.HTTPSAddr == "" {
		opts.HTTPSAddr = ":443"
	}
	p := &Proxy{opts: opts, checking: map[string]bool{}}
	prodDir, stagingDir := opts.Production, opts.Staging
	if prodDir == "" {
		prodDir = productionDirectory
	}
	if stagingDir == "" {
		stagingDir = stagingDirectory
	}
	p.prod = &autocert.Manager{
		Prompt:     autocert.AcceptTOS,
		Cache:      autocert.DirCache(opts.CacheDir),
		HostPolicy: p.hostPolicy,
		Email:      opts.Email,
		Client:     &acme.Client{DirectoryURL: prodDir},
	}
	p.stg = &autocert.Manager{
		Prompt:     autocert.AcceptTOS,
		Cache:      autocert.DirCache(opts.StagingCacheDir),
		HostPolicy: p.checkPolicy,
		Email:      opts.Email,
		Client:     &acme.Client{DirectoryURL: stagingDir},
	}
	return p
}

// normalize reads a Host header: lowercase, without the port or the dot of a fully qualified name
func normalize(host string) string {
	host = strings.ToLower(strings.TrimSpace(host))
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.TrimSuffix(strings.Trim(host, "[]"), ".")
}

// hostPolicy lets a certificate be asked for only for a registered domain
func (p *Proxy) hostPolicy(_ context.Context, host string) error {
	if _, ok := p.opts.Resolve(normalize(host)); ok {
		return nil
	}
	return fmt.Errorf("%s is not a registered domain", host)
}

// checkPolicy lets the test manager ask only for the domain being checked
func (p *Proxy) checkPolicy(_ context.Context, host string) error {
	p.checkMu.Lock()
	defer p.checkMu.Unlock()
	if p.checking[normalize(host)] {
		return nil
	}
	return fmt.Errorf("%s is not being checked", host)
}

// certSource is what the proxy needs of a certificate manager
type certSource interface {
	GetCertificate(*tls.ClientHelloInfo) (*tls.Certificate, error)
}

// pickCertificate answers a handshake. The challenge of a domain under check is answered by the test manager, and
// every other handshake by the production one.
func pickCertificate(hello *tls.ClientHelloInfo, prod, staging certSource) (*tls.Certificate, error) {
	for _, proto := range hello.SupportedProtos {
		if proto == acmeALPN {
			if cert, err := prod.GetCertificate(hello); err == nil {
				return cert, nil
			}
			return staging.GetCertificate(hello)
		}
	}
	return prod.GetCertificate(hello)
}

func (p *Proxy) tlsConfig() *tls.Config {
	if p.opts.TLSConfig != nil {
		return p.opts.TLSConfig
	}
	return &tls.Config{
		MinVersion: tls.VersionTLS12,
		NextProtos: []string{"h2", "http/1.1", acmeALPN},
		GetCertificate: func(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
			return pickCertificate(hello, p.prod, p.stg)
		},
	}
}

// ErrRunning is returned when Start is called on a proxy that already listens
var ErrRunning = errors.New("the public proxy is already running")

// Start binds both ports. When one of them cannot be bound nothing stays bound, and the error says which one.
func (p *Proxy) Start() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.running {
		return ErrRunning
	}
	httpLn, err := net.Listen("tcp", p.opts.HTTPAddr)
	if err != nil {
		return fmt.Errorf("cannot listen on %s: %w", p.opts.HTTPAddr, err)
	}
	httpsLn, err := net.Listen("tcp", p.opts.HTTPSAddr)
	if err != nil {
		_ = httpLn.Close()
		return fmt.Errorf("cannot listen on %s: %w", p.opts.HTTPSAddr, err)
	}
	httpsPort := portOf(httpsLn.Addr().String())

	redirect := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { p.redirect(w, r, httpsPort) })
	// the challenges of Let's Encrypt first (production, then the checks), then the redirect to https
	challenge := p.prod.HTTPHandler(p.stg.HTTPHandler(redirect))
	p.httpSrv = &http.Server{Handler: challenge, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10}
	p.httpsSrv = &http.Server{
		Handler: p.handler(), TLSConfig: p.tlsConfig(),
		ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 120 * time.Second, MaxHeaderBytes: 64 << 10,
	}
	p.httpLn, p.httpsLn, p.running = httpLn, httpsLn, true
	httpSrv, httpsSrv := p.httpSrv, p.httpsSrv
	go func() {
		if err := httpSrv.Serve(httpLn); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[publicproxy] http listener stopped: %v", err)
		}
	}()
	go func() {
		if err := httpsSrv.ServeTLS(httpsLn, "", ""); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("[publicproxy] https listener stopped: %v", err)
		}
	}()
	return nil
}

// Stop closes both listeners; connections that are still open get a few seconds to finish
func (p *Proxy) Stop() {
	p.mu.Lock()
	httpSrv, httpsSrv, was := p.httpSrv, p.httpsSrv, p.running
	p.running, p.httpSrv, p.httpsSrv, p.httpLn, p.httpsLn = false, nil, nil, nil, nil
	p.mu.Unlock()
	if !was {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(ctx)
	_ = httpsSrv.Shutdown(ctx)
}

// Running says whether the proxy listens
func (p *Proxy) Running() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.running
}

// Addrs are where the proxy listens, as bound (a port given as 0 shows the one that was picked)
func (p *Proxy) Addrs() (httpAddr, httpsAddr string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.httpLn != nil {
		httpAddr = p.httpLn.Addr().String()
	}
	if p.httpsLn != nil {
		httpsAddr = p.httpsLn.Addr().String()
	}
	return httpAddr, httpsAddr
}

func portOf(addr string) string {
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return ""
	}
	return port
}

// redirect sends a registered domain to https, and refuses the others
func (p *Proxy) redirect(w http.ResponseWriter, r *http.Request, httpsPort string) {
	host := normalize(r.Host)
	if _, ok := p.opts.Resolve(host); !ok {
		http.Error(w, "No site is set up for this address.", http.StatusNotFound)
		return
	}
	target := "https://" + host
	if httpsPort != "" && httpsPort != "443" {
		target += ":" + httpsPort
	}
	http.Redirect(w, r, target+r.URL.RequestURI(), http.StatusPermanentRedirect)
}

// handler forwards a request to the port of its domain. The forwarding headers are written here and nowhere else: what
// the visitor sent is dropped, so a visitor cannot pass as another address to the panel or a project behind this proxy.
func (p *Proxy) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		route, ok := p.opts.Resolve(normalize(r.Host))
		if !ok {
			http.Error(w, "No site is set up for this address.", http.StatusNotFound)
			return
		}
		if route.Port <= 0 {
			http.Error(w, "This site is not running right now.", http.StatusBadGateway)
			return
		}
		target := &url.URL{Scheme: "http", Host: net.JoinHostPort("127.0.0.1", strconv.Itoa(route.Port))}
		proxy := &httputil.ReverseProxy{
			Rewrite: func(pr *httputil.ProxyRequest) {
				pr.SetURL(target)
				// the Host the visitor asked for goes on, so the site sees its own domain
				pr.Out.Host = r.Host
				peer, _, _ := net.SplitHostPort(r.RemoteAddr)
				for _, name := range []string{"Forwarded", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Real-Ip", "Cf-Connecting-Ip", "True-Client-Ip"} {
					pr.Out.Header.Del(name)
				}
				pr.Out.Header.Set("X-Forwarded-For", peer)
				pr.Out.Header.Set("X-Real-IP", peer)
				pr.Out.Header.Set("X-Forwarded-Host", r.Host)
				pr.Out.Header.Set("X-Forwarded-Proto", "https")
			},
			ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
				log.Printf("[publicproxy] %s -> 127.0.0.1:%d: %v", route.Host, route.Port, err)
				http.Error(w, "This site did not answer.", http.StatusBadGateway)
			},
			FlushInterval: -1,
		}
		proxy.ServeHTTP(w, r)
	})
}

// CheckDomain asks Let's Encrypt's test service for a certificate for the domain. It proves that the domain leads to this
// machine and that the web ports are reachable, without spending the limits of the real service on a failure.
func (p *Proxy) CheckDomain(ctx context.Context, host string) error {
	host = normalize(host)
	if !p.Running() {
		return errors.New("the public proxy is not running")
	}
	if _, ok := p.opts.Resolve(host); !ok {
		return fmt.Errorf("%s is not a registered domain", host)
	}
	p.checkMu.Lock()
	if p.checking[host] {
		p.checkMu.Unlock()
		return errors.New("this domain is already being checked")
	}
	p.checking[host] = true
	p.checkMu.Unlock()
	defer func() {
		p.checkMu.Lock()
		delete(p.checking, host)
		p.checkMu.Unlock()
	}()
	ctx, cancel := context.WithTimeout(ctx, checkTimeout)
	defer cancel()
	// a certificate that was already made for the check is not used: the check has to meet the challenge again
	_ = p.stg.Cache.Delete(ctx, host)
	done := make(chan error, 1)
	go func() {
		_, err := p.stg.GetCertificate(&tls.ClientHelloInfo{ServerName: host})
		done <- err
	}()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return errors.New("Let's Encrypt did not finish in time; check that the domain leads to this server and that ports 80 and 443 are open")
	}
}

// Obtain gets the production certificate of a registered domain now, instead of at its first visit. It is for a domain that
// passed its check.
func (p *Proxy) Obtain(ctx context.Context, host string) error {
	host = normalize(host)
	if !p.Running() {
		return errors.New("the public proxy is not running")
	}
	if _, ok := p.opts.Resolve(host); !ok {
		return fmt.Errorf("%s is not a registered domain", host)
	}
	ctx, cancel := context.WithTimeout(ctx, checkTimeout)
	defer cancel()
	done := make(chan error, 1)
	go func() {
		_, err := p.prod.GetCertificate(&tls.ClientHelloInfo{ServerName: host})
		done <- err
	}()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return errors.New("Let's Encrypt did not finish in time")
	}
}

// Certificate is what the cache holds for a domain
type Certificate struct {
	NotBefore time.Time
	NotAfter  time.Time
	Issuer    string
}

// CertInfo reads the production certificate of a domain; nil when there is none yet
func (p *Proxy) CertInfo(ctx context.Context, host string) (*Certificate, error) {
	return certFromCache(ctx, p.prod.Cache, normalize(host))
}
