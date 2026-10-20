package httpserver

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/publicproxy"
)

// A buyer's own domain can be served by the public proxy of the server instead of Cloudflare for SaaS. The buyer proves
// the domain is theirs with a TXT record that holds a token, points it at the server, and the server gets the certificate.
// Nothing is served, and no certificate is asked for, before the TXT record is found: a domain that merely points here
// belongs to whoever pointed it, not to whoever types its name first.

const (
	// directVerifyLabel is put in front of the domain to make the name of the TXT record
	directVerifyLabel  = "_reneo-verify"
	directVerifyPrefix = "reneo-verify="
	// after a certificate failed it is tried again no sooner than this
	directRetryAfter = 5 * time.Minute
	directIssueTime  = 3 * time.Minute
)

// the notes of a direct domain are codes the page turns into words, so each buyer reads their own language
const (
	noteTXTMissing = "txt-missing"
	noteDNSMissing = "dns-missing"
	noteDNSWrong   = "dns-wrong:"
	noteCertFailed = "cert-failed:"
)

// directRefreshedAt and directCertTriedAt keep, by domain, when it was last looked at and when a certificate was last tried: a
// page that polls must not make a DNS query each time, and a failing certificate must not be asked for again and again
var directRefreshedAt, directCertTriedAt sync.Map

// lookups are where the DNS answers come from; variables so a test can answer instead
var (
	lookupTXT = func(name string) ([]string, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		return net.DefaultResolver.LookupTXT(ctx, name)
	}
	lookupHost = func(name string) ([]string, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		return net.DefaultResolver.LookupHost(ctx, name)
	}
)

// certIssuer is what a direct domain needs from the public proxy: a test certificate, then the real one
type certIssuer interface {
	CheckDomain(ctx context.Context, host string) error
	Obtain(ctx context.Context, host string) error
}

var _ certIssuer = (*publicproxy.Proxy)(nil)

func (s *Server) certIssuer() certIssuer {
	if s.testIssuer != nil {
		return s.testIssuer
	}
	if proxy := s.runningPublicProxy(); proxy != nil {
		return proxy
	}
	return nil
}

// directDomainsReady gives the address buyers point at, when the server serves their domains: the setting is on, an address is
// set, and the proxy runs
func (s *Server) directDomainsReady() (target string, ok bool) {
	settings := s.loadSiteSettings()
	if !settings.PublicBuyerDomains || strings.TrimSpace(settings.PublicProxyTarget) == "" || s.certIssuer() == nil {
		return "", false
	}
	return settings.PublicProxyTarget, true
}

// targetAddresses are the addresses the target stands for: itself when it is an address, else what its name leads to
func targetAddresses(target string) []string {
	if net.ParseIP(target) != nil {
		return []string{target}
	}
	ips, _ := lookupHost(target)
	return ips
}

// leadsToServer says what a domain resolves to, and whether any of it is the address of the server
func leadsToServer(hostname, target string) (resolved []string, ok bool) {
	resolved, _ = lookupHost(hostname)
	mine := map[string]bool{}
	for _, ip := range targetAddresses(target) {
		if parsed := net.ParseIP(ip); parsed != nil {
			mine[parsed.String()] = true
		}
	}
	for _, ip := range resolved {
		if parsed := net.ParseIP(ip); parsed != nil && mine[parsed.String()] {
			return resolved, true
		}
	}
	return resolved, false
}

func newVerifyToken() string {
	raw := make([]byte, 12)
	_, _ = rand.Read(raw)
	return hex.EncodeToString(raw)
}

// txtProvesOwner says whether the TXT record of the domain holds its token
func txtProvesOwner(row database.HostingCustomDomain) bool {
	records, _ := lookupTXT(directVerifyLabel + "." + row.Hostname)
	want := directVerifyPrefix + row.VerifyToken
	for _, record := range records {
		if strings.TrimSpace(record) == want {
			return true
		}
	}
	return false
}

// setDirectState stores the state when it changed; a write that changes nothing would only push the retry time forward
func (s *Server) setDirectState(row database.HostingCustomDomain, status, ssl, note string) database.HostingCustomDomain {
	if row.Status == status && row.SSLStatus == ssl && row.Note == note {
		return row
	}
	if err := s.database.SetHostingCustomDomainState(row.ID, status, ssl, note); err != nil {
		log.Printf("[hosting] custom domain %s: %v", row.Hostname, err)
		return row
	}
	row.Status, row.SSLStatus, row.Note = status, ssl, note
	return row
}

