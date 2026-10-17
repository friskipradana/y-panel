package httpserver

import (
	"net/url"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
)

func listItem(id int64, name, kind, status string, port int, running, drift bool, age time.Duration) projectWithRuntime {
	return projectWithRuntime{
		Project: database.Project{ID: id, Name: name, ProjectType: kind, Status: status, AssignedPort: port, CreatedAt: time.Unix(1_700_000_000, 0).Add(age)},
		Running: running,
		Runtime: projectRuntimeState{Known: true, Running: running, Drift: drift},
	}
}

func sample() []projectWithRuntime {
	return []projectWithRuntime{
		listItem(1, "beta", "nodejs", "active", 10002, true, false, 2*time.Hour),
		listItem(2, "Alpha", "static", "active", 10001, true, false, 3*time.Hour),
		listItem(3, "gamma", "static", "stopped", 10003, false, false, time.Hour),
		listItem(4, "delta", "python", "active", 10004, false, true, 4*time.Hour),
		listItem(5, "epsilon", "php", "degraded", 10005, true, false, 5*time.Hour),
	}
}

func projectNames(items []projectWithRuntime) string {
	out := ""
	for i, p := range items {
		if i > 0 {
			out += ","
		}
		out += p.Name
	}
	return out
}

func TestProjectStateOf(t *testing.T) {
	cases := map[string]projectWithRuntime{
		"drift":    listItem(1, "a", "static", "active", 1, false, true, 0),
		"degraded": listItem(1, "a", "static", "degraded", 1, true, false, 0),
		"running":  listItem(1, "a", "static", "active", 1, true, false, 0),
		"stopped":  listItem(1, "a", "static", "stopped", 1, false, false, 0),
		"error":    listItem(1, "a", "static", "error", 1, false, false, 0),
	}
	for want, p := range cases {
		if got := projectStateOf(p); got != want {
			t.Errorf("want %s, got %s", want, got)
		}
	}
}

func TestProjectTableColumns(t *testing.T) {
	spec := projectSpec()
	res := listquery.Apply(sample(), spec, listquery.Options{Filters: map[string][]string{"state": {"drift", "degraded"}}, Sort: "name"})
	if projectNames(res.Items) != "delta,epsilon" {
		t.Fatalf("two states ticked together: %s", projectNames(res.Items))
	}
	if res.Facets["state"]["running"] != 2 || res.Facets["state"]["stopped"] != 1 || res.Facets["type"]["static"] != 0 {
		// type counts follow the state filter: the two static projects are not drift or degraded
		t.Fatalf("facets: %+v", res.Facets)
	}
	res = listquery.Apply(sample(), spec, listquery.Options{Sort: "state"})
	if projectNames(res.Items) != "epsilon,delta,Alpha,beta,gamma" {
		t.Fatalf("state rank, ties by name: %s", projectNames(res.Items))
	}
	res = listquery.Apply(sample(), spec, listquery.Options{Sort: "port", Desc: true})
	if projectNames(res.Items) != "epsilon,delta,gamma,beta,Alpha" {
		t.Fatalf("port is compared as a number: %s", projectNames(res.Items))
	}
	res = listquery.Apply(sample(), spec, listquery.Options{Query: "PYTHON"})
	if projectNames(res.Items) != "delta" {
		t.Fatalf("the search looks in the type too: %s", projectNames(res.Items))
	}
}

func TestProjectTableKnowsItsColumns(t *testing.T) {
	spec := projectSpec()
	opts := listquery.Parse(url.Values{"sort": {"state"}, "f.type": {"static"}, "f.password": {"x"}}, spec.Keys())
	if opts.Sort != "state" || len(opts.Filters["type"]) != 1 || opts.Filters["password"] != nil {
		t.Fatalf("%+v", opts)
	}
}
