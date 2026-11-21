package httpserver

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

func (s *Server) appTokenSigningKey() []byte {
	if s == nil {
		return nil
	}
	secret := strings.TrimSpace(s.cfg.SessionSecret)
	if secret == "" {
		secret = strings.TrimSpace(s.cfg.EncryptionKey)
	}
	if secret == "" {
		return nil
	}
	sum := sha256.Sum256([]byte("reneo.app.token.v1|" + secret))
	return sum[:]
}

func (s *Server) signAppToken(userID int64, catalogID string, appID int64) string {
	key := s.appTokenSigningKey()
	if len(key) == 0 || userID <= 0 || strings.TrimSpace(catalogID) == "" {
		return ""
	}
	payload := fmt.Sprintf("v1|%d|%s|%d", userID, strings.TrimSpace(catalogID), appID)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(payload))
	return payload + "|" + hex.EncodeToString(mac.Sum(nil))
}

func (s *Server) parseAppToken(raw string) (userID int64, catalogID string, appID int64, ok bool) {
	key := s.appTokenSigningKey()
	if len(key) == 0 {
		return 0, "", 0, false
	}
	parts := strings.Split(strings.TrimSpace(raw), "|")
	if len(parts) != 5 || parts[0] != "v1" {
		return 0, "", 0, false
	}
	uid, err1 := strconv.ParseInt(parts[1], 10, 64)
	aid, err2 := strconv.ParseInt(parts[3], 10, 64)
	cat := strings.TrimSpace(parts[2])
	if err1 != nil || uid <= 0 || err2 != nil || aid < 0 || cat == "" {
		return 0, "", 0, false
	}
	payload := strings.Join(parts[:4], "|")
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(payload))
	expectedHex := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expectedHex), []byte(strings.ToLower(parts[4]))) {
		return 0, "", 0, false
	}
	return uid, cat, aid, true
}

func extractRequestAppToken(r *http.Request) string {
	if r == nil {
		return ""
	}
	if tok := strings.TrimSpace(r.Header.Get("X-Reneo-App-Token")); tok != "" {
		return tok
	}
	if authz := strings.TrimSpace(r.Header.Get("Authorization")); len(authz) > 7 && strings.EqualFold(authz[:7], "Bearer ") {
		return strings.TrimSpace(authz[7:])
	}
	return ""
}

func (s *Server) resolveLicenseAppActor(r *http.Request, expectedCatalogID string) (userID int64, appID int64, authenticated bool) {
	if actor := s.currentUserRecord(r); actor != nil {
		return actor.ID, 0, true
	}
	if tok := extractRequestAppToken(r); tok != "" {
		uid, cat, aid, ok := s.parseAppToken(tok)
		if ok && uid > 0 && (expectedCatalogID == "" || strings.EqualFold(cat, expectedCatalogID)) {
			return uid, aid, true
		}
	}
	return 0, 0, false
}

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
	PlanName      string `json:"planName,omitempty"`
	Months        int    `json:"months,omitempty"`
	AmountList    int64  `json:"amountList,omitempty"`
	Quantity      int    `json:"quantity"`
	PaymentMethod string `json:"paymentMethod"`
	BuyerName     string `json:"buyerName"`
	BuyerEmail    string `json:"buyerEmail"`
	BuyerPhone    string `json:"buyerPhone"`
}

type startAppLicenseTrialRequest struct {
	CatalogID  string `json:"catalogId"`
	PlanSlug   string `json:"planSlug"`
	TrialDays  int    `json:"trialDays"`
	BuyerPhone string `json:"buyerPhone"`
}

type appCatalogInquiryRequest struct {
	CatalogID    string `json:"catalogId"`
	Name         string `json:"name"`
	Phone        string `json:"phone"`
	BusinessName string `json:"businessName"`
	InquiryType  string `json:"inquiryType"`
	Message      string `json:"message"`
}

type payAppLicenseOrderRequest struct {
	PaymentMethod string `json:"paymentMethod"`
}

