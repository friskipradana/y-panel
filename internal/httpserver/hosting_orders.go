package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
	"github.com/friskipradana/panel-desktop-ui/internal/users"
)

// Self-service orders for hosting plans. A buyer picks a plan and signs up; the panel makes the account (it cannot
// sign in yet) and an order whose total is made unique by a small code. The buyer transfers exactly that total, the
// bank notification of the same amount is matched to the order, and the account and plan are switched on.

const (
	orderDefaultExpiryMinutes = 24 * 60
	orderMinExpiryMinutes     = 30
	orderMaxExpiryMinutes     = 7 * 24 * 60
	orderDefaultUniqueMax     = 999
	// what one address may do: orders in an hour, and trials in a day
	orderMaxPerHour   = 5
	orderMaxTrialsDay = 1
	orderMaxPeriods   = 24
	orderTextMax      = 80
)

func (s siteSettings) orderExpiry() time.Duration {
	minutes := s.OrderExpiryMinutes
	if minutes < orderMinExpiryMinutes || minutes > orderMaxExpiryMinutes {
		minutes = orderDefaultExpiryMinutes
	}
	return time.Duration(minutes) * time.Minute
}

func (s siteSettings) orderUniqueMax() int {
	if s.OrderUniqueMax < 9 || s.OrderUniqueMax > 9999 {
		return orderDefaultUniqueMax
	}
	return s.OrderUniqueMax
}

// paymentInstructions is where the buyer sends the money: any of the banks and e-wallets the seller lists
type paymentInstructions struct {
	Methods []orderMethod `json:"methods"`
}

// orderView is an order as the buyer sees it: no ids of the panel, no addresses, only what the page needs
type orderView struct {
	PublicID    string               `json:"publicId"`
	Kind        string               `json:"kind"`
	Status      string               `json:"status"`
	PlanName    string               `json:"planName"`
	Periods     int                  `json:"periods"`
	AmountBase  int64                `json:"amountBase"`
	// AmountList is the price before discounts; DiscountDuration and DiscountVoucher are what each took off
	AmountList       int64  `json:"amountList"`
	DiscountDuration int64  `json:"discountDuration"`
	DiscountVoucher  int64  `json:"discountVoucher"`
	VoucherCode      string `json:"voucherCode,omitempty"`
	AmountTotal int64                `json:"amountTotal"`
	CreatedAt   time.Time            `json:"createdAt"`
	ExpiresAt   time.Time            `json:"expiresAt"`
	PaidAt      *time.Time           `json:"paidAt"`
	Payment     *paymentInstructions `json:"payment,omitempty"`
	// Hostname is the panel address of the buyer: where they sign in once the order is paid
	Hostname string `json:"hostname,omitempty"`
}

func (s *Server) orderViewFor(o database.HostingOrder) orderView {
	view := orderView{
		PublicID: o.PublicID, Kind: o.Kind, Status: o.Status, PlanName: o.PlanName, Periods: o.Periods,
		AmountBase: o.AmountBase, AmountList: o.AmountList, DiscountDuration: o.DiscountDuration, DiscountVoucher: o.DiscountVoucher, VoucherCode: o.VoucherCode,
		AmountTotal: o.AmountTotal, CreatedAt: o.CreatedAt, ExpiresAt: o.ExpiresAt, PaidAt: o.PaidAt, Hostname: o.SubHostname,
	}
	if o.Status == database.OrderPending && o.AmountTotal > 0 {
		settings := s.loadSiteSettings()
		view.Payment = &paymentInstructions{Methods: activeOrderMethods(settings)}
	}
	return view
}

// orderMonths is how many months the order buys; zero means the plan does not end ("once")
func orderMonths(plan *database.HostingPlan, periods int) int {
	switch plan.Period {
	case "monthly":
		return periods
	case "yearly":
		return periods * 12
	}
	return 0
}

// maxPeriods is how many periods one order may buy
func maxPeriods(plan *database.HostingPlan) int {
	switch plan.Period {
	case "monthly":
		return orderMaxPeriods
	case "yearly":
		return 5
	}
	return 1
}

