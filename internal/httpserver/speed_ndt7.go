package httpserver

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// Google's speed test is M-Lab's NDT7, an open protocol over WebSocket. The agent speaks it
// directly: the Locate service names a nearby server and signs the URLs, then one connection
// downloads and another uploads for about ten seconds each.
// https://www.measurementlab.net/tests/ndt/ndt7/

const ndt7Subprotocol = "net.measurementlab.ndt.v7"

var (
	ndt7LocateURL = "https://locate.measurementlab.net/v2/nearest/ndt/ndt7"
	// each direction runs this long; a variable so the tests can be short
	ndt7Duration = 10 * time.Second
)

type ndt7Server struct {
	Hostname string
	City     string
	Country  string
	Download string
	Upload   string
}

type ndt7LocateReply struct {
	Results []struct {
		Machine  string `json:"machine"`
		Hostname string `json:"hostname"`
		Location struct {
			City    string `json:"city"`
			Country string `json:"country"`
		} `json:"location"`
		URLs map[string]string `json:"urls"`
	} `json:"results"`
}

// pickNDT7Server takes the first server that offers both directions, secure addresses first
func pickNDT7Server(reply ndt7LocateReply) (*ndt7Server, error) {
	for _, result := range reply.Results {
		for _, scheme := range []string{"wss", "ws"} {
			down, up := result.URLs[scheme+":///ndt/v7/download"], result.URLs[scheme+":///ndt/v7/upload"]
			if down == "" || up == "" {
				continue
			}
			host := result.Hostname
			if host == "" {
				host = result.Machine
			}
			return &ndt7Server{Hostname: host, City: result.Location.City, Country: result.Location.Country, Download: down, Upload: up}, nil
		}
	}
	return nil, errors.New("M-Lab did not name a server for this network")
}

func ndt7Locate(ctx context.Context, client *http.Client) (*ndt7Server, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ndt7LocateURL+"?client_name=reneo-panel", nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("cannot reach the M-Lab locate service: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("the M-Lab locate service answered HTTP %d", resp.StatusCode)
	}
	var reply ndt7LocateReply
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&reply); err != nil {
		return nil, errors.New("the M-Lab locate service sent something unreadable")
	}
	return pickNDT7Server(reply)
}

func ndt7Dialer() *websocket.Dialer {
	netDialer := &net.Dialer{Timeout: 6 * time.Second, KeepAlive: 15 * time.Second}
	return &websocket.Dialer{
		Proxy:            http.ProxyFromEnvironment,
		HandshakeTimeout: 10 * time.Second,
		NetDialContext:   netDialer.DialContext,
		Subprotocols:     []string{ndt7Subprotocol},
		ReadBufferSize:   1 << 16,
		WriteBufferSize:  1 << 16,
	}
}

func ndt7Connect(ctx context.Context, rawURL string) (*websocket.Conn, error) {
	header := http.Header{"User-Agent": []string{speedUserAgent}}
	conn, resp, err := ndt7Dialer().DialContext(ctx, rawURL, header)
	if err != nil {
		if resp != nil {
			return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
		}
		return nil, err
	}
	if conn.Subprotocol() != ndt7Subprotocol {
		_ = conn.Close()
		return nil, errors.New("the server does not speak NDT7")
	}
	return conn, nil
}

// ndt7Latency times TCP connections to the server: the time a SYN and its answer take is the round trip
func ndt7Latency(ctx context.Context, rawURL string, onSample func(float64)) (latency, jitter float64, err error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return 0, 0, err
	}
	addr := parsed.Host
	if parsed.Port() == "" {
		port := "443"
		if parsed.Scheme == "ws" {
			port = "80"
		}
		addr = net.JoinHostPort(parsed.Hostname(), port)
	}
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	var samples []float64
	for i := 0; i < speedPingSamples && ctx.Err() == nil; i++ {
		t0 := time.Now()
		conn, dialErr := dialer.DialContext(ctx, "tcp", addr)
		if dialErr != nil {
			if len(samples) == 0 && i == speedPingSamples-1 {
				return 0, 0, dialErr
			}
			continue
		}
		ms := round1(float64(time.Since(t0).Microseconds()) / 1000)
		_ = conn.Close()
		samples = append(samples, ms)
		onSample(ms)
	}
	if len(samples) == 0 {
		return 0, 0, errors.New("no connection could be made")
	}
	ordered := append([]float64(nil), samples...)
	for i := 1; i < len(ordered); i++ {
		for j := i; j > 0 && ordered[j] < ordered[j-1]; j-- {
			ordered[j], ordered[j-1] = ordered[j-1], ordered[j]
		}
	}
	var diff float64
	for i := 1; i < len(samples); i++ {
		d := samples[i] - samples[i-1]
		if d < 0 {
			d = -d
		}
		diff += d
	}
	if len(samples) > 1 {
		jitter = diff / float64(len(samples)-1)
	}
	return ordered[len(ordered)/2], round1(jitter), nil
}

// ndt7Measurement is the part of a server measurement the upload figure needs
type ndt7Measurement struct {
	TCPInfo *struct {
		BytesReceived int64 `json:"BytesReceived"`
		ElapsedTime   int64 `json:"ElapsedTime"`
	} `json:"TCPInfo"`
}