func (s *Server) getActivePaymentMethods() []orderMethod {
	return activeOrderMethods(s.loadSiteSettings())
}

// handleAppCatalogPaymentMethods returns the live payment methods configured in Reneo Panel
// so ecosystem apps (e.g. Reneo SIDesa, Reneo CRM) always show the exact same bank accounts & QRIS.
func (s *Server) handleAppCatalogPaymentMethods(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":             true,
		"paymentMethods": s.getActivePaymentMethods(),
	})
}

// licenseOrderBaseURL prefers the actual panel origin where the buyer placed or confirmed the
// license order (e.g. https://panel.reneo.my.id) rather than forcing RENEO_PUBLIC_URL or the
// root landing domain. Falls back to orderBaseURL(r) only for loopback/empty hosts.
func (s *Server) licenseOrderBaseURL(r *http.Request) string {
	if r != nil {
		for _, candidate := range []string{r.Header.Get("Origin"), r.Header.Get("Referer")} {
			if strings.TrimSpace(candidate) == "" {
				continue
			}
			if u, err := url.Parse(candidate); err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" && !isLoopbackHost(u.Host) {
				return u.Scheme + "://" + u.Host
			}
		}
		host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
		if i := strings.Index(host, ","); i > 0 {
			host = strings.TrimSpace(host[:i])
		}
		if host == "" {
			host = strings.TrimSpace(r.Host)
		}
		if host != "" && !isLoopbackHost(host) {
			scheme := "http"
			if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
				scheme = "https"
			}
			return scheme + "://" + host
		}
	}
	return s.orderBaseURL(r)
}

