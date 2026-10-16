package httpserver

import (
	"net/http/httptest"
	"testing"
)

func TestClientIPIgnoresSpoofedHeadersFromPublicPeers(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "203.0.113.9:5555"
	r.Header.Set("X-Forwarded-For", "1.2.3.4")
	r.Header.Set("CF-Connecting-IP", "5.6.7.8")
	if got := clientIP(r); got != "203.0.113.9" {
		t.Fatalf("direct client must be keyed by its own address, got %s", got)
	}

	r = httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "127.0.0.1:4000"
	r.Header.Set("CF-Connecting-IP", "198.51.100.7")
	if got := clientIP(r); got != "198.51.100.7" {
		t.Fatalf("tunnel peer: want the connecting IP, got %s", got)
	}
}

func TestLoginFailureThrottle(t *testing.T) {
	tr := &loginFailureTracker{entries: map[string]*loginFailure{}}
	for i := 0; i < loginFailureLimit; i++ {
		tr.fail("Alice")
	}
	if ok, _ := tr.blocked("alice"); !ok {
		t.Fatal("account must be blocked after repeated failures")
	}
	tr.clear("alice")
	if ok, _ := tr.blocked("alice"); ok {
		t.Fatal("clear should lift the block")
	}
}
