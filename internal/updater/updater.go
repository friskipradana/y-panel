// Package updater checks GitHub Releases for a newer Reneo and can start the
// installer for it in a way that survives the agent restart it causes.
package updater

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultRepo   = "friskipradana/y-panel"
	cacheTTL      = 6 * time.Hour
	maxNotesBytes = 4000
	stateFile     = "update-state.json"
	logFile       = "update.log"
	updateUnit    = "reneo-update"
	// First release that ships reneo-installer.run (older ones only have ypanel-installer.run)
	firstReneoAsset = "3.4.0"
)

var versionRe = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)$`)

// Info is what the API returns about the installed and the latest version.
type Info struct {
	Enabled     bool      `json:"enabled"`
	Current     string    `json:"current"`
	Latest      string    `json:"latest"`
	Available   bool      `json:"available"`
	ReleaseURL  string    `json:"releaseUrl,omitempty"`
	Notes       string    `json:"notes,omitempty"`
	PublishedAt time.Time `json:"publishedAt,omitempty"`
	CheckedAt   time.Time `json:"checkedAt,omitempty"`
	CanApply    bool      `json:"canApply"`
	Error       string    `json:"error,omitempty"`
}

// State describes the last update run started from the panel.
type State struct {
	State     string    `json:"state"` // idle | running | done | failed
	From      string    `json:"from,omitempty"`
	To        string    `json:"to,omitempty"`
	StartedAt time.Time `json:"startedAt,omitempty"`
	Log       []string  `json:"log,omitempty"`
}

type release struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	HTMLURL     string    `json:"html_url"`
	Body        string    `json:"body"`
	PublishedAt time.Time `json:"published_at"`
	Prerelease  bool      `json:"prerelease"`
	Draft       bool      `json:"draft"`
}

// Checker caches the latest release lookup.
type Checker struct {
	repo   string
	client *http.Client
	apiURL string

	mu     sync.Mutex
	cached *release
	at     time.Time
	err    string
}

func New() *Checker {
	repo := strings.TrimSpace(os.Getenv("RENEO_UPDATE_REPO"))
	if repo == "" {
		repo = defaultRepo
	}
	return &Checker{
		repo:   repo,
		client: &http.Client{Timeout: 10 * time.Second},
		apiURL: "https://api.github.com/repos/" + repo + "/releases/latest",
	}
}

// Enabled reports whether update checks are allowed (RENEO_UPDATE_CHECK=false turns them off).
func Enabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("RENEO_UPDATE_CHECK"))) {
	case "0", "false", "no", "off":
		return false
	}
	return true
}

// ParseVersion returns major, minor, patch of "v1.2.3" or "1.2.3".
func ParseVersion(v string) ([3]int, bool) {
	m := versionRe.FindStringSubmatch(strings.TrimSpace(v))
	if m == nil {
		return [3]int{}, false
	}
	var out [3]int
	for i := 0; i < 3; i++ {
		n, err := strconv.Atoi(m[i+1])
		if err != nil {
			return out, false
		}
		out[i] = n
	}
	return out, true
}

// Compare returns -1, 0 or 1; unparsable versions compare as equal.
func Compare(a, b string) int {
	va, okA := ParseVersion(a)
	vb, okB := ParseVersion(b)
	if !okA || !okB {
		return 0
	}
	for i := 0; i < 3; i++ {
		if va[i] < vb[i] {
			return -1
		}
		if va[i] > vb[i] {
			return 1
		}
	}
	return 0
}

func normalize(v string) string {
	return strings.TrimPrefix(strings.TrimSpace(v), "v")
}

func canApply() bool {
	if _, err := exec.LookPath("systemd-run"); err != nil {
		return false
	}
	return os.Geteuid() == 0
}

func (c *Checker) fetch(ctx context.Context) (*release, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "reneo-agent-update-check")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github returned HTTP %d", resp.StatusCode)
	}
	var rel release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}
	if rel.Draft || rel.Prerelease || rel.TagName == "" {
		return nil, errors.New("no stable release found")
	}
	return &rel, nil
}

// Check returns the update status. force bypasses the six hour cache.
func (c *Checker) Check(ctx context.Context, current string, force bool) Info {
	current = normalize(current)
	info := Info{Enabled: Enabled(), Current: current, CanApply: canApply()}
	if !info.Enabled {
		return info
	}

	c.mu.Lock()
	stale := c.cached == nil || time.Since(c.at) > cacheTTL || force
	c.mu.Unlock()

	if stale {
		rel, err := c.fetch(ctx)
		c.mu.Lock()
		c.at = time.Now()
		if err != nil {
			c.err = err.Error()
		} else {
			c.cached, c.err = rel, ""
		}
		c.mu.Unlock()
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	info.CheckedAt = c.at
	info.Error = c.err
	if c.cached != nil {
		info.Latest = normalize(c.cached.TagName)
		info.ReleaseURL = c.cached.HTMLURL
		info.PublishedAt = c.cached.PublishedAt
		notes := c.cached.Body
		if len(notes) > maxNotesBytes {
			notes = notes[:maxNotesBytes] + "..."
		}
		info.Notes = notes
		info.Available = Compare(info.Latest, current) > 0
	}
	return info
}

// InstallerURL is the release asset to run for a version.
func (c *Checker) InstallerURL(version string) (url, checksumURL string) {
	tag := "v" + normalize(version)
	asset := "reneo-installer.run"
	if Compare(version, firstReneoAsset) < 0 {
		asset = "ypanel-installer.run"
	}
	base := "https://github.com/" + c.repo + "/releases/download/" + tag + "/"
	return base + asset, base + "reneo-installer.run.sha256"
}

// updateScript downloads, verifies and runs the installer. URLs arrive as $1 and $2,
// never interpolated into the script text.
const updateScript = `set -euo pipefail
f="$(mktemp /tmp/reneo-update.XXXXXX.run)"
trap 'rm -f "$f" "$f.sha256"' EXIT
echo "[update] $(date -u +%FT%TZ) downloading $1"
curl -fsSL --retry 3 --connect-timeout 15 "$1" -o "$f"
if curl -fsSL --connect-timeout 15 "$2" -o "$f.sha256" 2>/dev/null; then
  want="$(cut -d' ' -f1 "$f.sha256")"
  have="$(sha256sum "$f" | cut -d' ' -f1)"
  if [ "$want" != "$have" ]; then echo "[update] checksum mismatch, aborting" >&2; exit 1; fi
  echo "[update] checksum ok"
