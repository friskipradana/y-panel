package httpserver

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// speedtest.net, and with it the CBN speed test (CBN's page is an Ookla "Speedtest Custom" with CBN's
// own servers), run through Ookla's official command line client. Ookla does not publish the protocol
// and refuses scripts, so the client has to be installed on the server (`speedtest`), and its licence
// is the superadmin's to accept: it is for personal, non-commercial use unless Ookla agrees otherwise.

const speedOoklaPrefix = "ookla-"

// Servers of CBN on speedtest.net, taken from CBN's own speed test page
var ooklaFixedServers = []struct {
	ID       int
	Name     string
	Location string
	Host     string
}{
	{12807, "CBN", "Jakarta, Indonesia", "speedtest.cbn.id"},
	{59016, "CBN", "Singapore", "speedtest-sg.cbn.id"},
}

var (
	ooklaBinMu      sync.Mutex
	ooklaBinChecked time.Time
	ooklaBinPath    string
	ooklaBinKey     string

	ooklaNearestMu      sync.Mutex
	ooklaNearestFetched time.Time
	ooklaNearestList    []ooklaListed
	ooklaNearestDone    chan struct{}
)

// ooklaBinary finds Ookla's client: RENEO_SPEEDTEST_BIN, then the agent's own copy (private, in its
// state directory), then `speedtest` in PATH. The Python "speedtest-cli" has the same name but speaks
// something else, so each candidate's version text is checked and the first real one wins.
func ooklaBinary(private string) string {
	ooklaBinMu.Lock()
	defer ooklaBinMu.Unlock()
	if ooklaBinKey == private && time.Since(ooklaBinChecked) < time.Minute {
		return ooklaBinPath
	}
	ooklaBinChecked = time.Now()
	ooklaBinKey = private
	ooklaBinPath = ""
	var candidates []string
	if fromEnv := strings.TrimSpace(os.Getenv("RENEO_SPEEDTEST_BIN")); fromEnv != "" {
		candidates = append(candidates, fromEnv)
	}
	if private != "" {
		candidates = append(candidates, private)
	}
	if found, err := exec.LookPath("speedtest"); err == nil {
		candidates = append(candidates, found)
	}
	for _, candidate := range candidates {
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		version, err := exec.CommandContext(ctx, candidate, "--version").Output()
		cancel()
		if err == nil && isOoklaVersion(string(version)) {
			ooklaBinPath = candidate
			break
		}
	}
	return ooklaBinPath
}

// forgetOoklaBinary makes the next lookup look again (after the client was installed)
func forgetOoklaBinary() {
	ooklaBinMu.Lock()
	ooklaBinChecked = time.Time{}
	ooklaBinMu.Unlock()
}

func isOoklaVersion(text string) bool {
	return strings.Contains(strings.ToLower(text), "by ookla")
}

// parseOoklaID reads the id part of "ookla-auto" or "ookla-12807"; 0 means the nearest server
func parseOoklaID(id string) (int, bool) {
	rest := strings.TrimPrefix(id, speedOoklaPrefix)
	if rest == "auto" {
		return 0, true
	}
	if rest == "" || len(rest) > 9 {
		return 0, false
	}
	n, err := strconv.Atoi(rest)
	if err != nil || n <= 0 {
		return 0, false
	}
	return n, true
}

type ooklaListed struct {
	ID       int    `json:"id"`
	Host     string `json:"host"`
	Name     string `json:"name"`
	Location string `json:"location"`
	Country  string `json:"country"`
}

// ooklaNearest lists the servers around this server, as the client reports them. The list is cached
// ten minutes and refreshed in the background: the client takes several seconds, and the first
// caller waits only a little for it.
func ooklaNearest(ctx context.Context, bin string) []ooklaListed {
	ooklaNearestMu.Lock()
	stale := time.Since(ooklaNearestFetched) >= 10*time.Minute
	var done chan struct{}
	if stale && ooklaNearestDone == nil {
		done = make(chan struct{})
		ooklaNearestDone = done
		go func() {
			list := fetchOoklaNearest(bin)
			ooklaNearestMu.Lock()
			ooklaNearestList = list
			ooklaNearestFetched = time.Now()
			ooklaNearestDone = nil
			ooklaNearestMu.Unlock()
			close(done)
		}()
	} else if stale {
		done = ooklaNearestDone
	}
	ooklaNearestMu.Unlock()

	if done != nil && len(ooklaNearestList) == 0 {
		select {
		case <-done:
		case <-time.After(8 * time.Second):
		case <-ctx.Done():
		}
	}
	ooklaNearestMu.Lock()
	defer ooklaNearestMu.Unlock()
	return ooklaNearestList
}

func fetchOoklaNearest(bin string) []ooklaListed {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	raw, err := exec.CommandContext(ctx, bin, "--accept-license", "--accept-gdpr", "-L", "-f", "json").Output()
	if err != nil {
		return nil
	}
	var reply struct {
		Servers []ooklaListed `json:"servers"`
	}
	if json.Unmarshal(raw, &reply) != nil {
		return nil
	}
	return reply.Servers
}

// ooklaRun carries what the lines of the client's output add up to
type ooklaRun struct {
	out        *speedStream
	phase      string
	latency    float64
	jitter     float64
	serverName string
	serverHost string
	serverID   int
	// the client's own words when it logs an error line
	failure string
	result  *speedInternetResult
}

