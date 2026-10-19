package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// The invoice of an order tells what the order tells: the seller, the buyer, the price with what each discount took off, and
// where to pay while it waits; it keeps its number. Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationInvoiceOfAnOrder(t *testing.T) {
	f := newHostingFixture(t)
	settings := f.s.loadSiteSettings()
	settings.InvoiceName, settings.InvoiceAddress, settings.InvoiceContact, settings.InvoiceNote = "Reneo Hosting", "Jl. Mawar 1\nJakarta", "halo@reneo.my.id", "Terima kasih."
	settings.OrderMethods = []orderMethod{{ID: "m1", Kind: "bank", Name: "BCA", Account: "1234567890", Holder: "Reneo", Enabled: true}}
	if err := f.s.saveSiteSettings(settings); err != nil {
		t.Fatal(err)
	}
	plan := f.plan(t, "starter", 50000, 0, 0)
	rec, view := f.postOrder(t, "203.0.113.80", map[string]any{
		"planId": plan.ID, "kind": "new", "periods": 1, "username": "ina", "email": "ina@example.com", "password": "Sup3r-secret-pass",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("order: %d %s", rec.Code, rec.Body.String())
	}
	order, _ := f.db.GetHostingOrderByPublicID(view.PublicID)

	get := func(id string) (*httptest.ResponseRecorder, invoiceView) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/public/hosting/orders/"+id+"/invoice", nil)
		req.SetPathValue("publicId", id)
		rec := httptest.NewRecorder()
		f.s.handlePublicOrderInvoice(rec, req)
		var out invoiceView
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return rec, out
	}
	rec, invoice := get(view.PublicID)
	if rec.Code != http.StatusOK {
		t.Fatalf("invoice: %d %s", rec.Code, rec.Body.String())
	}
	if invoice.Number != invoiceNumber(order) || !strings.HasPrefix(invoice.Number, "INV-") || !strings.HasSuffix(invoice.Number, fmt.Sprintf("-%05d", order.ID)) {
		t.Errorf("number: %q", invoice.Number)
	}
	if invoice.Seller.Name != "Reneo Hosting" || invoice.Seller.Address != "Jl. Mawar 1\nJakarta" || invoice.Seller.Contact != "halo@reneo.my.id" || invoice.Note != "Terima kasih." {
		t.Errorf("seller: %+v note %q", invoice.Seller, invoice.Note)
	}
	if invoice.Buyer.Email != "ina@example.com" || !strings.Contains(invoice.Buyer.Name, "ina") {
		t.Errorf("buyer: %+v", invoice.Buyer)
	}
	if invoice.AmountList != 50000 || invoice.AmountTotal != order.AmountTotal || invoice.Months != 1 || invoice.PlanName != "Starter" {
		t.Errorf("amounts: %+v", invoice)
	}
	if invoice.Status != database.OrderPending || invoice.Payment == nil || len(invoice.Payment.Methods) != 1 {
		t.Errorf("an unpaid invoice says where to pay: %+v", invoice.Payment)
	}

	// once paid there is nothing to pay to, and the paid date shows
	if _, err := f.db.DB().Exec(`UPDATE hosting_orders SET status = 'paid', paid_at = NOW() WHERE id = $1`, order.ID); err != nil {
		t.Fatal(err)
	}
	_, paid := get(view.PublicID)
	if paid.Status != database.OrderPaid || paid.PaidAt == nil || paid.Payment != nil || paid.Number != invoice.Number {
		t.Errorf("paid invoice: %+v", paid)
	}

	for _, id := range []string{"short", strings.Repeat("x", 24)} {
		if rec, _ := get(id); rec.Code != http.StatusNotFound {
			t.Errorf("an unknown order %q: %d", id, rec.Code)
		}
	}
}

// The seller can change the text of a notice, in each language, and bring the original back. Skipped without REN_TEST_DATABASE_URL.
func TestIntegrationSellerChangesANoticeText(t *testing.T) {
	f := newHostingFixture(t)
	f.s.notify = notify.New(f.db, testNotifyKey)
	call := func(method, event, locale, body string) *httptest.ResponseRecorder {
		payload, _ := json.Marshal(map[string]string{"body": body})
		req := httptest.NewRequest(method, "/api/v1/notify/templates/"+event+"/"+locale, strings.NewReader(string(payload)))
		req.SetPathValue("event", event)
		req.SetPathValue("locale", locale)
		req = req.WithContext(context.WithValue(req.Context(), ctxUser, f.super))
		rec := httptest.NewRecorder()
		if method == http.MethodPut {
			f.s.handleSaveNotifyTemplate(rec, req)
		} else {
			f.s.handleResetNotifyTemplate(rec, req)
		}
		return rec
	}
	list := func() map[string]string {
		rec := httptest.NewRecorder()
		f.s.handleListNotifyTemplates(rec, httptest.NewRequest(http.MethodGet, "/api/v1/notify/templates", nil))
		var out struct {
			Items []templateView `json:"items"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || rec.Code != http.StatusOK {
			t.Fatalf("list: %d %s", rec.Code, rec.Body.String())
		}
		for _, item := range out.Items {
			if item.Event == notify.EventBuyerOrderPaid {
				if len(item.Vars) == 0 || item.Default.ID == "" || item.Default.EN == "" {
					t.Fatalf("the list carries the variables and the original texts: %+v", item)
				}
				return item.Custom
			}
		}
		t.Fatal("the event is not listed")
		return nil
	}

	if got := list(); len(got) != 0 {
		t.Fatalf("nothing is changed at first: %v", got)
	}
	body := "Terima kasih {username}! Paket {plan} aktif sampai {until}. Faktur: {invoice}"
	if rec := call(http.MethodPut, notify.EventBuyerOrderPaid, "id", body); rec.Code != http.StatusOK {
		t.Fatalf("save: %d %s", rec.Code, rec.Body.String())
	}
	if got := list(); got["id"] != body || got["en"] != "" {
		t.Fatalf("only the language that was changed holds a text: %v", got)
	}
	// the worker reads it and fills the values
	custom, _ := f.db.GetNotificationTemplate(notify.EventBuyerOrderPaid, "id")
	out := notify.RenderWith(notify.EventBuyerOrderPaid, "id", map[string]any{"username": "ina", "plan": "Starter", "until": "1 Jan", "invoice": "https://x/i"}, custom)
	if !strings.HasPrefix(out, "Terima kasih ina! Paket Starter aktif sampai 1 Jan. Faktur: https://x/i") {
		t.Fatalf("rendered: %q", out)
	}
	for _, bad := range []struct{ event, locale, body, want string }{
		{notify.EventBuyerOrderPaid, "id", "Kata sandi {password}", "unknown variable"},
		{notify.EventBuyerOrderPaid, "id", "<script>", "only the tags"},
		{notify.EventBuyerOrderPaid, "fr", "x", "not found"},
		{"nope", "id", "x", "not found"},
	} {
		if rec := call(http.MethodPut, bad.event, bad.locale, bad.body); rec.Code < 400 || !strings.Contains(rec.Body.String(), bad.want) {
			t.Errorf("%+v: %d %s", bad, rec.Code, rec.Body.String())
		}
	}
	if rec := call(http.MethodDelete, notify.EventBuyerOrderPaid, "id", ""); rec.Code != http.StatusOK {
		t.Fatalf("reset: %d", rec.Code)
	}
	if got := list(); len(got) != 0 {
		t.Fatalf("the original is back: %v", got)
	}
}