func (s *Server) selfServiceOn() bool {
	settings := s.loadSiteSettings()
	return settings.HostingEnabled && settings.LandingEnabled && settings.SelfSignup &&
		s.database != nil && s.database.IsConnected()
}

type createOrderRequest struct {
	PlanID      int64  `json:"planId"`
	Kind        string `json:"kind"`
	Periods     int    `json:"periods"`
	Username    string `json:"username"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
	// Voucher is a code that takes something off the price
	Voucher string `json:"voucher"`
	// the panel address: a name under one of the domains the superadmin offers
	SubLabel  string `json:"subLabel"`
	SubZoneID string `json:"subZoneId"`
	// the WhatsApp number that gets the notices about the order; required while WhatsApp can deliver them
	WhatsApp string `json:"whatsapp"`
}

// handlePublicCreateOrder signs a buyer up for a plan: the account waits for its payment (or for the trial to be approved)
func (s *Server) handlePublicCreateOrder(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.selfServiceOn() {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	var req createOrderRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.Kind == "" {
		req.Kind = database.OrderNew
	}
	if req.Kind != database.OrderNew && req.Kind != database.OrderTrial {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "kind must be new or trial"})
		return
	}
	if err := users.ValidateUsername(req.Username); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if err := users.ValidateEmail(req.Email); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if err := users.ValidatePassword(req.Password); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if utf8.RuneCountInString(req.DisplayName) > 60 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "name is at most 60 characters"})
		return
	}

	plan, _ := s.database.GetHostingPlan(req.PlanID)
	if plan == nil || !plan.Visible {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "plan not found"})
		return
	}
	if req.Periods < 1 {
		req.Periods = 1
	}
	if req.Periods > maxPeriods(plan) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": fmt.Sprintf("at most %d periods", maxPeriods(plan))})
		return
	}
	if req.Kind == database.OrderTrial && plan.TrialDays <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "this plan has no trial"})
		return
	}
	// a trial costs nothing, so a voucher has nothing to take off
	var voucher *database.HostingVoucher
	if code := strings.TrimSpace(req.Voucher); code != "" && req.Kind == database.OrderNew {
		v, reason := s.voucherCheck(code, plan, database.OrderNew, 0)
		if reason != "" {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": voucherReasonText(reason), "reason": reason})
			return
		}
		voucher = v
	}
	quote := priceFor(plan, req.Periods, voucher)

	// the number for the notices about the order
	phone := ""
	buyerKind := s.notify.BuyerChannel()
	if strings.TrimSpace(req.WhatsApp) != "" || buyerKind != "" {
		normalized, err := notify.NormalizePhone(req.WhatsApp)
		if err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
			return
		}
		phone = normalized
	}

	// the panel address comes with every plan: picked now on the main domain, held for the order, created when it is paid
	var domain *database.HostingDomain
	req.SubLabel = strings.ToLower(strings.TrimSpace(req.SubLabel))
	if main := s.mainHostingDomain(); main != nil {
		reason, offered, err := s.subdomainAvailability(req.SubLabel, main.ZoneID)
		if err != nil {
			log.Printf("[orders] subdomain check: %v", err)
			s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "the address service is not ready, try again later"})
			return
		}
		if reason != "" {
			status := http.StatusBadRequest
			if strings.Contains(reason, "taken") {
				status = http.StatusConflict
			}
			s.writeJSON(w, status, jsonResponse{"error": reason})
			return
		}
		domain = offered
	}

	// one address does not make orders without end: a few an hour, one trial a day
	ip := clientIP(r)
	now := time.Now()
	if n, err := s.database.CountRecentOrdersFromIP(ip, now.Add(-time.Hour), ""); err == nil && n >= orderMaxPerHour {
		s.notify.OrderRefused(ip)
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many orders from this address, try again later"})
		return
	}
	if req.Kind == database.OrderTrial {
		if n, err := s.database.CountRecentOrdersFromIP(ip, now.Add(-24*time.Hour), database.OrderTrial); err == nil && n >= orderMaxTrialsDay {
			s.notify.OrderRefused(ip)
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "one trial per address a day"})
			return
		}
	}

	settings := s.loadSiteSettings()
	u, err := s.auth.CreateUser(req.Username, req.Email, req.Password, auth.UserRole, req.DisplayName)
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "that username or email is already used by another account: try a different username or email", "reason": "accountTaken"})
		return
	}
	// from here a failure must not leave the account behind
	rollback := func() { _ = s.database.DeleteUser(u.ID) }
	if err := s.database.UpdateUser(u.ID, map[string]any{"status": "pending"}); err != nil {
		rollback()
		s.writeError(w, http.StatusInternalServerError, errors.New("could not create the order"))
		return
	}
	if superadmin, err := s.database.GetSuperadminID(); err == nil && superadmin > 0 {
		_ = s.database.SetUserParent(u.ID, superadmin)
	}

	if phone != "" && buyerKind != "" {
		if err := s.database.SaveBuyerContact(u.ID, buyerKind, phone); err != nil {
			log.Printf("[orders] the WhatsApp number of %q was not saved: %v", u.Username, err)
		}
	}

	planID := plan.ID
	order := database.HostingOrder{
		Kind: req.Kind, PlanID: &planID, PlanName: plan.Name, UserID: u.ID, Periods: req.Periods,
		AmountList: quote.List, DiscountDuration: quote.DurationDiscount, DiscountVoucher: quote.VoucherDiscount,
		AmountBase: quote.Subtotal, Status: database.OrderPending,
		CreatedIP: ip, ExpiresAt: now.Add(settings.orderExpiry()), PublicBase: s.orderBaseURL(r),
	}
	if voucher != nil {
		order.VoucherCode = voucher.Code
	}
	if domain != nil {
		order.SubLabel, order.SubZoneID, order.SubDomain, order.SubHostname = req.SubLabel, domain.ZoneID, domain.Name, hostnameFor(req.SubLabel, domain.Name)
	}
	switch {
	case req.Kind == database.OrderTrial:
		// a trial costs nothing: it is switched on at once, or waits for the superadmin when approval is required
		order.Periods, order.AmountBase, order.AmountList, order.DiscountDuration, order.DiscountVoucher, order.VoucherCode = 1, 0, 0, 0, 0, ""
		if settings.TrialApproval {
			order.Status = database.OrderReview
		}
	case plan.PriceAmount <= 0 || quote.Subtotal <= 0:
		// a free plan, or a price a voucher took to nothing, is the superadmin's to grant
		order.AmountBase = 0
		order.Status = database.OrderReview
	}
	created, err := s.database.CreateHostingOrder(order, settings.orderUniqueMax())
	if err != nil {
		rollback()
		if errors.Is(err, database.ErrNoFreeTotal) {
			s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": err.Error()})
			return
		}
		if errors.Is(err, database.ErrSubdomainReserved) || errors.Is(err, database.ErrVoucherUnavailable) {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
			return
		}
		s.writeError(w, http.StatusInternalServerError, errors.New("could not create the order"))
		return
	}

	if req.Kind == database.OrderTrial && !settings.TrialApproval {
		if err := s.fulfillOrder(created, nil, "trial"); err != nil {
			log.Printf("[orders] trial of %q could not be switched on: %v", u.Username, err)
		}
		if refreshed, _ := s.database.GetHostingOrder(created.ID); refreshed != nil {
			created = refreshed
		}
	} else {
		s.notifyAllAdmins("Pesanan hosting baru", fmt.Sprintf("%s memesan paket %s (%s).", u.Username, plan.Name, orderKindLabel(created)), "info")
		s.emitOrderCreated(created, u.Username, plan.Name)
		s.buyerOrderCreated(created, plan.Name)
		if created.Status == database.OrderReview {
			s.emitOrderReview(created.ID, u.Username, notify.Localized{"id": "pesanan ini menunggu persetujuan Anda.", "en": "this order waits for your approval."})
		}
	}
	s.recordRuntimeLog("info", "hosting order created", map[string]any{"user": u.Username, "plan": plan.Name, "kind": created.Kind, "remote": ip})
	s.writeJSON(w, http.StatusCreated, s.orderViewFor(*created))
}

func orderKindLabel(o *database.HostingOrder) string {
	switch o.Kind {
	case database.OrderTrial:
		return "trial"
	case database.OrderRenew:
		return "perpanjangan"
	}
	if o.AmountTotal > 0 {
		return fmt.Sprintf("Rp %d", o.AmountTotal)
	}
	return "baru"
}

// handlePublicGetOrder is the page of an order: the address holds an unguessable id, and only the
// state of the order comes back
func (s *Server) handlePublicGetOrder(w http.ResponseWriter, r *http.Request) {
	if !s.selfServiceOn() {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	publicID := strings.TrimSpace(r.PathValue("publicId"))
	if len(publicID) != 24 {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "order not found"})
		return
	}
	order, _ := s.database.GetHostingOrderByPublicID(publicID)
	if order == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "order not found"})
		return
	}
	s.writeJSON(w, http.StatusOK, s.orderViewFor(*order))
}

// orderClaims remembers the orders whose buyer already said they transferred, so pressing the button again does not alert the seller again
var orderClaims sync.Map

// handlePublicOrderTransferred is the buyer saying "I have transferred": the seller is told once that the payment of this
// order is worth checking. It changes nothing on the order; only a matching bank notification, or the seller, can mark it paid.
func (s *Server) handlePublicOrderTransferred(w http.ResponseWriter, r *http.Request) {
	if !s.selfServiceOn() {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	if allowed, _ := s.allowRateLimit("claim:"+clientIP(r), rateLimitRule{Window: time.Minute, Limit: 10}); !allowed {
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many attempts, wait a moment"})
		return
	}
	publicID := strings.TrimSpace(r.PathValue("publicId"))
	if len(publicID) != 24 {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "order not found"})
		return
	}
	order, _ := s.database.GetHostingOrderByPublicID(publicID)
	if order == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "order not found"})
		return
	}
	if order.Status == database.OrderPending {
		if _, already := orderClaims.LoadOrStore(order.ID, time.Now()); !already {
			s.alertSellerOrder(order.ID, notify.Localized{"id": fmt.Sprintf("Pesanan #%d (%s): pembeli menyatakan sudah transfer %s. Periksa apakah transfernya sudah masuk.", order.ID, order.Username, rupiah(order.AmountTotal)), "en": fmt.Sprintf("Order #%d (%s): the buyer says they have transferred %s. Check that the transfer has arrived.", order.ID, order.Username, rupiah(order.AmountTotal))}, "info")
		}
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "status": order.Status})
}

// handleRenewMyPlan makes the order that extends the plan of the signed-in account by some periods
func (s *Server) handleRenewMyPlan(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.selfServiceOn() {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	user := userFromCtx(r)
	if user == nil || user.Role == auth.SuperadminRole || s.isDemoUser(user) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "this account does not renew a plan"})
		return
	}
	var req struct {
		Periods int    `json:"periods"`
		Voucher string `json:"voucher"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req)
	if req.Periods < 1 {
		req.Periods = 1
	}
	userPlan, _ := s.database.GetUserPlan(user.ID)
	if userPlan == nil || userPlan.PlanID == nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "this account is not on a plan"})
		return
	}
	plan, _ := s.database.GetHostingPlan(*userPlan.PlanID)
	if plan == nil || plan.PriceAmount <= 0 || plan.Period == "once" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "this plan is not renewed by an order"})
		return
	}
	if req.Periods > maxPeriods(plan) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": fmt.Sprintf("at most %d periods", maxPeriods(plan))})
		return
	}
	// the order already waiting is shown again, not doubled
	if open, _ := s.database.UserOpenOrder(user.ID, database.OrderRenew); open != nil && open.Status == database.OrderPending {
		s.writeJSON(w, http.StatusOK, s.orderViewFor(*open))
		return
	}
	var voucher *database.HostingVoucher
	if code := strings.TrimSpace(req.Voucher); code != "" {
		v, reason := s.voucherCheck(code, plan, database.OrderRenew, user.ID)
		if reason != "" {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": voucherReasonText(reason), "reason": reason})
			return
		}
		voucher = v
	}
	quote := priceFor(plan, req.Periods, voucher)
	if quote.Subtotal <= 0 {
		// a renewal that costs nothing has nothing to transfer: the seller grants it by hand
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "this voucher takes the whole price off: ask the seller to renew the plan"})
		return
	}
	settings := s.loadSiteSettings()
	planID := plan.ID
	renewal := database.HostingOrder{
		Kind: database.OrderRenew, PlanID: &planID, PlanName: plan.Name, UserID: user.ID, Periods: req.Periods,
		AmountList: quote.List, DiscountDuration: quote.DurationDiscount, DiscountVoucher: quote.VoucherDiscount,
		AmountBase: quote.Subtotal, Status: database.OrderPending,
		CreatedIP: clientIP(r), ExpiresAt: time.Now().Add(settings.orderExpiry()), PublicBase: s.orderBaseURL(r),
	}
	if voucher != nil {
		renewal.VoucherCode = voucher.Code
	}
	created, err := s.database.CreateHostingOrder(renewal, settings.orderUniqueMax())
	if err != nil {
		if errors.Is(err, database.ErrVoucherUnavailable) {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
			return
		}
		if errors.Is(err, database.ErrNoFreeTotal) {
			s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": err.Error()})
			return
		}
		s.writeError(w, http.StatusInternalServerError, errors.New("could not create the order"))
		return
	}
	s.notifyAllAdmins("Perpanjangan hosting", fmt.Sprintf("%s memperpanjang paket %s (Rp %d).", user.Username, plan.Name, created.AmountTotal), "info")
	s.emitOrderCreated(created, user.Username, plan.Name)
	s.buyerOrderCreated(created, plan.Name)
	s.writeJSON(w, http.StatusCreated, s.orderViewFor(*created))
}

