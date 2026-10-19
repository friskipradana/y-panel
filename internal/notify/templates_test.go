package notify

import (
	"strings"
	"testing"
)

func TestValidateTemplate(t *testing.T) {
	ok := "<b>Pesanan #{order}</b>\nPembeli: {username}\nFaktur: {invoice}"
	if err := ValidateTemplate(EventOrderCreated, ok); err != nil {
		t.Fatalf("a text with the variables of the event is fine: %v", err)
	}
	cases := []struct {
		name, event, body, want string
	}{
		{"empty", EventOrderCreated, "   ", "write the message"},
		{"unknown event", "nope", "x", "unknown event"},
		{"unknown variable", EventOrderCreated, "Halo {password}", "unknown variable {password}"},
		{"a variable of another event", EventOrderCreated, "Halo {deadline}", "unknown variable {deadline}"},
		{"script tag", EventOrderCreated, "<script>x</script>", "only the tags"},
		{"link tag", EventOrderCreated, `<a href="x">x</a>`, "only the tags"},
		{"bare angle bracket", EventOrderCreated, "a < b", "only the tags"},
		{"unclosed", EventOrderCreated, "<b>tebal", "not closed"},
		{"closed without opening", EventOrderCreated, "tebal</b>", "not opened"},
		{"too long", EventOrderCreated, strings.Repeat("a", MaxTemplateRunes+1), "longer than"},
	}
	for _, c := range cases {
		err := ValidateTemplate(c.event, c.body)
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: got %v, want %q", c.name, err, c.want)
		}
	}
}

// The variables of an event are the ones its own texts use plus the extra ones it carries, in both languages
func TestVariablesOfAnEvent(t *testing.T) {
	got := strings.Join(Variables(EventBuyerOrderPaid), ",")
	for _, want := range []string{"plan", "username", "until", "url", "invoice", "order", "amount"} {
		if !strings.Contains(","+got+",", ","+want+",") {
			t.Errorf("{%s} is missing from %s", want, got)
		}
	}
	for _, event := range Events() {
		if len(Variables(event)) == 0 && event != EventTest {
			continue
		}
		// a text of the catalog always passes its own check
		for _, locale := range []string{"id", "en"} {
			if err := ValidateTemplate(event, DefaultText(event, locale)); err != nil {
				t.Errorf("the text of %s in %s does not pass its own check: %v", event, locale, err)
			}
		}
	}
}

// A changed text replaces the one of the catalog, keeps the brand line, and escapes the values put in it
func TestRenderWithAChangedText(t *testing.T) {
	data := map[string]any{"order": 7, "username": "<b>x</b>"}
	out := RenderWith(EventOrderCreated, "id", data, "Order {order} dari {username}")
	if !strings.HasPrefix(out, "Order 7 dari &lt;b&gt;x&lt;/b&gt;") || !strings.HasSuffix(out, "\n\n- Reneo") {
		t.Fatalf("custom text: %q", out)
	}
	if def := RenderWith(EventOrderCreated, "id", data, ""); !strings.Contains(def, "Pesanan baru #7") {
		t.Fatalf("an empty change keeps the text of the catalog: %q", def)
	}
}

// Every event of the catalog is listed, the ones the seller works with first
func TestEventsAreAllListedInOrder(t *testing.T) {
	events := Events()
	if len(events) != len(catalog) {
		t.Fatalf("%d listed, %d in the catalog", len(events), len(catalog))
	}
	if events[0] != EventOrderCreated || events[len(events)-1] != EventTest {
		t.Fatalf("order: first %s, last %s", events[0], events[len(events)-1])
	}
	for _, event := range eventOrder {
		if !Known(event) {
			t.Errorf("%s is in the order but not in the catalog", event)
		}
	}
}
