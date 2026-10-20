package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"sync"
	"time"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
	"github.com/friskipradana/panel-desktop-ui/internal/publicproxy"
	"github.com/friskipradana/panel-desktop-ui/internal/runtimepath"
)

// An install that has a public address can serve its domains itself, without a tunnel: the public proxy listens on the web
// ports, gets a certificate for each registered domain from Let's Encrypt, and forwards to the panel, a project or a port on
// this machine. It is off until the superadmin turns it on, and only registered domains are answered.

const publicRoutesTTL = 3 * time.Second

// publicProxyRuntime is the proxy while it runs, and why it did not start
type publicProxyRuntime struct {
	mu    sync.Mutex
	proxy publicEngine
	err   string
}

// publicRouteCache keeps the routes for a few seconds, so a request does not ask the database
type publicRouteCache struct {
	mu     sync.Mutex
	at     time.Time
	routes map[string]publicproxy.Route
}

func (s *Server) forgetPublicRoutes() {
	s.publicRoutes.mu.Lock()
	s.publicRoutes.at = time.Time{}
	s.publicRoutes.mu.Unlock()
	// a web server that has files to write writes them again
	if engine := s.runningPublicProxy(); engine != nil {
		engine.Refresh()
	}
}

// panelLoopbackPort is the port the panel answers on at 127.0.0.1; 0 when it listens on one other address only
func (s *Server) panelLoopbackPort() int {
	host, port, err := net.SplitHostPort(s.cfg.BindAddr)
	if err != nil {
		return 0
	}
	if ip := net.ParseIP(host); host != "" && host != "localhost" && (ip == nil || !(ip.IsLoopback() || ip.IsUnspecified())) {
		return 0
	}
	n, _ := strconv.Atoi(port)
	return n
}

// publicRoutesSnapshot is every enabled route by domain, with the port it leads to
func (s *Server) publicRoutesSnapshot() map[string]publicproxy.Route {
	c := &s.publicRoutes
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.routes != nil && time.Since(c.at) < publicRoutesTTL {
		return c.routes
	}
	routes := map[string]publicproxy.Route{}
	if s.database != nil && s.database.IsConnected() {
		rows, err := s.database.ListPublicRoutes()
		if err != nil {
			log.Printf("[publicproxy] cannot read the routes: %v", err)
			if c.routes != nil {
				return c.routes
			}
		}
		panelPort := s.panelLoopbackPort()
		for _, r := range rows {
			if !r.Enabled {
				continue
			}
			route := publicproxy.Route{Host: r.Hostname, Kind: r.Kind}
			switch r.Kind {
			case publicproxy.KindPanel:
				route.Port = panelPort
			case publicproxy.KindProject:
				route.Port = r.ProjectPort
			default:
				route.Port = r.Port
			}
			routes[r.Hostname] = route
		}
		// the domains of buyers that this server serves itself, whose owner was proven
		for host, route := range s.directCustomRoutes(panelPort) {
			if _, taken := routes[host]; !taken {
				routes[host] = route
			}
		}
	}
	c.routes, c.at = routes, time.Now()
	return routes
}

// publicRoute is what the proxy asks for each request
func (s *Server) publicRoute(host string) (publicproxy.Route, bool) {
	route, ok := s.publicRoutesSnapshot()[strings.ToLower(host)]
	return route, ok
}

// isPublicPanelHost says whether a domain was registered to show the panel itself
func (s *Server) isPublicPanelHost(host string) bool {
	route, ok := s.publicRoute(host)
	return ok && route.Kind == publicproxy.KindPanel
}

func (s *Server) publicProxyAddrs() (httpAddr, httpsAddr string) {
	httpAddr, httpsAddr = runtimepath.Getenv("PUBLIC_HTTP_ADDR"), runtimepath.Getenv("PUBLIC_HTTPS_ADDR")
	if httpAddr == "" {
		httpAddr = ":80"
	}
	if httpsAddr == "" {
		httpsAddr = ":443"
	}
	return httpAddr, httpsAddr
}