// handleMyPlan is the plan of the signed-in account, and whether it can be renewed by an order from here
func (s *Server) handleMyPlan(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r)
	if user == nil || s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	if !s.hostingEnabled() || user.Role == auth.SuperadminRole || s.isDemoUser(user) {
		s.writeJSON(w, http.StatusOK, jsonResponse{"plan": nil, "state": planStateNone, "renewable": false})
		return
	}
	view, err := s.userPlanView(user.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	userPlan, _ := s.database.GetUserPlan(user.ID)
	renewable := s.selfServiceOn() && view.Plan != nil && view.Plan.PriceAmount > 0 && view.Plan.Period != "once"
	resp := jsonResponse{
		"plan": view.Plan, "expiresAt": view.ExpiresAt, "state": view.State, "graceEndsAt": view.GraceEndsAt,
		"renewable": renewable, "trial": s.trialViewFor(userPlan, time.Now()),
	}
	if renewable {
		resp["maxPeriods"] = maxPeriods(view.Plan)
		if open, _ := s.database.UserOpenOrder(user.ID, database.OrderRenew); open != nil && open.Status == database.OrderPending {
			order := s.orderViewFor(*open)
			resp["openOrder"] = &order
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	s.writeJSON(w, http.StatusOK, resp)
}

// handleListMyOrders lists the orders of the signed-in account
func (s *Server) handleListMyOrders(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r)
	if user == nil || s.database == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	orders, _, err := s.database.ListHostingOrders(user.ID, "", 20, 0)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	views := make([]orderView, 0, len(orders))
	for _, o := range orders {
		views = append(views, s.orderViewFor(o))
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": views})
}

// handleListOrders is the superadmin's list of orders
func (s *Server) handleListOrders(w http.ResponseWriter, r *http.Request) {
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	limit, offset := parseIntQuery(r, "limit", 50), parseIntQuery(r, "offset", 0)
	orders, total, err := s.database.ListHostingOrders(0, status, limit, offset)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": orders, "total": total})
}

func parseIntQuery(r *http.Request, name string, fallback int) int {
	if raw := strings.TrimSpace(r.URL.Query().Get(name)); raw != "" {
		if n, err := parseIntParam(raw); err == nil {
			return n
		}
	}
	return fallback
}

// handleConfirmOrder is the superadmin saying an order is paid (or a trial is approved)
func (s *Server) handleConfirmOrder(w http.ResponseWriter, r *http.Request) {
	order, _ := s.database.GetHostingOrder(parsePathID(r, "id"))
	if order == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "order not found"})
		return
	}
	if order.Status != database.OrderPending && order.Status != database.OrderReview {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "this order is already " + order.Status})
		return
	}
	if err := s.fulfillOrder(order, nil, "dikonfirmasi admin"); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "hosting.order.confirm", "ok", map[string]any{"order": order.ID, "user": order.Username})
	}
	refreshed, _ := s.database.GetHostingOrder(order.ID)
	s.writeJSON(w, http.StatusOK, refreshed)
}

