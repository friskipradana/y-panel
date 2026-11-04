package httpserver

import (
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestBuildReneoEmailTemplate(t *testing.T) {
	cfg := database.EmailServerConfig{
		Domain:   "reneo.my.id",
		Method:   "cloudflare",
		FromName: "Reneo Admin",
	}

	plain, html := buildReneoEmailTemplate(cfg, "admin@reneo.my.id", "Pesan Uji", "Halo dari Reneo Server", true)

	if !strings.Contains(plain, "RENEO SERVER CONTROL PANEL") {
		t.Errorf("plain text missing header: %s", plain)
	}
	if !strings.Contains(plain, "reneo.my.id") {
		t.Errorf("plain text missing domain: %s", plain)
	}
	if !strings.Contains(html, "cid:reneo-logo") {
		t.Errorf("html template missing cid:reneo-logo: %s", html)
	}
	if !strings.Contains(html, "TERVERIFIKASI") {
		t.Errorf("html template missing badge: %s", html)
	}
	if !strings.Contains(html, "Halo dari Reneo Server") {
		t.Errorf("html template missing body: %s", html)
	}
}

func TestBuildMIMEEnvelope(t *testing.T) {
	cfg := database.EmailServerConfig{
		Domain: "reneo.my.id",
	}
	plain, html := buildReneoEmailTemplate(cfg, "noreply@reneo.my.id", "Subjek Uji", "Konten uji", false)
	env := string(buildMIMEEnvelope("Reneo <noreply@reneo.my.id>", "target@gmail.com", "Subjek Uji", plain, html))

	if !strings.Contains(env, "multipart/related") {
		t.Errorf("MIME missing multipart/related")
	}
	if !strings.Contains(env, "multipart/alternative") {
		t.Errorf("MIME missing multipart/alternative")
	}
	if !strings.Contains(env, "Content-ID: <reneo-logo>") {
		t.Errorf("MIME missing Content-ID: <reneo-logo>")
	}
	if !strings.Contains(env, "image/png; name=\"reneo-icon.png\"") {
		t.Errorf("MIME missing image attachment")
	}
}

