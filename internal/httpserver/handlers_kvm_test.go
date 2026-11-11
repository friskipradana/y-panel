package httpserver

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func TestKvmStatusHandlerDefaults(t *testing.T) {
	s := &Server{}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/kvm/status", nil)

	s.handleGetKvmStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var res map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to parse json response: %v", err)
	}

	for _, field := range []string{"enabled", "available", "installed", "xvfbInstalled", "activeDisplays"} {
		if _, ok := res[field]; !ok {
			t.Fatalf("expected %q field in response", field)
		}
	}
	if res["port"] != float64(5900) {
		t.Fatalf("expected default port 5900, got %v", res["port"])
	}
	if res["host"] != "127.0.0.1" {
		t.Fatalf("expected host 127.0.0.1, got %v", res["host"])
	}
}

func TestKvmWebSocketDisabledRejects(t *testing.T) {
	s := &Server{}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/kvm/ws", nil)

	s.handleKvmWebSocket(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 Forbidden when KVM is disabled, got %d", rec.Code)
	}
}

func TestKvmDiscoverDisplaysAndPickFreeVirtual(t *testing.T) {
	tmpRoot := t.TempDir()
	sockDir := filepath.Join(tmpRoot, ".X11-unix")
	if err := os.MkdirAll(sockDir, 0755); err != nil {
		t.Fatalf("mkdir sockDir: %v", err)
	}

	for _, name := range []string{"X10", "X1", "Xbad", "X-1", "other"} {
		if err := os.WriteFile(filepath.Join(sockDir, name), nil, 0600); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	got := discoverX11Displays(sockDir)
	want := []string{":1", ":10"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("discoverX11Displays = %v, want %v", got, want)
	}

	// Mark :99 via socket and :100 via lock file so :101 should be picked.
	if err := os.WriteFile(filepath.Join(sockDir, "X99"), nil, 0600); err != nil {
		t.Fatalf("write X99: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tmpRoot, ".X100-lock"), nil, 0600); err != nil {
		t.Fatalf("write .X100-lock: %v", err)
	}
	if vDisp := pickFreeVirtualDisplay(sockDir); vDisp != ":101" {
		t.Fatalf("pickFreeVirtualDisplay = %q, want :101", vDisp)
	}

	candidates := buildRealDisplayCandidates(sockDir, ":0", got)
	if !reflect.DeepEqual(candidates, want) {
		t.Fatalf("buildRealDisplayCandidates = %v, want %v", candidates, want)
	}
}

func TestKvmStartReturnsOKWhenPortAlreadyListening(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen ephemeral tcp: %v", err)
	}
	defer func() { _ = ln.Close() }()

	tcpAddr, ok := ln.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatalf("unexpected addr type %T", ln.Addr())
	}

	s := &Server{}
	s.cfg.StateDir = t.TempDir()
	if err := s.saveSiteSettings(siteSettings{KvmEnabled: true, KvmPort: tcpAddr.Port, KvmDisplay: ":0"}); err != nil {
		t.Fatalf("saveSiteSettings: %v", err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/kvm/start", nil)
	s.handleStartKvm(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 when port already listening, got %d body=%s", rec.Code, rec.Body.String())
	}
	var res map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if res["ok"] != true || res["running"] != true {
		t.Fatalf("expected ok=true running=true, got %v", res)
	}
}

func TestKvmStartMissingPreconditionsNot500(t *testing.T) {
	if runtime.GOOS == "linux" {
		// Pick an unbound port and verify invalid/non-running precondition returns JSON error, not panic or 500 when x11vnc is absent.
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatalf("listen ephemeral tcp: %v", err)
		}
		port := ln.Addr().(*net.TCPAddr).Port
		_ = ln.Close()

		s := &Server{}
		s.cfg.StateDir = t.TempDir()
		_ = s.saveSiteSettings(siteSettings{KvmEnabled: true, KvmPort: port, KvmDisplay: ":99"})

		t.Setenv("PATH", t.TempDir())
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/kvm/start", nil)
		s.handleStartKvm(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 when x11vnc is absent in PATH, got %d body=%s", rec.Code, rec.Body.String())
		}
		return
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen ephemeral tcp: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	s := &Server{}
	s.cfg.StateDir = t.TempDir()
	_ = s.saveSiteSettings(siteSettings{KvmEnabled: true, KvmPort: port, KvmDisplay: ":0"})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/kvm/start", nil)
	s.handleStartKvm(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on non-Linux without listener, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestKvmStopManagedNilSafe(t *testing.T) {
	var nilServer *Server
	nilServer.stopManagedKvm()

	s := &Server{}
	s.stopManagedKvm()
}

