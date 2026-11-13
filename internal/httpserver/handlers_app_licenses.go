package httpserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

type renewLicenseRequest struct {
	CatalogID     string `json:"catalogId"`
	Months        int    `json:"months"`
	PlanName      string `json:"planName"`
	Period        string `json:"period"`
	PriceAmount   int64  `json:"priceAmount"`
	PaymentMethod string `json:"paymentMethod"`
}

type createAppLicenseOrderRequest struct {
	CatalogID     string `json:"catalogId"`
	PlanSlug      string `json:"planSlug"`
	PaymentMethod string `json:"paymentMethod"`
	BuyerName     string `json:"buyerName"`
	BuyerEmail    string `json:"buyerEmail"`
	BuyerPhone    string `json:"buyerPhone"`
}

type payAppLicenseOrderRequest struct {
	PaymentMethod string `json:"paymentMethod"`
}

func (s *Server) getActivePaymentMethods() []orderMethod {
	methods := activeOrderMethods(s.loadSiteSettings())
	if len(methods) == 0 {
		return []orderMethod{
			{
				ID:      "qris-default",
				Kind:    "qris",
				Name:    "QRIS Instan Reneo",
				Account: "NMID: ID1020030040050",
				Holder:  "PT RENEO TEKNOLOGI INDONESIA",
				Enabled: true,
			},
			{
				ID:      "bca-default",
				Kind:    "bank",
				Name:    "Bank Central Asia (BCA)",
				Account: "8831-2940-11",
				Holder:  "Reneo Payments",
				Enabled: true,
			},
			{
				ID:      "mandiri-default",
				Kind:    "bank",
				Name:    "Bank Mandiri",
				Account: "137-00-1928472-1",
				Holder:  "Reneo Payments",
				Enabled: true,
			},
		}
	}
	return methods
}

// handleAppLicensePlans returns pricing packages for an application (e.g. reneo-crm).
func (s *Server) handleAppLicensePlans(w http.ResponseWriter, r *http.Request) {
	catalogID := r.PathValue("catalogId")
	if catalogID == "" {
		catalogID = "reneo-crm"
	}

	appName := "Reneo CRM Services"
	if catalogID != "reneo-crm" {
		appName = catalogID
	}

	if s.database == nil || !s.database.IsConnected() {
		plans, _ := s.database.ListAppLicensePlans(catalogID)
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":        true,
			"catalogId": catalogID,
			"appName":   appName,
			"plans":     plans,
		})
		return
	}

	plans, err := s.database.ListAppLicensePlans(catalogID)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":        true,
		"catalogId": catalogID,
		"appName":   appName,
		"plans":     plans,
	})
}

