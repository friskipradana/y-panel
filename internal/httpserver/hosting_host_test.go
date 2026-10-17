package httpserver

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
)

func TestUserMayUseHost(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	hostingHostCache.Store("toko.example.com", hostingHostEntry{owner: 7, at: time.Now()})
	hostingHostCache.Store("panel.example.com", hostingHostEntry{owner: 0, at: time.Now()})
	t.Cleanup(forgetHostingHosts)

	req := func(host string) bool {
		r := httptest.NewRequest("GET", "http://"+host+"/api/v1/me", nil)
		return s.userMayUseHost(r, 7)
	}
	other := func(host string) bool {
		r := httptest.NewRequest("GET", "http://"+host+"/api/v1/me", nil)
		return s.userMayUseHost(r, 8)
	}
	if !req("toko.example.com") {
		t.Fatal("the owner must be able to use their own address")
	}
	if other("toko.example.com") {
		t.Fatal("another account must not use a buyer's address")
	}
	if !other("panel.example.com") || !req("panel.example.com") {
		t.Fatal("any account may use the main address")
	}
	if other("toko.example.com:443") {
		t.Fatal("a port must not change the answer")
	}
}