// startPublicProxy binds the web ports. It says why when it cannot, and then nothing is bound.
func (s *Server) startPublicProxy() error {
	rt := &s.publicProxy
	rt.mu.Lock()
	defer rt.mu.Unlock()
	if rt.proxy != nil && rt.proxy.Running() {
		return nil
	}
	settings := s.loadSiteSettings()
	proxy, err := s.newEngine(settings.PublicEngine, settings.PublicProxyEmail)
	if err == nil {
		err = proxy.Start()
	}
	if err != nil {
		rt.proxy, rt.err = nil, err.Error()
		return err
	}
	rt.proxy, rt.err = proxy, ""
	log.Printf("[publicproxy] serving registered domains through %s", proxy.Status().Name)
	return nil
}

func (s *Server) stopPublicProxy() {
	rt := &s.publicProxy
	rt.mu.Lock()
	proxy := rt.proxy
	rt.proxy, rt.err = nil, ""
	rt.mu.Unlock()
	if proxy != nil {
		proxy.Stop()
	}
}

// runningPublicProxy is the proxy when it listens, else nil
func (s *Server) runningPublicProxy() publicEngine {
	rt := &s.publicProxy
	rt.mu.Lock()
	defer rt.mu.Unlock()
	if rt.proxy != nil && rt.proxy.Running() {
		return rt.proxy
	}
	return nil
}

// RestorePublicProxy starts the proxy again after a restart, when it was on
func (s *Server) RestorePublicProxy() {
	settings := s.loadSiteSettings()
	// without the confirmation of the superadmin it is never started, whatever the stored switch says
	if s.database == nil || !s.database.IsConnected() || !settings.PublicProxyEnabled || settings.PublicProxyConfirmedAt == nil {
		return
	}
	if err := s.startPublicProxy(); err != nil {
		log.Printf("[publicproxy] could not start: %v", err)
	}
}

// ─── Status ─────────────────────────────────────────────────────────────────

type localAddress struct {
	IP string `json:"ip"`
	// Public: a global address, not a private, link-local, shared (100.64.0.0/10) or loopback one
	Public bool `json:"public"`
}

var sharedRange = func() *net.IPNet { _, n, _ := net.ParseCIDR("100.64.0.0/10"); return n }()

func localAddresses() []localAddress {
	out := []localAddress{}
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return out
	}
	for _, a := range addrs {
		ipnet, ok := a.(*net.IPNet)
		if !ok || ipnet.IP.IsLoopback() || ipnet.IP.IsLinkLocalUnicast() || ipnet.IP.IsLinkLocalMulticast() {
			continue
		}
		ip := ipnet.IP
		public := ip.IsGlobalUnicast() && !ip.IsPrivate() && !sharedRange.Contains(ip)
		out = append(out, localAddress{IP: ip.String(), Public: public})
	}
	return out
}

