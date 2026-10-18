// Package notify delivers notices outside the panel: a queue in the database that every notice goes through, a worker
// that sends from it at once and safely, the channels (Telegram first), and the detectors that turn a pile of failed
// requests into one message instead of one per request.
package notify

import "strings"

// The events that leave the panel (docs/NOTIFIKASI-KANAL.md, section 2).
const (
	EventTest = "test"

	EventOrderCreated   = "order.created"
	EventOrderReview    = "order.review"
	EventOrderPaid      = "order.paid"
	EventOrderAttention = "order.attention"
	EventPlanEnded      = "plan.ended"
	EventDomainError    = "domain.error"

	// to the buyer, about their own order (the group "buyer")
	EventBuyerOrderCreated = "buyer.order_created"
	EventBuyerOrderPaid    = "buyer.order_paid"
	EventBuyerPlanReminder = "buyer.plan_reminder"
	EventBuyerPlanEnded    = "buyer.plan_ended"

	EventLoginFailed     = "security.login_failed"
	EventLoginLocked     = "security.login_locked"
	EventLoginNew        = "security.login_new"
	EventPasswordChanged = "security.password_changed"
	EventTokenCreated    = "security.token_created"

	EventAccountScan  = "attack.account_scan"
	EventLoginFlood   = "attack.login_flood"
	EventRequestFlood = "attack.request_flood"
	EventOrderAbuse   = "attack.order_abuse"
	EventWebhookProbe = "attack.webhook_probe"
)

// Priority 0 is sent first: attacks, security, and what the seller has to handle.
const (
	PriorityUrgent = 0
	PriorityNormal = 1
)

// PriorityOf is how soon an event goes out
func PriorityOf(event string) int {
	switch {
	case strings.HasPrefix(event, "security."), strings.HasPrefix(event, "attack."), event == EventOrderAttention, event == EventOrderReview, event == EventTest, event == EventBuyerOrderPaid:
		return PriorityUrgent
	}
	return PriorityNormal
}

// Group is the part of an event before the dot; an account can switch a whole group off
func Group(event string) string {
	if i := strings.IndexByte(event, '.'); i > 0 {
		return event[:i]
	}
	return event
}

// IsMuted says whether the account switched this event, or its group, off
func IsMuted(muted []string, event string) bool {
	group := Group(event)
	for _, m := range muted {
		if m == event || m == group {
			return true
		}
	}
	return false
}

// ForSeller are the events about the business: they go to the superadmin accounts
func ForSeller(event string) bool {
	switch event {
	case EventOrderCreated, EventOrderReview, EventOrderPaid, EventOrderAttention, EventPlanEnded, EventDomainError, EventTest:
		return true
	}
	return strings.HasPrefix(event, "attack.")
}

// Event is one thing that happened, to be told to the people it concerns.
type Event struct {
	Name string
	// UserIDs are who it concerns; empty means the seller (the superadmin accounts)
	UserIDs []int64
	// Key makes the event happen once: the same name, key and recipient are never queued twice
	Key  string
	Data map[string]any
}
