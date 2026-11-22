package httpserver

import (
	"bytes"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/config"
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

	for _, field := range []string{"enabled", "available", "installed", "xvfbInstalled", "activeDisplays", "resolution"} {
		if _, ok := res[field]; !ok {
			t.Fatalf("expected %q field in response", field)
		}
	}
	if res["resolution"] != defaultKvmResolution {
		t.Fatalf("expected default resolution %s, got %v", defaultKvmResolution, res["resolution"])
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

func TestKvmTokenMintValidateAndRevoke(t *testing.T) {
	s := newSiteTestServer(t, config.Config{EncryptionKey: "test-kvm-secret-key"})
	if err := s.saveSiteSettings(siteSettings{KvmEnabled: true, KvmPort: 5900, KvmDisplay: ":0"}); err != nil {
		t.Fatalf("saveSiteSettings: %v", err)
	}

	now := time.Now()
	token, expiresAt := s.mintKvmToken(42, now)
	if token == "" || !expiresAt.After(now) {
		t.Fatalf("expected non-empty token and future expiry, got %q %v", token, expiresAt)
	}
	if !s.validateKvmToken(token, 42) {
		t.Fatal("expected minted KVM token to validate for owning user")
	}
	if s.validateKvmToken(token, 99) {
		t.Fatal("expected KVM token bound to user 42 to reject user 99")
	}
	if s.validateKvmToken(token+"tamper", 42) {
		t.Fatal("expected tampered KVM token signature to be rejected")
	}
	if s.validateKvmToken("not-a-valid-token", 42) {
		t.Fatal("expected malformed KVM token to be rejected")
	}

	expiredToken, _ := s.mintKvmToken(42, now.Add(-kvmTokenTTL-time.Minute))
	if s.validateKvmToken(expiredToken, 42) {
		t.Fatal("expected expired KVM token to be rejected")
	}

	// Revocation epoch bump must invalidate existing tokens while preserving future mints.
	revRec := httptest.NewRecorder()
	s.handleRevokeKvmTokens(revRec, httptest.NewRequest(http.MethodPost, "/api/v1/kvm/token/revoke", nil))
	if revRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on revoke, got %d", revRec.Code)
	}
	if s.validateKvmToken(token, 42) {
		t.Fatal("expected token issued before revoke epoch bump to fail validation")
	}

	freshToken, _ := s.mintKvmToken(42, time.Now())
	if !s.validateKvmToken(freshToken, 42) {
		t.Fatal("expected fresh token after revoke to validate")
	}

	// Disabling KVM in site settings must immediately invalidate tokens.
	if err := s.saveSiteSettings(siteSettings{KvmEnabled: false, KvmPort: 5900, KvmDisplay: ":0"}); err != nil {
		t.Fatalf("disable KVM: %v", err)
	}
	if s.validateKvmToken(freshToken, 42) {
		t.Fatal("expected KVM token to fail once KvmEnabled=false")
	}
}

func TestKvmProtectedPageRequiresAuthAndToken(t *testing.T) {
	s := newSiteTestServer(t, config.Config{EncryptionKey: "test-kvm-secret-key"})
	if err := s.saveSiteSettings(siteSettings{LandingEnabled: true, KvmEnabled: true}); err != nil {
		t.Fatalf("saveSiteSettings: %v", err)
	}

	reached := false
	handler := s.requireHTMLAuthV2(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	for _, path := range []string{"/kvm", "/kvm/", "/kvm?token=forged"} {
		reached = false
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if reached {
			t.Fatalf("unauthenticated request to %s must never reach inner handler", path)
		}
		if rec.Code != http.StatusFound || rec.Header().Get("Location") != "/login" {
			t.Fatalf("expected redirect to /login for %s, got status=%d loc=%q", path, rec.Code, rec.Header().Get("Location"))
		}
	}
}

func TestKvmWebSocketAndStatusTokenEnforcement(t *testing.T) {
	s := newSiteTestServer(t, config.Config{EncryptionKey: "test-kvm-secret-key"})
	if err := s.saveSiteSettings(siteSettings{KvmEnabled: true, KvmPort: 5900, KvmDisplay: ":0"}); err != nil {
		t.Fatalf("saveSiteSettings: %v", err)
	}

	statusRec := httptest.NewRecorder()
	s.handleGetKvmStatus(statusRec, httptest.NewRequest(http.MethodGet, "/api/v1/kvm/status?token=invalid", nil))
	if statusRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for /api/v1/kvm/status with invalid token, got %d", statusRec.Code)
	}

	for _, target := range []string{"/api/v1/kvm/ws", "/api/v1/kvm/ws?token=invalid"} {
		wsRec := httptest.NewRecorder()
		s.handleKvmWebSocket(wsRec, httptest.NewRequest(http.MethodGet, target, nil))
		if wsRec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for %s without valid user/token, got %d", target, wsRec.Code)
		}
	}
}