else
  echo "[update] no checksum published for this release, continuing"
fi
bash "$f" --yes --no-color
echo "[update] finished"
`

// BuildCommand returns the systemd-run invocation that runs the update outside the
// agent's own cgroup, so restarting reneo.service does not kill the installer.
func (c *Checker) BuildCommand(version, stateDir string) (name string, args []string, err error) {
	if _, ok := ParseVersion(version); !ok {
		return "", nil, fmt.Errorf("invalid version %q", version)
	}
	url, sum := c.InstallerURL(version)
	log := filepath.Join(stateDir, logFile)
	args = []string{
		"--unit=" + updateUnit,
		"--description=Reneo update to v" + normalize(version),
		"--collect",
		"--property=StandardOutput=append:" + log,
		"--property=StandardError=append:" + log,
		"/bin/bash", "-c", updateScript, "reneo-update", url, sum,
	}
	return "systemd-run", args, nil
}

// Apply starts the update. It returns immediately; progress is read with ReadState.
func (c *Checker) Apply(ctx context.Context, current, target, stateDir string) (State, error) {
	current, target = normalize(current), normalize(target)
	if !Enabled() {
		return State{}, errors.New("update checks are disabled (RENEO_UPDATE_CHECK=false)")
	}
	if !canApply() {
		return State{}, errors.New("this host cannot apply updates from the panel (needs systemd-run and root); run `sudo reneo update` in a terminal")
	}
	if target == "" {
		info := c.Check(ctx, current, true)
		if info.Latest == "" {
			return State{}, fmt.Errorf("latest version unknown: %s", info.Error)
		}
		target = info.Latest
	}
	if _, ok := ParseVersion(target); !ok {
		return State{}, fmt.Errorf("invalid version %q", target)
	}
	if Compare(target, current) <= 0 {
		return State{}, fmt.Errorf("v%s is not newer than the installed v%s", target, current)
	}
	if prev := ReadState(stateDir); prev.State == "running" && time.Since(prev.StartedAt) < 30*time.Minute {
		return prev, errors.New("an update is already running")
	}

	name, args, err := c.BuildCommand(target, stateDir)
	if err != nil {
		return State{}, err
	}
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		return State{}, err
	}
	_ = os.WriteFile(filepath.Join(stateDir, logFile), nil, 0o600)

	st := State{State: "running", From: current, To: target, StartedAt: time.Now().UTC()}
	if err := writeState(stateDir, st); err != nil {
		return State{}, err
	}
	// Reset a leftover failed unit of an earlier attempt, ignoring errors
	_ = exec.Command("systemctl", "reset-failed", updateUnit+".service").Run()

	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	if err != nil {
		st.State = "failed"
		_ = writeState(stateDir, st)
		return st, fmt.Errorf("start update: %v: %s", err, strings.TrimSpace(string(out)))
	}
	return st, nil
}

func writeState(stateDir string, st State) error {
	st.Log = nil
	b, err := json.Marshal(st)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(stateDir, stateFile), b, 0o600)
}

// ReadState returns the last update run, with the tail of its log. A "running" state
// whose target is already the installed version is reported as done.
func ReadState(stateDir string) State {
	st := State{State: "idle"}
	if b, err := os.ReadFile(filepath.Join(stateDir, stateFile)); err == nil {
		_ = json.Unmarshal(b, &st)
	}
	if st.State == "" {
		st.State = "idle"
	}
	if b, err := os.ReadFile(filepath.Join(stateDir, logFile)); err == nil {
		lines := strings.Split(strings.TrimRight(string(b), "\n"), "\n")
		if len(lines) > 40 {
			lines = lines[len(lines)-40:]
		}
		if len(lines) == 1 && lines[0] == "" {
			lines = nil
		}
		st.Log = lines
	}
	return st
}

// Settle marks a running update as done or failed based on the installed version.
func Settle(stateDir, current string) State {
	st := ReadState(stateDir)
	if st.State != "running" {
		return st
	}
	switch {
	case Compare(current, st.To) >= 0:
		st.State = "done"
	case time.Since(st.StartedAt) > 30*time.Minute:
		st.State = "failed"
	default:
		return st
	}
	_ = writeState(stateDir, st)
	return st
}
