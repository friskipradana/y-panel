package httpserver

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// The places where something happens that people should hear about outside the panel. Each one is a few lines here, so
// the handlers they are called from stay as they were. A server without a notify service (a test) ignores all of them.

func orderKindWord(kind string) notify.Localized {
	switch kind {
	case database.OrderTrial:
		return notify.Localized{"id": "percobaan gratis", "en": "free trial"}
	case database.OrderRenew:
		return notify.Localized{"id": "perpanjangan", "en": "renewal"}
	}
	return notify.Localized{"id": "baru", "en": "new"}
}

// amountText is what an order costs, or that it is free
func amountText(total int64) any {
	if total <= 0 {
		return notify.Localized{"id": "Gratis", "en": "Free"}
	}
	return rupiah(total)
}

// periodText is how long an order buys: months or years of its plan, or that the plan does not end
func (s *Server) periodText(o *database.HostingOrder) any {
	if o.Kind == database.OrderTrial {
		return notify.Localized{"id": "percobaan gratis", "en": "free trial"}
	}
	var plan *database.HostingPlan
	if o.PlanID != nil && s.database != nil {
		plan, _ = s.database.GetHostingPlan(*o.PlanID)
	}
	if plan == nil {
		return notify.Localized{"id": fmt.Sprintf("%d periode", o.Periods), "en": fmt.Sprintf("%d periods", o.Periods)}
	}
	months := orderMonths(plan, o.Periods)
	switch {
	case months == 0:
		return notify.Localized{"id": "sekali bayar", "en": "one-time"}
	case months%12 == 0 && months/12 == 1:
		return notify.Localized{"id": "1 tahun", "en": "1 year"}
	case months%12 == 0:
		return notify.Localized{"id": fmt.Sprintf("%d tahun", months/12), "en": fmt.Sprintf("%d years", months/12)}
	case months == 1:
		return notify.Localized{"id": "1 bulan", "en": "1 month"}
	}
	return notify.Localized{"id": fmt.Sprintf("%d bulan", months), "en": fmt.Sprintf("%d months", months)}
}

// voucherText is the code of an order and what it took off, or a dash
func voucherText(o *database.HostingOrder) string {
	if o.VoucherCode == "" {
		return ""
	}
	return fmt.Sprintf("%s (-%s)", o.VoucherCode, rupiah(o.DiscountVoucher))
}

// orderPaidHow says, in both languages, how an order was marked paid
func orderPaidHow(note string) any {
	switch {
	case note == "trial":
		return notify.Localized{"id": "percobaan dimulai", "en": "trial started"}
	case note == "dikonfirmasi admin":
		return notify.Localized{"id": "dikonfirmasi penjual", "en": "confirmed by the seller"}
	case strings.HasPrefix(note, "cocok otomatis dengan notifikasi #"):
		number := strings.TrimPrefix(note, "cocok otomatis dengan notifikasi #")
		return notify.Localized{"id": "cocok otomatis dengan notifikasi bank #" + number, "en": "matched bank notification #" + number + " by itself"}
	}
	return note
}

// rupiah writes an amount as Indonesians do: Rp 50.123
func rupiah(n int64) string {
	digits := fmt.Sprintf("%d", n)
	var b strings.Builder
	for i, c := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(c)
	}
	return "Rp " + b.String()
}

func (s *Server) emitOrderCreated(o *database.HostingOrder, username, plan string) {
	s.notify.Emit(notify.Event{
		Name: notify.EventOrderCreated, Key: fmt.Sprintf("order-%d", o.ID),
		Data: map[string]any{
			"order": o.ID, "username": username, "plan": plan, "period": s.periodText(o), "kind": orderKindWord(o.Kind),
			"amount": amountText(o.AmountTotal), "voucher": voucherText(o), "address": o.SubHostname, "invoice": invoiceURL(o),
		},
	})
}

