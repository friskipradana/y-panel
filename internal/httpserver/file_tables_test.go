package httpserver

import (
	"net/url"
	"testing"
	"time"
)

func TestFileTableFiltersByTypeAndOrdersBySize(t *testing.T) {
	now := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	files := []FileInfoNode{
		{Name: "docs", IsDir: true, Mode: "drwxr-xr-x", modTime: now.Add(-time.Hour)},
		{Name: "a.go", Size: 50, Mode: "-rw-r--r--", modTime: now.Add(-48 * time.Hour)},
		{Name: "b.go", Size: 5 << 20, Mode: "-rw-r--r--", modTime: now.Add(-40 * 24 * time.Hour)},
		{Name: "notes", Size: 10, Mode: "-rw-r--r--", modTime: now.Add(-2 * time.Hour)},
	}
	spec := fileSpec(now)
	res := tableResponse(files, spec, url.Values{"f.type": {".go"}, "sort": {"size"}, "order": {"desc"}})
	if res.Total != 2 || res.Items[0].Name != "b.go" {
		t.Fatalf("got %+v", res.Items)
	}
	if res.Facets["type"]["folder"] != 1 || res.Facets["type"]["file"] != 1 {
		t.Fatalf("the type column keeps offering the other types: %v", res.Facets["type"])
	}
	if res.Facets["modified"]["week"] != 1 || res.Facets["modified"]["year"] != 1 {
		t.Fatalf("modified buckets: %v", res.Facets["modified"])
	}
	byName := tableResponse(files, spec, url.Values{"sort": {"name"}, "order": {"asc"}})
	if !byName.Items[0].IsDir {
		t.Fatal("folders come first when ordering by name ascending")
	}
}
