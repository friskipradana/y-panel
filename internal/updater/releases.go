package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	releasesTTL      = time.Hour
	releasesPerPage  = 30
	maxReleaseNotes  = 8000
	releaseSummaryLn = 220
)

// ReleaseNote is one GitHub release as the changelog shows it.
type ReleaseNote struct {
	Version     string    `json:"version"`
	Title       string    `json:"title"`
	Summary     string    `json:"summary"`
	Body        string    `json:"body"`
	URL         string    `json:"url"`
	PublishedAt time.Time `json:"publishedAt"`
	Prerelease  bool      `json:"prerelease"`
}

type releasesCache struct {
	items []ReleaseNote
	at    time.Time
}

func (c *Checker) listURL() string {
	if c.releasesURL != "" {
		return c.releasesURL
	}
	return fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=%d", c.repo, releasesPerPage)
}

// Releases returns the published GitHub releases, newest first. The list is cached
// for an hour; force bypasses the cache. On a failed refresh the previous list is
// returned together with the error so the window can still show something.
func (c *Checker) Releases(ctx context.Context, force bool) ([]ReleaseNote, error) {
	c.mu.Lock()
	cached := c.releases
	c.mu.Unlock()
	if cached != nil && !force && time.Since(cached.at) < releasesTTL {
		return cached.items, nil
	}

	items, err := c.fetchReleases(ctx)
	if err != nil {
		if cached != nil {
			return cached.items, err
		}
		return nil, err
	}
	c.mu.Lock()
	c.releases = &releasesCache{items: items, at: time.Now()}
	c.mu.Unlock()
	return items, nil
}

func (c *Checker) fetchReleases(ctx context.Context) ([]ReleaseNote, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.listURL(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "reneo-agent-changelog")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github returned HTTP %d", resp.StatusCode)
	}
	var raw []release
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	notes := make([]ReleaseNote, 0, len(raw))
	for _, rel := range raw {
		if rel.Draft || strings.TrimSpace(rel.TagName) == "" {
			continue
		}
		body := strings.TrimSpace(rel.Body)
		if len(body) > maxReleaseNotes {
			body = body[:maxReleaseNotes] + "\n\n..."
		}
		title := strings.TrimSpace(rel.Name)
		if title == "" {
			title = rel.TagName
		}
		notes = append(notes, ReleaseNote{
			Version:     normalize(rel.TagName),
			Title:       title,
			Summary:     summarize(body),
			Body:        body,
			URL:         rel.HTMLURL,
			PublishedAt: rel.PublishedAt,
			Prerelease:  rel.Prerelease,
		})
	}
	return notes, nil
}

// summarize takes the first meaningful line of a release body as a one line teaser.
func summarize(body string) string {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(line), "#>*- "))
		if line == "" {
			continue
		}
		if len(line) > releaseSummaryLn {
			line = line[:releaseSummaryLn] + "..."
		}
		return line
	}
	return ""
}
