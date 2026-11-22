package publicproxy

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"errors"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// selfSigned makes a certificate for the tests, and its PEM as autocert keeps it (key first, then the certificate)
func selfSigned(t *testing.T) (tls.Certificate, []byte) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "site.test"}, DNSNames: []string{"site.test"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(48 * time.Hour),
		IPAddresses: []net.IP{net.ParseIP("127.0.0.1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		t.Fatal(err)
	}
	return cert, append(keyPEM, certPEM...)
}

type fixture struct {
	p      *Proxy
	routes map[string]Route
	mu     sync.Mutex
}

func (f *fixture) resolve(host string) (Route, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.routes[host]
	return r, ok
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	cert, _ := selfSigned(t)
	f := &fixture{routes: map[string]Route{}}
	f.p = New(Options{
		HTTPAddr: "127.0.0.1:0", HTTPSAddr: "127.0.0.1:0", CacheDir: t.TempDir(), StagingCacheDir: t.TempDir(),
		Resolve:   f.resolve,
		TLSConfig: &tls.Config{Certificates: []tls.Certificate{cert}, NextProtos: []string{"http/1.1"}},
	})
	if err := f.p.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(f.p.Stop)
	return f
}

func portFrom(t *testing.T, addr string) int {
	t.Helper()
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	n, _ := strconv.Atoi(port)
	return n
}

func insecureClient() *http.Client {
	return &http.Client{
		Transport:     &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		Timeout:       5 * time.Second,
	}
}

func TestStartAndStop(t *testing.T) {
	f := newFixture(t)
	if !f.p.Running() {
		t.Fatal("running after Start")
	}
	httpAddr, httpsAddr := f.p.Addrs()
	if httpAddr == "" || httpsAddr == "" {
		t.Fatalf("addresses: %q %q", httpAddr, httpsAddr)
	}
	if err := f.p.Start(); !errors.Is(err, ErrRunning) {
		t.Fatalf("a second Start: %v", err)
	}
	f.p.Stop()
	if f.p.Running() {
		t.Fatal("stopped")
	}
	// The port is free again: it can be bound. (Dialing it is not a test: while the whole suite runs, another test can take the
	// freed port at once and answer.) A port taken by somebody else is waited for a moment.
	var rebind net.Listener
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline); time.Sleep(50 * time.Millisecond) {
		var err error
		if rebind, err = net.Listen("tcp", httpsAddr); err == nil {
			break
		}
	}
	if rebind == nil {
		t.Fatal("the port is still held after Stop")
	}
	_ = rebind.Close()
	f.p.Stop() // stopping twice is fine
}

// When one port is taken nothing stays bound, so the other port is free for whoever needs it
func TestStartFailsCleanlyWhenAPortIsBusy(t *testing.T) {
	busy, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer busy.Close()
	free, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	freeAddr := free.Addr().String()
	free.Close()

	p := New(Options{HTTPAddr: freeAddr, HTTPSAddr: busy.Addr().String(), CacheDir: t.TempDir(), StagingCacheDir: t.TempDir(), Resolve: func(string) (Route, bool) { return Route{}, false }})
	err = p.Start()
	if err == nil || !strings.Contains(err.Error(), "cannot listen on "+busy.Addr().String()) {
		t.Fatalf("a busy port is named: %v", err)
	}
	if p.Running() {
		t.Fatal("not running")
	}
	again, err := net.Listen("tcp", freeAddr)
	if err != nil {
		t.Fatalf("the port that was free is released: %v", err)
	}
	again.Close()
}

func TestHTTPRedirectsRegisteredDomainsOnly(t *testing.T) {
	f := newFixture(t)
	f.routes["site.test"] = Route{Host: "site.test", Kind: KindPort, Port: 9}
	httpAddr, httpsAddr := f.p.Addrs()
	get := func(host, path string) *http.Response {
		req, _ := http.NewRequest(http.MethodGet, "http://"+httpAddr+path, nil)
		req.Host = host
		resp, err := insecureClient().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp
	}
	resp := get("site.test", "/a?b=1")
	want := "https://site.test:" + strconv.Itoa(portFrom(t, httpsAddr)) + "/a?b=1"
	if resp.StatusCode != http.StatusPermanentRedirect || resp.Header.Get("Location") != want {
		t.Fatalf("registered: %d %q, want %q", resp.StatusCode, resp.Header.Get("Location"), want)
	}
	if resp := get("stranger.test", "/"); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("a domain that is not registered: %d", resp.StatusCode)
	}
	// a challenge nobody asked for is not a redirect either
	if resp := get("stranger.test", "/.well-known/acme-challenge/nothing"); resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusNotFound {
		t.Fatalf("an unknown challenge is refused, not redirected: %d", resp.StatusCode)
	}
}