// handleCancelOrder closes an open order; the account a new order made, which never paid, goes with it
func (s *Server) handleCancelOrder(w http.ResponseWriter, r *http.Request) {
	order, _ := s.database.GetHostingOrder(parsePathID(r, "id"))
	if order == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "order not found"})
		return
	}
	changed, err := s.database.SetOrderStatus(order.ID, database.OrderCancelled, "dibatalkan admin")
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if !changed {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "this order is already " + order.Status})
		return
	}
	s.dropUnpaidAccount(order)
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "hosting.order.cancel", "ok", map[string]any{"order": order.ID, "user": order.Username})
	}
	refreshed, _ := s.database.GetHostingOrder(order.ID)
	s.writeJSON(w, http.StatusOK, refreshed)
}

// dropUnpaidAccount removes the account of an order that ended without payment, but only an account that was
// made for it and never switched on, and only when no other order still waits for it
func (s *Server) dropUnpaidAccount(order *database.HostingOrder) {
	if order.Kind == database.OrderRenew {
		return
	}
	user, _ := s.database.GetUserByID(order.UserID)
	if user == nil || user.Status != "pending" {
		return
	}
	for _, kind := range []string{database.OrderNew, database.OrderTrial} {
		if open, _ := s.database.UserOpenOrder(user.ID, kind); open != nil {
			return
		}
	}
	if err := s.database.DeleteUser(user.ID); err != nil {
		log.Printf("[orders] could not remove the unpaid account %q: %v", user.Username, err)
	}
}