func isLoopbackHost(hostport string) bool {
	h := hostport
	if parsed, _, err := net.SplitHostPort(hostport); err == nil {
		h = parsed
	}
	h = strings.ToLower(strings.TrimSpace(h))
	return h == "" || h == "localhost" || h == "127.0.0.1" || h == "::1"
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

// handleAppLicenseStartTrial activates a 7-day trial license for any plan tier.
func (s *Server) handleAppLicenseStartTrial(w http.ResponseWriter, r *http.Request) {
	var req startAppLicenseTrialRequest
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
	trialDays := req.TrialDays
	if trialDays <= 0 || trialDays > 30 {
		trialDays = 7
	}

	userID := int64(1)
	if s.database != nil && s.database.IsConnected() {
		resolvedID, _, ok := s.resolveLicenseAppActor(r, req.CatalogID)
		if !ok || resolvedID <= 0 {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "authentication required"})
			return
		}
		userID = resolvedID
	} else if actor := s.currentUserRecord(r); actor != nil {
		userID = actor.ID
	}

	appName := "Reneo CRM Services"
	if req.CatalogID != "reneo-crm" {
		appName = req.CatalogID
	}

	planName := "Growth Pro Bulanan"
	features := json.RawMessage(`{"unlimitedBroadcast":true,"maxBroadcastPerMonth":0,"unlimitedContacts":false,"maxContacts":10000,"birthdayBot":true,"liveChat":true,"multiSession":true,"maxSessions":3,"multiAgent":true,"maxAgents":5,"maxUsers":5,"maxTemplates":50,"customRoles":true,"omnichannel":true,"maxChannels":4,"scheduledPosts":true,"autoReply":true,"aiAgent":false,"mcpTools":false,"exportReports":true,"wahaSync":true,"apiAccess":false,"supportPriority":"fast","maxStorageMb":1024,"maxAttachmentSizeMb":10}`)

	if s.database != nil && s.database.IsConnected() {
		if plan, _ := s.database.GetAppLicensePlan(req.CatalogID, req.PlanSlug); plan != nil {
			planName = plan.Name
			if len(plan.Features) > 0 && string(plan.Features) != "{}" {
				features = plan.Features
			}
			if plan.TrialDays <= 0 {
				s.writeJSON(w, http.StatusBadRequest, jsonResponse{
					"error": "Paket ini tidak menyediakan uji coba gratis.",
				})
				return
			}
			trialDays = plan.TrialDays
		} else if req.PlanSlug == "starter-monthly" {
			planName = "Starter Bulanan"
			features = json.RawMessage(`{"unlimitedBroadcast":false,"maxBroadcastPerMonth":1500,"unlimitedContacts":false,"maxContacts":1500,"birthdayBot":true,"liveChat":false,"multiSession":false,"maxSessions":1,"multiAgent":false,"maxAgents":1,"maxUsers":1,"maxTemplates":10,"customRoles":false,"omnichannel":false,"maxChannels":0,"scheduledPosts":false,"autoReply":true,"aiAgent":false,"mcpTools":false,"exportReports":false,"wahaSync":true,"apiAccess":false,"supportPriority":"standard","maxStorageMb":250,"maxAttachmentSizeMb":5}`)
		} else if req.PlanSlug == "business-monthly" {
			planName = "Business AI Bulanan"
			features = json.RawMessage(`{"unlimitedBroadcast":true,"maxBroadcastPerMonth":0,"unlimitedContacts":false,"maxContacts":35000,"birthdayBot":true,"liveChat":true,"multiSession":true,"maxSessions":10,"multiAgent":true,"maxAgents":12,"maxUsers":12,"maxTemplates":0,"customRoles":true,"omnichannel":true,"maxChannels":12,"scheduledPosts":true,"autoReply":true,"aiAgent":true,"mcpTools":true,"exportReports":true,"wahaSync":true,"apiAccess":true,"supportPriority":"priority","maxStorageMb":3072,"maxAttachmentSizeMb":20}`)
		} else if req.PlanSlug == "enterprise-annual" {
			planName = "Enterprise Tahunan"
			features = json.RawMessage(`{"unlimitedBroadcast":true,"maxBroadcastPerMonth":0,"unlimitedContacts":true,"maxContacts":0,"birthdayBot":true,"liveChat":true,"multiSession":true,"maxSessions":25,"multiAgent":true,"maxAgents":30,"maxUsers":30,"maxTemplates":0,"customRoles":true,"omnichannel":true,"maxChannels":0,"scheduledPosts":true,"autoReply":true,"aiAgent":true,"mcpTools":true,"exportReports":true,"wahaSync":true,"apiAccess":true,"supportPriority":"vip","maxStorageMb":10240,"maxAttachmentSizeMb":35}`)
		}

		existing, _ := s.database.ListAppLicenses(userID, req.CatalogID)
		for _, lic := range existing {
			if strings.EqualFold(lic.Status, "SUSPENDED") {
				s.writeJSON(w, http.StatusForbidden, jsonResponse{
					"error": "Lisensi aplikasi Anda sedang disuspend oleh administrator.",
				})
				return
			}
			if (strings.EqualFold(lic.Status, "ACTIVE") || strings.EqualFold(lic.Status, "TRIAL")) && !lic.IsExpired {
				s.writeJSON(w, http.StatusConflict, jsonResponse{
					"error": fmt.Sprintf("Aplikasi ini sudah memiliki 1 sesi lisensi aktif (%s). Hanya 1 lisensi aktif yang diizinkan per aplikasi.", lic.PlanName),
				})
				return
			}
			if strings.EqualFold(lic.Period, "trial") || strings.EqualFold(lic.Status, "TRIAL") || strings.Contains(strings.ToLower(lic.PlanName), "trial") {
				s.writeJSON(w, http.StatusConflict, jsonResponse{
					"error": "Masa uji coba gratis aplikasi ini sudah pernah digunakan. Silakan pilih paket berbayar untuk melanjutkan.",
				})
				return
			}
		}
	}

	now := time.Now()
	expiresAt := now.AddDate(0, 0, trialDays)
	trialPlanName := fmt.Sprintf("%s (Trial %d Hari)", planName, trialDays)

	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":      true,
			"message": fmt.Sprintf("Paket trial %s (%d hari) berhasil diaktifkan", planName, trialDays),
			"license": database.AppLicense{
				ID:          1,
				UserID:      userID,
				CatalogID:   req.CatalogID,
				AppName:     appName,
				LicenseKey:  "RN-TRIAL-DEMO-2026",
				Status:      "TRIAL",
				PlanName:    trialPlanName,
				Period:      "trial",
				PriceAmount: 0,
				StartedAt:   now.Format(time.RFC3339),
				ExpiresAt:   expiresAt.Format(time.RFC3339),
				DaysLeft:    trialDays,
				IsExpired:   false,
				Features:    features,
			},
		})
		return
	}

	created, err := s.database.CreateAppLicense(database.AppLicense{
		UserID:      userID,
		CatalogID:   req.CatalogID,
		AppName:     appName,
		Status:      "TRIAL",
		PlanName:    trialPlanName,
		Period:      "trial",
		PriceAmount: 0,
		StartedAt:   now.Format(time.RFC3339),
		ExpiresAt:   expiresAt.Format(time.RFC3339),
		Features:    features,
	})
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	normalizedPhone := ""
	if s.database != nil && s.database.IsConnected() && s.notify != nil && userID > 0 && strings.TrimSpace(req.BuyerPhone) != "" {
		if phone, normErr := notify.NormalizePhone(req.BuyerPhone); normErr == nil && phone != "" {
			normalizedPhone = phone
			if buyerKind := s.notify.BuyerChannel(); buyerKind != "" {
				_ = s.database.SaveBuyerContact(userID, buyerKind, phone)
			}
		}
	}
	if normalizedPhone != "" {
		s.notifyAllAdmins(
			"Trial Lisensi Diaktifkan",
			fmt.Sprintf("Trial %s (%s, %d hari) diaktifkan. WhatsApp: %s.", appName, planName, trialDays, normalizedPhone),
			"info",
		)
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"message": fmt.Sprintf("Paket trial %s (%d hari) berhasil diaktifkan", planName, trialDays),
		"license": created,
	})
}

