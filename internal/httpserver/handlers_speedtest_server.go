package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// The server's own internet speed, streamed as it is measured. One JSON object per line:
//
//	{"type":"phase","phase":"ping"}
//	{"type":"ping","latencyMs":9.4}                     one per sample
//	{"type":"latency","latencyMs":9.1,"jitterMs":0.8}   final latency figures
//	{"type":"download","mbps":412.6,"fraction":0.37}    about four per second
//	{"type":"upload","mbps":188.2,"fraction":0.5}
//	{"type":"done","result":{...}}                      or {"type":"error","error":"..."}

const speedTick = 250 * time.Millisecond

type speedInternetResult struct {
	DownloadMbps float64 `json:"downloadMbps"`
	UploadMbps   float64 `json:"uploadMbps"`
	LatencyMs    float64 `json:"latencyMs"`
	JitterMs     float64 `json:"jitterMs"`
	Server       string  `json:"server"`
	ServerID     string  `json:"serverId"`
	ServerName   string  `json:"serverName"`
	CanUpload    bool    `json:"canUpload"`
	DurationMs   int64   `json:"durationMs"`
	At           int64   `json:"at"`
	// DownloadServer is where the download was measured when it is not Server
	DownloadServer string `json:"downloadServer,omitempty"`
	// Notes explain a figure that is missing or measured elsewhere (host and HTTP status)
	Notes []string `json:"notes,omitempty"`
}

type speedEvent struct {
	Type      string               `json:"type"`
	Phase     string               `json:"phase,omitempty"`
	Mbps      *float64             `json:"mbps,omitempty"`
	Fraction  *float64             `json:"fraction,omitempty"`
	LatencyMs *float64             `json:"latencyMs,omitempty"`
	JitterMs  *float64             `json:"jitterMs,omitempty"`
	Result    *speedInternetResult `json:"result,omitempty"`
	Error     string               `json:"error,omitempty"`
}

// speedStream writes events and flushes each one so proxies and the browser see them at once
type speedStream struct {
	mu sync.Mutex
	w  http.ResponseWriter
	f  http.Flusher
}

func (st *speedStream) send(ev speedEvent) {
	st.mu.Lock()
	defer st.mu.Unlock()
	_ = json.NewEncoder(st.w).Encode(ev)
	if st.f != nil {
		st.f.Flush()
	}
}

func fptr(v float64) *float64 { return &v }

// Several speed hosts (Hetzner, and Cloudflare for some networks) refuse Go's default
// User-Agent and close the connection, so every request carries a browser style one
const speedUserAgent = "Mozilla/5.0 (compatible; Reneo-speedtest)"

type speedAgentTransport struct{ base http.RoundTripper }

func (t speedAgentTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.Header.Get("User-Agent") == "" {
		req = req.Clone(req.Context())
		req.Header.Set("User-Agent", speedUserAgent)
	}
	return t.base.RoundTrip(req)
}

// The zero http.Transport has no dial or handshake timeout and ignores HTTP(S)_PROXY, so a blackholed
// address (often IPv6) or a proxy-only network stalled a stream until the test time was over
func newSpeedClient() *http.Client {
	dialer := &net.Dialer{Timeout: 6 * time.Second, KeepAlive: 15 * time.Second, FallbackDelay: 250 * time.Millisecond}
	base := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   8 * time.Second,
		ResponseHeaderTimeout: 12 * time.Second,
		DisableCompression:    true,
		MaxIdleConnsPerHost:   speedStreams * 2,
	}
	return &http.Client{Transport: speedAgentTransport{base: base}}
}

