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

func orderKindWord(kind string) string {
	switch kind {
	case database.OrderTrial:
		return "percobaan"
	case database.OrderRenew:
		return "perpanjangan"
	}
	return "baru"
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
	amount := ""
	if o.AmountTotal > 0 {
		amount = "Total " + rupiah(o.AmountTotal) + "."
	}
	s.notify.Emit(notify.Event{
		Name: notify.EventOrderCreated, Key: fmt.Sprintf("order-%d", o.ID),
		Data: map[string]any{"username": username, "plan": plan, "kind": orderKindWord(o.Kind), "amount": amount},
	})
}

// buyerOrderCreated tells the buyer, on the number they gave, how to pay; the order status page has the same facts
func (s *Server) buyerOrderCreated(o *database.HostingOrder, plan string) {
	if o.AmountTotal <= 0 {
		return
	}
	// the notice names the first way to pay; the order page it links to lists them all
	var first orderMethod
	if methods := activeOrderMethods(s.loadSiteSettings()); len(methods) > 0 {
		first = methods[0]
	}
	s.notify.Emit(notify.Event{
		Name: notify.EventBuyerOrderCreated, UserIDs: []int64{o.UserID}, Key: fmt.Sprintf("order-%d", o.ID),
		Data: map[string]any{
			"plan": plan, "amount": rupiah(o.AmountTotal), "bank": first.Name, "account": first.Account,
			"holder": first.Holder, "deadline": o.ExpiresAt.Local().Format("02 Jan 2006 15:04"),
			"url": strings.TrimRight(o.PublicBase, "/") + "/order/" + o.PublicID,
		},
	})
}

// buyerOrderPaid tells the buyer the account is active and where to sign in: their own address when they have one
func (s *Server) buyerOrderPaid(o *database.HostingOrder, user *database.User, plan string) {
	url := strings.TrimRight(o.PublicBase, "/") + "/login"
	if o.SubHostname != "" {
		url = "https://" + o.SubHostname + "/login"
	}
	s.notify.Emit(notify.Event{
		Name: notify.EventBuyerOrderPaid, UserIDs: []int64{o.UserID}, Key: fmt.Sprintf("order-%d", o.ID),
		Data: map[string]any{"plan": plan, "username": user.Username, "url": url},
	})
}

// buyerPlanReminder tells the buyer, on the number they gave, that the plan runs out soon
func (s *Server) buyerPlanReminder(user *database.User, planName string, ends time.Time, days int) {
	s.notify.Emit(notify.Event{
		Name: notify.EventBuyerPlanReminder, UserIDs: []int64{user.ID}, Key: fmt.Sprintf("plan-reminder-%d-%d", user.ID, ends.Unix()),
		Data: map[string]any{"plan": planName, "until": ends.Local().Format("02 Jan 2006 15:04"), "days": days},
	})
}

// buyerPlanEnded tells the buyer that the account was suspended because the plan ended
func (s *Server) buyerPlanEnded(user *database.User, planName string, expired *time.Time) {
	key := fmt.Sprintf("plan-ended-%d", user.ID)
	if expired != nil {
		key += fmt.Sprintf("-%d", expired.Unix())
	}
	s.notify.Emit(notify.Event{Name: notify.EventBuyerPlanEnded, UserIDs: []int64{user.ID}, Key: key, Data: map[string]any{"plan": planName, "username": user.Username}})
}

func (s *Server) emitOrderReview(orderID int64, username, reason string) {
	s.notify.Emit(notify.Event{
		Name: notify.EventOrderReview, Key: fmt.Sprintf("order-%d", orderID),
		Data: map[string]any{"order": orderID, "username": username, "reason": reason},
	})
}

func (s *Server) emitOrderPaid(o *database.HostingOrder, username, plan, note string) {
	s.notify.Emit(notify.Event{
		Name: notify.EventOrderPaid, Key: fmt.Sprintf("order-%d", o.ID),
		Data: map[string]any{"username": username, "plan": plan, "note": note},
	})
}

// alertSellerOrder tells the admins in the panel, and the seller outside it, that an order needs handling
func (s *Server) alertSellerOrder(orderID int64, text, level string) {
	s.notifyAllAdmins("Pesanan perlu ditangani", text, level)
	s.notify.Emit(notify.Event{
		Name: notify.EventOrderAttention, Key: fmt.Sprintf("order-%d-%x", orderID, shortHash(text)),
		Data: map[string]any{"detail": text},
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
	data := map[string]any{"username": u.Username, "time": time.Now().Format("02 Jan 2006 15:04")}
	if by != "" {
		data["username"] = u.Username + " (direset oleh " + by + ")"
	}
	s.notify.Emit(notify.Event{Name: notify.EventPasswordChanged, UserIDs: []int64{u.ID}, Key: fmt.Sprintf("pw-%d-%d", u.ID, time.Now().Unix()), Data: data})
}

func (s *Server) emitTokenCreated(u *database.User, name string) {
	s.notify.Emit(notify.Event{
		Name: notify.EventTokenCreated, UserIDs: []int64{u.ID}, Key: fmt.Sprintf("token-%d-%d", u.ID, time.Now().UnixNano()),
		Data: map[string]any{"username": u.Username, "name": name, "time": time.Now().Format("02 Jan 2006 15:04")},
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
