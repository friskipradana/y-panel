package httpserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDemoAllowedIsReadOnly(t *testing.T) {
	allowed := []struct{ method, path string }{
		{http.MethodGet, "/api/v1/me"},
		{http.MethodGet, "/api/v1/system/summary"},
		{http.MethodGet, "/api/v1/projects"},
		{http.MethodPost, "/api/v1/auth/logout"},
	}
	for _, c := range allowed {
		r := httptest.NewRequest(c.method, c.path, nil)
		if !demoAllowed(r) {
			t.Errorf("%s %s should be allowed for demo", c.method, c.path)
		}
	}

	blocked := []struct{ method, path string }{
		{http.MethodPost, "/api/v1/projects"},
		{http.MethodDelete, "/api/v1/projects/1"},
		{http.MethodPost, "/api/v1/terminal/sessions"},
		{http.MethodGet, "/api/v1/terminal/sessions/1/ws"},
		{http.MethodGet, "/api/v1/files"},
		{http.MethodGet, "/api/v1/files/read"},
		{http.MethodGet, "/api/v1/users"},
		{http.MethodPost, "/api/v1/me/password"},
		{http.MethodPost, "/api/v1/me/api-tokens"},
		{http.MethodGet, "/api/v1/settings/system"},
		{http.MethodGet, "/api/v1/system/logs"},
		{http.MethodGet, "/api/v1/database/status"},
		{http.MethodPost, "/api/v1/containers/deploy-image"},
		{http.MethodPost, "/api/v1/system/update/apply"},
		{http.MethodPatch, "/api/v1/docs/1"},
		{http.MethodGet, "/api/v1/me/cloudflare"},
		{http.MethodPut, "/api/v1/me/widgets"},
		{http.MethodGet, "/api/v1/docs"},
		{http.MethodGet, "/api/v1/docs/42"},
		{http.MethodGet, "/api/v1/docker/images"},
		{http.MethodGet, "/api/v1/docker/networks"},
		{http.MethodGet, "/api/v1/system/changelog"},
		{http.MethodGet, "/api/v1/system/update"},
		{http.MethodGet, "/api/v1/containers/owners"},
		{http.MethodPost, "/api/v1/tools/ping"},
		{http.MethodGet, "/api/v1/projects/1"},
		{http.MethodGet, "/api/v1/databases"},
		{http.MethodPost, "/api/v1/databases"},
		{http.MethodGet, "/api/v1/databases/1/credentials"},
		{http.MethodDelete, "/api/v1/databases/1"},
	}
	for _, c := range blocked {
		r := httptest.NewRequest(c.method, c.path, nil)
		if demoAllowed(r) {
			t.Errorf("%s %s must be blocked for demo", c.method, c.path)
		}
	}
}
