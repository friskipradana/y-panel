package httpserver

import "testing"

func TestPasswordGateAllowsOnlyWhatChoosingAPasswordNeeds(t *testing.T) {
	for _, path := range []string{"/api/v1/me", "/api/v1/me/password", "/api/v1/auth/logout"} {
		if !passwordGateAllows(path) {
			t.Errorf("%s must stay reachable", path)
		}
	}
	for _, path := range []string{"/api/v1/users", "/api/v1/me/api-tokens", "/api/v1/terminal/sessions", "/api/v1/me/password/x", "/api/v1/me/"} {
		if passwordGateAllows(path) {
			t.Errorf("%s must be blocked until the password is chosen", path)
		}
	}
}
