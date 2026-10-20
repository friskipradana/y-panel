package httpserver

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// An order has an invoice: the page a buyer keeps or prints as proof of what they ordered and paid. It is made from the
// order when it is opened, so it always tells the same as the order, and it is reached by the same unguessable code.

type invoiceParty struct {
	Name    string `json:"name"`
	Address string `json:"address,omitempty"`
	Contact string `json:"contact,omitempty"`
	Email   string `json:"email,omitempty"`
}

type invoiceView struct {
	Number   string     `json:"number"`
	Status   string     `json:"status"`
	IssuedAt time.Time  `json:"issuedAt"`
	DueAt    time.Time  `json:"dueAt"`
	PaidAt   *time.Time `json:"paidAt"`
	Seller   invoiceParty `json:"seller"`
	Buyer    invoiceParty `json:"buyer"`
	// Note is the line the seller wants under every invoice
	Note     string `json:"note,omitempty"`
	Kind     string `json:"kind"`
	// Difference: an upgrade paid as the price difference for the time left
	Difference bool `json:"difference,omitempty"`
	PlanName string `json:"planName"`
	Periods  int    `json:"periods"`
	// Months is how long the order buys; zero for a plan that does not end
	Months           int    `json:"months"`
	Hostname         string `json:"hostname,omitempty"`
	AmountList       int64  `json:"amountList"`
	DiscountDuration int64  `json:"discountDuration"`
	DiscountVoucher  int64  `json:"discountVoucher"`
	VoucherCode      string `json:"voucherCode,omitempty"`
	AmountBase       int64  `json:"amountBase"`
	UniqueCode       int    `json:"uniqueCode"`
	AmountTotal      int64  `json:"amountTotal"`
	// Payment lists where to pay while the invoice is unpaid
	Payment *paymentInstructions `json:"payment,omitempty"`
}

// invoiceNumber is INV, the month the order was made and the order number: the same order always has the same number
func invoiceNumber(o *database.HostingOrder) string {
	return fmt.Sprintf("INV-%s-%05d", o.CreatedAt.Local().Format("200601"), o.ID)
}

// invoiceURL is where the invoice of an order is read, on the address the buyer ordered from
func invoiceURL(o *database.HostingOrder) string {
	if strings.TrimSpace(o.PublicBase) == "" {
		return ""
	}
	return strings.TrimRight(o.PublicBase, "/") + "/order/" + o.PublicID + "/invoice"
}

func (s *Server) invoiceFor(o *database.HostingOrder) invoiceView {
	settings := s.loadSiteSettings()
	seller := invoiceParty{Name: settings.InvoiceName, Address: settings.InvoiceAddress, Contact: settings.InvoiceContact}
	if seller.Name == "" {
		seller.Name = "Reneo"
		if main := s.mainHostingDomain(); main != nil && main.Name != "" {
			seller.Name = main.Name
		}
	}
	buyer := invoiceParty{Name: o.Username}
	if o.UserID > 0 {
		if user, _ := s.database.GetUserByID(o.UserID); user != nil {
			buyer.Email = user.Email
			if user.DisplayName != "" {
				buyer.Name = user.DisplayName + " (" + o.Username + ")"
			}
		}
	}
	months := 0
	if o.PlanID != nil {
		if plan, _ := s.database.GetHostingPlan(*o.PlanID); plan != nil {
			months = orderMonths(plan, o.Periods)
		}
	}
	view := invoiceView{
		Number: invoiceNumber(o), Status: o.Status, IssuedAt: o.CreatedAt, DueAt: o.ExpiresAt, PaidAt: o.PaidAt,
		Seller: seller, Buyer: buyer, Note: settings.InvoiceNote,
		Kind: o.Kind, Difference: o.Difference, PlanName: o.PlanName, Periods: o.Periods, Months: months, Hostname: o.SubHostname,
		AmountList: o.AmountList, DiscountDuration: o.DiscountDuration, DiscountVoucher: o.DiscountVoucher, VoucherCode: o.VoucherCode,
		AmountBase: o.AmountBase, UniqueCode: o.UniqueCode, AmountTotal: o.AmountTotal,
	}
	if o.Status == database.OrderPending && o.AmountTotal > 0 {
		view.Payment = &paymentInstructions{Methods: activeOrderMethods(settings)}
	}
	return view
}

func (s *Server) handlePublicOrderInvoice(w http.ResponseWriter, r *http.Request) {
	if s.database == nil || !s.database.IsConnected() || !s.loadSiteSettings().HostingEnabled {
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
	s.writeJSON(w, http.StatusOK, s.invoiceFor(order))
}