func ndt7Download(ctx context.Context, rawURL string, onTick func(mbps, fraction float64)) (float64, error) {
	conn, err := ndt7Connect(ctx, rawURL)
	if err != nil {
		return 0, err
	}
	defer conn.Close()
	runCtx, cancel := context.WithTimeout(ctx, ndt7Duration+3*time.Second)
	defer cancel()
	var total atomic.Int64
	reported := make(chan struct{})
	go func() {
		defer close(reported)
		reportRate(runCtx, &total, ndt7Duration, onTick)
	}()

	started := time.Now()
	_ = conn.SetReadDeadline(started.Add(ndt7Duration + 3*time.Second))
	for ctx.Err() == nil {
		kind, data, readErr := conn.ReadMessage()
		if readErr != nil {
			break
		}
		if kind == websocket.BinaryMessage {
			total.Add(int64(len(data)))
		}
		// the test is over when the time is up, whether or not the server has closed
		if time.Since(started) >= ndt7Duration {
			break
		}
	}
	elapsed := time.Since(started)
	cancel()
	<-reported
	_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
	if total.Load() == 0 {
		return 0, errors.New("the server sent no data")
	}
	return mbps(total.Load(), elapsed), nil
}

func ndt7Upload(ctx context.Context, rawURL string, onTick func(mbps, fraction float64)) (float64, error) {
	conn, err := ndt7Connect(ctx, rawURL)
	if err != nil {
		return 0, err
	}
	defer conn.Close()
	runCtx, cancel := context.WithTimeout(ctx, ndt7Duration+3*time.Second)
	defer cancel()

	// the server counts what arrived; its figure is the honest one, ours only counts what was handed to the socket
	var serverBytes, serverElapsedUs, sentBytes atomic.Int64
	go func() {
		for {
			kind, data, readErr := conn.ReadMessage()
			if readErr != nil {
				return
			}
			if kind != websocket.TextMessage {
				continue
			}
			var m ndt7Measurement
			if json.Unmarshal(data, &m) == nil && m.TCPInfo != nil {
				serverBytes.Store(m.TCPInfo.BytesReceived)
				serverElapsedUs.Store(m.TCPInfo.ElapsedTime)
			}
		}
	}()
	reported := make(chan struct{})
	counter := &atomic.Int64{}
	go func() {
		defer close(reported)
		reportRate(runCtx, counter, ndt7Duration, onTick)
	}()
	// the live number follows the server's count, falling back to ours until the first measurement arrives
	feed := make(chan struct{})
	go func() {
		defer close(feed)
		ticker := time.NewTicker(speedTick / 2)
		defer ticker.Stop()
		for {
			select {
			case <-runCtx.Done():
				return
			case <-ticker.C:
				if b := serverBytes.Load(); b > 0 {
					counter.Store(b)
				} else {
					counter.Store(sentBytes.Load())
				}
			}
		}
	}()

	payloadMax := 1 << 20
	payload := make([]byte, payloadMax)
	_, _ = rand.Read(payload)
	size := 1 << 13
	started := time.Now()
	for ctx.Err() == nil && time.Since(started) < ndt7Duration {
		_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
		if err := conn.WriteMessage(websocket.BinaryMessage, payload[:size]); err != nil {
			break
		}
		sentBytes.Add(int64(size))
		// bigger messages once the link keeps up, so a fast link is not limited by message overhead
		if size < payloadMax && int64(size) < sentBytes.Load()/16 {
			size *= 2
		}
	}
	elapsed := time.Since(started)
	cancel()
	<-reported
	<-feed
	_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
	if b, us := serverBytes.Load(), serverElapsedUs.Load(); b > 0 && us > 0 {
		return round1(float64(b) * 8 / float64(us)), nil
	}
	if sentBytes.Load() == 0 {
		return 0, errors.New("nothing could be sent")
	}
	return mbps(sentBytes.Load(), elapsed), nil
}

func runNDT7(ctx context.Context, out *speedStream) (*speedInternetResult, error) {
	started := time.Now()
	client := newSpeedClient()
	defer client.CloseIdleConnections()

	out.send(speedEvent{Type: "phase", Phase: "ping"})
	server, err := ndt7Locate(ctx, client)
	if err != nil {
		return nil, err
	}
	latency, jitter, err := ndt7Latency(ctx, server.Download, func(ms float64) {
		out.send(speedEvent{Type: "ping", LatencyMs: fptr(ms)})
	})
	if err != nil {
		return nil, fmt.Errorf("cannot reach %s: %w", server.Hostname, err)
	}
	out.send(speedEvent{Type: "latency", LatencyMs: fptr(latency), JitterMs: fptr(jitter)})

	var notes []string
	out.send(speedEvent{Type: "phase", Phase: "download"})
	down, downErr := ndt7Download(ctx, server.Download, func(mbps, fraction float64) {
		out.send(speedEvent{Type: "download", Mbps: fptr(round1(mbps)), Fraction: fptr(fraction)})
	})
	if downErr != nil {
		notes = append(notes, "download from "+server.Hostname+": "+downErr.Error())
	}
	out.send(speedEvent{Type: "phase", Phase: "upload"})
	up, upErr := ndt7Upload(ctx, server.Upload, func(mbps, fraction float64) {
		out.send(speedEvent{Type: "upload", Mbps: fptr(round1(mbps)), Fraction: fptr(fraction)})
	})
	if upErr != nil {
		notes = append(notes, "upload to "+server.Hostname+": "+upErr.Error())
	}
	if down == 0 && up == 0 {
		return nil, errors.New("no data moved to or from M-Lab: " + strings.Join(notes, "; "))
	}
	place := strings.Trim(strings.Join([]string{server.City, server.Country}, ", "), ", ")
	return &speedInternetResult{
		DownloadMbps: down,
		UploadMbps:   up,
		LatencyMs:    latency,
		JitterMs:     jitter,
		Server:       server.Hostname,
		ServerID:     speedMLabID,
		ServerName:   "Google (M-Lab NDT7), " + place,
		CanUpload:    true,
		DurationMs:   time.Since(started).Milliseconds(),
		At:           time.Now().UnixMilli(),
		Notes:        notes,
	}, nil
}
