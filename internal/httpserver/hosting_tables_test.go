package httpserver

import (
	"net/url"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestHostingTablesOrderAndNarrowByColumn(t *testing.T) {
	now := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)
	orders := []database.HostingOrder{
		{ID: 1, Username: "ani", PlanName: "Starter", Kind: "new", Status: "paid", AmountTotal: 25100, CreatedAt: now.Add(-48 * time.Hour)},
		{ID: 2, Username: "budi", PlanName: "Pro", Kind: "new", Status: "pending", AmountTotal: 450300, VoucherCode: "HEMAT10", CreatedAt: now.Add(-time.Hour)},
		{ID: 3, Username: "citra", PlanName: "Pro", Kind: "renew", Status: "pending", AmountTotal: 75200, CreatedAt: now},
	}
	// the total is ordered as a number, not as text ("450300" would come before "75200" as text)
	res := tableResponse(orders, orderSpec(), url.Values{"sort": {"total"}, "order": {"desc"}})
	if res.Items[0].ID != 2 || res.Items[2].ID != 1 {
		t.Fatalf("by total: %+v", res.Items)
	}
	// a column narrows to some of its values, and the others keep counting what is left
	res = tableResponse(orders, orderSpec(), url.Values{"f.status": {"pending"}})
	if res.Total != 2 || res.All != 3 {
		t.Fatalf("pending only: %d of %d", res.Total, res.All)
	}
	if res.Facets["plan"]["Pro"] != 2 || res.Facets["plan"]["Starter"] != 0 {
		t.Fatalf("plan facets over the pending rows: %v", res.Facets["plan"])
	}
	if res = tableResponse(orders, orderSpec(), url.Values{"q": {"hemat10"}}); res.Total != 1 || res.Items[0].Username != "budi" {
		t.Fatalf("search finds the voucher: %+v", res.Items)
	}
	// without an order the rows keep the order the list came in (the database gives the newest first)
	if res = tableResponse(orders, orderSpec(), url.Values{}); res.Items[0].ID != 1 || res.Items[2].ID != 3 {
		t.Fatalf("unchanged: %+v", res.Items)
	}
}

func TestVoucherStateAndTable(t *testing.T) {
	now := time.Now()
	past, future := now.Add(-time.Hour), now.Add(time.Hour)
	cases := []struct {
		v    database.HostingVoucher
		want string
	}{
		{database.HostingVoucher{Enabled: true}, "active"},
		{database.HostingVoucher{Enabled: false}, "off"},
		{database.HostingVoucher{Enabled: true, ValidFrom: &future}, "notStarted"},
		{database.HostingVoucher{Enabled: true, ValidUntil: &past}, "expired"},
		{database.HostingVoucher{Enabled: true, MaxUses: 2, Used: 2}, "usedUp"},
		{database.HostingVoucher{Enabled: true, MaxUses: 0, Used: 99}, "active"},
	}
	for _, c := range cases {
		if got := voucherState(c.v, now); got != c.want {
			t.Errorf("%+v: %s, want %s", c.v, got, c.want)
		}
	}
	vouchers := []database.HostingVoucher{{ID: 1, Code: "A", Enabled: true}, {ID: 2, Code: "B", Enabled: false}}
	res := tableResponse(vouchers, voucherSpec(), url.Values{"f.state": {"off"}})
	if res.Total != 1 || res.Items[0].Code != "B" {
		t.Fatalf("by state: %+v", res.Items)
	}
}