func TestProxyForwardsWithTheHeadersItWrites(t *testing.T) {
	f := newFixture(t)
	var seen http.Header
	var seenHost string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, seenHost = r.Header.Clone(), r.Host
		_ = json.NewEncoder(w).Encode(map[string]string{"path": r.URL.Path})
	}))
	defer backend.Close()
	f.routes["site.test"] = Route{Host: "site.test", Kind: KindProject, Port: portFrom(t, backend.Listener.Addr().String())}
	_, httpsAddr := f.p.Addrs()

	req, _ := http.NewRequest(http.MethodGet, "https://"+httpsAddr+"/hello", nil)
	req.Host = "site.test"
	// what a visitor may try: to pass as another address
	req.Header.Set("X-Forwarded-For", "6.6.6.6")
	req.Header.Set("X-Real-IP", "7.7.7.7")
	req.Header.Set("CF-Connecting-IP", "8.8.8.8")
	req.Header.Set("Forwarded", "for=9.9.9.9")
	resp, err := insecureClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	if seenHost != "site.test" {
		t.Errorf("the site sees the domain it was asked for: %q", seenHost)
	}
	for name, want := range map[string]string{"X-Forwarded-For": "127.0.0.1", "X-Real-Ip": "127.0.0.1", "X-Forwarded-Proto": "https", "X-Forwarded-Host": "site.test"} {
		if got := seen.Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
	for _, name := range []string{"Cf-Connecting-Ip", "Forwarded", "True-Client-Ip"} {
		if got := seen.Get(name); got != "" {
			t.Errorf("%s must not pass: %q", name, got)
		}
	}
}

func TestProxyAnswersWhenThereIsNothingToReach(t *testing.T) {
	f := newFixture(t)
	idle, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	closedPort := portFrom(t, idle.Addr().String())
	idle.Close()
	f.routes["down.test"] = Route{Host: "down.test", Kind: KindPort, Port: closedPort}
	f.routes["stopped.test"] = Route{Host: "stopped.test", Kind: KindProject, Port: 0}
	_, httpsAddr := f.p.Addrs()
	status := func(host string) int {
		req, _ := http.NewRequest(http.MethodGet, "https://"+httpsAddr+"/", nil)
		req.Host = host
		resp, err := insecureClient().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	if got := status("down.test"); got != http.StatusBadGateway {
		t.Errorf("nothing listens on its port: %d", got)
	}
	if got := status("stopped.test"); got != http.StatusBadGateway {
		t.Errorf("a project that is not running: %d", got)
	}
	if got := status("stranger.test"); got != http.StatusNotFound {
		t.Errorf("a domain that is not registered: %d", got)
	}
}

func TestWebSocketsGoThrough(t *testing.T) {
	f := newFixture(t)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			kind, message, err := conn.ReadMessage()
			if err != nil {
				return
			}
			_ = conn.WriteMessage(kind, append([]byte("echo:"), message...))
		}
	}))
	defer backend.Close()
	f.routes["live.test"] = Route{Host: "live.test", Kind: KindProject, Port: portFrom(t, backend.Listener.Addr().String())}
	_, httpsAddr := f.p.Addrs()

	dialer := websocket.Dialer{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, HandshakeTimeout: 5 * time.Second}
	conn, _, err := dialer.Dial("wss://"+httpsAddr+"/socket", http.Header{"Host": []string{"live.test"}})
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := conn.WriteMessage(websocket.TextMessage, []byte("hi")); err != nil {
		t.Fatal(err)
	}
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, message, err := conn.ReadMessage()
	if err != nil || string(message) != "echo:hi" {
		t.Fatalf("echo through the proxy: %q %v", message, err)
	}
}