func (s *Server) handleSpeedtestServer(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("server"))
	if engine := speedEngineOf(id); engine != engineHTTP {
		s.handleSpeedtestEngine(w, r, id, engine)
		return
	}
	candidates, ok := resolveSpeedServers(id)
	if !ok {
		s.writeError(w, http.StatusBadRequest, errors.New("unknown speed test server"))
		return
	}
	if !speedInternetMu.TryLock() {
		s.writeError(w, http.StatusConflict, errors.New("a speed test is already running on this server"))
		return
	}
	defer speedInternetMu.Unlock()

	out := newSpeedStream(w)

	started := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	client := newSpeedClient()
	defer client.CloseIdleConnections()

	// the first candidate that answers is the peer for latency and upload
	out.send(speedEvent{Type: "phase", Phase: "ping"})
	var notes []string
	var peer *speedServer
	var latency, jitter float64
	for i := range candidates {
		candidate := candidates[i]
		l, j, err := measureSpeedLatency(ctx, client, candidate, func(ms float64) {
			out.send(speedEvent{Type: "ping", LatencyMs: fptr(ms)})
		})
		if err != nil {
			notes = append(notes, fmt.Sprintf("latency to %s: %v", candidate.Host, err))
			continue
		}
		peer, latency, jitter = &candidate, l, j
		break
	}
	if peer == nil {
		out.send(speedEvent{Type: "error", Error: "cannot reach the speed test server from this server: " + strings.Join(notes, "; ")})
		return
	}
	if len(candidates) > 1 && candidates[0].ID != peer.ID {
		notes = append(notes, fmt.Sprintf("%s did not answer, using %s", candidates[0].Host, peer.Host))
	}
	out.send(speedEvent{Type: "latency", LatencyMs: fptr(latency), JitterMs: fptr(jitter)})

	// downloads: the peer first, the other candidates (auto only) when it refuses
	out.send(speedEvent{Type: "phase", Phase: "download"})
	sources := []speedSource{{name: peer.Host, url: peer.down}}
	for _, candidate := range candidates {
		if candidate.ID != peer.ID {
			sources = append(sources, speedSource{name: candidate.Host, url: candidate.down})
		}
	}
	var source *speedSource
	down := 0.0
	for remaining := sources; len(remaining) > 0 && down == 0; {
		picked, failures := pickSpeedSource(ctx, client, remaining)
		notes = append(notes, failures...)
		if picked == nil {
			break
		}
		source = picked
		var note string
		down, note = measureSpeedDownload(ctx, client, *picked, func(mbps, fraction float64) {
			out.send(speedEvent{Type: "download", Mbps: fptr(round1(mbps)), Fraction: fptr(fraction)})
		})
		if note != "" {
			notes = append(notes, note)
		}
		// whatever happened, the next attempt starts after the source that was just used
		next := remaining[:0:0]
		seen := false
		for _, candidate := range remaining {
			if seen {
				next = append(next, candidate)
			}
			if candidate.name == picked.name {
				seen = true
			}
		}
		remaining = next
	}

	up := 0.0
	if peer.canUpload() {
		out.send(speedEvent{Type: "phase", Phase: "upload"})
		var upNote string
		up, upNote = measureSpeedUpload(ctx, client, *peer, func(mbps, fraction float64) {
			out.send(speedEvent{Type: "upload", Mbps: fptr(round1(mbps)), Fraction: fptr(fraction)})
		})
		if upNote != "" {
			notes = append(notes, upNote)
		}
	}
	if ctx.Err() != nil && r.Context().Err() != nil {
		return
	}
	if down == 0 && up == 0 {
		out.send(speedEvent{Type: "error", Error: "no data moved to or from the internet: " + strings.Join(notes, "; ")})
		return
	}
	downloadServer := ""
	if source != nil && source.name != peer.Host {
		downloadServer = source.name
	}
	out.send(speedEvent{Type: "done", Result: &speedInternetResult{
		DownloadMbps: down,
		UploadMbps:   up,
		LatencyMs:    latency,
		JitterMs:     jitter,
		Server:       peer.Host,
		ServerID:     peer.ID,
		ServerName:   peer.Name + ", " + peer.Location,
		CanUpload:    peer.canUpload(),
		DurationMs:   time.Since(started).Milliseconds(),
		At:           time.Now().UnixMilli(),

		DownloadServer: downloadServer,
		Notes:          notes,
	}})
}