// buyerOrderCreated tells the buyer, on the number they gave, how to pay; the order status page has the same facts
func (s *Server) buyerOrderCreated(o *database.HostingOrder, username, rawPassword, plan string) {
	if o.AmountTotal <= 0 {
		return
	}
	if strings.TrimSpace(username) == "" && s.database != nil && o.UserID > 0 {
		if u, _ := s.database.GetUserByID(o.UserID); u != nil {
			username = u.Username
		}
	}
	var passwordVal any = rawPassword
	if strings.TrimSpace(rawPassword) == "" {
		passwordVal = notify.Localized{"id": "Sesuai kata sandi akun Anda", "en": "Your existing account password"}
	}
	// the notice names the first way to pay; the order page it links to lists them all
	var first orderMethod
	if methods := activeOrderMethods(s.loadSiteSettings()); len(methods) > 0 {
		first = methods[0]
	}
	s.notify.Emit(notify.Event{
		Name: notify.EventBuyerOrderCreated, UserIDs: []int64{o.UserID}, Key: fmt.Sprintf("order-%d", o.ID),
		Data: map[string]any{
			"order": o.ID, "username": username, "password": passwordVal, "invoice": invoiceURL(o),
			"plan": plan, "period": s.periodText(o), "amount": rupiah(o.AmountTotal), "bank": first.Name, "account": first.Account,
			"holder": first.Holder, "deadline": o.ExpiresAt.Local().Format(notify.TimeLayout),
			"url": strings.TrimRight(o.PublicBase, "/") + "/order/" + o.PublicID,
		},
	})
}

// buyerOrderPaid tells the buyer the account is active and where to sign in: their own address when they have one
func (s *Server) buyerOrderPaid(o *database.HostingOrder, user *database.User, plan, rawPassword string) {
	url := strings.TrimRight(o.PublicBase, "/") + "/login"
	if o.SubHostname != "" {
		url = "https://" + o.SubHostname + "/login"
	}
	// the plan runs until the end that was just set; one that does not end says so
	until := any(notify.Localized{"id": "tanpa batas waktu", "en": "no end date"})
	if up, _ := s.database.GetUserPlan(user.ID); up != nil && up.ExpiresAt != nil {
		until = up.ExpiresAt.Local().Format(notify.TimeLayout)
	}
	var passwordVal any = rawPassword
	if strings.TrimSpace(rawPassword) == "" {
		passwordVal = notify.Localized{"id": "Sesuai kata sandi saat mendaftar", "en": "As set during registration"}
	}
	s.notify.Emit(notify.Event{
		Name: notify.EventBuyerOrderPaid, UserIDs: []int64{o.UserID}, Key: fmt.Sprintf("order-%d", o.ID),
		Data: map[string]any{
			"order": o.ID, "amount": amountText(o.AmountTotal), "invoice": invoiceURL(o),
			"plan": plan, "username": user.Username, "password": passwordVal, "until": until, "url": url,
		},
	})
}