type fakeSource struct {
	name  string
	err   error
	calls int
}

func (f *fakeSource) GetCertificate(*tls.ClientHelloInfo) (*tls.Certificate, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	return &tls.Certificate{Certificate: [][]byte{[]byte(f.name)}}, nil
}

// The challenge of a check is answered by the test manager; the production manager gets every other handshake
func TestPickCertificate(t *testing.T) {
	alpn := &tls.ClientHelloInfo{SupportedProtos: []string{"h2", acmeALPN}}
	plain := &tls.ClientHelloInfo{SupportedProtos: []string{"h2"}}

	prod, staging := &fakeSource{name: "prod"}, &fakeSource{name: "staging"}
	if cert, err := pickCertificate(plain, prod, staging); err != nil || string(cert.Certificate[0]) != "prod" || staging.calls != 0 {
		t.Fatalf("a visitor gets the production certificate: %v %v", cert, err)
	}
	prod, staging = &fakeSource{name: "prod", err: errors.New("no token")}, &fakeSource{name: "staging"}
	if cert, err := pickCertificate(alpn, prod, staging); err != nil || string(cert.Certificate[0]) != "staging" {
		t.Fatalf("a challenge the production manager does not know goes to the test manager: %v %v", cert, err)
	}
	prod, staging = &fakeSource{name: "prod"}, &fakeSource{name: "staging"}
	if cert, err := pickCertificate(alpn, prod, staging); err != nil || string(cert.Certificate[0]) != "prod" || staging.calls != 0 {
		t.Fatalf("its own challenge stays with the production manager: %v %v", cert, err)
	}
	// a visitor never reaches the test manager, even when production has nothing
	prod, staging = &fakeSource{name: "prod", err: errors.New("not registered")}, &fakeSource{name: "staging"}
	if _, err := pickCertificate(plain, prod, staging); err == nil || staging.calls != 0 {
		t.Fatalf("a visitor does not get a test certificate: %v", err)
	}
}

func TestHostPolicies(t *testing.T) {
	f := newFixture(t)
	f.routes["site.test"] = Route{Host: "site.test", Kind: KindPanel, Port: 8787}
	ctx := context.Background()
	if err := f.p.hostPolicy(ctx, "SITE.test"); err != nil {
		t.Errorf("a registered domain, in any letter case: %v", err)
	}
	if err := f.p.hostPolicy(ctx, "stranger.test"); err == nil {
		t.Error("a domain that is not registered cannot ask for a certificate")
	}
	if err := f.p.checkPolicy(ctx, "site.test"); err == nil {
		t.Error("the test manager asks for nothing unless a check is running")
	}
	f.p.checking["site.test"] = true
	if err := f.p.checkPolicy(ctx, "site.test"); err != nil {
		t.Errorf("a domain under check: %v", err)
	}
	if err := f.p.CheckDomain(ctx, "stranger.test"); err == nil {
		t.Error("only a registered domain can be checked")
	}
}

func TestCertInfoReadsTheCache(t *testing.T) {
	f := newFixture(t)
	_, bundle := selfSigned(t)
	ctx := context.Background()
	if info, err := f.p.CertInfo(ctx, "site.test"); err != nil || info != nil {
		t.Fatalf("no certificate yet: %v %v", info, err)
	}
	if err := f.p.prod.Cache.Put(ctx, "site.test", bundle); err != nil {
		t.Fatal(err)
	}
	info, err := f.p.CertInfo(ctx, "Site.Test")
	if err != nil || info == nil {
		t.Fatalf("the certificate: %v %v", info, err)
	}
	if info.NotAfter.Before(time.Now().Add(24*time.Hour)) || info.Issuer != "site.test" {
		t.Fatalf("info: %+v", info)
	}
}

func TestNormalize(t *testing.T) {
	for in, want := range map[string]string{"Site.Test": "site.test", "site.test:8443": "site.test", "site.test.": "site.test", "[::1]:443": "::1", " a.b ": "a.b"} {
		if got := normalize(in); got != want {
			t.Errorf("normalize(%q) = %q, want %q", in, got, want)
		}
	}
}
