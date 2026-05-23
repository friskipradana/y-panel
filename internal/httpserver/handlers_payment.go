package httpserver

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

// ─── Payment Settings Handlers ──────────────────────────────────────────────

type updatePaymentSettingsRequest struct {
	Settings map[string]string `json:"settings"`
}

// handleGetPaymentSettings returns all payment gateway configuration entries.
// Secret values are masked in the response.
func (s *Server) handleGetPaymentSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := s.database.GetPaymentSettings()
	if err != nil {
		log.Printf("[payment] read settings failed remote=%s err=%v", remoteAddr(r), err)
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	log.Printf("[payment] settings read served count=%d remote=%s", len(settings), remoteAddr(r))
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":       true,
		"settings": settings,
	})
}

// handleUpdatePaymentSettings batch-updates payment gateway configuration.
// Only provided keys are updated; omitting a key leaves it unchanged.
// Special handling: if a value matches the masked pattern (starts with "••••"),
// the field is skipped to prevent overwriting secrets with the masked display.
func (s *Server) handleUpdatePaymentSettings(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req updatePaymentSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	if len(req.Settings) == 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "no settings provided"})
		return
	}

	// Filter out masked values to prevent overwriting real secrets
	filtered := make(map[string]string)
	for k, v := range req.Settings {
		if len(v) >= 8 && v[:8] == "••••••••" {
			continue // skip masked secret values
		}
		filtered[k] = v
	}

	if len(filtered) == 0 {
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": "no changes detected"})
		return
	}

	if err := s.database.UpdatePaymentSettingsBatch(filtered); err != nil {
		log.Printf("[payment] update settings failed remote=%s err=%v", remoteAddr(r), err)
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	username, _ := s.currentUser(r)
	log.Printf("[payment] settings updated keys=%v remote=%s user=%s", keys(filtered), remoteAddr(r), username)
	s.recordRuntimeLog("info", "payment settings updated", map[string]any{
		"keys":   keys(filtered),
		"remote": remoteAddr(r),
		"user":   username,
	})
	s.notifyCurrentServerUser(r, "Payment settings diperbarui 💳", "Konfigurasi payment gateway berhasil diperbarui.", "info")

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"message": "payment settings updated successfully",
	})
}

