package httpserver

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The phones that read the bank notifications: registering one, changing it, and what happens to one that is not there.
// Skipped without REN_TEST_DATABASE_URL.

func deviceCall(f *hostingFixture, handler http.HandlerFunc, method, deviceID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "/api/v1/notification-devices/"+deviceID, bytes.NewBufferString(body))
	req.SetPathValue("deviceId", deviceID)
	req.RemoteAddr = "203.0.113.20:5000"
	rec := httptest.NewRecorder()
	handler(rec, asUser(req, f.super))
	return rec
}

func TestIntegrationNotificationDevicesAreChangedOnlyWhereTheyExist(t *testing.T) {
	f := newHostingFixture(t)

	// a device nobody registered is not found, and says what to do: it used to be a 500 about an empty result
	rec := deviceCall(f, f.s.handleUpdateNotificationDevice, "PUT", "wimboro-device-001", `{"status":"active","packageFilter":["id.dana"]}`)
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "save its API key first") {
		t.Fatalf("an unknown device: %d %s", rec.Code, rec.Body.String())
	}

	// registered with a filter
	rec = deviceCall(f, f.s.handleRegisterNotificationDevice, "POST", "", `{"deviceId":"wimboro-device-001","apiKey":"key-123456","packageFilter":["id.dana","com.whatsapp"]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("register: %d %s", rec.Code, rec.Body.String())
	}

	// only the status changes: the filter stays
	rec = deviceCall(f, f.s.handleUpdateNotificationDevice, "PUT", "wimboro-device-001", `{"status":"inactive"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"inactive"`) || !strings.Contains(rec.Body.String(), `"packageFilter":["id.dana","com.whatsapp"]`) {
		t.Fatalf("status only: %d %s", rec.Code, rec.Body.String())
	}
	// only the filter changes: the status stays
	rec = deviceCall(f, f.s.handleUpdateNotificationDevice, "PUT", "wimboro-device-001", `{"packageFilter":["com.gojek.gopay"]}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"inactive"`) || !strings.Contains(rec.Body.String(), `"packageFilter":["com.gojek.gopay"]`) {
		t.Fatalf("filter only: %d %s", rec.Code, rec.Body.String())
	}
	// an empty filter clears it, which means every package: the form says "leave empty for all", and it used to do nothing
	rec = deviceCall(f, f.s.handleUpdateNotificationDevice, "PUT", "wimboro-device-001", `{"status":"active","packageFilter":[]}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"packageFilter":[]`) || !strings.Contains(rec.Body.String(), `"status":"active"`) {
		t.Fatalf("an empty filter clears it: %d %s", rec.Code, rec.Body.String())
	}
	// nothing sent changes nothing
	rec = deviceCall(f, f.s.handleUpdateNotificationDevice, "PUT", "wimboro-device-001", `{}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"active"`) {
		t.Fatalf("an empty change: %d %s", rec.Code, rec.Body.String())
	}

	// a status that is not one of the three is refused with a reason, not with a database error
	for _, bad := range []string{`{"status":"paused"}`, `{"status":"` + strings.Repeat("x", 40) + `"}`} {
		rec = deviceCall(f, f.s.handleUpdateNotificationDevice, "PUT", "wimboro-device-001", bad)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "active, inactive or blocked") {
			t.Fatalf("%s: %d %s", bad, rec.Code, rec.Body.String())
		}
	}
	rec = deviceCall(f, f.s.handleUpdateNotificationDevice, "PUT", "wimboro-device-001", `{"status":"blocked"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"blocked"`) {
		t.Fatalf("blocked: %d %s", rec.Code, rec.Body.String())
	}
	if rec = deviceCall(f, f.s.handleUpdateNotificationDevice, "PUT", "wimboro-device-001", `not json`); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad JSON: %d", rec.Code)
	}
}