// resolveHostingRenewalLinks finds or creates a pending renewal order so reminder/expiry notices carry direct checkout and invoice links.
func (s *Server) resolveHostingRenewalLinks(user *database.User, now time.Time) (checkoutURL, invURL string) {
	base := strings.TrimRight(s.orderBaseURL(nil), "/")
	fallbackLogin := base + "/login"
	if s.database != nil && s.database.IsConnected() && user != nil {
		if subs, err := s.database.ListHostingSubdomains(user.ID); err == nil && len(subs) > 0 && strings.TrimSpace(subs[0].Hostname) != "" {
			fallbackLogin = "https://" + strings.TrimSpace(subs[0].Hostname) + "/login"
		}
		// Reuse an active pending renewal order if one already exists
		if pending, _, err := s.database.ListHostingOrders(user.ID, database.OrderPending, 10, 0); err == nil {
			for i := range pending {
				o := pending[i]
				if o.Kind == database.OrderRenew && o.ExpiresAt.After(now) && o.PublicID != "" {
					b := strings.TrimRight(o.PublicBase, "/")
					if b == "" {
						b = base
					}
					return b + "/order/" + o.PublicID, b + "/order/" + o.PublicID + "/invoice"
				}
			}
		}
		// Otherwise auto-create a 1-period renewal order for paid recurring plans
		if up, _ := s.database.GetUserPlan(user.ID); up != nil && up.PlanID != nil {
			if plan, _ := s.database.GetHostingPlan(*up.PlanID); plan != nil && plan.PriceAmount > 0 && plan.Period != "once" {
				settings := s.loadSiteSettings()
				quote := priceFor(plan, 1, nil, database.OrderRenew, now)
				if quote.Subtotal > 0 {
					expiry := settings.orderExpiry()
					if expiry < 72*time.Hour {
						expiry = 72 * time.Hour
					}
					planID := plan.ID
					renewal := database.HostingOrder{
						Kind:             database.OrderRenew,
						PlanID:           &planID,
						PlanName:         plan.Name,
						UserID:           user.ID,
						Periods:          1,
						AmountList:       quote.List,
						DiscountPromo:    quote.PromoDiscount,
						DiscountDuration: quote.DurationDiscount,
						AmountBase:       quote.Subtotal,
						Status:           database.OrderPending,
						CreatedIP:        "127.0.0.1",
						ExpiresAt:        now.Add(expiry),
						PublicBase:       base,
					}
					if created, err := s.database.CreateHostingOrder(renewal, settings.orderUniqueMax()); err == nil && created != nil {
						b := strings.TrimRight(created.PublicBase, "/")
						if b == "" {
							b = base
						}
						return b + "/order/" + created.PublicID, b + "/order/" + created.PublicID + "/invoice"
					}
				}
			}
		}
	}
	return fallbackLogin, fallbackLogin
}

// buyerPlanReminder tells the buyer, on the number they gave, that the plan runs out soon
func (s *Server) buyerPlanReminder(user *database.User, planName string, ends time.Time, days int) {
	checkoutURL, invURL := s.resolveHostingRenewalLinks(user, time.Now())
	s.notify.Emit(notify.Event{
		Name: notify.EventBuyerPlanReminder, UserIDs: []int64{user.ID}, Key: fmt.Sprintf("plan-reminder-%d-%d", user.ID, ends.Unix()),
		Data: map[string]any{
			"plan": planName, "username": user.Username, "until": ends.Local().Format(notify.TimeLayout), "days": days,
			"url": checkoutURL, "invoice": invURL,
		},
	})
}

// buyerPlanEnded tells the buyer that the account was suspended because the plan ended
func (s *Server) buyerPlanEnded(user *database.User, planName string, expired *time.Time) {
	key := fmt.Sprintf("plan-ended-%d", user.ID)
	if expired != nil {
		key += fmt.Sprintf("-%d", expired.Unix())
	}
	checkoutURL, invURL := s.resolveHostingRenewalLinks(user, time.Now())
	s.notify.Emit(notify.Event{
		Name: notify.EventBuyerPlanEnded, UserIDs: []int64{user.ID}, Key: key,
		Data: map[string]any{"plan": planName, "username": user.Username, "url": checkoutURL, "invoice": invURL},
	})
}

func (s *Server) emitOrderReview(orderID int64, username string, reason notify.Localized) {
	s.notify.Emit(notify.Event{
		Name: notify.EventOrderReview, Key: fmt.Sprintf("order-%d", orderID),
		Data: map[string]any{"order": orderID, "username": username, "reason": reason},
	})
}

func (s *Server) emitOrderPaid(o *database.HostingOrder, username, plan, note string) {
	s.notify.Emit(notify.Event{
		Name: notify.EventOrderPaid, Key: fmt.Sprintf("order-%d", o.ID),
		Data: map[string]any{"order": o.ID, "username": username, "plan": plan, "amount": amountText(o.AmountTotal), "note": orderPaidHow(note), "invoice": invoiceURL(o)},
	})
}

func appLicensePeriodText(months int) notify.Localized {
	if months <= 1 {
		return notify.Localized{"id": "1 bulan", "en": "1 month"}
	}
	return notify.Localized{"id": fmt.Sprintf("%d bulan", months), "en": fmt.Sprintf("%d months", months)}
}

