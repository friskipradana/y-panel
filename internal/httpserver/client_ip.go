package httpserver

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// clientIP is the address used for rate limiting. Forwarding headers are believed only when the
// TCP peer is the local machine or a private network (the tunnel or reverse proxy in front of the
// panel); a client that connects directly cannot choose its own address with a header.
func clientIP(r *http.Request) string {
	peer := r.RemoteAddr
	if host, _, err := net.SplitHostPort(peer); err == nil {
		peer = host
	}
	if ip := net.ParseIP(peer); ip != nil && (ip.IsLoopback() || ip.IsPrivate()) {
		if v := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); v != "" {
			return v
		}
		if v := strings.TrimSpace(r.Header.Get("X-Real-IP")); v != "" {
			return v
		}
		if fwd := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); fwd != "" {
			// the entry closest to us was added by our own proxy: the last one
			parts := strings.Split(fwd, ",")
			return strings.TrimSpace(parts[len(parts)-1])
		}
	}
	return peer
}

// loginFailureTracker counts failed sign-ins per account name, across all addresses, so a slow
// guessing run spread over many IPs still stops.
type loginFailureTracker struct {
	mu      sync.Mutex
	entries map[string]*loginFailure
}

type loginFailure struct {
	count   int
	resetAt time.Time
}

const (
	loginFailureLimit  = 10
	loginFailureWindow = 10 * time.Minute
)

var loginFailures = &loginFailureTracker{entries: map[string]*loginFailure{}}

func (t *loginFailureTracker) blocked(name string) (bool, time.Duration) {
	name = strings.ToLower(strings.TrimSpace(name))
	t.mu.Lock()
	defer t.mu.Unlock()
	e := t.entries[name]
	if e == nil || time.Now().After(e.resetAt) {
		delete(t.entries, name)
		return false, 0
	}
	if e.count >= loginFailureLimit {
		return true, time.Until(e.resetAt)
	}
	return false, 0
}

func (t *loginFailureTracker) fail(name string) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	now := time.Now()
	for k, e := range t.entries {
		if now.After(e.resetAt) {
			delete(t.entries, k)
		}
	}
	e := t.entries[name]
	if e == nil {
		e = &loginFailure{resetAt: now.Add(loginFailureWindow)}
		t.entries[name] = e
	}
	e.count++
}

func (t *loginFailureTracker) clear(name string) {
	t.mu.Lock()
	delete(t.entries, strings.ToLower(strings.TrimSpace(name)))
	t.mu.Unlock()
}
