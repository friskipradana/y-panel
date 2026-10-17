package httpserver

import (
	"strconv"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
)

// The two tables of the Cloudflare window as spreadsheets, like the Docker ones (list_tables.go).

// dnsSpec: the records of one domain
func dnsSpec() listquery.Spec[cloudflareapi.DNSRecord] {
	ttlOf := func(r cloudflareapi.DNSRecord) string {
		if r.TTL <= 1 {
			return "auto"
		}
		return strconv.Itoa(r.TTL)
	}
	return listquery.Spec[cloudflareapi.DNSRecord]{
		Columns: []listquery.Column[cloudflareapi.DNSRecord]{
			{Key: "name", Value: func(r cloudflareapi.DNSRecord) string { return r.Name }},
			{Key: "type", Value: func(r cloudflareapi.DNSRecord) string { return r.Type }},
			{Key: "content", Value: func(r cloudflareapi.DNSRecord) string { return r.Content }},
			{Key: "proxy", Value: func(r cloudflareapi.DNSRecord) string {
				if r.Proxied {
					return "proxied"
				}
				return "dns-only"
			}},
			{Key: "ttl", Value: ttlOf, Compare: func(a, b cloudflareapi.DNSRecord) int {
				ta, tb := a.TTL, b.TTL
				if ta <= 1 {
					ta = 0
				}
				if tb <= 1 {
					tb = 0
				}
				return ta - tb
			}},
		},
		Search: func(r cloudflareapi.DNSRecord) string {
			return lower(r.Type + " " + r.Name + " " + r.Content + " " + r.Comment)
		},
		Tiebreak: func(a, b cloudflareapi.DNSRecord) int {
			if a.Name != b.Name {
				if lower(a.Name) < lower(b.Name) {
					return -1
				}
				return 1
			}
			return 0
		},
	}
}

// tunnelRow is a route with whether its tunnel runs
type tunnelRow struct {
	database.Tunnel
	DaemonRunning bool `json:"daemonRunning"`
}

// routeSpec: the routes of one tunnel profile
func routeSpec() listquery.Spec[tunnelRow] {
	return listquery.Spec[tunnelRow]{
		Columns: []listquery.Column[tunnelRow]{
			{Key: "name", Value: func(r tunnelRow) string { return r.Name }},
			{Key: "hostname", Value: func(r tunnelRow) string { return r.CFHostname }},
			{Key: "target", Value: func(r tunnelRow) string { return r.TargetURL }},
			{Key: "status", Value: func(r tunnelRow) string { return r.Status }},
		},
		Search: func(r tunnelRow) string {
			return lower(r.Name + " " + r.CFHostname + " " + r.TargetURL + " " + r.Status)
		},
		Tiebreak: func(a, b tunnelRow) int { return int(a.ID - b.ID) },
	}
}