// handleAppCatalogInquiry accepts public feature-request / source-code purchase inquiries
// from an application's landing page, notifies Reneo Panel superadmins via their configured
// notification channels, and sends a WhatsApp confirmation to the buyer.
func (s *Server) handleAppCatalogInquiry(w http.ResponseWriter, r *http.Request) {
	var req appCatalogInquiryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format permintaan tidak valid"})
		return
	}
	name := strings.TrimSpace(req.Name)
	rawPhone := strings.TrimSpace(req.Phone)
	msg := strings.TrimSpace(req.Message)
	if name == "" || rawPhone == "" || msg == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "nama, nomor WhatsApp, dan pesan wajib diisi"})
		return
	}
	if len(name) > 120 {
		name = name[:120]
	}
	if len(msg) > 2000 {
		msg = msg[:2000]
	}
	phone, err := notify.NormalizePhone(rawPhone)
	if err != nil || phone == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "nomor WhatsApp tidak valid"})
		return
	}

	appName := "Reneo CRM"
	if cid := strings.TrimSpace(req.CatalogID); cid != "" && cid != "reneo-crm" {
		appName = cid
	}
	topic := strings.TrimSpace(req.InquiryType)
	if topic == "" {
		topic = "Tambah Fitur / Beli Aset Program"
	}

	adminNotified := 0
	buyerNotified := false
	if s.notify != nil {
		adminNotified, buyerNotified = s.notify.SendPublicInquiry(r.Context(), notify.PublicInquiryNotice{
			AppName:      appName,
			Name:         name,
			BuyerPhone:   phone,
			BusinessName: strings.TrimSpace(req.BusinessName),
			InquiryType:  topic,
			Message:      msg,
		})
	}
	s.notifyAllAdmins(
		fmt.Sprintf("Permintaan %s: %s", appName, topic),
		fmt.Sprintf("%s (%s) — %s", name, phone, msg),
		"info",
	)

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":            true,
		"adminNotified": adminNotified,
		"buyerNotified": buyerNotified,
		"message":       "Permintaan Anda sudah kami terima. Anda akan segera mendapat balasan oleh tim kami.",
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
	actorUsername := ""
	if actor := s.currentUserRecord(r); actor != nil {
		userID = actor.ID
		actorUsername = actor.Username
		if req.BuyerName == "" {
			req.BuyerName = actor.DisplayName
			if req.BuyerName == "" {
				req.BuyerName = actor.Username
			}
		}
		if req.BuyerEmail == "" {
			req.BuyerEmail = actor.Email
		}
	} else if s.database != nil && s.database.IsConnected() {
		resolvedID, _, ok := s.resolveLicenseAppActor(r, req.CatalogID)
		if !ok || resolvedID <= 0 {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "authentication required"})
			return
		}
		userID = resolvedID
		if u, uErr := s.database.GetUserByID(userID); uErr == nil && u != nil {
			actorUsername = u.Username
			if req.BuyerName == "" {
				req.BuyerName = u.DisplayName
				if req.BuyerName == "" {
					req.BuyerName = u.Username
				}
			}
			if req.BuyerEmail == "" {
				req.BuyerEmail = u.Email
			}
		}
	}

	if req.BuyerName == "" {
		req.BuyerName = "Pelanggan Reneo"
	}

	appName := "Reneo CRM Services"
	if req.CatalogID == "reneo-sidesa" {
		appName = "Reneo SIDesa"
	} else if req.CatalogID != "reneo-crm" {
		appName = req.CatalogID
	}

	var plan *database.AppLicensePlan
	if s.database != nil && s.database.IsConnected() {
		plan, _ = s.database.GetAppLicensePlan(req.CatalogID, req.PlanSlug)
	}

	planName := "Growth Pro Bulanan"
	period := "monthly"
	months := 1
	priceAmount := int64(179000)

	if plan != nil {
		planName = plan.Name
		period = plan.Period
		months = plan.Months
		priceAmount = plan.PriceAmount
	} else if req.CatalogID == "reneo-sidesa" && req.AmountList > 0 {
		planName = strings.TrimSpace(req.PlanName)
		if planName == "" {
			planName = "Langganan Reneo SIDesa"
		}
		months = req.Months
		if months < 1 {
			months = 1
		}
		if months >= 12 {
			period = "annual"
		} else {
			period = "monthly"
		}
		priceAmount = req.AmountList
	} else if req.PlanSlug == "starter-monthly" {
		planName = "Starter Bulanan"
		period = "monthly"
		months = 1
		priceAmount = 79000
	} else if req.PlanSlug == "business-monthly" {
		planName = "Business AI Bulanan"
		period = "monthly"
		months = 1
		priceAmount = 349000
	} else if req.PlanSlug == "enterprise-annual" {
		planName = "Enterprise Tahunan"
		period = "annual"
		months = 12
		priceAmount = 3490000
	}

	if req.PaymentMethod == "" {
		req.PaymentMethod = "transfer"
	}

	qty := req.Quantity
	if qty < 1 {
		qty = 1
	}
	if qty > 24 {
		qty = 24
	}
	totalMonths := months * qty
	totalAmountList := priceAmount * int64(qty)

	orderData := database.AppLicenseOrder{
		UserID:        userID,
		CatalogID:     req.CatalogID,
		AppName:       appName,
		PlanSlug:      req.PlanSlug,
		PlanName:      planName,
		Period:        period,
		Months:        totalMonths,
		AmountList:    totalAmountList,
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

	if s.database != nil && s.database.IsConnected() && s.notify != nil && userID > 0 {
		if buyerKind := s.notify.BuyerChannel(); buyerKind != "" && strings.TrimSpace(req.BuyerPhone) != "" {
			if phone, normErr := notify.NormalizePhone(req.BuyerPhone); normErr == nil && phone != "" {
				_ = s.database.SaveBuyerContact(userID, buyerKind, phone)
			}
		}
	}

	s.notifyUserAction(
		userID,
		"Invoice Lisensi Diterbitkan",
		fmt.Sprintf("Invoice %s untuk paket %s sebesar %s siap dibayarkan.", created.InvoiceNumber, created.PlanName, rupiah(created.AmountTotal)),
		"info",
	)
	username := created.BuyerName
	if actorUsername != "" {
		username = actorUsername
	}
	s.notifyAllAdmins(
		"Pesanan Lisensi Baru",
		fmt.Sprintf("%s menerbitkan invoice %s untuk %s (%s) sebesar %s.", username, created.InvoiceNumber, created.AppName, created.PlanName, rupiah(created.AmountTotal)),
		"info",
	)
	s.emitAppLicenseOrderCreated(created, username)
	s.buyerAppLicenseOrderCreated(created, s.licenseOrderBaseURL(r))

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

	actor := s.currentUserRecord(r)
	tokUserID, tokCatalog, _, tokOK := s.parseAppToken(extractRequestAppToken(r))
	if actor == nil && !tokOK {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "authentication required"})
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

	isAdmin := actor != nil && (actor.Role == "superadmin" || actor.Role == "admin")
	allowedByUser := actor != nil && (isAdmin || order.UserID == actor.ID)
	allowedByToken := tokOK && order.UserID == tokUserID && (tokCatalog == "" || strings.EqualFold(tokCatalog, order.CatalogID))
	if !allowedByUser && !allowedByToken {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "forbidden"})
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":             true,
		"order":          order,
		"paymentMethods": s.getActivePaymentMethods(),
	})
}

