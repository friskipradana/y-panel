package httpserver

import (
	"net/http"
	"strconv"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
)

// The lists of the Hosting settings as spreadsheets, like the Docker ones (list_tables.go): searched, ordered and narrowed by
// column on the agent, over the whole list.

const hostingTableLimit = 1000

func compareText(a, b string) int {
	switch {
	case lower(a) < lower(b):
		return -1
	case lower(a) > lower(b):
		return 1
	}
	return 0
}

func compareTime(a, b time.Time) int {
	switch {
	case a.Before(b):
		return -1
	case a.After(b):
		return 1
	}
	return 0
}

func yesNo(v bool) string {
	if v {
		return "yes"
	}
	return "no"
}

// ─── Orders ──────────────────────────────────────────────────────────────────

func orderSpec() listquery.Spec[database.HostingOrder] {
	return listquery.Spec[database.HostingOrder]{
		Columns: []listquery.Column[database.HostingOrder]{
			{Key: "user", Value: func(o database.HostingOrder) string { return o.Username }},
			{Key: "plan", Value: func(o database.HostingOrder) string { return o.PlanName }},
			{Key: "kind", Value: func(o database.HostingOrder) string { return o.Kind }},
			{Key: "status", Value: func(o database.HostingOrder) string { return o.Status }},
			{Key: "total", Value: func(o database.HostingOrder) string { return strconv.FormatInt(o.AmountTotal, 10) },
				Compare: func(a, b database.HostingOrder) int { return int(a.AmountTotal - b.AmountTotal) }},
			{Key: "voucher", Value: func(o database.HostingOrder) string { return o.VoucherCode }},
			{Key: "created", Value: func(o database.HostingOrder) string { return o.CreatedAt.Format("2006-01-02") },
				Compare: func(a, b database.HostingOrder) int { return compareTime(a.CreatedAt, b.CreatedAt) }},
		},
		Search: func(o database.HostingOrder) string {
			return lower(o.Username + " " + o.PlanName + " " + o.Kind + " " + o.Status + " " + o.VoucherCode + " " + o.SubHostname + " " + o.Note)
		},
		Tiebreak: func(a, b database.HostingOrder) int { return int(b.ID - a.ID) },
	}
}

func (s *Server) handleOrdersTable(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	orders, _, err := s.database.ListHostingOrders(0, "", hostingTableLimit, 0)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, tableResponse(orders, orderSpec(), r.URL.Query()))
}

// ─── Subdomains ──────────────────────────────────────────────────────────────

func subdomainSpec() listquery.Spec[database.HostingSubdomain] {
	return listquery.Spec[database.HostingSubdomain]{
		Columns: []listquery.Column[database.HostingSubdomain]{
			{Key: "hostname", Value: func(d database.HostingSubdomain) string { return d.Hostname }},
			{Key: "owner", Value: func(d database.HostingSubdomain) string { return d.Username }},
			{Key: "domain", Value: func(d database.HostingSubdomain) string { return d.Domain }},
			{Key: "kind", Value: func(d database.HostingSubdomain) string {
				if d.Panel {
					return "panel"
				}
				return "extra"
			}},
			{Key: "status", Value: func(d database.HostingSubdomain) string { return d.Status }},
		},
		Search: func(d database.HostingSubdomain) string {
			return lower(d.Hostname + " " + d.Username + " " + d.Status + " " + d.Note)
		},
		Tiebreak: func(a, b database.HostingSubdomain) int { return compareText(a.Hostname, b.Hostname) },
	}
}

func (s *Server) handleSubdomainsTable(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	items, err := s.database.ListHostingSubdomains(0)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, tableResponse(items, subdomainSpec(), r.URL.Query()))
}

// ─── Plans ───────────────────────────────────────────────────────────────────

func planSpec() listquery.Spec[database.HostingPlan] {
	return listquery.Spec[database.HostingPlan]{
		Columns: []listquery.Column[database.HostingPlan]{
			{Key: "name", Value: func(p database.HostingPlan) string { return p.Name }},
			{Key: "price", Value: func(p database.HostingPlan) string { return strconv.FormatInt(p.PriceAmount, 10) },
				Compare: func(a, b database.HostingPlan) int { return int(a.PriceAmount - b.PriceAmount) }},
			{Key: "period", Value: func(p database.HostingPlan) string { return p.Period }},
			{Key: "accounts", Value: func(p database.HostingPlan) string { return strconv.Itoa(p.Accounts) },
				Compare: func(a, b database.HostingPlan) int { return a.Accounts - b.Accounts }},
			{Key: "visible", Value: func(p database.HostingPlan) string { return yesNo(p.Visible) }},
		},
		Search:   func(p database.HostingPlan) string { return lower(p.Name + " " + p.Slug + " " + p.Tagline) },
		Tiebreak: func(a, b database.HostingPlan) int { return a.SortOrder - b.SortOrder },
	}
}

func (s *Server) handlePlansTable(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	plans, err := s.database.ListHostingPlans(false)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, tableResponse(plans, planSpec(), r.URL.Query()))
}

// ─── Vouchers ────────────────────────────────────────────────────────────────

