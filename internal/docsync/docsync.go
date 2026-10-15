// Package docsync keeps the official Reneo articles identical on every installation.
// They live in the project repository (docs/articles) and each panel reads them from
// GitHub, so a fresh install on another machine and another database shows the same
// documentation without anyone copying files around.
package docsync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	defaultRepo   = "friskipradana/y-panel"
	cacheTTL      = time.Hour
	maxArticles   = 60
	maxBodyBytes  = 200 << 10
	maxManifestSz = 64 << 10
)

var (
	slugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,118}$`)
	fileRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.md$`)
)

// Article is one official article.
type Article struct {
	Slug      string    `json:"slug"`
	Title     string    `json:"title"`
	Excerpt   string    `json:"excerpt"`
	Content   string    `json:"content"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type manifest struct {
	Articles []struct {
		Slug      string `json:"slug"`
		Title     string `json:"title"`
		Excerpt   string `json:"excerpt"`
		File      string `json:"file"`
		UpdatedAt string `json:"updatedAt"`
	} `json:"articles"`
}

// Client fetches and caches the official articles.
type Client struct {
	baseURL string
	http    *http.Client

	mu     sync.Mutex
	cached []Article
	at     time.Time
}

// New builds a client for RENEO_DOCS_REPO (default: the project repository).
func New() *Client {
	repo := strings.TrimSpace(os.Getenv("RENEO_DOCS_REPO"))
	if repo == "" {
		repo = defaultRepo
	}
	return &Client{
		baseURL: "https://raw.githubusercontent.com/" + repo + "/HEAD/docs/articles/",
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// Enabled reports whether syncing is allowed (RENEO_DOCS_SYNC=false turns it off).
func Enabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("RENEO_DOCS_SYNC"))) {
	case "0", "false", "no", "off":
		return false
	}
	return true
}

func (c *Client) get(ctx context.Context, name string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+name, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "reneo-agent-docs-sync")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: HTTP %d", name, resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, limit))
}

func (c *Client) fetch(ctx context.Context) ([]Article, error) {
	raw, err := c.get(ctx, "index.json", maxManifestSz)
	if err != nil {
		return nil, err
	}
	var m manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("index.json: %w", err)
	}
	var out []Article
	for _, entry := range m.Articles {
		if len(out) >= maxArticles {
			break
		}
		// the manifest comes over the network: only plain slugs and file names are followed
		if !slugRe.MatchString(entry.Slug) || !fileRe.MatchString(entry.File) || strings.TrimSpace(entry.Title) == "" {
			continue
		}
		body, err := c.get(ctx, entry.File, maxBodyBytes)
		if err != nil {
			continue
		}
		updated, _ := time.Parse("2006-01-02", entry.UpdatedAt)
		out = append(out, Article{
			Slug:      entry.Slug,
			Title:     strings.TrimSpace(entry.Title),
			Excerpt:   strings.TrimSpace(entry.Excerpt),
			Content:   string(body),
			UpdatedAt: updated,
		})
	}
	if len(out) == 0 {
		return nil, errors.New("no official articles available")
	}
	return out, nil
}

// Articles returns the cached list, refreshing it when older than an hour. When a
// refresh fails the previous list is kept and returned with the error.
func (c *Client) Articles(ctx context.Context, force bool) ([]Article, error) {
	if !Enabled() {
		return nil, nil
	}
	c.mu.Lock()
	cached, at := c.cached, c.at
	c.mu.Unlock()
	if cached != nil && !force && time.Since(at) < cacheTTL {
		return cached, nil
	}
	items, err := c.fetch(ctx)
	if err != nil {
		// remember the attempt so an offline server does not retry on every request
		c.mu.Lock()
		c.at = time.Now().Add(-cacheTTL + 5*time.Minute)
		c.mu.Unlock()
		return cached, err
	}
	c.mu.Lock()
	c.cached, c.at = items, time.Now()
	c.mu.Unlock()
	return items, nil
}

// Find returns one official article by slug.
func (c *Client) Find(ctx context.Context, slug string) (*Article, error) {
	items, err := c.Articles(ctx, false)
	for i := range items {
		if items[i].Slug == slug {
			return &items[i], nil
		}
	}
	return nil, err
}