func measureSpeedLatency(ctx context.Context, client *http.Client, target speedServer, onSample func(float64)) (float64, float64, error) {
	var samples []float64
	for i := 0; i < speedPingSamples; i++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.ping, nil)
		if err != nil {
			return 0, 0, err
		}
		if target.rangePing {
			req.Header.Set("Range", "bytes=0-0")
		}
		t0 := time.Now()
		resp, err := client.Do(req)
		if err != nil {
			if i == 0 {
				return 0, 0, err
			}
			continue
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
		if resp.StatusCode/100 != 2 {
			return 0, 0, fmt.Errorf("HTTP %d", resp.StatusCode)
		}
		// the first request pays for DNS and TLS, so it is not a latency sample
		if i > 0 {
			ms := round1(float64(time.Since(t0).Microseconds()) / 1000)
			samples = append(samples, ms)
			onSample(ms)
		}
	}
	if len(samples) == 0 {
		return 0, 0, errors.New("no reply")
	}
	ordered := append([]float64(nil), samples...)
	sort.Float64s(ordered)
	median := ordered[len(ordered)/2]
	var diff float64
	for i := 1; i < len(samples); i++ {
		d := samples[i] - samples[i-1]
		if d < 0 {
			d = -d
		}
		diff += d
	}
	jitter := 0.0
	if len(samples) > 1 {
		jitter = diff / float64(len(samples)-1)
	}
	return round1(median), round1(jitter), nil
}

// reportRate calls onTick with the rate over the last second until the context ends
func reportRate(ctx context.Context, total *atomic.Int64, duration time.Duration, onTick func(mbps, fraction float64)) {
	type point struct {
		at    time.Time
		bytes int64
	}
	started := time.Now()
	window := []point{{started, 0}}
	ticker := time.NewTicker(speedTick)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			window = append(window, point{now, total.Load()})
			for len(window) > 2 && now.Sub(window[0].at) > time.Second {
				window = window[1:]
			}
			first, last := window[0], window[len(window)-1]
			fraction := float64(now.Sub(started)) / float64(duration)
			if fraction > 1 {
				fraction = 1
			}
			onTick(mbps(last.bytes-first.bytes, last.at.Sub(first.at)), fraction)
		}
	}
}

type speedSource struct {
	name string
	url  string
}

// pickSpeedSource returns the first source that answers 200 with data, and why the earlier ones did not
func pickSpeedSource(ctx context.Context, client *http.Client, sources []speedSource) (*speedSource, []string) {
	var failures []string
	for _, src := range sources {
		probeCtx, cancel := context.WithTimeout(ctx, 9*time.Second)
		req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, src.url, nil)
		if err != nil {
			cancel()
			continue
		}
		resp, err := client.Do(req)
		if err != nil {
			cancel()
			failures = append(failures, fmt.Sprintf("download from %s: %v", src.name, err))
			continue
		}
		buf := make([]byte, 4096)
		n, _ := resp.Body.Read(buf)
		_ = resp.Body.Close()
		cancel()
		if resp.StatusCode/100 != 2 {
			failures = append(failures, fmt.Sprintf("download from %s: HTTP %d", src.name, resp.StatusCode))
			continue
		}
		if n == 0 {
			failures = append(failures, fmt.Sprintf("download from %s: empty reply", src.name))
			continue
		}
		picked := src
		return &picked, failures
	}
	return nil, failures
}

