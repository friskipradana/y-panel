package httpserver

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// A sold subdomain is the address of its owner's panel. The panel answers on it like on the main
// address, but only the owner may sign in or use a session there.

const hostingHostTTL = 15 * time.Second

type hostingHostEntry struct {
	owner int64 // 0: not a sold subdomain
	at    time.Time
}

var hostingHostCache sync.Map // lower-case host -> hostingHostEntry

// hostingHostOwner returns the account a sold subdomain belongs to, 0 for any other host.
// Answers are kept briefly so a request does not cost a query.
func (s *Server) hostingHostOwner(host string) int64 {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return 0
	}
	if cached, ok := hostingHostCache.Load(host); ok {
		if entry := cached.(hostingHostEntry); time.Since(entry.at) < hostingHostTTL {
			return entry.owner
		}
	}
	if s.database == nil || !s.database.IsConnected() {
		return 0
	}
	var owner int64
	if row, err := s.database.GetHostingSubdomainByHostname(host); err == nil && row != nil {
		owner = row.UserID
	}
	hostingHostCache.Store(host, hostingHostEntry{owner: owner, at: time.Now()})
	return owner
}

// forgetHostingHosts drops what was remembered, after a subdomain is created or released
func forgetHostingHosts() {
	hostingHostCache.Range(func(key, _ any) bool {
		hostingHostCache.Delete(key)
		return true
	})
}

// userMayUseHost is false when the request arrives on the subdomain of another account
func (s *Server) userMayUseHost(r *http.Request, userID int64) bool {
	owner := s.hostingHostOwner(normalizeHost(r.Host))
	return owner == 0 || owner == userID
}