// fulfillOrder switches the account and the plan on for a paid order. It is safe to call twice: the order
// closes once, and only the call that closed it does the work.
func (s *Server) fulfillOrder(order *database.HostingOrder, notifID *int64, note string) error {
	changed, err := s.database.MarkOrderPaid(order.ID, notifID, note)
	if err != nil {
		return err
	}
	if !changed {
		return nil
	}
	user, _ := s.database.GetUserByID(order.UserID)
	if user == nil || order.PlanID == nil {
		s.alertSellerOrder(order.ID, notify.Localized{"id": fmt.Sprintf("Pesanan #%d dibayar, tetapi akun atau paketnya sudah tidak ada.", order.ID), "en": fmt.Sprintf("Order #%d is paid, but its account or plan no longer exists.", order.ID)}, "warning")
		return errors.New("the account or the plan of the order no longer exists")
	}
	plan, _ := s.database.GetHostingPlan(*order.PlanID)
	if plan == nil {
		s.alertSellerOrder(order.ID, notify.Localized{"id": fmt.Sprintf("Pesanan #%d dibayar, tetapi paketnya sudah dihapus.", order.ID), "en": fmt.Sprintf("Order #%d is paid, but its plan has been deleted.", order.ID)}, "warning")
		return errors.New("the plan of the order no longer exists")
	}
	// a trial upgrade in progress ends first, so its time is credited to the plan this order renews
	s.finishPlanTrial(user.ID, time.Now())
	previous, _ := s.database.GetUserPlan(user.ID)
	now := time.Now()
	var ends *time.Time
	if order.Kind == database.OrderTrial {
		end := now.Add(time.Duration(plan.TrialDays) * 24 * time.Hour)
		ends = &end
	} else {
		months := orderMonths(plan, order.Periods)
		var monthsArg *int
		if months > 0 {
			monthsArg = &months
		}
		if ends, err = planEnd(plan, previous, nil, monthsArg, now); err != nil {
			return err
		}
	}
	if err := s.applyUserPlan(user.ID, plan, ends); err != nil {
		s.alertSellerOrder(order.ID, notify.Localized{"id": fmt.Sprintf("Pesanan #%d dibayar, tetapi paket %s gagal dipasang ke %s.", order.ID, plan.Name, user.Username), "en": fmt.Sprintf("Order #%d is paid, but the plan %s could not be applied to %s.", order.ID, plan.Name, user.Username)}, "warning")
		return err
	}
	if user.Status == "pending" {
		if err := s.database.UpdateUser(user.ID, map[string]any{"status": "active"}); err != nil {
			return err
		}
	}
	s.liftExpirySuspension(user, previous)
	if order.SubHostname != "" {
		s.giveOrderSubdomain(order, user)
	}
	s.recordRuntimeLog("info", "hosting order paid", map[string]any{"order": order.ID, "user": user.Username, "plan": plan.Name, "kind": order.Kind})
	s.notifyAllAdmins("Pesanan terbayar", fmt.Sprintf("%s: paket %s aktif (%s).", user.Username, plan.Name, note), "success")
	s.emitOrderPaid(order, user.Username, plan.Name, note)
	s.buyerOrderPaid(order, user, plan.Name)
	s.notifyBuyerOrderDone(order, user, plan, ends)
	go s.syncHostingRoutes()
	return nil
}