func (s *Server) emitAppLicenseOrderCreated(o *database.AppLicenseOrder, username string) {
	if s.notify == nil || o == nil {
		return
	}
	s.notify.Emit(notify.Event{
		Name: notify.EventOrderCreated,
		Key:  fmt.Sprintf("app-order-%d", o.ID),
		Data: map[string]any{
			"order":    o.ID,
			"username": username,
			"plan":     fmt.Sprintf("%s - %s", o.AppName, o.PlanName),
			"period":   appLicensePeriodText(o.Months),
			"kind":     notify.Localized{"id": "lisensi aplikasi", "en": "app license"},
			"amount":   amountText(o.AmountTotal),
			"voucher":  "",
			"address":  "",
			"invoice":  o.InvoiceNumber,
		},
	})
}

func (s *Server) buyerAppLicenseOrderCreated(o *database.AppLicenseOrder, publicBase string) {
	if s.notify == nil || o == nil || o.AmountTotal <= 0 || o.UserID <= 0 {
		return
	}
	username := o.BuyerName
	if s.database != nil {
		if u, _ := s.database.GetUserByID(o.UserID); u != nil {
			username = u.Username
		}
	}
	var first orderMethod
	if methods := activeOrderMethods(s.loadSiteSettings()); len(methods) > 0 {
		first = methods[0]
	}
	base := strings.TrimRight(publicBase, "/")
	checkoutURL := base + "/order/" + o.PublicID
	invURL := base + "/order/" + o.PublicID + "/invoice"
	s.notify.Emit(notify.Event{
		Name:    notify.EventBuyerOrderCreated,
		UserIDs: []int64{o.UserID},
		Key:     fmt.Sprintf("app-order-%d", o.ID),
		Data: map[string]any{
			"order":    o.ID,
			"username": username,
			"password": notify.Localized{"id": "Sesuai kata sandi akun Anda", "en": "Your existing account password"},
			"invoice":  invURL,
			"plan":     fmt.Sprintf("%s - %s", o.AppName, o.PlanName),
			"period":   appLicensePeriodText(o.Months),
			"amount":   rupiah(o.AmountTotal),
			"bank":     first.Name,
			"account":  first.Account,
			"holder":   first.Holder,
			"deadline": o.ExpiresAt.Local().Format(notify.TimeLayout),
			"url":      checkoutURL,
		},
	})
}

func (s *Server) emitAppLicenseOrderPaid(o *database.AppLicenseOrder, username, note string) {
	if s.notify == nil || o == nil {
		return
	}
	s.notify.Emit(notify.Event{
		Name: notify.EventOrderPaid,
		Key:  fmt.Sprintf("app-order-%d", o.ID),
		Data: map[string]any{
			"order":    o.ID,
			"username": username,
			"plan":     fmt.Sprintf("%s - %s", o.AppName, o.PlanName),
			"amount":   amountText(o.AmountTotal),
			"note":     orderPaidHow(note),
			"invoice":  o.InvoiceNumber,
		},
	})
}

func (s *Server) buyerAppLicenseOrderPaid(o *database.AppLicenseOrder, username, publicBase string) {
	if s.notify == nil || o == nil || o.UserID <= 0 {
		return
	}
	base := strings.TrimRight(publicBase, "/")
	url := base + "/login"
	invURL := base + "/order/" + o.PublicID + "/invoice"
	until := time.Now().AddDate(0, o.Months, 0).Local().Format(notify.TimeLayout)
	if s.database != nil && s.database.IsConnected() {
		if lic, err := s.database.GetAppLicense(o.UserID, o.CatalogID); err == nil && lic != nil && lic.ExpiresAt != "" {
			if t, err := time.Parse(time.RFC3339, lic.ExpiresAt); err == nil {
				until = t.Local().Format(notify.TimeLayout)
			}
		}
	}
	s.notify.Emit(notify.Event{
		Name:    notify.EventBuyerOrderPaid,
		UserIDs: []int64{o.UserID},
		Key:     fmt.Sprintf("app-order-%d", o.ID),
		Data: map[string]any{
			"order":    o.ID,
			"amount":   amountText(o.AmountTotal),
			"invoice":  invURL,
			"plan":     fmt.Sprintf("%s - %s", o.AppName, o.PlanName),
			"username": username,
			"password": notify.Localized{"id": "Sesuai kata sandi akun Anda", "en": "Your existing account password"},
			"until":    until,
			"url":      url,
		},
	})
}

