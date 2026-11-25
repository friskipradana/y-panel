package uptime

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ProbeResult captures latency, status, HTTP code, error, and optional TLS expiry metadata.
type ProbeResult struct {
	Up           bool
	Status       string // "up" | "down"
	HTTPCode     int
	LatencyMs    int
	ErrorText    string
	SSLExpiresAt *time.Time
	SSLDaysLeft  *int
}

// ValidateTarget checks that a monitor target is a safe http/https URL or host:port TCP address.
func ValidateTarget(kind, raw string) (string, error) {
	kind = strings.ToLower(strings.TrimSpace(kind))
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errors.New("target monitor wajib diisi")
	}
	switch kind {
	case "http":
		if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
			raw = "https://" + raw
		}
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			return "", errors.New("URL HTTP/HTTPS tidak valid")
		}
		return u.String(), nil
	case "tcp":
		host, port, err := net.SplitHostPort(raw)
		if err != nil || host == "" || port == "" {
			return "", errors.New("target TCP harus berformat host:port (mis. 127.0.0.1:5432)")
		}
		return raw, nil
	default:
		return "", errors.New("jenis monitor harus http atau tcp")
	}
}

// Probe executes a single HTTP/HTTPS or TCP health check with TLS expiry inspection.
func Probe(ctx context.Context, kind, target string, expectedStatus, timeoutSec int) ProbeResult {
	if timeoutSec <= 0 || timeoutSec > 60 {
		timeoutSec = 10
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSec)*time.Second)
	defer cancel()

	start := time.Now()
	if strings.EqualFold(kind, "tcp") {
		var dialer net.Dialer
		conn, err := dialer.DialContext(ctx, "tcp", target)
		lat := int(time.Since(start).Milliseconds())
		if err != nil {
			return ProbeResult{Up: false, Status: "down", LatencyMs: lat, ErrorText: trimErr(err)}
		}
		_ = conn.Close()
		return ProbeResult{Up: true, Status: "up", LatencyMs: lat}
	}

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12},
		DialContext: (&net.Dialer{
			Timeout: time.Duration(timeoutSec) * time.Second,
		}).DialContext,
	}
	defer transport.CloseIdleConnections()

	client := &http.Client{
		Transport: transport,
		Timeout:   time.Duration(timeoutSec) * time.Second,
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return ProbeResult{Up: false, Status: "down", ErrorText: trimErr(err)}
	}
	req.Header.Set("User-Agent", "Reneo-Uptime-Monitor/1.0")

	resp, err := client.Do(req)
	lat := int(time.Since(start).Milliseconds())
	if err != nil {
		return ProbeResult{Up: false, Status: "down", LatencyMs: lat, ErrorText: trimErr(err)}
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))

	res := ProbeResult{
		HTTPCode:  resp.StatusCode,
		LatencyMs: lat,
	}

	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		exp := resp.TLS.PeerCertificates[0].NotAfter.UTC()
		days := int(time.Until(exp).Hours() / 24)
		res.SSLExpiresAt = &exp
		res.SSLDaysLeft = &days
	}

	okStatus := false
	if expectedStatus > 0 {
		okStatus = resp.StatusCode == expectedStatus
	} else {
		okStatus = resp.StatusCode >= 200 && resp.StatusCode < 400
	}
	if okStatus {
		res.Up = true
		res.Status = "up"
	} else {
		res.Up = false
		res.Status = "down"
		if expectedStatus > 0 {
			res.ErrorText = fmt.Sprintf("HTTP %d (harapan %d)", resp.StatusCode, expectedStatus)
		} else {
			res.ErrorText = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
	}
	return res
}

func trimErr(err error) string {
	s := strings.TrimSpace(err.Error())
	if len(s) > 240 {
		return s[:240]
	}
	return s
}
