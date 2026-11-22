package httpserver

import (
	"errors"
	"net"
	"regexp"
	"sort"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
)

// Subdomains the superadmin sells under the domains of its own Cloudflare account. The rules
// are kept apart from the handlers and the Cloudflare calls so they can be tested alone.

// 3 to 32 characters: letters, digits and single dashes inside
var subdomainLabelRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$`)

// Names a buyer must not hold: infrastructure, mail, and what looks like the seller
var reservedSubdomainLabels = map[string]bool{
	"www": true, "mail": true, "smtp": true, "imap": true, "pop": true, "pop3": true, "ftp": true, "sftp": true, "ssh": true,
	"ns": true, "ns1": true, "ns2": true, "ns3": true, "dns": true, "mx": true, "webmail": true, "autodiscover": true, "autoconfig": true,
	"admin": true, "administrator": true, "root": true, "api": true, "panel": true, "reneo": true, "cpanel": true, "whm": true, "dashboard": true,
	"login": true, "signin": true, "account": true, "accounts": true, "billing": true, "payment": true, "pay": true, "secure": true, "security": true,
	"support": true, "help": true, "status": true, "docs": true, "blog": true, "app": true, "static": true, "cdn": true, "assets": true, "vpn": true,
	"localhost": true, "hosting": true, "server": true, "cloud": true, "portal": true,
}

func validateSubdomainLabel(label string) error {
	switch {
	case len(label) < 3 || len(label) > 32:
		return errors.New("use 3 to 32 characters")
	case !subdomainLabelRe.MatchString(label):
		return errors.New("use only lowercase letters, digits and dashes, starting and ending with a letter or digit")
	case strings.Contains(label, "--"):
		// "xx--" is how internationalised names are written, and look-alike names are a phishing tool
		return errors.New("two dashes in a row are not allowed")
	case reservedSubdomainLabels[label]:
		return errors.New("this name is reserved")
	}
	return nil
}

func hostnameFor(label, domain string) string {
	return label + "." + strings.ToLower(strings.TrimSpace(domain))
}

// Subdomain states a row can be in
const (
	subdomainPending   = "pending"
	subdomainActive    = "active"
	subdomainSuspended = "suspended"
	subdomainError     = "error"
)

// hostingRoute is one hostname that should be served, and where
type hostingRoute struct {
	subdomain database.HostingSubdomain
	service   string
}

// panelService is where a sold subdomain leads: the panel itself, which the buyer signs in to
func panelService(bindAddr string) string {
	port := "8787"
	if _, p, err := net.SplitHostPort(bindAddr); err == nil && p != "" {
		port = p
	}
	return "http://localhost:" + port
}

// planHostingRoutes decides which rows are served. Nothing is while hosting mode is off. A row is served when it is not
// suspended and its owner can sign in (not suspended by hand or by an ended plan). The rest are listed with the reason,
// for the status the owner sees.
func planHostingRoutes(rows []database.HostingSubdomain, hostingOn bool, ownerActive map[int64]bool, service string) (served []hostingRoute, skipped map[int64]string) {
	skipped = map[int64]string{}
	for _, row := range rows {
		switch {
		case !hostingOn || row.Status == subdomainSuspended:
			// nothing is served, and the status the owner sees stays as it was
			skipped[row.ID] = ""
		case !ownerActive[row.UserID]:
			skipped[row.ID] = "account is not active"
		default:
			served = append(served, hostingRoute{subdomain: row, service: service})
		}
	}
	sort.Slice(served, func(i, j int) bool { return served[i].subdomain.Hostname < served[j].subdomain.Hostname })
	return served, skipped
}

func ingressFor(served []hostingRoute) []cloudflareapi.IngressRule {
	rules := make([]cloudflareapi.IngressRule, 0, len(served))
	for _, route := range served {
		rules = append(rules, cloudflareapi.IngressRule{Hostname: route.subdomain.Hostname, Service: route.service})
	}
	return rules
}

// rulesKey lets the sync skip a restart of the tunnel when nothing changed
func rulesKey(rules []cloudflareapi.IngressRule) string {
	parts := make([]string, 0, len(rules))
	for _, rule := range rules {
		parts = append(parts, rule.Hostname+">"+rule.Service)
	}
	return strings.Join(parts, "|")
}

// dnsVerdict says what an existing set of records at a hostname means for us
type dnsVerdict int

const (
	dnsFree    dnsVerdict = iota // nothing there: create ours
	dnsOurs                      // our CNAME is there already
	dnsTaken                     // something else holds the name
)

func judgeDNS(records []cloudflareapi.DNSRecord, tunnelContent string) dnsVerdict {
	if len(records) == 0 {
		return dnsFree
	}
	for _, record := range records {
		if !strings.EqualFold(record.Type, "CNAME") || !strings.EqualFold(strings.TrimSuffix(record.Content, "."), tunnelContent) {
			return dnsTaken
		}
	}
	return dnsOurs
}
