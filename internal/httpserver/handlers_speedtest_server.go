package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
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
	DurationMs   int64   `json:"durationMs"`
	At           int64   `json:"at"`
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

func (s *Server) handleSpeedtestServer(w http.ResponseWriter, r *http.Request) {
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
	ctx, cancel := context.WithTimeout(r.Context(), 40*time.Second)
	defer cancel()
	client := &http.Client{Transport: &http.Transport{DisableCompression: true, MaxIdleConnsPerHost: speedStreams * 2}}
	defer client.CloseIdleConnections()

	out.send(speedEvent{Type: "phase", Phase: "ping"})
	latency, jitter, err := measureSpeedLatency(ctx, client, func(ms float64) {
		out.send(speedEvent{Type: "ping", LatencyMs: fptr(ms)})
	})
	if err != nil {
		out.send(speedEvent{Type: "error", Error: fmt.Sprintf("cannot reach %s from the server: %v", speedInternetName, err)})
		return
	}
	out.send(speedEvent{Type: "latency", LatencyMs: fptr(latency), JitterMs: fptr(jitter)})

	out.send(speedEvent{Type: "phase", Phase: "download"})
	down := measureSpeedDownload(ctx, client, func(mbps, fraction float64) {
		out.send(speedEvent{Type: "download", Mbps: fptr(round1(mbps)), Fraction: fptr(fraction)})
	})
	out.send(speedEvent{Type: "phase", Phase: "upload"})
	up := measureSpeedUpload(ctx, client, func(mbps, fraction float64) {
		out.send(speedEvent{Type: "upload", Mbps: fptr(round1(mbps)), Fraction: fptr(fraction)})
	})
	if ctx.Err() != nil && r.Context().Err() != nil {
		return
	}
	if down == 0 && up == 0 {
		out.send(speedEvent{Type: "error", Error: fmt.Sprintf("no data moved to or from %s; check the server's internet connection", speedInternetName)})
		return
	}
	out.send(speedEvent{Type: "done", Result: &speedInternetResult{
		DownloadMbps: down,
		UploadMbps:   up,
		LatencyMs:    latency,
		JitterMs:     jitter,
		Server:       speedInternetName,
		DurationMs:   time.Since(started).Milliseconds(),
		At:           time.Now().UnixMilli(),
	}})
}

func measureSpeedLatency(ctx context.Context, client *http.Client, onSample func(float64)) (float64, float64, error) {
	var samples []float64
	for i := 0; i < speedPingSamples; i++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, speedInternetHost+"/__down?bytes=0", nil)
		if err != nil {
			return 0, 0, err
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

func measureSpeedDownload(ctx context.Context, client *http.Client, onTick func(mbps, fraction float64)) float64 {
	runCtx, cancel := context.WithTimeout(ctx, speedDownloadFor)
	defer cancel()
	var total atomic.Int64
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
				req, err := http.NewRequestWithContext(runCtx, http.MethodGet, fmt.Sprintf("%s/__down?bytes=%d", speedInternetHost, speedDownloadBytes), nil)
				if err != nil {
					return
				}
				resp, err := client.Do(req)
				if err != nil {
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
	return mbps(total.Load(), time.Since(started))
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

func measureSpeedUpload(ctx context.Context, client *http.Client, onTick func(mbps, fraction float64)) float64 {
	runCtx, cancel := context.WithTimeout(ctx, speedUploadFor)
	defer cancel()
	var total atomic.Int64
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
				req, err := http.NewRequestWithContext(runCtx, http.MethodPost, speedInternetHost+"/__up", body)
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
			}
		}()
	}
	wg.Wait()
	cancel()
	<-reported
	return mbps(total.Load(), time.Since(started))
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