// notifyBuyerOrderDone tells the buyer, in their own panel, that the order went through and what they can use now
func (s *Server) notifyBuyerOrderDone(order *database.HostingOrder, user *database.User, plan *database.HostingPlan, ends *time.Time) {
	until := "tanpa batas waktu"
	if ends != nil {
		until = "sampai " + ends.Local().Format(notify.TimeLayout)
	}
	switch order.Kind {
	case database.OrderRenew:
		s.notifyUserAction(user.ID, "Perpanjangan berhasil", fmt.Sprintf("Paket %s diperpanjang, berlaku %s.", plan.Name, until), "success")
	case database.OrderTrial:
		s.notifyUserAction(user.ID, "Akun aktif", fmt.Sprintf("Percobaan paket %s dimulai dan akun Anda sudah bisa dipakai, berlaku %s.%s", plan.Name, until, addressSentence(order)), "success")
	default:
		s.notifyUserAction(user.ID, "Akun aktif", fmt.Sprintf("Pembayaran diterima. Paket %s aktif dan akun Anda sudah bisa dipakai, berlaku %s.%s", plan.Name, until, addressSentence(order)), "success")
	}
}

func addressSentence(order *database.HostingOrder) string {
	if order.SubHostname == "" {
		return ""
	}
	return fmt.Sprintf(" Masuk lewat https://%s.", order.SubHostname)
}

