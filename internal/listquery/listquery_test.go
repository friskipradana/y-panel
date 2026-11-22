package listquery

import (
	"net/url"
	"strings"
	"testing"
)

type row struct {
	ID    int
	Name  string
	State string
	Port  int
}

func spec() Spec[row] {
	return Spec[row]{
		Columns: []Column[row]{
			{Key: "name", Value: func(r row) string { return r.Name }},
			{Key: "state", Value: func(r row) string { return r.State }},
			{Key: "port", Value: func(r row) string { return string(rune('0' + r.Port%10)) }, Compare: func(a, b row) int { return a.Port - b.Port }},
		},
		Search:   func(r row) string { return r.Name + " " + r.State },
		Tiebreak: func(a, b row) int { return strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)) },
	}
}

func rows() []row {
	return []row{
		{1, "beta", "up", 12},
		{2, "Alpha", "up", 11},
		{3, "gamma", "down", 13},
		{4, "delta", "up", 14},
		{5, "Zeta", "down", 15},
	}
}

func names(items []row) string {
	out := make([]string, len(items))
	for i, r := range items {
		out[i] = r.Name
	}
	return strings.Join(out, ",")
}

func TestParseDropsWhatItDoesNotKnow(t *testing.T) {
	q := url.Values{"q": {"  web "}, "sort": {"state"}, "order": {"DESC"}, "f.state": {"up", "down"}, "f.evil": {"x"}, "f.name": {strings.Repeat("a", 201)}}
	opts := Parse(q, []string{"name", "state"})
	if opts.Query != "web" || opts.Sort != "state" || !opts.Desc {
		t.Fatalf("%+v", opts)
	}
	if len(opts.Filters["state"]) != 2 || opts.Filters["evil"] != nil || opts.Filters["name"] != nil {
		t.Fatalf("filters: %+v", opts.Filters)
	}
	if got := Parse(url.Values{"sort": {"password"}}, []string{"name"}); got.Sort != "" {
		t.Fatalf("an unknown column must not be sorted by: %+v", got)
	}
	many := url.Values{"f.name": make([]string, 200)}
	for i := range many["f.name"] {
		many["f.name"][i] = "v"
	}
	if got := Parse(many, []string{"name"}); len(got.Filters["name"]) != maxFilterValues {
		t.Fatalf("values per column are capped: %d", len(got.Filters["name"]))
	}
}

func TestApplyFiltersLikeASpreadsheet(t *testing.T) {
	res := Apply(rows(), spec(), Options{Filters: map[string][]string{"state": {"up"}}})
	if names(res.Items) != "beta,Alpha,delta" || res.Total != 3 || res.All != 5 {
		t.Fatalf("%s total=%d all=%d", names(res.Items), res.Total, res.All)
	}
	// the choices of the filtered column still count the rows the OTHER filters leave, not its own
	if res.Facets["state"]["up"] != 3 || res.Facets["state"]["down"] != 2 {
		t.Fatalf("state facet: %+v", res.Facets["state"])
	}
	// another column is counted over what the state filter left
	if res.Facets["name"]["gamma"] != 0 && res.Facets["name"]["gamma"] != 1 {
		t.Fatalf("name facet: %+v", res.Facets["name"])
	}
	if _, offered := res.Facets["name"]["gamma"]; offered {
		t.Fatalf("gamma is down: it is not on offer while only up is ticked: %+v", res.Facets["name"])
	}

	res = Apply(rows(), spec(), Options{Filters: map[string][]string{"state": {"up", "down"}, "name": {"Alpha", "Zeta"}}})
	if names(res.Items) != "Alpha,Zeta" {
		t.Fatalf("several values per column, several columns together: %s", names(res.Items))
	}
}

func TestApplySearchAndSort(t *testing.T) {
	res := Apply(rows(), spec(), Options{Query: "DOWN"})
	if names(res.Items) != "gamma,Zeta" || res.All != 5 {
		t.Fatalf("search is case-insensitive: %s", names(res.Items))
	}
	// the counts are over what the search left
	if res.Facets["state"]["down"] != 2 || res.Facets["state"]["up"] != 0 {
		if _, has := res.Facets["state"]["up"]; has {
			t.Fatalf("facets over the search: %+v", res.Facets["state"])
		}
	}
	res = Apply(rows(), spec(), Options{Sort: "name"})
	if names(res.Items) != "Alpha,beta,delta,gamma,Zeta" {
		t.Fatalf("names compared without case: %s", names(res.Items))
	}
	res = Apply(rows(), spec(), Options{Sort: "port", Desc: true})
	if names(res.Items) != "Zeta,delta,gamma,beta,Alpha" {
		t.Fatalf("a column's own comparison: %s", names(res.Items))
	}
	res = Apply(rows(), spec(), Options{Sort: "state"})
	if names(res.Items) != "gamma,Zeta,Alpha,beta,delta" {
		t.Fatalf("ties by the tiebreak: %s", names(res.Items))
	}
	res = Apply(rows(), spec(), Options{Sort: "state", Desc: true})
	if names(res.Items) != "Alpha,beta,delta,gamma,Zeta" {
		t.Fatalf("descending keeps the tiebreak ascending: %s", names(res.Items))
	}
	if got := Apply(rows(), spec(), Options{}); names(got.Items) != "beta,Alpha,gamma,delta,Zeta" {
		t.Fatalf("no sort keeps the order the rows came in: %s", names(got.Items))
	}
}

func TestTickedValueStaysOnOffer(t *testing.T) {
	res := Apply(rows(), spec(), Options{Filters: map[string][]string{"state": {"gone"}}})
	if res.Total != 0 {
		t.Fatalf("nothing is 'gone': %d", res.Total)
	}
	if _, ok := res.Facets["state"]["gone"]; !ok {
		t.Fatal("a ticked value must stay in the list so it can be unticked")
	}
}

func TestFacetOfAHugeColumnIsTrimmed(t *testing.T) {
	big := make([]row, 0, 1200)
	for i := 0; i < 1200; i++ {
		big = append(big, row{ID: i, Name: "n" + strings.Repeat("x", i%7) + string(rune('a'+i%26)) + strings.Repeat("y", i/26), State: "up"})
	}
	res := Apply(big, spec(), Options{})
	if len(res.Facets["name"]) > maxFacetValues {
		t.Fatalf("a column offers at most %d values, got %d", maxFacetValues, len(res.Facets["name"]))
	}
}
