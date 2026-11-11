package httpserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

	if _, ok := res["enabled"]; !ok {
		t.Fatalf("expected 'enabled' field in response")
	}
	if _, ok := res["available"]; !ok {
		t.Fatalf("expected 'available' field in response")
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

