package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
)

const (
	pingTimeout     = 3 * time.Second
	pingMaxHostLen  = 253
	pingBodyMaxSize = 1024
)

var (
	pingHostnameRe = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$`)
	pingTimeRe     = regexp.MustCompile(`time[=<]\s*([0-9]+(?:[.,][0-9]+)?)\s*ms`)
)

type pingRequest struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

type pingResult struct {
	OK        bool    `json:"ok"`
	Host      string  `json:"host"`
	Mode      string  `json:"mode"`
	LatencyMs float64 `json:"latencyMs"`
	Resolved  string  `json:"resolved,omitempty"`
	Error     string  `json:"error,omitempty"`
	CheckedAt int64   `json:"checkedAt"`
}

// normalizePingHost accepts an IP address or a DNS hostname and rejects anything
// that could be interpreted as a command-line flag or contain shell/URL syntax.
func normalizePingHost(raw string) (string, error) {
	host := strings.TrimSpace(raw)
	if host == "" {
		return "", errors.New("host wajib diisi")
	}
	if len(host) > pingMaxHostLen {
		return "", errors.New("host terlalu panjang")
	}
	if strings.HasPrefix(host, "-") {
		return "", errors.New("host tidak valid")
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.String(), nil
	}
	if !pingHostnameRe.MatchString(host) {
		return "", errors.New("host tidak valid")
	}
	return strings.ToLower(host), nil
}

// icmpPing shells out to the system ping binary (no raw-socket privilege needed).
func icmpPing(ctx context.Context, host string) (float64, error) {
	var args []string
	if runtime.GOOS == "windows" {
		args = []string{"-n", "1", "-w", "2000", host}
	} else {
		args = []string{"-n", "-c", "1", "-W", "2", host}
	}
	started := time.Now()
	out, err := exec.CommandContext(ctx, "ping", args...).CombinedOutput()
	if err != nil {
		var execErr *exec.Error
		if errors.As(err, &execErr) {
			return 0, errors.New("perintah ping tidak tersedia di server")
		}
		text := strings.TrimSpace(string(out))
		if text == "" {
			text = "host tidak merespons"
		}
		return 0, errors.New(firstLine(text))
	}
	if m := pingTimeRe.FindStringSubmatch(string(out)); len(m) == 2 {
		if v, perr := strconv.ParseFloat(strings.ReplaceAll(m[1], ",", "."), 64); perr == nil {
			return v, nil
		}
	}
	// Reply received but latency not parseable: fall back to wall clock
	return float64(time.Since(started).Microseconds()) / 1000, nil
}

func tcpPing(ctx context.Context, host string, port int) (float64, string, error) {
	var d net.Dialer
	started := time.Now()
	conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		return 0, "", errors.New(firstLine(err.Error()))
	}
	defer conn.Close()
	resolved := ""
	if addr, ok := conn.RemoteAddr().(*net.TCPAddr); ok {
		resolved = addr.IP.String()
	}
	return float64(time.Since(started).Microseconds()) / 1000, resolved, nil
}

func firstLine(s string) string {
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		s = s[:i]
	}
	if len(s) > 160 {
		s = s[:160]
	}
	return s
}

// handlePing measures reachability of a host from the server: ICMP echo when no
// port is given, otherwise a TCP connect to host:port.
func (s *Server) handlePing(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req pingRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, pingBodyMaxSize)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}

	host, err := normalizePingHost(req.Host)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if req.Port < 0 || req.Port > 65535 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "port tidak valid"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), pingTimeout)
	defer cancel()

	res := pingResult{Host: host, CheckedAt: time.Now().UnixMilli()}
	caller := userFromCtx(r)
	probeHost, policyErr := pingTarget(ctx, host, caller != nil && auth.IsSuperAdmin(caller.Role))
	if policyErr != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": policyErr.Error()})
		return
	}
	host = probeHost
	if req.Port > 0 {
		res.Mode = "tcp"
		latency, resolved, perr := tcpPing(ctx, host, req.Port)
		if perr != nil {
			res.Error = perr.Error()
		} else {
			res.OK, res.LatencyMs, res.Resolved = true, latency, resolved
		}
	} else {
		res.Mode = "icmp"
		latency, perr := icmpPing(ctx, host)
		if perr != nil {
			res.Error = perr.Error()
		} else {
			res.OK, res.LatencyMs = true, latency
		}
	}
	s.writeJSON(w, http.StatusOK, res)
}