// handleAppLicenseCreateOrder creates a new subscription order and issues an invoice.
func (s *Server) handleAppLicenseCreateOrder(w http.ResponseWriter, r *http.Request) {
	var req createAppLicenseOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid payload: " + err.Error()})
		return
	}

	if req.CatalogID == "" {
		req.CatalogID = "reneo-crm"
	}
	if req.PlanSlug == "" {
		req.PlanSlug = "pro-monthly"
	}

	userID := int64(1)
	if actor := s.currentUserRecord(r); actor != nil {
		userID = actor.ID
		if req.BuyerName == "" {
			req.BuyerName = actor.DisplayName
			if req.BuyerName == "" {
				req.BuyerName = actor.Username
			}
		}
		if req.BuyerEmail == "" {
			req.BuyerEmail = actor.Email
		}
	}

	if req.BuyerName == "" {
		req.BuyerName = "Pelanggan Reneo"
	}

	appName := "Reneo CRM Services"
	if req.CatalogID != "reneo-crm" {
		appName = req.CatalogID
	}

	var plan *database.AppLicensePlan
	if s.database != nil && s.database.IsConnected() {
		plan, _ = s.database.GetAppLicensePlan(req.CatalogID, req.PlanSlug)
	}

	planName := "Pro Bulanan"
	period := "monthly"
	months := 1
	priceAmount := int64(99000)

	if plan != nil {
		planName = plan.Name
		period = plan.Period
		months = plan.Months
		priceAmount = plan.PriceAmount
	} else if req.PlanSlug == "starter-monthly" {
		planName = "Starter Bulanan"
		period = "monthly"
		months = 1
		priceAmount = 49000
	} else if req.PlanSlug == "enterprise-annual" {
		planName = "Enterprise Tahunan"
		period = "annual"
		months = 12
		priceAmount = 990000
	}

	if req.PaymentMethod == "" {
		req.PaymentMethod = "transfer"
	}

	orderData := database.AppLicenseOrder{
		UserID:        userID,
		CatalogID:     req.CatalogID,
		AppName:       appName,
		PlanSlug:      req.PlanSlug,
		PlanName:      planName,
		Period:        period,
		Months:        months,
		AmountList:    priceAmount,
		Status:        "pending",
		PaymentMethod: req.PaymentMethod,
		BuyerName:     req.BuyerName,
		BuyerEmail:    req.BuyerEmail,
		BuyerPhone:    req.BuyerPhone,
		CreatedIP:     clientIP(r),
	}

	var created *database.AppLicenseOrder
	var err error
	if s.database != nil && s.database.IsConnected() {
		created, err = s.database.CreateAppLicenseOrder(orderData)
		if err != nil {
			s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
			return
		}
	} else {
		now := time.Now()
		orderData.ID = 1
		orderData.PublicID = "rn" + now.Format("060102150405")
		orderData.InvoiceNumber = fmt.Sprintf("INV-CRM-%s-%04d", now.Format("200601"), 1)
		orderData.UniqueCode = 123
		orderData.AmountTotal = orderData.AmountList + int64(orderData.UniqueCode)
		orderData.CreatedAt = now
		orderData.ExpiresAt = now.Add(24 * time.Hour)
		created = &orderData
	}

	methods := s.getActivePaymentMethods()

	s.notifyUserAction(
		userID,
		"Invoice Lisensi Diterbitkan",
		fmt.Sprintf("Invoice %s untuk paket %s sebesar Rp %s siap dibayarkan.", created.InvoiceNumber, created.PlanName, rupiah(created.AmountTotal)),
		"info",
	)

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":             true,
		"message":        "Invoice pesanan lisensi berhasil diterbitkan",
		"order":          created,
		"paymentMethods": methods,
		"invoiceUrl":     fmt.Sprintf("/order/license/%s/invoice", created.PublicID),
	})
}

// handleAppLicenseGetOrder returns order details, status, and payment instructions.
func (s *Server) handleAppLicenseGetOrder(w http.ResponseWriter, r *http.Request) {
	publicID := r.PathValue("publicId")
	if publicID == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "publicId required"})
		return
	}

	if s.database == nil || !s.database.IsConnected() {
		now := time.Now()
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok": true,
			"order": database.AppLicenseOrder{
				ID:            1,
				PublicID:      publicID,
				InvoiceNumber: "INV-CRM-DEMO-0001",
				CatalogID:     "reneo-crm",
				AppName:       "Reneo CRM Services",
				PlanName:      "Pro Bulanan",
				AmountList:    99000,
				UniqueCode:    123,
				AmountTotal:   99123,
				Status:        "pending",
				CreatedAt:     now,
				ExpiresAt:     now.Add(24 * time.Hour),
			},
			"paymentMethods": s.getActivePaymentMethods(),
		})
		return
	}

	order, err := s.database.GetAppLicenseOrderByPublicID(publicID)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}
	if order == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "order not found"})
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":             true,
		"order":          order,
		"paymentMethods": s.getActivePaymentMethods(),
	})
}