func (s *Server) resolveAppLicenseRenewalLinks(user *database.User, lic database.AppLicense, now time.Time) (checkoutURL, invURL string) {
	base := strings.TrimRight(s.licenseOrderBaseURL(nil), "/")
	fallback := base + "/login"
	if s.database == nil || !s.database.IsConnected() || user == nil {
		return fallback, fallback
	}
	// Reuse existing pending license order if still valid
	if orders, err := s.database.ListAppLicenseOrders(user.ID, lic.CatalogID); err == nil {
		for _, o := range orders {
			if o.Status == "pending" && o.ExpiresAt.After(now) && o.PublicID != "" {
				return base + "/order/" + o.PublicID, base + "/order/" + o.PublicID + "/invoice"
			}
		}
	}
	// Pick matching active paid plan to create a renewal invoice link
	plans, err := s.database.ListAppLicensePlans(lic.CatalogID)
	if err != nil || len(plans) == 0 {
		return fallback, fallback
	}
	var chosen *database.AppLicensePlan
	for i := range plans {
		p := plans[i]
		if !p.IsActive || p.PriceAmount <= 0 || p.Months <= 0 {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(p.Name), strings.TrimSpace(lic.PlanName)) {
			chosen = &p
			break
		}
		if chosen == nil || p.Highlighted {
			chosen = &p
		}
	}
	if chosen == nil {
		return fallback, fallback
	}
	settings := s.loadSiteSettings()
	expiry := settings.orderExpiry()
	if expiry < 72*time.Hour {
		expiry = 72 * time.Hour
	}
	buyerName := strings.TrimSpace(user.Username)
	order := database.AppLicenseOrder{
		UserID:        user.ID,
		CatalogID:     lic.CatalogID,
		AppName:       lic.AppName,
		PlanSlug:      chosen.Slug,
		PlanName:      chosen.Name,
		Period:        chosen.Period,
		Months:        chosen.Months,
		AmountList:    chosen.PriceAmount,
		Status:        "pending",
		PaymentMethod: "transfer",
		BuyerName:     buyerName,
		BuyerEmail:    user.Email,
		ExpiresAt:     now.Add(expiry),
		CreatedIP:     "127.0.0.1",
	}
	if created, err := s.database.CreateAppLicenseOrder(order); err == nil && created != nil && created.PublicID != "" {
		return base + "/order/" + created.PublicID, base + "/order/" + created.PublicID + "/invoice"
	}
	return fallback, fallback
}

func (s *Server) buyerAppLicenseReminder(user *database.User, lic database.AppLicense, ends time.Time, days int, keySuffix string) {
	if s.notify == nil || user == nil {
		return
	}
	checkoutURL, invURL := s.resolveAppLicenseRenewalLinks(user, lic, time.Now())
	planLabel := strings.TrimSpace(lic.AppName)
	if strings.TrimSpace(lic.PlanName) != "" {
		planLabel = fmt.Sprintf("%s - %s", lic.AppName, lic.PlanName)
	}
	s.notify.Emit(notify.Event{
		Name:    notify.EventBuyerPlanReminder,
		UserIDs: []int64{user.ID},
		Key:     fmt.Sprintf("app-license-reminder-%d-%d%s", lic.ID, ends.Unix(), keySuffix),
		Data: map[string]any{
			"plan":     planLabel,
			"username": user.Username,
			"until":    ends.Local().Format(notify.TimeLayout),
			"days":     days,
			"url":      checkoutURL,
			"invoice":  invURL,
		},
	})
}

