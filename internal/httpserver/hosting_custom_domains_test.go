package httpserver

import (
	"errors"
	"testing"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
)

func TestValidateCustomHostname(t *testing.T) {
	good := []string{"example.com", "toko-saya.co.id", "a1.b2.example.org", "xn--bcher-kva.example"}
	for _, h := range good {
		if err := validateCustomHostname(h); err != nil {
			t.Errorf("%q should be accepted: %v", h, err)
		}
	}
	bad := []string{
		"", "localhost", "example", "https://example.com", "example.com/path", "example.com:8080", "user@example.com",
		"-a.example.com", "a-.example.com", "a..example.com", "exa mple.com", "exa_mple.com", "*.example.com",
		"192.168.1.1", "example.123", "panel.local", "x.internal", "Example.com",
	}
	for _, h := range bad {
		if err := validateCustomHostname(h); err == nil {
			t.Errorf("%q must be refused", h)
		}
	}
}

func TestCustomStateFromCloudflare(t *testing.T) {
	var active cloudflareapi.CustomHostname
	active.Status, active.SSL.Status = "active", "active"
	if status, _, note := customStateFromCloudflare(&active); status != "active" || note != "" {
		t.Fatalf("active and certified is live, got %q %q", status, note)
	}

	waiting := cloudflareapi.CustomHostname{Status: "pending"}
	if status, _, note := customStateFromCloudflare(&waiting); status != "pending" || note == "" {
		t.Fatalf("a new domain waits and says what for, got %q %q", status, note)
	}

	withError := cloudflareapi.CustomHostname{Status: "pending", VerificationErrors: []string{"CNAME not found"}}
	if _, _, note := customStateFromCloudflare(&withError); note != "CNAME not found" {
		t.Fatalf("Cloudflare's own reason is shown, got %q", note)
	}

	certWait := cloudflareapi.CustomHostname{Status: "active"}
	certWait.SSL.Status = "pending_validation"
	if status, _, note := customStateFromCloudflare(&certWait); status != "pending" || note != "waiting for the certificate" {
		t.Fatalf("active without a certificate still waits, got %q %q", status, note)
	}

	blocked := cloudflareapi.CustomHostname{Status: "blocked"}
	if status, _, _ := customStateFromCloudflare(&blocked); status != "error" {
		t.Fatalf("a blocked domain is an error, got %q", status)
	}
}

func TestPointsAtTarget(t *testing.T) {
	original := lookupCNAME
	defer func() { lookupCNAME = original }()

	lookupCNAME = func(string) (string, error) { return "CNAME.reneo.my.id.", nil }
	if !pointsAtTarget("toko.com", "cname.reneo.my.id") {
		t.Fatal("the same name, in any case and with the trailing dot, is pointing")
	}
	lookupCNAME = func(string) (string, error) { return "other.example.", nil }
	if pointsAtTarget("toko.com", "cname.reneo.my.id") {
		t.Fatal("another target is not pointing")
	}
	lookupCNAME = func(string) (string, error) { return "", errors.New("no such host") }
	if pointsAtTarget("toko.com", "cname.reneo.my.id") {
		t.Fatal("no answer is not pointing")
	}
}