func (s *Server) notifyAppLicenseOrderPaid(order *database.AppLicenseOrder, methodOrNote, publicBase string) {
	if order == nil {
		return
	}
	s.notifyUserAction(
		order.UserID,
		"Pembayaran Lisensi Lunas",
		fmt.Sprintf("Invoice %s berhasil dilunasi. Lisensi %s paket %s telah aktif!", order.InvoiceNumber, order.AppName, order.PlanName),
		"success",
	)
	username := order.BuyerName
	if s.database != nil && s.database.IsConnected() {
		if u, err := s.database.GetUserByID(order.UserID); err == nil && u != nil && u.Username != "" {
			username = u.Username
		}
	}
	s.notifyAllAdmins(
		"Pembayaran Lisensi Lunas",
		fmt.Sprintf("%s melunasi invoice %s untuk %s (%s).", username, order.InvoiceNumber, order.AppName, order.PlanName),
		"success",
	)
	s.emitAppLicenseOrderPaid(order, username, methodOrNote)
	s.buyerAppLicenseOrderPaid(order, username, publicBase)
}

// matchAppLicenseOrderPayment matches incoming bank notifications to pending app license orders by exact unique total.
func (s *Server) matchAppLicenseOrderPayment(amountDetected string, notifID int64, receivedAt time.Time) {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	total := database.NormalizeAmount(amountDetected)
	if total <= 0 {
		return
	}
	orders, err := s.database.PendingAppLicenseOrdersForTotal(total, receivedAt)
	if err != nil {
		log.Printf("[app-orders] match check failed: %v", err)
		return
	}
	if len(orders) != 1 {
		if len(orders) > 1 {
			log.Printf("[app-orders] %d pending license orders share total %d; leaving for admin review", len(orders), total)
		}
		return
	}
	order := orders[0]
	if auto, _ := s.database.GetPaymentSettingValue("auto_confirm"); auto != "true" {
		if changed, _ := s.database.SetAppLicenseOrderStatus(order.PublicID, "review"); changed {
			s.notifyAllAdmins(
				"Pembayaran Lisensi Cocok, Perlu Konfirmasi",
				fmt.Sprintf("Invoice lisensi %s (%s, Rp %d) cocok dengan notifikasi bank #%d. Konfirmasi di jendela Lisensi Aplikasi.", order.InvoiceNumber, order.BuyerName, total, notifID),
				"info",
			)
		}
		return
	}
	changed, paidOrder, err := s.database.MarkAppLicenseOrderPaidAtomic(order.PublicID, "transfer")
	if err != nil {
		log.Printf("[app-orders] order %s matched notif #%d but settle failed: %v", order.InvoiceNumber, notifID, err)
		return
	}
	if changed && paidOrder != nil {
		note := fmt.Sprintf("cocok otomatis dengan notifikasi #%d", notifID)
		s.notifyAppLicenseOrderPaid(paidOrder, note, s.orderBaseURL(nil))
	}
}

