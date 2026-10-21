package httpserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWebhookAPIKeyIsFoundInTheCommonPlaces(t *testing.T) {
	cases := []struct {
		name   string
		target string
		header map[string]string
		want   string
	}{
		{"x-api-key", "/api/v1/webhooks", map[string]string{"X-API-Key": " ypnl_a "}, "ypnl_a"},
		{"bearer", "/api/v1/webhooks", map[string]string{"Authorization": "Bearer ypnl_b"}, "ypnl_b"},
		{"query api_key", "/api/v1/webhooks?api_key=ypnl_c", nil, "ypnl_c"},
		{"query key", "/api/v1/webhooks?key=ypnl_d", nil, "ypnl_d"},
		{"none", "/api/v1/webhooks", nil, ""},
		{"basic is not a key", "/api/v1/webhooks", map[string]string{"Authorization": "Basic abc"}, ""},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodPost, c.target, nil)
		for k, v := range c.header {
			req.Header.Set(k, v)
		}
		if got := webhookAPIKey(req); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