func TestParseKvmResolutionAndSetHandler(t *testing.T) {
	validCases := []struct {
		in   string
		w, h int
		norm string
	}{
		{"1280x800", 1280, 800, "1280x800"},
		{" 1920 X 1080 ", 1920, 1080, "1920x1080"},
		{"640x480", 640, 480, "640x480"},
		{"3840x2160", 3840, 2160, "3840x2160"},
	}
	for _, tc := range validCases {
		w, h, norm, ok := parseKvmResolution(tc.in)
		if !ok || w != tc.w || h != tc.h || norm != tc.norm {
			t.Fatalf("parseKvmResolution(%q) = (%d,%d,%q,%v), want (%d,%d,%q,true)", tc.in, w, h, norm, ok, tc.w, tc.h, tc.norm)
		}
	}
	for _, bad := range []string{"", "1024", "320x240", "7680x4320", "1280xabc", "1280x800x24"} {
		if _, _, _, ok := parseKvmResolution(bad); ok {
			t.Fatalf("expected parseKvmResolution(%q) to fail", bad)
		}
	}

	s := newSiteTestServer(t, config.Config{})

	// Invalid format -> 400
	badRec := httptest.NewRecorder()
	s.handleSetKvmResolution(badRec, httptest.NewRequest(http.MethodPost, "/api/v1/kvm/resolution", bytes.NewBufferString(`{"resolution":"99999x1"}`)))
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid resolution, got %d", badRec.Code)
	}

	// KVM disabled -> 403
	disRec := httptest.NewRecorder()
	s.handleSetKvmResolution(disRec, httptest.NewRequest(http.MethodPost, "/api/v1/kvm/resolution", bytes.NewBufferString(`{"resolution":"1920x1080"}`)))
	if disRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when KVM disabled, got %d", disRec.Code)
	}

	// Enabled + unbound port -> saves setting with applied=false
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen ephemeral tcp: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()
	if err := s.saveSiteSettings(siteSettings{KvmEnabled: true, KvmPort: port, KvmDisplay: ":0"}); err != nil {
		t.Fatalf("saveSiteSettings: %v", err)
	}

	okRec := httptest.NewRecorder()
	s.handleSetKvmResolution(okRec, httptest.NewRequest(http.MethodPost, "/api/v1/kvm/resolution", bytes.NewBufferString(`{"resolution":"1920x1080"}`)))
	if okRec.Code != http.StatusOK {
		t.Fatalf("expected 200 setting resolution, got %d body=%s", okRec.Code, okRec.Body.String())
	}
	var setRes map[string]interface{}
	if err := json.Unmarshal(okRec.Body.Bytes(), &setRes); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if setRes["resolution"] != "1920x1080" || setRes["applied"] != false {
		t.Fatalf("unexpected set resolution response: %v", setRes)
	}

	statusRec := httptest.NewRecorder()
	s.handleGetKvmStatus(statusRec, httptest.NewRequest(http.MethodGet, "/api/v1/kvm/status", nil))
	var statusBody map[string]interface{}
	if err := json.Unmarshal(statusRec.Body.Bytes(), &statusBody); err != nil {
		t.Fatalf("decode status: %v", err)
	}
	if statusBody["resolution"] != "1920x1080" {
		t.Fatalf("expected persisted resolution 1920x1080 in status, got %v", statusBody["resolution"])
	}
}

func TestIntegrationKvmProtectedPageAndToken(t *testing.T) {
	f := newHostingFixture(t)
	settings := f.s.loadSiteSettings()
	settings.KvmEnabled = true
	if err := f.s.saveSiteSettings(settings); err != nil {
		t.Fatal(err)
	}

	regular, err := f.db.CreateUser("bob", "bob@example.com", "hash", auth.UserRole, "Bob")
	if err != nil {
		t.Fatal(err)
	}

	superSess := "super-session-token"
	if err := f.db.CreateSession(f.super.ID, superSess, "127.0.0.1", "test", time.Hour); err != nil {
		t.Fatal(err)
	}
	bobSess := "bob-session-token"
	if err := f.db.CreateSession(regular.ID, bobSess, "127.0.0.1", "test", time.Hour); err != nil {
		t.Fatal(err)
	}

	superTok, _ := f.s.mintKvmToken(f.super.ID, time.Now())
	bobTok, _ := f.s.mintKvmToken(regular.ID, time.Now())

	reached := false
	page := f.s.requireHTMLAuthV2(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))

	call := func(path, sess string) int {
		reached = false
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if sess != "" {
			req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: sess})
		}
		rec := httptest.NewRecorder()
		page.ServeHTTP(rec, req)
		return rec.Code
	}

	if code := call("/kvm", superSess); code != http.StatusForbidden || reached {
		t.Fatalf("expected 403 for superadmin without token, got %d (reached=%v)", code, reached)
	}
	if code := call("/kvm?token="+url.QueryEscape(bobTok), superSess); code != http.StatusForbidden || reached {
		t.Fatalf("expected 403 when superadmin uses another user's token, got %d", code)
	}
	if code := call("/kvm?token="+url.QueryEscape(bobTok), bobSess); code != http.StatusForbidden || reached {
		t.Fatalf("expected 403 for non-superadmin user even with token, got %d", code)
	}
	if code := call("/kvm?token="+url.QueryEscape(superTok), superSess); code != http.StatusOK || !reached {
		t.Fatalf("expected 200 when superadmin supplies valid token, got %d (reached=%v)", code, reached)
	}

	// Revoking must reject that same URL on reload.
	f.s.handleRevokeKvmTokens(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/v1/kvm/token/revoke", nil))
	if code := call("/kvm?token="+url.QueryEscape(superTok), superSess); code != http.StatusForbidden || reached {
		t.Fatalf("expected 403 after token revocation, got %d", code)
	}
}