// handleAppLicensePayOrder settles an order and extends the app license.
func (s *Server) handleAppLicensePayOrder(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "authentication required"})
		return
	}
	if actor.Role != "superadmin" && actor.Role != "admin" {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "admin role required"})
		return
	}

	publicID := r.PathValue("publicId")
	if publicID == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "publicId required"})
		return
	}

	var req payAppLicenseOrderRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.PaymentMethod == "" {
		req.PaymentMethod = "transfer"
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

	changed, order, err := s.database.MarkAppLicenseOrderPaidAtomic(publicID, req.PaymentMethod)
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	if !changed {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "invoice ini sudah dilunasi sebelumnya"})
		return
	}

	s.notifyAppLicenseOrderPaid(order, req.PaymentMethod, s.licenseOrderBaseURL(r))

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"message": "Pembayaran berhasil diverifikasi. Lisensi telah aktif!",
		"order":   order,
	})
}

// handleAppLicenseCancelOrder cancels a pending invoice/order.
func (s *Server) handleAppLicenseCancelOrder(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "authentication required"})
		return
	}

	publicID := r.PathValue("publicId")
	if publicID == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "publicId required"})
		return
	}

	if s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":      true,
			"message": "Invoice berhasil dibatalkan.",
			"order": database.AppLicenseOrder{
				PublicID:      publicID,
				InvoiceNumber: "INV-CRM-DEMO-0001",
				Status:        "cancelled",
			},
		})
		return
	}

	isAdmin := actor.Role == "superadmin" || actor.Role == "admin"
	order, err := s.database.CancelAppLicenseOrder(publicID, actor.ID, isAdmin)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	s.notifyUserAction(
		order.UserID,
		"Invoice Dibatalkan",
		fmt.Sprintf("Invoice %s untuk %s (%s) telah dibatalkan.", order.InvoiceNumber, order.AppName, order.PlanName),
		"info",
	)
	s.notifyAllAdmins(
		"Invoice Lisensi Dibatalkan",
		fmt.Sprintf("Invoice %s untuk %s (%s) dibatalkan oleh %s.", order.InvoiceNumber, order.AppName, order.PlanName, actor.Username),
		"info",
	)

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"message": "Invoice berhasil dibatalkan.",
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
	UserID      int64           `json:"userId"`
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
	targetUserID := actor.ID
	if req.UserID > 0 {
		if s.database != nil && s.database.IsConnected() {
			u, err := s.database.GetUserByID(req.UserID)
			if err != nil || u == nil {
				s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "target user not found"})
				return
			}
		}
		targetUserID = req.UserID
	}
	if req.AppName == "" {
		if req.CatalogID == "reneo-crm" {
			req.AppName = "Reneo CRM Services"
		} else {
			req.AppName = req.CatalogID
		}
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
		UserID:      targetUserID,
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
		status := http.StatusInternalServerError
		if errors.Is(err, database.ErrActiveLicenseExists) {
			status = http.StatusConflict
		}
		s.writeJSON(w, status, jsonResponse{"error": err.Error()})
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

	isAdmin := actor.Role == "superadmin" || actor.Role == "admin"
	updated, err := s.database.UpdateAppLicense(id, actor.ID, isAdmin, licData)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, database.ErrActiveLicenseExists) {
			status = http.StatusConflict
		}
		s.writeJSON(w, status, jsonResponse{"error": err.Error()})
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

	isAdmin := actor.Role == "superadmin" || actor.Role == "admin"
	if s.database != nil && s.database.IsConnected() {
		if err := s.database.DeleteAppLicense(id, actor.ID, isAdmin); err != nil {
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
		userID, _, ok := s.resolveLicenseAppActor(r, catalogID)
		if !ok || userID <= 0 {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{
				"ok":      false,
				"valid":   false,
				"status":  "UNAUTHORIZED",
				"message": "Autentikasi panel atau token aplikasi diperlukan.",
			})
			return
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

	isSuspended := strings.EqualFold(lic.Status, "SUSPENDED")
	valid := !lic.IsExpired && !isSuspended && (lic.Status == "ACTIVE" || lic.Status == "TRIAL")
	features := lic.Features
	if !valid {
		features = json.RawMessage(`{"unlimitedBroadcast":false,"maxBroadcastPerMonth":0,"birthdayBot":false,"liveChat":false,"multiSession":false,"maxSessions":0,"multiAgent":false,"maxAgents":0,"maxContacts":0,"maxTemplates":0,"customRoles":false,"omnichannel":false,"maxChannels":0,"scheduledPosts":false,"autoReply":false,"aiAgent":false,"mcpTools":false,"exportReports":false,"wahaSync":false,"apiAccess":false}`)
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":          true,
		"valid":       valid,
		"status":      lic.Status,
		"appName":     lic.AppName,
		"catalogId":   lic.CatalogID,
		"licenseKey":  lic.LicenseKey,
		"planName":    lic.PlanName,
		"period":      lic.Period,
		"daysLeft":    lic.DaysLeft,
		"isExpired":   lic.IsExpired || isSuspended,
		"isSuspended": isSuspended,
		"startedAt":   lic.StartedAt,
		"expiresAt":   lic.ExpiresAt,
		"features":    features,
	})
}

