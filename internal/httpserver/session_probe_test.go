package httpserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSessionProbeAnswersWithoutSessionAsNo(t *testing.T) {
	s := &Server{}
	reached := false
	handler := s.sessionProbe(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusUnauthorized)
	}))

	probe := httptest.NewRecorder()
	handler.ServeHTTP(probe, httptest.NewRequest(http.MethodGet, "/api/v1/me?probe=1", nil))
	if probe.Code != http.StatusOK || reached {
		t.Fatalf("a probe without a session is answered with 200 and does not reach auth: code=%d reached=%v", probe.Code, reached)
	}

	plain := httptest.NewRecorder()
	handler.ServeHTTP(plain, httptest.NewRequest(http.MethodGet, "/api/v1/me", nil))
	if plain.Code != http.StatusUnauthorized || !reached {
		t.Fatalf("a normal request still goes through auth: code=%d reached=%v", plain.Code, reached)
	}
}
