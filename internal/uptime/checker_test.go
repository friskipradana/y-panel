package uptime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestValidateTarget(t *testing.T) {
	u, err := ValidateTarget("http", "example.com/health")
	if err != nil || u != "https://example.com/health" {
		t.Fatalf("unexpected url: %q err=%v", u, err)
	}
	if _, err := ValidateTarget("tcp", "127.0.0.1:5432"); err != nil {
		t.Fatalf("unexpected tcp error: %v", err)
	}
	if _, err := ValidateTarget("tcp", "badhost"); err == nil {
		t.Fatal("expected error for tcp without port")
	}
}

func TestProbeHTTP(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/fail" {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	okRes := Probe(context.Background(), "http", srv.URL, 200, 5)
	if !okRes.Up || okRes.HTTPCode != 200 {
		t.Fatalf("expected up 200, got %+v", okRes)
	}

	failRes := Probe(context.Background(), "http", srv.URL+"/fail", 200, 5)
	if failRes.Up || failRes.HTTPCode != 503 {
		t.Fatalf("expected down 503, got %+v", failRes)
	}
}