// handleAppLicensePayOrder settles an order and extends the app license.
func (s *Server) handleAppLicensePayOrder(w http.ResponseWriter, r *http.Request) {
	publicID := r.PathValue("publicId")
	if publicID == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "publicId required"})
		return
	}

	var req payAppLicenseOrderRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.PaymentMethod == "" {
		req.PaymentMethod = "saldo"
	}

	if s.database == nil || !s.database.IsConnected() {
		now := time.Now()
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":      true,
			"message": "Pembayaran berhasil diverifikasi. Lisensi telah aktif!",
			"order": database.AppLicenseOrder{
				PublicID:      publicID,
				InvoiceNumber: "INV-CRM-DEMO-0001",
				Status:        "paid",
				PaidAt:        &now,
			},
		})
		return
	}

	order, err := s.database.MarkAppLicenseOrderPaid(publicID, req.PaymentMethod)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.notifyUserAction(
		order.UserID,
		"Pembayaran Lisensi Lunas",
		fmt.Sprintf("Invoice %s berhasil dilunasi. Lisensi %s paket %s telah aktif!", order.InvoiceNumber, order.AppName, order.PlanName),
		"success",
	)

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"message": "Pembayaran berhasil diverifikasi. Lisensi telah aktif!",
		"order":   order,
	})
}

// handleAppLicensesList returns user's active licenses.
func (s *Server) handleAppLicensesList(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	catalogID := r.URL.Query().Get("catalogId")

	if s.database == nil || !s.database.IsConnected() {
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

	licenses, err := s.database.ListAppLicenses(actor.ID, catalogID)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":       true,
		"licenses": licenses,
	})
}

// handleAppLicensesOrdersList lists past and pending orders/invoices for the current user.
func (s *Server) handleAppLicensesOrdersList(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	catalogID := r.URL.Query().Get("catalogId")

	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":     true,
			"orders": []database.AppLicenseOrder{},
		})
		return
	}

	orders, err := s.database.ListAppLicenseOrders(actor.ID, catalogID)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":     true,
		"orders": orders,
	})
}

// handleAppLicensesRenew handles direct renewal.
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

// handlePublicAppLicenseInvoice returns a full invoice view for an app license order.
func (s *Server) handlePublicAppLicenseInvoice(w http.ResponseWriter, r *http.Request) {
	publicID := r.PathValue("publicId")
	if publicID == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "publicId required"})
		return
	}

	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}

	order, err := s.database.GetAppLicenseOrderByPublicID(publicID)
	if err != nil || order == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "order not found"})
		return
	}

	settings := s.loadSiteSettings()
	seller := invoiceParty{
		Name:    settings.InvoiceName,
		Address: settings.InvoiceAddress,
		Contact: settings.InvoiceContact,
	}
	if seller.Name == "" {
		seller.Name = "Reneo Platform"
	}

	buyer := invoiceParty{
		Name:    order.BuyerName,
		Email:   order.BuyerEmail,
		Contact: order.BuyerPhone,
	}

	view := invoiceView{
		Number:      order.InvoiceNumber,
		Status:      order.Status,
		IssuedAt:    order.CreatedAt,
		DueAt:       order.ExpiresAt,
		PaidAt:      order.PaidAt,
		Seller:      seller,
		Buyer:       buyer,
		Note:        settings.InvoiceNote,
		Kind:        "app-license",
		PlanName:    fmt.Sprintf("%s - %s", order.AppName, order.PlanName),
		Periods:     order.Months,
		Months:      order.Months,
		AmountList:  order.AmountList,
		UniqueCode:  order.UniqueCode,
		AmountTotal: order.AmountTotal,
	}

	if order.Status == "pending" {
		view.Payment = &paymentInstructions{Methods: s.getActivePaymentMethods()}
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"invoice": view,
	})
}

type createAppLicensePayload struct {
	CatalogID   string          `json:"catalogId"`
	AppName     string          `json:"appName"`
	LicenseKey  string          `json:"licenseKey"`
	Status      string          `json:"status"` // ACTIVE, TRIAL, EXPIRED
	PlanName    string          `json:"planName"`
	Period      string          `json:"period"` // monthly, annual, lifetime, trial
	PriceAmount int64           `json:"priceAmount"`
	Months      int             `json:"months"` // 1, 3, 6, 12, 0=lifetime, -1=trial
	ExpiresAt   string          `json:"expiresAt"`
	Features    json.RawMessage `json:"features"`
}