// refreshDirectCustomDomain moves a direct domain one step on: its owner is proven, it points at the server, and the certificate is
// made. Each step waits for the one before. The owner hears when it goes live.
func (s *Server) refreshDirectCustomDomain(row database.HostingCustomDomain, force bool) database.HostingCustomDomain {
	if row.Provider != database.CustomProviderDirect || row.Status == "suspended" || row.Status == "active" {
		return row
	}
	target, ready := s.directDomainsReady()
	if !ready {
		return row
	}
	if last, ok := directRefreshedAt.Load(row.ID); ok && !force && time.Since(last.(time.Time)) < customRefreshAfter {
		return row
	}
	directRefreshedAt.Store(row.ID, time.Now())
	if row.VerifiedAt == nil {
		if !txtProvesOwner(row) {
			return s.setDirectState(row, "pending", "pending", noteTXTMissing)
		}
		if err := s.database.SetCustomDomainVerified(row.ID); err != nil {
			return row
		}
		now := time.Now()
		row.VerifiedAt = &now
		// from now on the proxy may answer for it, and ask for its certificate
		s.forgetPublicRoutes()
		forgetHostingHosts()
	}
	resolved, ok := leadsToServer(row.Hostname, target)
	if !ok {
		if len(resolved) == 0 {
			return s.setDirectState(row, "pending", "pending", noteDNSMissing)
		}
		return s.setDirectState(row, "pending", "pending", noteDNSWrong+strings.Join(resolved, ","))
	}
	if last, ok := directCertTriedAt.Load(row.ID); ok && !force && time.Since(last.(time.Time)) < directRetryAfter {
		return row
	}
	issuer := s.certIssuer()
	if issuer == nil {
		return row
	}
	directCertTriedAt.Store(row.ID, time.Now())
	ctx, cancel := context.WithTimeout(context.Background(), directIssueTime)
	defer cancel()
	// the test service first: a failure there costs nothing, and one at the real service counts against the limits
	if err := issuer.CheckDomain(ctx, row.Hostname); err != nil {
		return s.setDirectState(row, "pending", "error", noteCertFailed+err.Error())
	}
	if err := issuer.Obtain(ctx, row.Hostname); err != nil {
		return s.setDirectState(row, "pending", "error", noteCertFailed+err.Error())
	}
	row = s.setDirectState(row, "active", "active", "")
	s.notifyUserAction(row.UserID, "Domain aktif", fmt.Sprintf("Domain %s sudah tersambung ke panel Anda dan bisa dipakai untuk masuk.", row.Hostname), "success")
	forgetHostingHosts()
	return row
}

// refreshPendingDirectDomains moves the direct domains that are not live yet
func (s *Server) refreshPendingDirectDomains(rows []database.HostingCustomDomain) {
	for _, row := range rows {
		if row.Provider == database.CustomProviderDirect && row.Status == "pending" {
			s.refreshDirectCustomDomain(row, false)
		}
	}
}

// directCustomRoutes are the direct domains the public proxy answers for: their owner was proven, the domain is not suspended,
// and the account is active. They show the panel, where only their owner can sign in.
func (s *Server) directCustomRoutes(panelPort int) map[string]publicproxy.Route {
	routes := map[string]publicproxy.Route{}
	rows, err := s.database.ListHostingCustomDomains(0)
	if err != nil || panelPort == 0 {
		return routes
	}
	active := map[int64]bool{}
	for _, row := range rows {
		if row.Provider != database.CustomProviderDirect || row.VerifiedAt == nil || row.Status == "suspended" {
			continue
		}
		if _, seen := active[row.UserID]; !seen {
			user, _ := s.database.GetUserByID(row.UserID)
			active[row.UserID] = user != nil && user.Status == "active"
		}
		if active[row.UserID] {
			routes[row.Hostname] = publicproxy.Route{Host: row.Hostname, Kind: publicproxy.KindPanel, Port: panelPort}
		}
	}
	return routes
}

// ─── Settings of the seller ──────────────────────────────────────────────────

// validTarget accepts the address buyers point at: an IP address, or a domain name that leads to one
func validTarget(target string) error {
	if net.ParseIP(target) != nil {
		return nil
	}
	return validateCustomHostname(strings.ToLower(target))
}
