package httpserver

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Speed test. Two measurements:
//   - browser <-> panel: the browser pulls and pushes bytes through the endpoints below, so the
//     result is the link between the person and this server (what OpenSpeedTest measures)
//   - panel <-> internet: the server measures its own uplink against a public speed endpoint
//     (superadmin only), the figure a hosting provider sells

const (
	speedMaxBytes      = 64 << 20
	speedDefaultBytes  = 10 << 20
	speedChunk         = 64 << 10
	speedInternetHost  = "https://speed.cloudflare.com"
	speedInternetName  = "speed.cloudflare.com"
	speedDownloadFor   = 8 * time.Second
	speedUploadFor     = 6 * time.Second
	speedStreams       = 4
	speedDownloadBytes = 25 << 20
	speedUploadBytes   = 8 << 20
	speedPingSamples   = 6
)

var (
	speedPayload     []byte
	speedPayloadOnce sync.Once
	speedInternetMu  sync.Mutex
)

// An incompressible buffer, so a compressing proxy cannot inflate the result
func speedBuffer() []byte {
	speedPayloadOnce.Do(func() {
		speedPayload = make([]byte, speedChunk)
		_, _ = rand.Read(speedPayload)
	})
	return speedPayload
}

func isSpeedtestPath(path string) bool {
	return strings.HasPrefix(path, "/api/v1/speedtest/")
}

func (s *Server) handleSpeedtestDownload(w http.ResponseWriter, r *http.Request) {
	size := int64(speedDefaultBytes)
	if raw := r.URL.Query().Get("bytes"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || parsed < 0 {
			s.writeError(w, http.StatusBadRequest, errors.New("bytes must be a positive number"))
			return
		}
		size = parsed
	}
	if size > speedMaxBytes {
		size = speedMaxBytes
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Encoding", "identity")
	buf := speedBuffer()
	for size > 0 {
		n := int64(len(buf))
		if size < n {
			n = size
		}
		if _, err := w.Write(buf[:n]); err != nil {
			return
		}
		size -= n
	}
}

func (s *Server) handleSpeedtestUpload(w http.ResponseWriter, r *http.Request) {
	n, err := io.Copy(io.Discard, io.LimitReader(r.Body, speedMaxBytes+1))
	if err != nil && !errors.Is(err, context.Canceled) {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	if n > speedMaxBytes {
		s.writeError(w, http.StatusRequestEntityTooLarge, fmt.Errorf("upload is limited to %d MB per request", speedMaxBytes>>20))
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	s.writeJSON(w, http.StatusOK, jsonResponse{"bytes": n})
}

func (s *Server) handleSpeedtestPing(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

type speedInternetResult struct {
	DownloadMbps float64 `json:"downloadMbps"`
	UploadMbps   float64 `json:"uploadMbps"`
	LatencyMs    float64 `json:"latencyMs"`
	JitterMs     float64 `json:"jitterMs"`
	Server       string  `json:"server"`
	DurationMs   int64   `json:"durationMs"`
	At           int64   `json:"at"`
}

func (s *Server) handleSpeedtestServer(w http.ResponseWriter, r *http.Request) {
	if !speedInternetMu.TryLock() {
		s.writeError(w, http.StatusConflict, errors.New("a speed test is already running on this server"))
		return
	}
	defer speedInternetMu.Unlock()

	started := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), 40*time.Second)
	defer cancel()
	client := &http.Client{Transport: &http.Transport{DisableCompression: true, MaxIdleConnsPerHost: speedStreams * 2}}
	defer client.CloseIdleConnections()

	latency, jitter, err := measureSpeedLatency(ctx, client)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, fmt.Errorf("cannot reach %s from the server: %w", speedInternetName, err))
		return
	}
	down := measureSpeedDownload(ctx, client)
	up := measureSpeedUpload(ctx, client)
	if down == 0 && up == 0 {
		s.writeError(w, http.StatusBadGateway, fmt.Errorf("no data moved to or from %s; check the server's internet connection", speedInternetName))
		return
	}
	s.writeJSON(w, http.StatusOK, speedInternetResult{
		DownloadMbps: down,
		UploadMbps:   up,
		LatencyMs:    latency,
		JitterMs:     jitter,
		Server:       speedInternetName,
		DurationMs:   time.Since(started).Milliseconds(),
		At:           time.Now().UnixMilli(),
	})
}

func measureSpeedLatency(ctx context.Context, client *http.Client) (float64, float64, error) {
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
			samples = append(samples, float64(time.Since(t0).Microseconds())/1000)
		}
	}
	if len(samples) == 0 {
		return 0, 0, errors.New("no reply")
	}
	sort.Float64s(samples)
	median := samples[len(samples)/2]
	var diff float64
	for i := 1; i < len(samples); i++ {
		diff += samples[i] - samples[i-1]
	}
	jitter := 0.0
	if len(samples) > 1 {
		jitter = diff / float64(len(samples)-1)
	}
	return round1(median), round1(jitter), nil
}

func measureSpeedDownload(ctx context.Context, client *http.Client) float64 {
	runCtx, cancel := context.WithTimeout(ctx, speedDownloadFor)
	defer cancel()
	var total atomic.Int64
	var wg sync.WaitGroup
	started := time.Now()
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

func measureSpeedUpload(ctx context.Context, client *http.Client) float64 {
	runCtx, cancel := context.WithTimeout(ctx, speedUploadFor)
	defer cancel()
	var total atomic.Int64
	var wg sync.WaitGroup
	started := time.Now()
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
