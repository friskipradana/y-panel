package httpserver

import (
	"encoding/json"
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
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "add it first") {
		t.Fatalf("an unknown device: %d %s", rec.Code, rec.Body.String())
	}

	// registered with a filter
	rec = deviceCall(f, f.s.handleRegisterNotificationDevice, "POST", "", `{"deviceId":"wimboro-device-001","packageFilter":["id.dana","com.whatsapp"]}`)
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

func webhookCall(f *hostingFixture, key, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", "/api/v1/webhooks", bytes.NewBufferString(body))
	req.Header.Set("X-API-Key", key)
	req.RemoteAddr = "203.0.113.30:5000"
	rec := httptest.NewRecorder()
	f.s.handleNotificationWebhook(rec, req)
	return rec
}

// Several phones at once, each with a key the panel made: shown once, replaceable, and what the listener app sends is accepted.
func TestIntegrationListenerPhonesGetTheirOwnKeys(t *testing.T) {
	f := newHostingFixture(t)

	register := func(name string) (key string, rec *httptest.ResponseRecorder) {
		rec = deviceCall(f, f.s.handleRegisterNotificationDevice, "POST", "", `{"deviceId":"`+name+`"}`)
		if rec.Code == http.StatusCreated {
			var out struct {
				APIKey string `json:"apiKey"`
			}
			_ = json.Unmarshal(rec.Body.Bytes(), &out)
			key = out.APIKey
		}
		return key, rec
	}
	keyA, rec := register("poco")
	if rec.Code != http.StatusCreated || !strings.HasPrefix(keyA, "ypnl_") || len(keyA) < 30 {
		t.Fatalf("the panel makes the key: %d %s", rec.Code, rec.Body.String())
	}
	keyB, _ := register("redmi")
	if keyB == "" || keyB == keyA {
		t.Fatal("each phone has a key of its own")
	}
	// a name that is taken does not overwrite the phone that has it
	if _, rec = register("poco"); rec.Code != http.StatusConflict {
		t.Fatalf("a name already used: %d %s", rec.Code, rec.Body.String())
	}
	if rec = deviceCall(f, f.s.handleRegisterNotificationDevice, "POST", "", `{"deviceId":"x","apiKey":"short"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("a weak key by hand: %d", rec.Code)
	}

	// the test button of the app sends only a message: it proves the key and is not stored
	if rec = webhookCall(f, keyA, `{"message":"Test dari Notification Listener"}`); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"success":true`) {
		t.Fatalf("app test: %d %s", rec.Code, rec.Body.String())
	}
	if rec = webhookCall(f, "ypnl_wrong", `{"message":"x"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("a wrong key: %d", rec.Code)
	}
	// a real one, with the long text in bigText
	body := `{"deviceId":"poco","packageName":"id.dana","appName":"DANA","title":"Dana","text":"Uang masuk","bigText":"Uang masuk Rp 25.000 dari Sari","amountDetected":"25000","notificationId":7,"extras":{"a":"b"}}`
	if rec = webhookCall(f, keyA, body); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"capturedId"`) {
		t.Fatalf("a notification: %d %s", rec.Code, rec.Body.String())
	}
	list, err := f.db.ListNotificationDevices()
	if err != nil || len(list) != 2 {
		t.Fatalf("two phones: %v %d", err, len(list))
	}
	for _, d := range list {
		switch d.DeviceID {
		case "poco":
			if d.Received != 1 || d.LastSeenAt == nil {
				t.Fatalf("the phone that sent shows when and how much: %+v", d)
			}
		case "redmi":
			if d.Received != 0 || d.LastSeenAt != nil {
				t.Fatalf("the phone that sent nothing says so: %+v", d)
			}
		}
	}

	// a new key: the old one stops working at once, the other phone is not touched
	rec = deviceCall(f, f.s.handleRotateNotificationDeviceKey, "POST", "poco", "")
	var rotated struct {
		APIKey string `json:"apiKey"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &rotated)
	if rec.Code != 200 || rotated.APIKey == "" || rotated.APIKey == keyA {
		t.Fatalf("rotate: %d %s", rec.Code, rec.Body.String())
	}
	if rec = webhookCall(f, keyA, `{"message":"x"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("the old key: %d", rec.Code)
	}
	if rec = webhookCall(f, rotated.APIKey, `{"message":"x"}`); rec.Code != 200 {
		t.Fatalf("the new key: %d", rec.Code)
	}
	if rec = webhookCall(f, keyB, `{"message":"x"}`); rec.Code != 200 {
		t.Fatalf("the other phone keeps its key: %d", rec.Code)
	}
	if rec = deviceCall(f, f.s.handleRotateNotificationDeviceKey, "POST", "ghost", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("an unknown phone: %d", rec.Code)
	}
}
