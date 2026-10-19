package cloudflare

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type recorded struct {
	method, path, auth, body string
}

// fakeCloudflare answers like the API does and remembers what it was asked
func fakeCloudflare(t *testing.T, reply func(r *http.Request) (int, string)) (*Client, *[]recorded) {
	t.Helper()
	var seen []recorded
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		seen = append(seen, recorded{r.Method, r.URL.Path, r.Header.Get("Authorization"), string(body)})
		status, payload := reply(r)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(payload))
	}))
	t.Cleanup(srv.Close)
	return NewClient("secret-token", "acct", "").WithBaseURL(srv.URL), &seen
}

func TestCustomHostnameCalls(t *testing.T) {
	client, seen := fakeCloudflare(t, func(r *http.Request) (int, string) {
		switch {
		case r.Method == http.MethodPut && strings.HasSuffix(r.URL.Path, "/custom_hostnames/fallback_origin"):
			return 200, `{"success":true,"errors":[],"result":{"origin":"cname.reneo.my.id","status":"pending_deployment"}}`
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/custom_hostnames"):
			return 200, `{"success":true,"errors":[],"result":{"id":"ch-1","hostname":"toko.com","status":"pending","ssl":{"status":"pending_validation","validation_errors":[{"message":"CNAME not found"}]},"verification_errors":["custom hostname does not CNAME to this zone."]}}`
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/custom_hostnames/ch-1"):
			return 200, `{"success":true,"errors":[],"result":{"id":"ch-1","hostname":"toko.com","status":"active","ssl":{"status":"active"}}}`
		case r.Method == http.MethodDelete && strings.HasSuffix(r.URL.Path, "/custom_hostnames/ch-1"):
			return 200, `{"success":true,"errors":[],"result":{"id":"ch-1"}}`
		}
		return 404, `{"success":false,"errors":[{"code":1000,"message":"not found"}],"result":null}`
	})

	if err := client.SetFallbackOrigin("zone-1", "cname.reneo.my.id"); err != nil {
		t.Fatal(err)
	}
	created, err := client.CreateCustomHostname("zone-1", "toko.com")
	if err != nil {
		t.Fatal(err)
	}
	if created.ID != "ch-1" || created.Status != "pending" || created.SSL.Status != "pending_validation" ||
		len(created.VerificationErrors) != 1 || created.SSL.ValidationErrors[0].Message != "CNAME not found" {
		t.Fatalf("the response is read whole: %+v", created)
	}
	got, err := client.GetCustomHostname("zone-1", "ch-1")
	if err != nil || got.Status != "active" || got.SSL.Status != "active" {
		t.Fatalf("status read: %+v %v", got, err)
	}
	if err := client.DeleteCustomHostname("zone-1", "ch-1"); err != nil {
		t.Fatal(err)
	}

	want := []struct{ method, path string }{
		{"PUT", "/zones/zone-1/custom_hostnames/fallback_origin"},
		{"POST", "/zones/zone-1/custom_hostnames"},
		{"GET", "/zones/zone-1/custom_hostnames/ch-1"},
		{"DELETE", "/zones/zone-1/custom_hostnames/ch-1"},
	}
	if len(*seen) != len(want) {
		t.Fatalf("requests: %+v", *seen)
	}
	for i, w := range want {
		if (*seen)[i].method != w.method || (*seen)[i].path != w.path || (*seen)[i].auth != "Bearer secret-token" {
			t.Errorf("request %d: want %s %s with the token, got %+v", i, w.method, w.path, (*seen)[i])
		}
	}

	var origin map[string]string
	_ = json.Unmarshal([]byte((*seen)[0].body), &origin)
	if origin["origin"] != "cname.reneo.my.id" {
		t.Errorf("the fallback origin is sent as the hostname, got %q", (*seen)[0].body)
	}
	var create struct {
		Hostname string `json:"hostname"`
		SSL      struct {
			Method   string `json:"method"`
			Type     string `json:"type"`
			Settings struct {
				MinTLS string `json:"min_tls_version"`
			} `json:"settings"`
		} `json:"ssl"`
	}
	if err := json.Unmarshal([]byte((*seen)[1].body), &create); err != nil {
		t.Fatal(err)
	}
	if create.Hostname != "toko.com" || create.SSL.Method != "http" || create.SSL.Type != "dv" || create.SSL.Settings.MinTLS != "1.2" {
		t.Errorf("the custom hostname asks for an HTTP-validated DV certificate, got %s", (*seen)[1].body)
	}
}