// handleAppLicensesAvailableApps returns only apps specifically registered/managed for licensing.
func (s *Server) handleAppLicensesAvailableApps(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	type appItem struct {
		CatalogID string `json:"catalogId"`
		Name      string `json:"name"`
		Type      string `json:"type"` // catalog
	}

	apps := []appItem{
		{CatalogID: "reneo-crm", Name: "Reneo CRM Services", Type: "catalog"},
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":   true,
		"apps": apps,
	})
}

type appLicensePlanInput struct {
	database.AppLicensePlan
	TrialDays *int `json:"trialDays"`
}

// handleAppLicensePlansCreate creates or updates a plan tier for an application.
func (s *Server) handleAppLicensePlansCreate(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	var input appLicensePlanInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid payload: " + err.Error()})
		return
	}
	plan := input.AppLicensePlan
	if input.TrialDays != nil {
		d := *input.TrialDays
		if d < 0 {
			d = 0
		} else if d > planMaxTrialDays {
			d = planMaxTrialDays
		}
		plan.TrialDays = d
	} else {
		plan.TrialDays = 7
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

// handleAppLicensePlansUpdate updates an existing plan tier by ID.
func (s *Server) handleAppLicensePlansUpdate(w http.ResponseWriter, r *http.Request) {
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

	var input appLicensePlanInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid payload: " + err.Error()})
		return
	}
	plan := input.AppLicensePlan
	if input.TrialDays != nil {
		d := *input.TrialDays
		if d < 0 {
			d = 0
		} else if d > planMaxTrialDays {
			d = planMaxTrialDays
		}
		plan.TrialDays = d
	} else {
		plan.TrialDays = -1 // keep existing trial_days when omitted from payload
	}

	if s.database == nil || !s.database.IsConnected() {
		plan.ID = id
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "plan": plan})
		return
	}

	updated, err := s.database.UpdateAppLicensePlan(id, plan)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"message": "Paket tarif aplikasi berhasil diperbarui",
		"plan":    updated,
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
