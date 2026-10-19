package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// What an order costs: the list price of the periods, minus the discount of a longer subscription, minus a voucher.
// The unique code that makes the total recognisable is added to the result when the order is made.

const (
	voucherCodeMax      = 32
	voucherMaxFixed     = 100_000_000
	voucherMaxUses      = 1_000_000
	discountMaxPercent  = 90
	discountMaxPeriods  = 24
	voucherPerMinuteIP  = 30
	voucherNoteMax      = 200
	voucherMaxPerAcount = 100
)

var voucherCodeRe = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{2,31}$`)

// priceQuote is the price of an order and where it comes from
type priceQuote struct {
	List             int64 `json:"list"`
	DurationPercent  int   `json:"durationPercent"`
	DurationDiscount int64 `json:"durationDiscount"`
	VoucherDiscount  int64 `json:"voucherDiscount"`
	// Subtotal is what is left to pay before the unique code
	Subtotal int64 `json:"subtotal"`
}

// durationPercent is the discount of the longest tier the subscription reaches
func durationPercent(plan *database.HostingPlan, periods int) int {
	best := 0
	for _, tier := range plan.DurationDiscounts {
		if periods >= tier.Periods && tier.Percent > best {
			best = tier.Percent
		}
	}
	return best
}

// priceFor works out the price of some periods of a plan with a voucher (or none)
func priceFor(plan *database.HostingPlan, periods int, voucher *database.HostingVoucher) priceQuote {
	q := priceQuote{List: plan.PriceAmount * int64(periods)}
	if q.List <= 0 {
		return q
	}
	q.DurationPercent = durationPercent(plan, periods)
	q.DurationDiscount = q.List * int64(q.DurationPercent) / 100
	after := q.List - q.DurationDiscount
	if voucher != nil {
		switch voucher.Kind {
		case database.VoucherPercent:
			q.VoucherDiscount = after * voucher.Value / 100
		case database.VoucherFixed:
			q.VoucherDiscount = voucher.Value
		}
		if q.VoucherDiscount > after {
			q.VoucherDiscount = after
		}
	}
	q.Subtotal = after - q.VoucherDiscount
	return q
}

// voucherCheck is why a code cannot be used for this order, as a short reason; empty means it can
func (s *Server) voucherCheck(code string, plan *database.HostingPlan, kind string, userID int64) (*database.HostingVoucher, string) {
	v, err := s.database.GetHostingVoucherByCode(code)
	if err != nil || v == nil {
		return nil, "unknown"
	}
	now := time.Now()
	switch {
	case !v.Enabled:
		return v, "disabled"
	case v.ValidFrom != nil && now.Before(*v.ValidFrom):
		return v, "notStarted"
	case v.ValidUntil != nil && now.After(*v.ValidUntil):
		return v, "expired"
	case v.MaxUses > 0 && v.Used >= v.MaxUses:
		return v, "usedUp"
	case v.AppliesTo == "new" && kind != database.OrderNew, v.AppliesTo == "renew" && kind != database.OrderRenew:
		return v, "wrongKind"
	}
	if len(v.PlanIDs) > 0 {
		allowed := false
		for _, id := range v.PlanIDs {
			if id == plan.ID {
				allowed = true
				break
			}
		}
		if !allowed {
			return v, "wrongPlan"
		}
	}
	if v.MaxPerAccount > 0 && userID > 0 {
		if used, err := s.database.VoucherUsesByAccount(v.Code, userID); err == nil && used >= v.MaxPerAccount {
			return v, "usedByYou"
		}
	}
	return v, ""
}

// voucherReasonText says a reason in the words of an error
func voucherReasonText(reason string) string {
	switch reason {
	case "disabled":
		return "this voucher is switched off"
	case "notStarted":
		return "this voucher is not valid yet"
	case "expired":
		return "this voucher has expired"
	case "usedUp":
		return "this voucher has been used up"
	case "usedByYou":
		return "this account already used this voucher"
	case "wrongPlan":
		return "this voucher is not for this plan"
	case "wrongKind":
		return "this voucher does not apply to this kind of order"
	}
	return "this voucher code is not known"
}

// ─── Plans: discounts of longer subscriptions ───────────────────────────────

// cleanDurationDiscounts keeps one tier per number of periods, in order; a plan that never ends has none
func cleanDurationDiscounts(p *database.HostingPlan) {
	if p.Period == "once" || len(p.DurationDiscounts) == 0 {
		p.DurationDiscounts = []database.DurationDiscount{}
		return
	}
	sort.Slice(p.DurationDiscounts, func(i, j int) bool { return p.DurationDiscounts[i].Periods < p.DurationDiscounts[j].Periods })
}

func validateDurationDiscounts(p database.HostingPlan) error {
	seen := map[int]bool{}
	for _, tier := range p.DurationDiscounts {
		switch {
		case tier.Periods < 2 || tier.Periods > discountMaxPeriods:
			return fmt.Errorf("a discount is for 2 to %d periods", discountMaxPeriods)
		case tier.Percent < 1 || tier.Percent > discountMaxPercent:
			return fmt.Errorf("a discount is between 1 and %d percent", discountMaxPercent)
		case seen[tier.Periods]:
			return fmt.Errorf("the discount for %d periods is listed twice", tier.Periods)
		}
		seen[tier.Periods] = true
	}
	return nil
}

// ─── Vouchers ────────────────────────────────────────────────────────────────

func cleanVoucher(v *database.HostingVoucher) {
	v.Code = strings.ToUpper(strings.TrimSpace(v.Code))
	v.Kind = strings.ToLower(strings.TrimSpace(v.Kind))
	v.AppliesTo = strings.ToLower(strings.TrimSpace(v.AppliesTo))
	if v.AppliesTo == "" {
		v.AppliesTo = "both"
	}
	v.Note = strings.TrimSpace(v.Note)
	if v.PlanIDs == nil {
		v.PlanIDs = []int64{}
	}
}

func validateVoucher(v database.HostingVoucher) error {
	switch {
	case !voucherCodeRe.MatchString(v.Code) || len(v.Code) > voucherCodeMax:
		return errors.New("a code is 3 to 32 letters, digits, dashes or underscores")
	case v.Kind != database.VoucherPercent && v.Kind != database.VoucherFixed:
		return errors.New("a voucher takes off a percent or a fixed amount")
	case v.Kind == database.VoucherPercent && (v.Value < 1 || v.Value > 100):
		return errors.New("a percent voucher takes off between 1 and 100 percent")
	case v.Kind == database.VoucherFixed && (v.Value < 1 || v.Value > voucherMaxFixed):
		return fmt.Errorf("a fixed voucher takes off between 1 and %d rupiah", voucherMaxFixed)
	case v.MaxUses < 0 || v.MaxUses > voucherMaxUses:
		return fmt.Errorf("the number of uses is between 0 (no limit) and %d", voucherMaxUses)
	case v.MaxPerAccount < 0 || v.MaxPerAccount > voucherMaxPerAcount:
		return fmt.Errorf("the uses per account are between 0 (no limit) and %d", voucherMaxPerAcount)
	case v.AppliesTo != "both" && v.AppliesTo != "new" && v.AppliesTo != "renew":
		return errors.New("a voucher applies to new orders, renewals or both")
	case utf8.RuneCountInString(v.Note) > voucherNoteMax:
		return fmt.Errorf("the note is at most %d characters", voucherNoteMax)
	case len(v.PlanIDs) > 50:
		return errors.New("a voucher is for at most 50 plans")
	case v.ValidFrom != nil && v.ValidUntil != nil && !v.ValidUntil.After(*v.ValidFrom):
		return errors.New("the end of the voucher must come after its start")
	}
	return nil
}

func decodeVoucher(w http.ResponseWriter, r *http.Request) (database.HostingVoucher, error) {
	defer r.Body.Close()
	var v database.HostingVoucher
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14)).Decode(&v); err != nil {
		return v, errors.New("invalid JSON")
	}
	cleanVoucher(&v)
	return v, validateVoucher(v)
}

func (s *Server) requireDatabase(w http.ResponseWriter) bool {
	if s.database != nil && s.database.IsConnected() {
		return true
	}
	s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "the database is not connected"})
	return false
}

func (s *Server) handleListVouchers(w http.ResponseWriter, _ *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	list, err := s.database.ListHostingVouchers()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleCreateVoucher(w http.ResponseWriter, r *http.Request) {
	if !s.requireHostingMode(w) {
		return
	}
	v, err := decodeVoucher(w, r)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	created, err := s.database.CreateHostingVoucher(v)
	if isDuplicate(err) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "a voucher with this code already exists"})
		return
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "hosting.voucher.create", "ok", map[string]any{"code": created.Code})
	}
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateVoucher(w http.ResponseWriter, r *http.Request) {
	if !s.requireHostingMode(w) {
		return
	}
	v, err := decodeVoucher(w, r)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	v.ID = parsePathID(r, "id")
	updated, err := s.database.UpdateHostingVoucher(v)
	if isDuplicate(err) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "a voucher with this code already exists"})
		return
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if updated == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "voucher not found"})
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "hosting.voucher.update", "ok", map[string]any{"code": updated.Code})
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteVoucher(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	id := parsePathID(r, "id")
	existing, _ := s.database.GetHostingVoucher(id)
	if existing == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "voucher not found"})
		return
	}
	if err := s.database.DeleteHostingVoucher(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "hosting.voucher.delete", "ok", map[string]any{"code": existing.Code})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// ─── The price a buyer sees before ordering ─────────────────────────────────

type quoteRequest struct {
	PlanID  int64  `json:"planId"`
	Periods int    `json:"periods"`
	Kind    string `json:"kind"`
	Voucher string `json:"voucher"`
}

type voucherAnswer struct {
	Code   string `json:"code"`
	Valid  bool   `json:"valid"`
	Reason string `json:"reason,omitempty"`
	Kind   string `json:"kind,omitempty"`
	Value  int64  `json:"value,omitempty"`
}

// quoteFor answers what an order would cost; userID is the account that renews, or 0 for a buyer who has none yet
func (s *Server) quoteFor(w http.ResponseWriter, r *http.Request, kind string, userID int64) {
	defer r.Body.Close()
	var req quoteRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if allowed, _ := s.allowRateLimit("quote:"+clientIP(r), rateLimitRule{Window: time.Minute, Limit: voucherPerMinuteIP}); !allowed {
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many attempts, wait a moment"})
		return
	}
	plan, _ := s.database.GetHostingPlan(req.PlanID)
	if plan == nil || (kind == database.OrderNew && !plan.Visible) {
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
	answer := jsonResponse{}
	var voucher *database.HostingVoucher
	if code := strings.TrimSpace(req.Voucher); code != "" {
		v, reason := s.voucherCheck(code, plan, kind, userID)
		if reason == "" {
			voucher = v
			answer["voucher"] = voucherAnswer{Code: v.Code, Valid: true, Kind: v.Kind, Value: v.Value}
		} else {
			answer["voucher"] = voucherAnswer{Code: strings.ToUpper(code), Valid: false, Reason: reason}
		}
	}
	answer["quote"] = priceFor(plan, req.Periods, voucher)
	s.writeJSON(w, http.StatusOK, answer)
}

func (s *Server) handlePublicQuote(w http.ResponseWriter, r *http.Request) {
	if !s.selfServiceOn() {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	s.quoteFor(w, r, database.OrderNew, 0)
}

func (s *Server) handleMyQuote(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r)
	if !s.selfServiceOn() || user == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	s.quoteFor(w, r, database.OrderRenew, user.ID)
}
