package httpserver

import (
	"net/url"
	"testing"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
)

func TestDNSTableFiltersByProxyAndOrdersByTTL(t *testing.T) {
	records := []cloudflareapi.DNSRecord{
		{ID: "1", Type: "A", Name: "a.example.com", Content: "1.1.1.1", Proxied: true, TTL: 1},
		{ID: "2", Type: "CNAME", Name: "b.example.com", Content: "a.example.com", TTL: 300},
		{ID: "3", Type: "A", Name: "c.example.com", Content: "2.2.2.2", TTL: 60},
	}
	res := tableResponse(records, dnsSpec(), url.Values{"f.proxy": {"dns-only"}, "sort": {"ttl"}, "order": {"asc"}})
	if res.Total != 2 || res.Items[0].ID != "3" || res.Items[1].ID != "2" {
		t.Fatalf("got %+v", res.Items)
	}
	if res.Facets["proxy"]["proxied"] != 1 {
		t.Fatalf("the proxy column should still offer the proxied value: %v", res.Facets["proxy"])
	}
	if res.Facets["type"]["A"] != 1 {
		t.Fatalf("type facet should count the rows the proxy filter leaves: %v", res.Facets["type"])
	}
}
