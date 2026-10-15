package httpserver

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Contributors shown on the public pages come from the repository itself (GitHub), not from
// a list kept in the code. The answer is cached; when GitHub cannot be reached the list is empty
// and the page links to the repository instead.

const contributorsTTL = 6 * time.Hour

type publicContributor struct {
	Login string `json:"login"`
	URL   string `json:"url"`
}

var (
	contributorsMu      sync.Mutex
	contributorsCache   []publicContributor
	contributorsFetched time.Time
)

func contributorsRepo() string {
	if v := strings.TrimSpace(os.Getenv("RENEO_UPDATE_REPO")); v != "" {
		return v
	}
	return "friskipradana/y-panel"
}

func fetchContributors(ctx context.Context) ([]publicContributor, error) {
	ctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/repos/"+contributorsRepo()+"/contributors?per_page=30", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "reneo-agent")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, context.DeadlineExceeded
	}
	var raw []struct {
		Login   string `json:"login"`
		HTMLURL string `json:"html_url"`
		Type    string `json:"type"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&raw); err != nil {
		return nil, err
	}
	out := make([]publicContributor, 0, len(raw))
	for _, c := range raw {
		lower := strings.ToLower(c.Login)
		// people only: bots and AI assistant accounts are not listed as contributors
		if c.Login == "" || c.Type != "User" || strings.HasSuffix(lower, "[bot]") || strings.Contains(lower, "claude") || strings.Contains(lower, "anthropic") {
			continue
		}
		out = append(out, publicContributor{Login: c.Login, URL: c.HTMLURL})
	}
	return out, nil
}

func (s *Server) handlePublicContributors(w http.ResponseWriter, r *http.Request) {
	contributorsMu.Lock()
	stale := time.Since(contributorsFetched) > contributorsTTL
	cached := contributorsCache
	contributorsMu.Unlock()

	if stale {
		if list, err := fetchContributors(r.Context()); err == nil {
			contributorsMu.Lock()
			contributorsCache, contributorsFetched = list, time.Now()
			contributorsMu.Unlock()
			cached = list
		} else {
			// retry later, but do not hammer GitHub on every page view
			contributorsMu.Lock()
			contributorsFetched = time.Now().Add(-contributorsTTL + 10*time.Minute)
			contributorsMu.Unlock()
		}
	}
	if cached == nil {
		cached = []publicContributor{}
	}
	w.Header().Set("Cache-Control", "public, max-age=3600")
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": cached, "repo": "https://github.com/" + contributorsRepo()})
}