func TestCustomHostnameErrorsCarryCloudflaresMessage(t *testing.T) {
	client, _ := fakeCloudflare(t, func(r *http.Request) (int, string) {
		return 403, `{"success":false,"errors":[{"code":1401,"message":"Custom Hostnames is not enabled for this zone"}],"result":null}`
	})
	err := client.SetFallbackOrigin("zone-1", "cname.reneo.my.id")
	if err == nil || !strings.Contains(err.Error(), "Custom Hostnames is not enabled") {
		t.Fatalf("the reason Cloudflare gave reaches the superadmin, got %v", err)
	}
	if _, err := client.GetCustomHostname("zone-1", "gone"); err == nil || !strings.Contains(err.Error(), "status 403") {
		t.Fatalf("a failed read is an error that names the status, got %v", err)
	}
}

func TestVerifyTokenReportsCustomHostnameAccessSeparately(t *testing.T) {
	handler := func(customHostnames int) func(r *http.Request) (int, string) {
		return func(r *http.Request) (int, string) {
			switch {
			case strings.HasSuffix(r.URL.Path, "/user/tokens/verify"):
				return 200, `{"success":true,"errors":[],"result":{"status":"active"}}`
			case r.URL.Path == "/zones":
				return 200, `{"success":true,"errors":[],"result":[{"id":"z1","name":"reneo.my.id","status":"active"}]}`
			case strings.HasSuffix(r.URL.Path, "/dns_records"):
				return 200, `{"success":true,"errors":[],"result":[]}`
			case strings.HasSuffix(r.URL.Path, "/cfd_tunnel"):
				return 200, `{"success":true,"errors":[],"result":[]}`
			case strings.Contains(r.URL.Path, "/rulesets/"):
				return 404, `{"success":false,"errors":[{"code":10000,"message":"no ruleset"}],"result":null}`
			case strings.HasSuffix(r.URL.Path, "/custom_hostnames"):
				if customHostnames == 200 {
					return 200, `{"success":true,"errors":[],"result":[]}`
				}
				return customHostnames, `{"success":false,"errors":[{"code":1401,"message":"not allowed"}],"result":null}`
			}
			return 404, `{"success":false,"errors":[{"code":1000,"message":"unexpected ` + r.URL.Path + `"}],"result":null}`
		}
	}

	client, _ := fakeCloudflare(t, handler(200))
	client.accountID = "acct"
	perm := client.VerifyTokenPermissions()
	if !perm.Valid || !perm.CanReadZones || !perm.CanManageDNS || !perm.CanEditTunnels || !perm.CanManageCustomHostnames || len(perm.MissingScopes) != 0 {
		t.Fatalf("a token with everything reports everything: %+v", perm)
	}

	client, _ = fakeCloudflare(t, handler(403))
	client.accountID = "acct"
	perm = client.VerifyTokenPermissions()
	if perm.CanManageCustomHostnames {
		t.Fatal("without the SSL and Certificates permission custom hostnames are not reported")
	}
	if perm.CustomHostnamesReason != "permission" {
		t.Fatalf("a refused token is told apart from a missing quota: %q", perm.CustomHostnamesReason)
	}
	if got := customHostnamesReason(errors.New("cloudflare API GET /zones/z/custom_hostnames returned status 403: [[1404] No quota has been allocated]")); got != "quota" {
		t.Fatalf("error 1404 means the account has no Cloudflare for SaaS quota, got %q", got)
	}
	if !strings.Contains(perm.CustomHostnamesError, "reneo.my.id") || !strings.Contains(perm.CustomHostnamesError, "1401") {
		t.Fatalf("the answer of Cloudflare is kept so the reason can be shown: %q", perm.CustomHostnamesError)
	}
	if !perm.Valid || len(perm.MissingScopes) != 0 {
		t.Fatalf("the missing hosting permission must not fail a token that serves tunnels and DNS: %+v", perm)
	}
}