type ooklaLine struct {
	Type string `json:"type"`
	Ping *struct {
		Jitter   float64 `json:"jitter"`
		Latency  float64 `json:"latency"`
		Progress float64 `json:"progress"`
	} `json:"ping"`
	Download *ooklaDirection `json:"download"`
	Upload   *ooklaDirection `json:"upload"`
	Server   *struct {
		ID       int    `json:"id"`
		Host     string `json:"host"`
		Name     string `json:"name"`
		Location string `json:"location"`
		Country  string `json:"country"`
	} `json:"server"`
	Message string `json:"message"`
	Level   string `json:"level"`
}

type ooklaDirection struct {
	// bytes per second
	Bandwidth float64 `json:"bandwidth"`
	Progress  float64 `json:"progress"`
}

func ooklaMbps(bytesPerSecond float64) float64 { return round1(bytesPerSecond * 8 / 1e6) }

// consume folds one line of the client's JSON lines output into events for the browser
func (r *ooklaRun) consume(line []byte) {
	var l ooklaLine
	if err := json.Unmarshal(line, &l); err != nil {
		return
	}
	switch l.Type {
	case "log":
		if l.Level == "error" && l.Message != "" {
			r.failure = l.Message
		}
	case "testStart":
		if l.Server != nil {
			r.serverID, r.serverHost = l.Server.ID, l.Server.Host
			r.serverName = strings.Trim(l.Server.Name+", "+strings.Trim(l.Server.Location+", "+l.Server.Country, ", "), ", ")
		}
		r.phase = "ping"
		r.out.send(speedEvent{Type: "phase", Phase: "ping"})
	case "ping":
		if l.Ping != nil {
			r.latency, r.jitter = l.Ping.Latency, l.Ping.Jitter
			r.out.send(speedEvent{Type: "ping", LatencyMs: fptr(round1(l.Ping.Latency))})
		}
	case "download":
		if l.Download == nil {
			return
		}
		if r.phase != "download" {
			r.out.send(speedEvent{Type: "latency", LatencyMs: fptr(round1(r.latency)), JitterMs: fptr(round1(r.jitter))})
			r.phase = "download"
			r.out.send(speedEvent{Type: "phase", Phase: "download"})
		}
		r.out.send(speedEvent{Type: "download", Mbps: fptr(ooklaMbps(l.Download.Bandwidth)), Fraction: fptr(l.Download.Progress)})
	case "upload":
		if l.Upload == nil {
			return
		}
		if r.phase != "upload" {
			r.phase = "upload"
			r.out.send(speedEvent{Type: "phase", Phase: "upload"})
		}
		r.out.send(speedEvent{Type: "upload", Mbps: fptr(ooklaMbps(l.Upload.Bandwidth)), Fraction: fptr(l.Upload.Progress)})
	case "result":
		var final struct {
			Ping struct {
				Jitter  float64 `json:"jitter"`
				Latency float64 `json:"latency"`
			} `json:"ping"`
			Download ooklaDirection `json:"download"`
			Upload   ooklaDirection `json:"upload"`
		}
		if json.Unmarshal(line, &final) != nil {
			return
		}
		r.result = &speedInternetResult{
			DownloadMbps: ooklaMbps(final.Download.Bandwidth),
			UploadMbps:   ooklaMbps(final.Upload.Bandwidth),
			LatencyMs:    round1(final.Ping.Latency),
			JitterMs:     round1(final.Ping.Jitter),
			Server:       r.serverHost,
			ServerID:     speedOoklaPrefix + strconv.Itoa(r.serverID),
			ServerName:   r.serverName + " (Ookla)",
			CanUpload:    true,
		}
	}
}

// runOokla runs the client for one server (0: the nearest) and streams what it reports
func runOokla(ctx context.Context, out *speedStream, bin string, serverID int) (*speedInternetResult, error) {
	started := time.Now()
	args := []string{"--accept-license", "--accept-gdpr", "-f", "jsonl", "--progress-update-interval=250"}
	if serverID > 0 {
		args = append(args, "-s", strconv.Itoa(serverID))
	}
	cmd := exec.CommandContext(ctx, bin, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("cannot start the Ookla client: %w", err)
	}

	run := &ooklaRun{out: out}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 1<<20)
	for scanner.Scan() {
		run.consume(scanner.Bytes())
	}
	waitErr := cmd.Wait()
	if run.result == nil {
		message := run.failure
		if message == "" {
			message = lastLine(stderr.String())
		}
		if ctx.Err() != nil {
			message = "the test was stopped or took too long"
		}
		if message == "" && waitErr != nil {
			message = waitErr.Error()
		}
		if message == "" {
			message = "the Ookla client ended without a result"
		}
		return nil, errors.New(message)
	}
	run.result.DurationMs = time.Since(started).Milliseconds()
	run.result.At = time.Now().UnixMilli()
	return run.result, nil
}

// lastLine is the last non-empty line of the client's error output, where it says what went wrong
func lastLine(text string) string {
	lines := strings.Split(strings.TrimSpace(text), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if line := strings.TrimSpace(lines[i]); line != "" && !strings.HasPrefix(line, "===") {
			if len(line) > 300 {
				line = line[:300]
			}
			return line
		}
	}
	return ""
}