// giveOrderSubdomain creates the panel address the buyer picked with the order, so it is their sign-in address
func (s *Server) giveOrderSubdomain(order *database.HostingOrder, user *database.User) {
	if has, _ := s.database.HasPanelAddress(user.ID); has {
		return
	}
	if _, err := s.database.CreateHostingSubdomain(user.ID, order.SubLabel, order.SubZoneID, order.SubDomain, order.SubHostname, true); err != nil {
		log.Printf("[orders] could not create %s for %q: %v", order.SubHostname, user.Username, err)
		s.alertSellerOrder(order.ID, notify.Localized{"id": fmt.Sprintf("Pesanan #%d dibayar, tetapi alamat %s gagal dibuat untuk %s. Buatkan dari jendela Pengguna.", order.ID, order.SubHostname, user.Username), "en": fmt.Sprintf("Order #%d is paid, but the address %s could not be created for %s. Create it from the Users window.", order.ID, order.SubHostname, user.Username)}, "warning")
		return
	}
	forgetHostingHosts()
}

// handlePublicCheckSubdomain tells a buyer, while they type, whether a panel address is free
func (s *Server) handlePublicCheckSubdomain(w http.ResponseWriter, r *http.Request) {
	// the request form of a seller who takes orders by message checks the address too, so this needs only the public page
	if settings := s.loadSiteSettings(); !settings.HostingEnabled || !settings.LandingEnabled || s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	// each check asks Cloudflare, so one address gets a few a minute
	if allowed, retry := s.allowRateLimit("pubsub:"+clientIP(r), rateLimitRule{Window: time.Minute, Limit: 30}); !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())+1))
		s.notify.OrderRefused(clientIP(r))
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many requests, wait a moment"})
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	label := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("label")))
	// always on the main domain: that is where the panel address of a buyer is made
	main := s.mainHostingDomain()
	if main == nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "no domain is offered"})
		return
	}
	reason, _, err := s.subdomainAvailability(label, main.ZoneID)
	if err != nil {
		log.Printf("[orders] availability check: %v", err)
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "the address service is not ready, try again later"})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"available": reason == "", "reason": reason})
}

