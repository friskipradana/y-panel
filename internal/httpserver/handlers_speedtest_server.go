package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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

func newSpeedClient() *http.Client {
	base := &http.Transport{DisableCompression: true, MaxIdleConnsPerHost: speedStreams * 2}
	return &http.Client{Transport: speedAgentTransport{base: base}}
}

func (s *Server) handleSpeedtestServer(w http.ResponseWriter, r *http.Request) {
	candidates, ok := resolveSpeedServers(r.URL.Query().Get("server"))
	if !ok {
		s.writeError(w, http.StatusBadRequest, errors.New("unknown speed test server"))
		return
	}
	if !speedInternetMu.TryLock() {
		s.writeError(w, http.StatusConflict, errors.New("a speed test is already running on this server"))
		return
	}
	defer speedInternetMu.Unlock()

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")
	// stop nginx style proxies from holding the stream back
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, _ := w.(http.Flusher)
	out := &speedStream{w: w, f: flusher}

	started := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
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
	source, failures := pickSpeedSource(ctx, client, sources)
	notes = append(notes, failures...)
	down := 0.0
	if source != nil {
		var note string
		down, note = measureSpeedDownload(ctx, client, *source, func(mbps, fraction float64) {
			out.send(speedEvent{Type: "download", Mbps: fptr(round1(mbps)), Fraction: fptr(fraction)})
		})
		if note != "" {
			notes = append(notes, note)
		}
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
		probeCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
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
		n, _ := io.ReadFull(resp.Body, buf)
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
	var refused atomic.Int64
	var wg sync.WaitGroup
	started := time.Now()
	reported := make(chan struct{})
	go func() {
		defer close(reported)
		reportRate(runCtx, &total, speedDownloadFor, onTick)
	}()
	for i := 0; i < speedStreams; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			buf := make([]byte, speedChunk)
			for runCtx.Err() == nil {
				req, err := http.NewRequestWithContext(runCtx, http.MethodGet, src.url, nil)
				if err != nil {
					return
				}
				resp, err := client.Do(req)
				if err != nil {
					return
				}
				if resp.StatusCode/100 != 2 {
					_ = resp.Body.Close()
					refused.Store(int64(resp.StatusCode))
					return
				}
				for {
					n, readErr := resp.Body.Read(buf)
					total.Add(int64(n))
					if readErr != nil {
						break
					}
				}
				_ = resp.Body.Close()
			}
		}()
	}
	wg.Wait()
	cancel()
	<-reported
	if total.Load() == 0 && refused.Load() != 0 {
		return 0, fmt.Sprintf("download from %s: HTTP %d", src.name, refused.Load())
	}
	return mbps(total.Load(), time.Since(started)), ""
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