// voucherState is why a voucher cannot be used now, or "active"
func voucherState(v database.HostingVoucher, now time.Time) string {
	switch {
	case !v.Enabled:
		return "off"
	case v.ValidFrom != nil && now.Before(*v.ValidFrom):
		return "notStarted"
	case v.ValidUntil != nil && now.After(*v.ValidUntil):
		return "expired"
	case v.MaxUses > 0 && v.Used >= v.MaxUses:
		return "usedUp"
	}
	return "active"
}

func voucherSpec() listquery.Spec[database.HostingVoucher] {
	now := time.Now()
	return listquery.Spec[database.HostingVoucher]{
		Columns: []listquery.Column[database.HostingVoucher]{
			{Key: "code", Value: func(v database.HostingVoucher) string { return v.Code }},
			{Key: "kind", Value: func(v database.HostingVoucher) string { return v.Kind }},
			{Key: "value", Value: func(v database.HostingVoucher) string { return strconv.FormatInt(v.Value, 10) },
				Compare: func(a, b database.HostingVoucher) int { return int(a.Value - b.Value) }},
			{Key: "used", Value: func(v database.HostingVoucher) string { return strconv.Itoa(v.Used) },
				Compare: func(a, b database.HostingVoucher) int { return a.Used - b.Used }},
			{Key: "applies", Value: func(v database.HostingVoucher) string { return v.AppliesTo }},
			{Key: "state", Value: func(v database.HostingVoucher) string { return voucherState(v, now) }},
			{Key: "until", Value: func(v database.HostingVoucher) string {
				if v.ValidUntil == nil {
					return ""
				}
				return v.ValidUntil.Format("2006-01-02")
			}, Compare: func(a, b database.HostingVoucher) int {
				switch {
				case a.ValidUntil == nil && b.ValidUntil == nil:
					return 0
				case a.ValidUntil == nil:
					return 1
				case b.ValidUntil == nil:
					return -1
				}
				return compareTime(*a.ValidUntil, *b.ValidUntil)
			}},
		},
		Search:   func(v database.HostingVoucher) string { return lower(v.Code + " " + v.Note) },
		Tiebreak: func(a, b database.HostingVoucher) int { return int(b.ID - a.ID) },
	}
}

func (s *Server) handleVouchersTable(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	vouchers, err := s.database.ListHostingVouchers()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, tableResponse(vouchers, voucherSpec(), r.URL.Query()))
}

// ─── Domains of the buyers' own ──────────────────────────────────────────────

func customDomainSpec() listquery.Spec[database.HostingCustomDomain] {
	return listquery.Spec[database.HostingCustomDomain]{
		Columns: []listquery.Column[database.HostingCustomDomain]{
			{Key: "hostname", Value: func(d database.HostingCustomDomain) string { return d.Hostname }},
			{Key: "owner", Value: func(d database.HostingCustomDomain) string { return d.Username }},
			{Key: "status", Value: func(d database.HostingCustomDomain) string { return d.Status }},
			{Key: "ssl", Value: func(d database.HostingCustomDomain) string { return d.SSLStatus }},
			{Key: "created", Value: func(d database.HostingCustomDomain) string { return d.CreatedAt.Format("2006-01-02") },
				Compare: func(a, b database.HostingCustomDomain) int { return compareTime(a.CreatedAt, b.CreatedAt) }},
		},
		Search: func(d database.HostingCustomDomain) string {
			return lower(d.Hostname + " " + d.Username + " " + d.Status + " " + d.SSLStatus + " " + d.Note)
		},
		Tiebreak: func(a, b database.HostingCustomDomain) int { return compareText(a.Hostname, b.Hostname) },
	}
}

func (s *Server) handleCustomDomainsTable(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	items, err := s.database.ListHostingCustomDomains(0)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, tableResponse(items, customDomainSpec(), r.URL.Query()))
}

// ─── Offered domains ─────────────────────────────────────────────────────────

func domainSpec() listquery.Spec[hostingDomainView] {
	return listquery.Spec[hostingDomainView]{
		Columns: []listquery.Column[hostingDomainView]{
			{Key: "name", Value: func(d hostingDomainView) string { return d.Name }},
			{Key: "status", Value: func(d hostingDomainView) string { return d.Status }},
			{Key: "role", Value: func(d hostingDomainView) string {
				if d.IsMain {
					return "main"
				}
				return "extra"
			}},
		},
		Search:   func(d hostingDomainView) string { return lower(d.Name + " " + d.Status) },
		Tiebreak: func(a, b hostingDomainView) int { return compareText(a.Name, b.Name) },
	}
}

// handleDomainsTable lists the domains that are offered; picking more of the account's domains stays on the plain list
func (s *Server) handleDomainsTable(w http.ResponseWriter, r *http.Request) {
	views, status, err := s.hostingDomainViews()
	if err != nil {
		s.writeJSON(w, status, jsonResponse{"error": err.Error()})
		return
	}
	offered := make([]hostingDomainView, 0, len(views))
	for _, view := range views {
		if view.Enabled {
			offered = append(offered, view)
		}
	}
	s.writeJSON(w, http.StatusOK, tableResponse(offered, domainSpec(), r.URL.Query()))
}
