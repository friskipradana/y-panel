package httpserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type renewLicenseRequest struct {
	CatalogID     string `json:"catalogId"`
	Months        int    `json:"months"`
	PlanName      string `json:"planName"`
	Period        string `json:"period"`
	PriceAmount   int64  `json:"priceAmount"`
	PaymentMethod string `json:"paymentMethod"`
}

func (s *Server) handleAppLicensesList(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	if s.database == nil || !s.database.IsConnected() {
		// Mock fallback if DB is not connected
		now := time.Now()
		expiresAt := now.AddDate(0, 1, 0)
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok": true,
			"licenses": []map[string]any{
				{
					"id":          1,
					"userId":      actor.ID,
					"catalogId":   "reneo-crm",
					"appName":     "Reneo CRM Services",
					"licenseKey":  "RN-CRM-DEMO-2026",
					"status":      "ACTIVE",
					"planName":    "Bulanan (Pro)",
					"period":      "monthly",
					"priceAmount": 99000,
					"startedAt":   now.Format(time.RFC3339),
					"expiresAt":   expiresAt.Format(time.RFC3339),
					"daysLeft":    30,
					"isExpired":   false,
					"features": map[string]any{
						"unlimitedBroadcast": true,
						"birthdayBot":        true,
						"liveChat":           true,
						"maxContacts":        10000,
						"wahaSync":           true,
					},
					"createdAt": now.Format(time.RFC3339),
					"updatedAt": now.Format(time.RFC3339),
				},
			},
		})
		return
	}

	licenses, err := s.database.ListAppLicenses(actor.ID)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":       true,
		"licenses": licenses,
	})
}

func (s *Server) handleAppLicensesRenew(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	var req renewLicenseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid payload: " + err.Error()})
		return
	}

	if req.CatalogID == "" {
		req.CatalogID = "reneo-crm"
	}
	if req.Months <= 0 {
		req.Months = 1
	}

	if s.database == nil || !s.database.IsConnected() {
		// Mock response if DB is not connected
		now := time.Now()
		expiresAt := now.AddDate(0, req.Months, 0)
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":      true,
			"message": fmt.Sprintf("Lisensi berhasil diperpanjang selama %d bulan.", req.Months),
			"license": map[string]any{
				"id":          1,
				"userId":      actor.ID,
				"catalogId":   req.CatalogID,
				"appName":     "Reneo CRM Services",
				"licenseKey":  "RN-CRM-DEMO-2026",
				"status":      "ACTIVE",
				"planName":    req.PlanName,
				"period":      req.Period,
				"priceAmount": req.PriceAmount,
				"startedAt":   now.Format(time.RFC3339),
				"expiresAt":   expiresAt.Format(time.RFC3339),
				"daysLeft":    req.Months * 30,
				"isExpired":   false,
			},
		})
		return
	}

	lic, err := s.database.RenewAppLicense(actor.ID, req.CatalogID, req.Months, req.PlanName, req.Period, req.PriceAmount)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.notifyUserAction(actor.ID, "Lisensi Berhasil Diperpanjang", fmt.Sprintf("Langganan %s berhasil diperpanjang selama %d bulan.", lic.AppName, req.Months), "success")

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"message": fmt.Sprintf("Lisensi %s berhasil diperpanjang selama %d bulan.", lic.AppName, req.Months),
		"license": lic,
	})
}