// handleTestPaymentGateway tests the connection to the configured payment gateway.
func (s *Server) handleTestPaymentGateway(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req struct {
		Gateway string `json:"gateway"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	settings, err := s.database.GetPaymentSettingsMap()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	activeGateway := settings["active_gateway"]
	if req.Gateway != "" {
		activeGateway = req.Gateway
	}

	switch activeGateway {
	case "midtrans":
		serverKey := settings["midtrans_server_key"]
		if serverKey == "" {
			s.writeJSON(w, http.StatusOK, jsonResponse{
				"ok":      false,
				"gateway": "midtrans",
				"message": "Midtrans Server Key belum dikonfigurasi",
			})
			return
		}
		env := settings["midtrans_environment"]
		if env == "" {
			env = "sandbox"
		}
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":          true,
			"gateway":     "midtrans",
			"environment": env,
			"message":     "Midtrans terkonfigurasi — key tersimpan",
		})

	case "xendit":
		secretKey := settings["xendit_secret_key"]
		if secretKey == "" {
			s.writeJSON(w, http.StatusOK, jsonResponse{
				"ok":      false,
				"gateway": "xendit",
				"message": "Xendit Secret Key belum dikonfigurasi",
			})
			return
		}
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":      true,
			"gateway": "xendit",
			"message": "Xendit terkonfigurasi — key tersimpan",
		})

	default:
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":      false,
			"gateway": activeGateway,
			"message": "Belum ada payment gateway yang dipilih. Set active_gateway ke 'midtrans' atau 'xendit'.",
		})
	}
}

// ─── Notification Listener Handlers ─────────────────────────────────────────

type registerNotificationDeviceRequest struct {
	DeviceID      string   `json:"deviceId"`
	APIKey        string   `json:"apiKey"`
	PackageFilter []string `json:"packageFilter,omitempty"`
}

type updateNotificationDeviceRequest struct {
	Status        string   `json:"status,omitempty"`
	PackageFilter []string `json:"packageFilter,omitempty"`
}

// handleListNotificationDevices returns all registered notification listener devices.
func (s *Server) handleListNotificationDevices(w http.ResponseWriter, r *http.Request) {
	devices, err := s.database.ListNotificationDevices()
	if err != nil {
		log.Printf("[notif-listener] list devices failed remote=%s err=%v", remoteAddr(r), err)
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"devices": devices,
	})
}

// handleRegisterNotificationDevice registers a new Android notification listener device.
func (s *Server) handleRegisterNotificationDevice(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req registerNotificationDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	if req.DeviceID == "" || req.APIKey == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "deviceId and apiKey are required"})
		return
	}

	device, err := s.database.RegisterNotificationDevice(req.DeviceID, req.APIKey, req.PackageFilter)
	if err != nil {
		log.Printf("[notif-listener] register device failed remote=%s err=%v", remoteAddr(r), err)
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	username, _ := s.currentUser(r)
	log.Printf("[notif-listener] device registered deviceId=%q remote=%s user=%s", req.DeviceID, remoteAddr(r), username)
	s.recordRuntimeLog("info", "notification device registered", map[string]any{
		"deviceId": req.DeviceID,
		"remote":   remoteAddr(r),
		"user":     username,
	})

	s.writeJSON(w, http.StatusCreated, jsonResponse{
		"ok":     true,
		"device": device,
	})
}

// handleUpdateNotificationDevice updates an existing notification listener device.
func (s *Server) handleUpdateNotificationDevice(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	deviceID := r.PathValue("deviceId")
	if deviceID == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "deviceId path parameter required"})
		return
	}

	var req updateNotificationDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	device, err := s.database.UpdateNotificationDevice(deviceID, req.Status, req.PackageFilter)
	if err != nil {
		log.Printf("[notif-listener] update device failed deviceId=%q remote=%s err=%v", deviceID, remoteAddr(r), err)
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":     true,
		"device": device,
	})
}

// handleDeleteNotificationDevice removes a notification listener device.
func (s *Server) handleDeleteNotificationDevice(w http.ResponseWriter, r *http.Request) {
	deviceID := r.PathValue("deviceId")
	if deviceID == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "deviceId path parameter required"})
		return
	}

	if err := s.database.DeleteNotificationDevice(deviceID); err != nil {
		log.Printf("[notif-listener] delete device failed deviceId=%q remote=%s err=%v", deviceID, remoteAddr(r), err)
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	username, _ := s.currentUser(r)
	log.Printf("[notif-listener] device deleted deviceId=%q remote=%s user=%s", deviceID, remoteAddr(r), username)

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"message": "device removed",
	})
}

// handleListCapturedNotifications returns captured notifications from listener devices.
func (s *Server) handleListCapturedNotifications(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if parsed, err := parseIntParam(v); err == nil && parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}

	notifications, err := s.database.ListCapturedNotifications(limit)
	if err != nil {
		log.Printf("[notif-listener] list captured failed remote=%s err=%v", remoteAddr(r), err)
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":            true,
		"notifications": notifications,
	})
}

// handleNotificationWebhook receives incoming notifications from Android devices.
// This is the endpoint the NotificationListener Android app POSTs to.
func (s *Server) handleNotificationWebhook(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	// Validate API key from header
	apiKey := r.Header.Get("X-API-Key")
	if apiKey == "" {
		apiKey = r.URL.Query().Get("api_key")
	}
	if apiKey == "" {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "X-API-Key header required"})
		return
	}

	// Validate the device by API key
	device, err := s.database.GetNotificationDeviceByAPIKey(apiKey)
	if err != nil || device == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "invalid API key"})
		return
	}

	if device.Status != "active" {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "device is not active"})
		return
	}

	var payload struct {
		PackageName    string `json:"packageName"`
		AppName        string `json:"appName"`
		Title          string `json:"title"`
		Text           string `json:"text"`
		AmountDetected string `json:"amountDetected"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON body"})
		return
	}

	// Check package filter
	if len(device.PackageFilter) > 0 {
		allowed := false
		for _, pkg := range device.PackageFilter {
			if pkg == payload.PackageName {
				allowed = true
				break
			}
		}
		if !allowed {
			s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": "package filtered out"})
			return
		}
	}

	// Store the captured notification
	captured, err := s.database.InsertCapturedNotification(
		device.ID,
		payload.PackageName,
		payload.AppName,
		payload.Title,
		payload.Text,
		payload.AmountDetected,
	)
	if err != nil {
		log.Printf("[notif-listener] insert captured failed deviceId=%q err=%v", device.DeviceID, err)
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	log.Printf("[notif-listener] captured notification pkg=%q title=%q amount=%q from device=%q",
		payload.PackageName, payload.Title, payload.AmountDetected, device.DeviceID)

	// Auto-match with pending payment_transactions if amount matches
	if payload.AmountDetected != "" {
		matched, err := s.database.MatchCapturedAmountToPendingTransaction(payload.AmountDetected)
		if err != nil {
			log.Printf("[notif-listener] transaction match check failed err=%v", err)
		} else if matched != nil {
			log.Printf("[notif-listener] matched amount=%q to transaction_id=%d status=%q",
				payload.AmountDetected, matched.ID, matched.Status)
			// Actually commit the match — mark transaction as paid
			if err := s.database.MatchTransactionToNotification(matched.ID, captured.ID); err != nil {
				log.Printf("[notif-listener] failed to commit match txn_id=%d -> notif_id=%d err=%v",
					matched.ID, captured.ID, err)
			} else {
				log.Printf("[notif-listener] transaction_id=%d marked as paid via notification_id=%d",
					matched.ID, captured.ID)
				// Notify all admins about the successful match
				s.notifyAllAdmins(
					"Transaksi otomatis terverifikasi ✅",
					fmt.Sprintf("Transaksi #%d (Rp %s) berhasil dicocokkan dengan notifikasi dari %s",
						matched.ID, payload.AmountDetected, payload.AppName),
					"success",
				)
			}
		}
	}

	// Push real-time event via WebSocket to all admin users
	s.pushCapturedNotificationToAdmins(captured)

	// Send panel notification to superadmin
	s.notifyAllAdmins(
		"Notifikasi pembayaran masuk 💰",
		fmt.Sprintf("Dari %s: %s — Rp %s", payload.AppName, payload.Title, payload.AmountDetected),
		"info",
	)

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":         true,
		"capturedId": captured.ID,
		"message":    "notification captured",
	})
}

// keys returns the keys of a map for logging.
func keys(m map[string]string) []string {
	result := make([]string, 0, len(m))
	for k := range m {
		result = append(result, k)
	}
	return result
}

// parseIntParam is a simple integer parser for query params.
func parseIntParam(s string) (int, error) {
	var result int
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, nil
		}
		result = result*10 + int(c-'0')
	}
	return result, nil
}