// handleAppLicensesCreate allows creating a license directly for any application.
func (s *Server) handleAppLicensesCreate(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	var req createAppLicensePayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid payload: " + err.Error()})
		return
	}

	if req.CatalogID == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "catalogId required"})
		return
	}
	if req.AppName == "" {
		req.AppName = req.CatalogID
	}
	if req.PlanName == "" {
		req.PlanName = "Bulanan (Pro)"
	}
	if req.Period == "" {
		req.Period = "monthly"
	}
	if req.Status == "" {
		req.Status = "ACTIVE"
	}

	now := time.Now()
	var expiresAt time.Time
	if req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, req.ExpiresAt)
		if err == nil {
			expiresAt = t
		}
	}
	if expiresAt.IsZero() {
		switch req.Months {
		case 0:
			// Lifetime (100 years)
			expiresAt = now.AddDate(100, 0, 0)
			req.Period = "lifetime"
		case -1:
			// Trial 14 days
			expiresAt = now.AddDate(0, 0, 14)
			req.Period = "trial"
			req.Status = "TRIAL"
		default:
			if req.Months <= 0 {
				req.Months = 1
			}
			expiresAt = now.AddDate(0, req.Months, 0)
		}
	}

	licData := database.AppLicense{
		UserID:      actor.ID,
		CatalogID:   req.CatalogID,
		AppName:     req.AppName,
		LicenseKey:  req.LicenseKey,
		Status:      req.Status,
		PlanName:    req.PlanName,
		Period:      req.Period,
		PriceAmount: req.PriceAmount,
		StartedAt:   now.Format(time.RFC3339),
		ExpiresAt:   expiresAt.Format(time.RFC3339),
		Features:    req.Features,
	}

	if s.database == nil || !s.database.IsConnected() {
		licData.ID = 1
		s.writeJSON(w, http.StatusCreated, jsonResponse{"ok": true, "license": licData})
		return
	}

	created, err := s.database.CreateAppLicense(licData)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.notifyUserAction(actor.ID, "Lisensi Baru Dibuat", fmt.Sprintf("Lisensi baru untuk aplikasi %s (%s) berhasil diterbitkan.", created.AppName, created.LicenseKey), "success")

	s.writeJSON(w, http.StatusCreated, jsonResponse{
		"ok":      true,
		"message": "Lisensi aplikasi berhasil dibuat",
		"license": created,
	})
}

// handleAppLicensesUpdate updates an existing license.
func (s *Server) handleAppLicensesUpdate(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid license ID"})
		return
	}

	var req createAppLicensePayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid payload: " + err.Error()})
		return
	}

	licData := database.AppLicense{
		AppName:     req.AppName,
		Status:      req.Status,
		PlanName:    req.PlanName,
		Period:      req.Period,
		PriceAmount: req.PriceAmount,
		ExpiresAt:   req.ExpiresAt,
		Features:    req.Features,
	}

	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "license": licData})
		return
	}

	updated, err := s.database.UpdateAppLicense(id, actor.ID, licData)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"message": "Lisensi berhasil diperbarui",
		"license": updated,
	})
}

// handleAppLicensesDelete deletes an existing license.
func (s *Server) handleAppLicensesDelete(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid license ID"})
		return
	}

	if s.database != nil && s.database.IsConnected() {
		if err := s.database.DeleteAppLicense(id, actor.ID); err != nil {
			s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
			return
		}
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": "Lisensi berhasil dihapus"})
}

