package docsync

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func serve(t *testing.T, files map[string]string) *Client {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		body, ok := files[name]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	c := New()
	c.baseURL = server.URL + "/"
	c.http = server.Client()
	return c
}

func TestArticlesFetchAndCache(t *testing.T) {
	c := serve(t, map[string]string{
		"index.json": `{"articles":[
			{"slug":"memasang","title":"Memasang Reneo","excerpt":"Satu perintah","file":"memasang.md","updatedAt":"2026-10-15"},
			{"slug":"../etc","title":"bad","excerpt":"","file":"x.md","updatedAt":"2026-10-15"},
			{"slug":"ok","title":"bad file","excerpt":"","file":"../secret.md","updatedAt":"2026-10-15"},
			{"slug":"hilang","title":"Missing","excerpt":"","file":"hilang.md","updatedAt":"2026-10-15"}
		]}`,
		"memasang.md": "# Memasang\n\nJalankan installer.",
	})
	items, err := c.Articles(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Slug != "memasang" || !strings.Contains(items[0].Content, "installer") {
		t.Fatalf("unexpected items: %+v", items)
	}
	if items[0].UpdatedAt.Year() != 2026 {
		t.Fatalf("date not parsed: %v", items[0].UpdatedAt)
	}

	found, _ := c.Find(context.Background(), "memasang")
	if found == nil || found.Title != "Memasang Reneo" {
		t.Fatalf("Find failed: %+v", found)
	}
	if none, _ := c.Find(context.Background(), "tidak-ada"); none != nil {
		t.Fatal("unknown slug must not be found")
	}
}

func TestArticlesKeepsStaleListOnFailure(t *testing.T) {
	c := serve(t, map[string]string{
		"index.json": `{"articles":[{"slug":"a","title":"A","excerpt":"","file":"a.md","updatedAt":"2026-01-01"}]}`,
		"a.md":       "isi",
	})
	if _, err := c.Articles(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	c.baseURL = "http://127.0.0.1:1/" // unreachable
	items, err := c.Articles(context.Background(), true)
	if err == nil || len(items) != 1 {
		t.Fatalf("want stale list plus error, got %d items err=%v", len(items), err)
	}
}

func TestDisabled(t *testing.T) {
	t.Setenv("RENEO_DOCS_SYNC", "false")
	c := New()
	items, err := c.Articles(context.Background(), false)
	if err != nil || items != nil {
		t.Fatalf("disabled sync must return nothing: %v %v", items, err)
	}
}
