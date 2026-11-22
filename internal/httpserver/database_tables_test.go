package httpserver

import (
	"net/url"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestDatabaseTableFiltersByEngineAndOrdersByPort(t *testing.T) {
	rows := []managedDatabaseView{
		{ManagedDatabase: database.ManagedDatabase{ID: 1, Name: "shop", HostPort: 20010}, EngineLabel: "MySQL", State: "running"},
		{ManagedDatabase: database.ManagedDatabase{ID: 2, Name: "blog", HostPort: 20002}, EngineLabel: "PostgreSQL", State: "exited"},
		{ManagedDatabase: database.ManagedDatabase{ID: 3, Name: "cache", HostPort: 20003}, EngineLabel: "Redis", State: "running"},
	}
	res := tableResponse(rows, databaseSpec(), url.Values{"f.state": {"running"}, "sort": {"port"}, "order": {"asc"}})
	if res.Total != 2 || res.Items[0].Name != "cache" || res.Items[1].Name != "shop" {
		t.Fatalf("got %+v", res.Items)
	}
	if res.Facets["state"]["exited"] != 1 {
		t.Fatalf("the state column keeps offering the other states: %v", res.Facets["state"])
	}
}