func (s *Server) handlePublicProxyStatus(w http.ResponseWriter, _ *http.Request) {
	settings := s.loadSiteSettings()
	httpWant, httpsWant := s.publicProxyAddrs()
	status := jsonResponse{
		// on only counts when the superadmin confirmed it
		"enabled": settings.PublicProxyEnabled && settings.PublicProxyConfirmedAt != nil, "email": settings.PublicProxyEmail,
		"confirmedBy": settings.PublicProxyConfirmedBy, "confirmedAt": settings.PublicProxyConfirmedAt,
		"buyerDomains": settings.PublicBuyerDomains, "target": settings.PublicProxyTarget, "cloudflare": s.publicCloudflareReady(),
		"engine": map[bool]string{true: engineBuiltin, false: settings.PublicEngine}[settings.PublicEngine == ""],
		"wantHttp": httpWant, "wantHttps": httpsWant, "addresses": localAddresses(), "panelOnLoopback": s.panelLoopbackPort() > 0,
	}
	rt := &s.publicProxy
	rt.mu.Lock()
	status["error"] = rt.err
	if rt.proxy != nil && rt.proxy.Running() {
		status["running"] = true
		status["http"], status["https"] = rt.proxy.Addrs()
		status["engineStatus"] = rt.proxy.Status()
	} else {
		status["running"] = false
	}
	rt.mu.Unlock()
	s.writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleSetPublicProxy(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireDatabase(w) {
		return
	}
	var req struct {
		Enabled *bool   `json:"enabled"`
		Email   *string `json:"email"`
		// ConfirmPublicIP is the superadmin saying that this server has a public address (or that the web ports are
		// forwarded to it); turning the proxy on needs it every time
		ConfirmPublicIP bool `json:"confirmPublicIp"`
		// BuyerDomains serves the domains of buyers from this server; Target is the address they point at
		BuyerDomains *bool   `json:"buyerDomains"`
		Target       *string `json:"target"`
		// Engine is what serves the domains: builtin, nginx or apache
		Engine *string `json:"engine"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	current := s.loadSiteSettings()
	next := current
	if req.Email != nil {
		email := strings.TrimSpace(*req.Email)
		if email != "" {
			if _, err := mail.ParseAddress(email); err != nil || len(email) > 200 {
				s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid email address"})
				return
			}
		}
		next.PublicProxyEmail = email
	}
	if req.Enabled != nil {
		if *req.Enabled && !current.PublicProxyEnabled {
			if !req.ConfirmPublicIP {
				s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "confirm that this server has a public IP first"})
				return
			}
			who := ""
			if u := userFromCtx(r); u != nil {
				who = u.Username
			}
			now := time.Now()
			next.PublicProxyConfirmedBy, next.PublicProxyConfirmedAt = who, &now
		}
		next.PublicProxyEnabled = *req.Enabled
	}
	if req.Engine != nil {
		if !validEngine(*req.Engine) {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "this is not a way to serve domains"})
			return
		}
		next.PublicEngine = *req.Engine
	}
	if req.Target != nil {
		target := strings.TrimSpace(*req.Target)
		if target != "" {
			if err := validTarget(target); err != nil {
				s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
				return
			}
		}
		next.PublicProxyTarget = target
	}
	if req.BuyerDomains != nil {
		if *req.BuyerDomains && next.PublicProxyTarget == "" {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "set the address buyers point their domain at first"})
			return
		}
		next.PublicBuyerDomains = *req.BuyerDomains
	}
	// the email is read when the proxy starts, so a changed email starts it again
	restart := next.PublicProxyEnabled && (!current.PublicProxyEnabled || next.PublicProxyEmail != current.PublicProxyEmail || next.PublicEngine != current.PublicEngine)
	if !next.PublicProxyEnabled {
		s.stopPublicProxy()
	} else if restart {
		s.stopPublicProxy()
		if err := s.saveSiteSettings(next); err != nil {
			s.writeError(w, http.StatusInternalServerError, errors.New("could not save the settings"))
			return
		}
		if err := s.startPublicProxy(); err != nil {
			// not on, so it is not remembered as on
			next.PublicProxyEnabled = false
			_ = s.saveSiteSettings(next)
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
			return
		}
	}
	if err := s.saveSiteSettings(next); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("could not save the settings"))
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "publicproxy.settings", "ok", map[string]any{"enabled": next.PublicProxyEnabled, "confirmedPublicIp": req.ConfirmPublicIP})
	}
	s.handlePublicProxyStatus(w, r)
}

// handleDetectPublicIP asks a public service what address this machine shows to the internet, and says whether it is one of
// its own: if not, the address belongs to a router in front of it and the web ports have to be forwarded. It runs only when
// the superadmin asks for it.
func (s *Server) handleDetectPublicIP(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://1.1.1.1/cdn-cgi/trace", nil)
	resp, err := (&http.Client{Timeout: 8 * time.Second}).Do(req)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "could not reach the internet to find the public address"})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
	ip := ""
	for _, line := range strings.Split(string(body), "\n") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(line), "ip="); ok {
			ip = v
		}
	}
	if net.ParseIP(ip) == nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "the answer did not hold an address"})
		return
	}
	onHost := false
	for _, a := range localAddresses() {
		if a.IP == ip {
			onHost = true
		}
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ip": ip, "onThisMachine": onHost})
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// publicRouteView is a route with what the proxy knows about it
type publicRouteView struct {
	database.PublicRoute
	// Target says in words what the route leads to
	Target string `json:"target"`
	// State: disabled, off (the proxy is not running), issued (a certificate exists), error (the last check failed), waiting
	State       string     `json:"state"`
	CertExpires *time.Time `json:"certExpires"`
	CertIssuer  string     `json:"certIssuer"`
}

func (s *Server) publicRouteViews(rows []database.PublicRoute) []publicRouteView {
	proxy := s.runningPublicProxy()
	out := make([]publicRouteView, 0, len(rows))
	for _, row := range rows {
		view := publicRouteView{PublicRoute: row}
		switch row.Kind {
		case publicproxy.KindPanel:
			view.Target = "panel"
		case publicproxy.KindProject:
			view.Target = row.ProjectName
		default:
			view.Target = "127.0.0.1:" + strconv.Itoa(row.Port)
		}
		var cert *publicproxy.Certificate
		if proxy != nil {
			cert, _ = proxy.CertInfo(context.Background(), row.Hostname)
		}
		if cert != nil {
			view.CertExpires, view.CertIssuer = &cert.NotAfter, cert.Issuer
		}
		switch {
		case !row.Enabled:
			view.State = "disabled"
		case proxy == nil:
			view.State = "off"
		case cert != nil:
			view.State = "issued"
		case row.CheckedAt != nil && !row.CheckOK:
			view.State = "error"
		default:
			view.State = "waiting"
		}
		out = append(out, view)
	}
	return out
}

func publicRouteSpec() listquery.Spec[publicRouteView] {
	return listquery.Spec[publicRouteView]{
		Columns: []listquery.Column[publicRouteView]{
			{Key: "hostname", Value: func(v publicRouteView) string { return v.Hostname }},
			{Key: "kind", Value: func(v publicRouteView) string { return v.Kind }},
			{Key: "target", Value: func(v publicRouteView) string { return v.Target }},
			{Key: "state", Value: func(v publicRouteView) string { return v.State }},
		},
		Search: func(v publicRouteView) string {
			return lower(v.Hostname + " " + v.Kind + " " + v.Target + " " + v.State + " " + v.Note)
		},
		Tiebreak: func(a, b publicRouteView) int { return compareText(a.Hostname, b.Hostname) },
	}
}

func (s *Server) handlePublicRoutesTable(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	rows, err := s.database.ListPublicRoutes()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, tableResponse(s.publicRouteViews(rows), publicRouteSpec(), r.URL.Query()))
}

type publicRouteInput struct {
	Hostname  string `json:"hostname"`
	Kind      string `json:"kind"`
	ProjectID *int64 `json:"projectId"`
	Port      int    `json:"port"`
	Enabled   *bool  `json:"enabled"`
	Note      string `json:"note"`
}

// cleanPublicRoute checks a route: a valid domain that is not taken, and a target that exists
func (s *Server) cleanPublicRoute(in publicRouteInput, creating bool) (database.PublicRoute, error) {
	route := database.PublicRoute{Hostname: strings.ToLower(strings.TrimSpace(in.Hostname)), Kind: in.Kind, Enabled: true, Note: strings.TrimSpace(in.Note)}
	if in.Enabled != nil {
		route.Enabled = *in.Enabled
	}
	if len(route.Note) > 200 {
		return route, errors.New("the note is at most 200 characters")
	}
	if creating {
		if err := validateCustomHostname(route.Hostname); err != nil {
			return route, err
		}
		// a domain that is already the panel address of a buyer is served through Cloudflare, not here
		if s.hostingHostOwner(route.Hostname) != 0 {
			return route, errors.New("this domain is already the panel address of a buyer")
		}
	}
	switch in.Kind {
	case publicproxy.KindPanel:
		if s.panelLoopbackPort() == 0 {
			return route, errors.New("the panel does not listen on this machine's loopback address, so it cannot be served here")
		}
	case publicproxy.KindProject:
		if in.ProjectID == nil {
			return route, errors.New("pick a project")
		}
		if ok, err := s.database.ProjectExists(*in.ProjectID); err != nil || !ok {
			return route, errors.New("this project does not exist")
		}
		route.ProjectID = in.ProjectID
	case publicproxy.KindPort:
		if in.Port < 1 || in.Port > 65535 {
			return route, errors.New("the port is a number from 1 to 65535")
		}
		httpAddr, httpsAddr := s.publicProxyAddrs()
		for _, addr := range []string{httpAddr, httpsAddr} {
			if _, p, err := net.SplitHostPort(addr); err == nil && p == strconv.Itoa(in.Port) {
				return route, errors.New("this is a port of the public proxy itself")
			}
		}
		route.Port = in.Port
	default:
		return route, errors.New("a domain leads to the panel, a project or a port")
	}
	return route, nil
}

func (s *Server) handleCreatePublicRoute(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireDatabase(w) {
		return
	}
	var in publicRouteInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&in); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	route, err := s.cleanPublicRoute(in, true)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	u := userFromCtx(r)
	var by int64
	if u != nil {
		by = u.ID
	}
	created, err := s.database.CreatePublicRoute(route, by)
	if errors.Is(err, database.ErrPublicRouteTaken) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.forgetPublicRoutes()
	if u != nil {
		s.auditSensitiveAction(r, u, "publicproxy.route.create", "ok", map[string]any{"hostname": created.Hostname, "kind": created.Kind})
	}
	s.writeJSON(w, http.StatusCreated, s.publicRouteViews([]database.PublicRoute{*created})[0])
}

func (s *Server) handleUpdatePublicRoute(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireDatabase(w) {
		return
	}
	id := parsePathID(r, "id")
	existing, _ := s.database.GetPublicRoute(id)
	if existing == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	var in publicRouteInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&in); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	// the domain is the identity of a route: to change it, make a new one
	in.Hostname = existing.Hostname
	route, err := s.cleanPublicRoute(in, false)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	route.ID = id
	updated, err := s.database.UpdatePublicRoute(route)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.forgetPublicRoutes()
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "publicproxy.route.update", "ok", map[string]any{"hostname": existing.Hostname, "kind": route.Kind, "enabled": route.Enabled})
	}
	s.writeJSON(w, http.StatusOK, s.publicRouteViews([]database.PublicRoute{*updated})[0])
}

func (s *Server) handleDeletePublicRoute(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	id := parsePathID(r, "id")
	existing, _ := s.database.GetPublicRoute(id)
	if existing == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	if err := s.database.DeletePublicRoute(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.forgetPublicRoutes()
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "publicproxy.route.delete", "ok", map[string]any{"hostname": existing.Hostname})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// handleCheckPublicRoute asks the test service of Let's Encrypt for a certificate for the domain, which proves that the domain
// leads here and that the web ports are reachable. What it said is kept on the route.
func (s *Server) handleCheckPublicRoute(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	if allowed, retry := s.allowRateLimit("publiccheck", rateLimitRule{Window: time.Minute, Limit: 6}); !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())+1))
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many checks, wait a moment"})
		return
	}
	id := parsePathID(r, "id")
	route, _ := s.database.GetPublicRoute(id)
	if route == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	proxy := s.runningPublicProxy()
	if proxy == nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "the public proxy is not running"})
		return
	}
	if !route.Enabled {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "switch the domain on first"})
		return
	}
	// what the name leads to, to tell the person when it is the first thing wrong
	resolved, lookupErr := lookupHost(route.Hostname)
	if lookupErr != nil || len(resolved) == 0 {
		reason := "the domain has no DNS record yet: point an A record (or AAAA) at this server's public address"
		_ = s.database.SetPublicRouteCheck(id, false, reason)
		s.respondCheckedRoute(w, id, false, reason, resolved)
		return
	}
	err := proxy.CheckDomain(r.Context(), route.Hostname)
	reason := ""
	if err != nil {
		reason = err.Error()
	}
	_ = s.database.SetPublicRouteCheck(id, err == nil, reason)
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "publicproxy.route.check", map[bool]string{true: "ok", false: "failed"}[err == nil], map[string]any{"hostname": route.Hostname})
	}
	s.respondCheckedRoute(w, id, err == nil, reason, resolved)
}

func (s *Server) respondCheckedRoute(w http.ResponseWriter, id int64, ok bool, reason string, resolved []string) {
	updated, _ := s.database.GetPublicRoute(id)
	if updated == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": ok, "error": reason, "resolved": resolved, "route": s.publicRouteViews([]database.PublicRoute{*updated})[0]})
}

// handlePublicEngines tells what each way to serve needs on this machine: what is installed and running, and whether the web
// ports are free for the proxy of Reneo. It runs commands, so the page asks only when it is opened or when asked.
func (s *Server) handlePublicEngines(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	s.writeJSON(w, http.StatusOK, jsonResponse{"engines": s.engineReports(ctx)})
}

// publicCloudflare is the Cloudflare account of the superadmin, which can make the DNS record of a domain
func (s *Server) publicCloudflare() (*cloudflareapi.Client, error) {
	if s.testCloudflare != nil {
		return s.testCloudflare, nil
	}
	client, _, err := s.hostingCloudflare()
	return client, err
}

func (s *Server) publicCloudflareReady() bool {
	if s.testCloudflare != nil {
		return true
	}
	if s.database == nil || !s.database.IsConnected() {
		return false
	}
	_, err := s.publicCloudflare()
	return err == nil
}

// publicAddressRecord is the DNS record that makes a domain lead to this server: an A or AAAA record for the address that was
// set (or the first public address of the machine), or a CNAME when the address is a name
func (s *Server) publicAddressRecord() (recordType, content string, err error) {
	target := strings.TrimSpace(s.loadSiteSettings().PublicProxyTarget)
	if target == "" {
		for _, a := range localAddresses() {
			if a.Public {
				target = a.IP
				break
			}
		}
	}
	if target == "" {
		return "", "", errors.New("set the address of this server first")
	}
	if ip := net.ParseIP(target); ip != nil {
		if ip.To4() != nil {
			return "A", ip.String(), nil
		}
		return "AAAA", ip.String(), nil
	}
	return "CNAME", strings.TrimSuffix(strings.ToLower(target), "."), nil
}

// zoneFor finds the zone of the account that holds a domain: the one with the longest name that the domain ends with
func zoneFor(hostname string, zones []cloudflareapi.ZoneInfo) *cloudflareapi.ZoneInfo {
	var best *cloudflareapi.ZoneInfo
	for i := range zones {
		name := strings.ToLower(zones[i].Name)
		if hostname == name || strings.HasSuffix(hostname, "."+name) {
			if best == nil || len(name) > len(best.Name) {
				best = &zones[i]
			}
		}
	}
	return best
}

// recordsAreOurs says whether what is at the name already is the record we would make
func recordsAreOurs(records []cloudflareapi.DNSRecord, recordType, content string) bool {
	if len(records) == 0 {
		return false
	}
	for _, r := range records {
		if !strings.EqualFold(r.Type, recordType) || !strings.EqualFold(strings.TrimSuffix(r.Content, "."), content) {
			return false
		}
	}
	return true
}

// handleRouteCloudflareDNS makes the DNS record of a domain at Cloudflare, when the domain is in the account of the superadmin.
// The record is DNS only (not proxied): the certificate is asked for through the web ports of this server.
func (s *Server) handleRouteCloudflareDNS(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	route, _ := s.database.GetPublicRoute(parsePathID(r, "id"))
	if route == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	recordType, content, err := s.publicAddressRecord()
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	client, err := s.publicCloudflare()
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	zones, err := client.ListZones()
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "Cloudflare did not answer: " + err.Error()})
		return
	}
	zone := zoneFor(route.Hostname, zones)
	if zone == nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "this domain is not in your Cloudflare account"})
		return
	}
	records, err := client.DNSRecordsByName(zone.ID, route.Hostname)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "Cloudflare did not answer: " + err.Error()})
		return
	}
	created := false
	if !recordsAreOurs(records, recordType, content) {
		if len(records) > 0 {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": route.Hostname + " is already used by another DNS record"})
			return
		}
		if _, err := client.CreateDNSRecord(zone.ID, cloudflareapi.DNSRecordPayload{Type: recordType, Name: route.Hostname, Content: content, TTL: 1, Proxied: false, Comment: "Reneo public IP"}); err != nil {
			s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "could not create the DNS record: " + err.Error()})
			return
		}
		created = true
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "publicproxy.route.dns", "ok", map[string]any{"hostname": route.Hostname, "type": recordType, "created": created})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "created": created, "type": recordType, "content": content, "zone": zone.Name})
}