func (s *Server) buyerAppLicenseEnded(user *database.User, lic database.AppLicense, ends time.Time) {
	if s.notify == nil || user == nil {
		return
	}
	checkoutURL, invURL := s.resolveAppLicenseRenewalLinks(user, lic, time.Now())
	planLabel := strings.TrimSpace(lic.AppName)
	if strings.TrimSpace(lic.PlanName) != "" {
		planLabel = fmt.Sprintf("%s - %s", lic.AppName, lic.PlanName)
	}
	s.notify.Emit(notify.Event{
		Name:    notify.EventBuyerPlanEnded,
		UserIDs: []int64{user.ID},
		Key:     fmt.Sprintf("app-license-ended-%d-%d", lic.ID, ends.Unix()),
		Data: map[string]any{
			"plan":     planLabel,
			"username": user.Username,
			"url":      checkoutURL,
			"invoice":  invURL,
		},
	})
}

// alertSellerOrder tells the admins in the panel, and the seller outside it, that an order needs handling
func (s *Server) alertSellerOrder(orderID int64, detail notify.Localized, level string) {
	text := detail["id"]
	s.notifyAllAdmins("Pesanan perlu ditangani", text, level)
	s.notify.Emit(notify.Event{
		Name: notify.EventOrderAttention, Key: fmt.Sprintf("order-%d-%x", orderID, shortHash(text)),
		Data: map[string]any{"detail": detail},
	})
}

func shortHash(text string) uint32 {
	var h uint32 = 2166136261
	for i := 0; i < len(text); i++ {
		h = (h ^ uint32(text[i])) * 16777619
	}
	return h
}

func (s *Server) emitPlanEnded(user *database.User, planName string, expired *time.Time) {
	key := fmt.Sprintf("plan-ended-%d", user.ID)
	if expired != nil {
		key += fmt.Sprintf("-%d", expired.Unix())
	}
	s.notify.Emit(notify.Event{Name: notify.EventPlanEnded, Key: key, Data: map[string]any{"username": user.Username, "plan": planName}})
}

func (s *Server) emitDomainError(row database.HostingCustomDomain, note string) {
	s.notify.Emit(notify.Event{
		Name: notify.EventDomainError, Key: fmt.Sprintf("domain-%d-%d", row.ID, time.Now().Unix()/60),
		Data: map[string]any{"hostname": row.Hostname, "username": row.Username, "note": note},
	})
}

func (s *Server) emitPasswordChanged(u *database.User, by string) {
	data := map[string]any{"username": u.Username, "time": time.Now().Format(notify.TimeLayout), "by": notify.Localized{"id": "pemilik akun", "en": "the account owner"}}
	if by != "" {
		data["by"] = by
	}
	s.notify.Emit(notify.Event{Name: notify.EventPasswordChanged, UserIDs: []int64{u.ID}, Key: fmt.Sprintf("pw-%d-%d", u.ID, time.Now().Unix()), Data: data})
}

func (s *Server) emitTokenCreated(u *database.User, name string) {
	s.notify.Emit(notify.Event{
		Name: notify.EventTokenCreated, UserIDs: []int64{u.ID}, Key: fmt.Sprintf("token-%d-%d", u.ID, time.Now().UnixNano()),
		Data: map[string]any{"username": u.Username, "name": name, "time": time.Now().Format(notify.TimeLayout)},
	})
}

// A request the rate limit refused used to write a line to the log and a row to the database each time, which under an
// attack is the attack's work done for it. Now the refusals are counted by the detector, and only a few a minute are written.
type logSampler struct {
	mu     sync.Mutex
	window int64
	count  int
	max    int
}

func (l *logSampler) Allow() bool {
	minute := time.Now().Unix() / 60
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.window != minute {
		l.window, l.count = minute, 0
	}
	if l.count >= l.max {
		return false
	}
	l.count++
	return true
}

var rateLogSampler = &logSampler{max: 20}