// handleAppLicensesVerify provides license validation for internal or external applications.
func (s *Server) handleAppLicensesVerify(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	if key == "" {
		key = r.Header.Get("X-License-Key")
	}
	catalogID := r.URL.Query().Get("catalogId")

	if key == "" && catalogID == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "license key or catalogId required", "valid": false})
		return
	}

	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":      true,
			"valid":   true,
			"status":  "ACTIVE",
			"message": "Demo mode license is active",
		})
		return
	}

	var lic *database.AppLicense
	var err error
	if key != "" {
		lic, err = s.database.GetAppLicenseByKey(key)
	} else if catalogID != "" {
		userID := int64(1)
		if actor := s.currentUserRecord(r); actor != nil {
			userID = actor.ID
		}
		lic, err = s.database.GetAppLicense(userID, catalogID)
	}

	if err != nil || lic == nil {
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":      false,
			"valid":   false,
			"status":  "NOT_FOUND",
			"message": "Lisensi tidak ditemukan atau belum terdaftar.",
		})
		return
	}

	if catalogID != "" && lic.CatalogID != catalogID {
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":      false,
			"valid":   false,
			"status":  "INVALID_APP",
			"message": fmt.Sprintf("Kunci lisensi ini untuk aplikasi '%s', bukan '%s'", lic.CatalogID, catalogID),
		})
		return
	}

	valid := !lic.IsExpired && (lic.Status == "ACTIVE" || lic.Status == "TRIAL")

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":         true,
		"valid":      valid,
		"status":     lic.Status,
		"appName":    lic.AppName,
		"catalogId":  lic.CatalogID,
		"licenseKey": lic.LicenseKey,
		"planName":   lic.PlanName,
		"period":     lic.Period,
		"daysLeft":   lic.DaysLeft,
		"isExpired":  lic.IsExpired,
		"startedAt":  lic.StartedAt,
		"expiresAt":  lic.ExpiresAt,
		"features":   lic.Features,
	})
}

// handleAppLicensesAvailableApps returns all apps known in the system (catalog, projects, and custom).
func (s *Server) handleAppLicensesAvailableApps(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	type appItem struct {
		CatalogID string `json:"catalogId"`
		Name      string `json:"name"`
		Type      string `json:"type"` // catalog | project | custom
	}

	seen := make(map[string]bool)
	apps := make([]appItem, 0)

	addApp := func(cid, name, appType string) {
		if cid == "" || seen[cid] {
			return
		}
		seen[cid] = true
		if name == "" {
			name = cid
		}
		apps = append(apps, appItem{CatalogID: cid, Name: name, Type: appType})
	}

	// 1. Built-in catalog app Reneo CRM
	addApp("reneo-crm", "Reneo CRM Services", "catalog")

	// 2. Installed apps from catalog
	if s.database != nil && s.database.IsConnected() {
		if installed, err := s.database.ListInstalledApps(actor.ID); err == nil {
			for _, it := range installed {
				addApp(it.CatalogID, it.Name, "catalog")
			}
		}

		// 3. Projects created on server
		if projs, err := s.database.ListProjects(actor.ID); err == nil {
			for _, p := range projs {
				slug := "proj-" + strings.ToLower(strings.ReplaceAll(p.Name, " ", "-"))
				addApp(slug, p.Name, "project")
			}
		}

		// 4. Any other custom apps already in app_licenses or app_license_plans
		if distinct, err := s.database.ListDistinctAppCatalogIDs(); err == nil {
			for _, cid := range distinct {
				addApp(cid, cid, "custom")
			}
		}
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":   true,
		"apps": apps,
	})
}

// handleAppLicensePlansCreate creates or updates a plan tier for an application.
func (s *Server) handleAppLicensePlansCreate(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	var plan database.AppLicensePlan
	if err := json.NewDecoder(r.Body).Decode(&plan); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid payload: " + err.Error()})
		return
	}

	if plan.CatalogID == "" || plan.Name == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "catalogId and name required"})
		return
	}

	if s.database == nil || !s.database.IsConnected() {
		plan.ID = 1
		s.writeJSON(w, http.StatusCreated, jsonResponse{"ok": true, "plan": plan})
		return
	}

	created, err := s.database.CreateAppLicensePlan(plan)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.writeJSON(w, http.StatusCreated, jsonResponse{
		"ok":      true,
		"message": "Paket tarif aplikasi berhasil disimpan",
		"plan":    created,
	})
}

// handleAppLicensePlansDelete deletes a plan tier by ID.
func (s *Server) handleAppLicensePlansDelete(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid plan ID"})
		return
	}

	if s.database != nil && s.database.IsConnected() {
		if err := s.database.DeleteAppLicensePlan(id); err != nil {
			s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
			return
		}
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": "Paket tarif berhasil dihapus"})
}