// matchHostingOrderPayment looks for the order a bank notification pays. Only an exact total, an order still open
// at the time of the payment, and exactly one candidate count; anything else is left for the superadmin to see.
func (s *Server) matchHostingOrderPayment(amountDetected string, notifID int64, receivedAt time.Time) {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	total := database.NormalizeAmount(amountDetected)
	if total <= 0 {
		return
	}
	orders, err := s.database.PendingOrdersForTotal(total, receivedAt)
	if err != nil {
		log.Printf("[orders] match check failed: %v", err)
		return
	}
	if len(orders) != 1 {
		if len(orders) > 1 {
			log.Printf("[orders] %d waiting orders share the total %d: left for review", len(orders), total)
			s.notify.Emit(notify.Event{
				Name: notify.EventOrderAttention, Key: fmt.Sprintf("shared-total-%d-%d", total, notifID),
				Data: map[string]any{"detail": notify.Localized{"id": fmt.Sprintf("%d pesanan menunggu dengan total %s yang sama, jadi transfernya tidak bisa dicocokkan sendiri. Periksa di tab Pesanan.", len(orders), rupiah(total)), "en": fmt.Sprintf("%d waiting orders share the total %s, so the transfer cannot be matched by itself. Check the Orders tab.", len(orders), rupiah(total))}},
			})
		}
		return
	}
	order := orders[0]
	// the superadmin may want to see every payment before an account is switched on
	if auto, _ := s.database.GetPaymentSettingValue("auto_confirm"); auto != "true" {
		if _, err := s.database.SetOrderStatus(order.ID, database.OrderReview, "pembayaran cocok, menunggu konfirmasi"); err == nil {
			s.notifyAllAdmins("Pembayaran cocok, perlu konfirmasi", fmt.Sprintf("Pesanan #%d (%s, Rp %d) cocok dengan notifikasi. Konfirmasi di tab Hosting.", order.ID, order.Username, total), "info")
			s.emitOrderReview(order.ID, order.Username, notify.Localized{"id": fmt.Sprintf("transfer %s cocok dengan notifikasi bank dan menunggu konfirmasi Anda.", rupiah(total)), "en": fmt.Sprintf("a transfer of %s matches a bank notification and waits for your confirmation.", rupiah(total))})
		}
		return
	}
	id := notifID
	if err := s.fulfillOrder(&order, &id, fmt.Sprintf("cocok otomatis dengan notifikasi #%d", notifID)); err != nil {
		log.Printf("[orders] order %d matched but could not be fulfilled: %v", order.ID, err)
	}
}

// expireOrders closes the orders whose time ran out and removes the accounts that never paid
func (s *Server) expireOrders(now time.Time) {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	expired, err := s.database.ExpireHostingOrders(now)
	if err != nil {
		log.Printf("[orders] expiry check failed: %v", err)
		return
	}
	for i := range expired {
		s.dropUnpaidAccount(&expired[i])
	}
	if len(expired) > 0 {
		s.recordRuntimeLog("info", "hosting orders expired", map[string]any{"count": len(expired)})
	}
}