func measureSpeedDownload(ctx context.Context, client *http.Client, src speedSource, onTick func(mbps, fraction float64)) (float64, string) {
	runCtx, cancel := context.WithTimeout(ctx, speedDownloadFor)
	defer cancel()
	var total atomic.Int64
	var lastErr atomic.Value
	var wg sync.WaitGroup
	started := time.Now()
	reported := make(chan struct{})
	go func() {
		defer close(reported)
		reportRate(runCtx, &total, speedDownloadFor, onTick)
	}()
	for i := 0; i < speedStreams; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			// opening every connection in the same instant looks like a flood to some hosts
			if !sleepCtx(runCtx, time.Duration(index)*120*time.Millisecond) {
				return
			}
			buf := make([]byte, speedChunk)
			failures := 0
			for runCtx.Err() == nil {
				err := func() error {
					req, err := http.NewRequestWithContext(runCtx, http.MethodGet, src.url, nil)
					if err != nil {
						return err
					}
					resp, err := client.Do(req)
					if err != nil {
						return err
					}
					defer resp.Body.Close()
					if resp.StatusCode/100 != 2 {
						return fmt.Errorf("HTTP %d", resp.StatusCode)
					}
					for {
						n, readErr := resp.Body.Read(buf)
						total.Add(int64(n))
						if readErr != nil {
							if errors.Is(readErr, io.EOF) || runCtx.Err() != nil {
								return nil
							}
							return readErr
						}
					}
				}()
				if err == nil {
					failures = 0
					continue
				}
				if runCtx.Err() != nil {
					return
				}
				lastErr.Store(err.Error())
				failures++
				// a refusal will not change in a second; a dropped connection might
				if failures >= 2 || strings.HasPrefix(err.Error(), "HTTP 4") {
					return
				}
				if !sleepCtx(runCtx, 400*time.Millisecond) {
					return
				}
			}
		}(i)
	}
	wg.Wait()
	cancel()
	<-reported
	if total.Load() == 0 {
		reason, _ := lastErr.Load().(string)
		if reason == "" {
			reason = "no data received"
		}
		return 0, fmt.Sprintf("download from %s: %s", src.name, reason)
	}
	return mbps(total.Load(), time.Since(started)), ""
}

// sleepCtx waits for d; false means the context ended first
func sleepCtx(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		return ctx.Err() == nil
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

// A reader that serves random bytes up to a limit and counts what the transport consumed
type countingSource struct {
	left  int64
	total *atomic.Int64
}

func (c *countingSource) Read(p []byte) (int, error) {
	if c.left <= 0 {
		return 0, io.EOF
	}
	buf := speedBuffer()
	n := len(p)
	if n > len(buf) {
		n = len(buf)
	}
	if int64(n) > c.left {
		n = int(c.left)
	}
	copy(p, buf[:n])
	c.left -= int64(n)
	c.total.Add(int64(n))
	return n, nil
}

func measureSpeedUpload(ctx context.Context, client *http.Client, target speedServer, onTick func(mbps, fraction float64)) (float64, string) {
	runCtx, cancel := context.WithTimeout(ctx, speedUploadFor)
	defer cancel()
	var total atomic.Int64
	var refused, accepted atomic.Int64
	var wg sync.WaitGroup
	started := time.Now()
	reported := make(chan struct{})
	go func() {
		defer close(reported)
		reportRate(runCtx, &total, speedUploadFor, onTick)
	}()
	for i := 0; i < speedStreams; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for runCtx.Err() == nil {
				body := &countingSource{left: speedUploadBytes, total: &total}
				req, err := http.NewRequestWithContext(runCtx, http.MethodPost, target.up, body)
				if err != nil {
					return
				}
				req.ContentLength = speedUploadBytes
				req.Header.Set("Content-Type", "application/octet-stream")
				resp, err := client.Do(req)
				if err != nil {
					return
				}
				_, _ = io.Copy(io.Discard, resp.Body)
				_ = resp.Body.Close()
				if resp.StatusCode/100 != 2 {
					refused.Store(int64(resp.StatusCode))
					return
				}
				accepted.Add(1)
			}
		}()
	}
	wg.Wait()
	cancel()
	<-reported
	// bytes handed to a peer that answered with an error were not delivered
	if accepted.Load() == 0 && refused.Load() != 0 {
		return 0, fmt.Sprintf("upload to %s: HTTP %d", target.Host, refused.Load())
	}
	return mbps(total.Load(), time.Since(started)), ""
}

func mbps(bytes int64, elapsed time.Duration) float64 {
	if bytes <= 0 || elapsed <= 0 {
		return 0
	}
	return round1(float64(bytes) * 8 / elapsed.Seconds() / 1e6)
}

func round1(v float64) float64 {
	return float64(int64(v*10+0.5)) / 10
}
