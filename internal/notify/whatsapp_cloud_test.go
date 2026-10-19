package notify

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"
)

func TestEveryEventHasATemplateMetWillTake(t *testing.T) {
	name := regexp.MustCompile(`^[a-z0-9_]{1,512}$`)
	seen := map[string]bool{}
	for _, tpl := range Templates() {
		if !name.MatchString(tpl.Name) {
			t.Errorf("%s: a template name is lowercase letters, digits and underscores", tpl.Name)
		}
		key := tpl.Name + "|" + tpl.Language
		if seen[key] {
			t.Errorf("%s is made twice", key)
		}
		seen[key] = true
		if strings.HasPrefix(strings.TrimSpace(tpl.Body), "{{") {
			t.Errorf("%s: Meta refuses a body that starts with a variable", key)
		}
		if !strings.HasSuffix(tpl.Body, "- Reneo") {
			t.Errorf("%s: a body must not end with a variable: %q", key, tpl.Body)
		}
		if regexp.MustCompile(`</?[a-z]+>`).MatchString(tpl.Body) {
			t.Errorf("%s keeps HTML in the body: %q", key, tpl.Body)
		}
		// the variables are numbered one after another from 1, and each has a sample
		for i := range tpl.Params {
			if !strings.Contains(tpl.Body, "{{"+string(rune('1'+i))+"}}") && i < 9 {
				t.Errorf("%s: variable %d is missing from the body", key, i+1)
			}
		}
		if len(tpl.Samples) != len(tpl.Params) {
			t.Errorf("%s: every variable needs a sample", key)
		}
		for _, sample := range tpl.Samples {
			if strings.ContainsAny(sample, "\n\t") {
				t.Errorf("%s: a sample must be one line: %q", key, sample)
			}
		}
		// two variables side by side have no text between them, which Meta refuses
		if regexp.MustCompile(`\}\}\{\{`).MatchString(tpl.Body) {
			t.Errorf("%s has two variables side by side", key)
		}
	}
	if len(seen) != 2*len(catalog) {
		t.Fatalf("both languages of every event: %d for %d events", len(seen), len(catalog))
	}
}

func TestTemplateValuesFitAVariable(t *testing.T) {
	cases := map[string]string{"": "-", "  ": "-", "a\nb": "a b", "a     b": "a b", "x\ty": "x y"}
	for in, want := range cases {
		if got := templateValue(in); got != want {
			t.Errorf("%q: got %q want %q", in, got, want)
		}
	}
	if templateValue(nil) != "-" || templateValue(12) != "12" {
		t.Fatal("nil is a dash and a number is its digits")
	}
	if len(templateValue(strings.Repeat("a", 5000))) > 1000 {
		t.Fatal("a value is cut to what Meta takes")
	}
}

type fakeMeta struct {
	*httptest.Server
	mu        sync.Mutex
	token     string
	sent      []map[string]any
	templates map[string]string
	created   []map[string]any
	reply     func(w http.ResponseWriter, r *http.Request) bool
}

func newFakeMeta(t *testing.T) *fakeMeta {
	t.Helper()
	m := &fakeMeta{token: "tok", templates: map[string]string{}}
	m.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.mu.Lock()
		defer m.mu.Unlock()
		if r.Header.Get("Authorization") != "Bearer "+m.token {
			w.WriteHeader(401)
			_, _ = w.Write([]byte(`{"error":{"message":"Invalid OAuth access token","type":"OAuthException","code":190}}`))
			return
		}
		if m.reply != nil && m.reply(w, r) {
			return
		}
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/messages"):
			m.sent = append(m.sent, body)
			_, _ = w.Write([]byte(`{"messages":[{"id":"wamid.ABC"}]}`))
		case strings.HasSuffix(r.URL.Path, "/message_templates") && r.Method == http.MethodGet:
			type item struct {
				Name     string `json:"name"`
				Language string `json:"language"`
				Status   string `json:"status"`
			}
			var data []item
			for key, status := range m.templates {
				parts := strings.SplitN(key, "|", 2)
				data = append(data, item{parts[0], parts[1], status})
			}
			out, _ := json.Marshal(map[string]any{"data": data})
			_, _ = w.Write(out)
		case strings.HasSuffix(r.URL.Path, "/message_templates") && r.Method == http.MethodPost:
			m.created = append(m.created, body)
			m.templates[body["name"].(string)+"|"+body["language"].(string)] = "PENDING"
			_, _ = w.Write([]byte(`{"id":"1","status":"PENDING"}`))
		default:
			_, _ = w.Write([]byte(`{"display_phone_number":"+62 812-0000-1111","verified_name":"Reneo","quality_rating":"GREEN"}`))
		}
	}))
	t.Cleanup(m.Close)
	return m
}

func TestSendingATemplateFillsItsVariablesInOrder(t *testing.T) {
	meta := newFakeMeta(t)
	c := NewWhatsAppCloud("tok", "555", "777", "").WithBase(meta.URL)
	id, err := c.SendEvent(context.Background(), "+62 812-3456-7890", EventBuyerOrderCreated, "id", map[string]any{
		"plan": "Starter", "period": Localized{"id": "3 bulan", "en": "3 months"}, "amount": "Rp 50.123", "bank": "BCA", "account": "1234", "holder": "Reneo\nPT", "deadline": "20/10/2026 10:00", "url": "https://x/order/abc",
	})
	if err != nil || id != "wamid.ABC" {
		t.Fatalf("%q %v", id, err)
	}
	body := meta.sent[0]
	tpl := body["template"].(map[string]any)
	if body["to"] != "6281234567890" || tpl["name"] != templateName(EventBuyerOrderCreated) {
		t.Fatalf("the number is digits only and the name follows the event: %v", body)
	}
	if tpl["language"].(map[string]any)["code"] != "id" {
		t.Fatalf("language: %v", tpl["language"])
	}
	params := tpl["components"].([]any)[0].(map[string]any)["parameters"].([]any)
	var texts []string
	for _, p := range params {
		texts = append(texts, p.(map[string]any)["text"].(string))
	}
	joined := strings.Join(texts, "|")
	for _, w := range []string{"Starter", "3 bulan", "Rp 50.123", "BCA", "Reneo PT", "https://x/order/abc"} {
		if !strings.Contains(joined, w) {
			t.Fatalf("%q is not among the variables: %s", w, joined)
		}
	}
	if strings.Contains(joined, "\n") {
		t.Fatalf("a variable is one line: %q", joined)
	}
}

func TestAnAlertTemplateCarriesItsVariantLine(t *testing.T) {
	meta := newFakeMeta(t)
	c := NewWhatsAppCloud("tok", "555", "777", "").WithBase(meta.URL)
	_, err := c.SendEvent(context.Background(), "628123456789", EventRequestFlood, "en", map[string]any{"count": 40, "minutes": 5, "ips": 3, "samples": "1.2.3.4", "variant": "escalated", "level": 2})
	if err != nil {
		t.Fatal(err)
	}
	params := meta.sent[0]["template"].(map[string]any)["components"].([]any)[0].(map[string]any)["parameters"].([]any)
	last := params[len(params)-1].(map[string]any)["text"].(string)
	if last != "Raised to level 2." {
		t.Fatalf("the last variable is the line that changes: %q", last)
	}
}

func TestMetaFailuresAreSortedForTheWorker(t *testing.T) {
	cases := []struct {
		status int
		body   string
		check  func(*SendError) bool
		what   string
	}{
		{401, `{"error":{"message":"Invalid token","type":"OAuthException","code":190}}`, func(e *SendError) bool { return e.Config && !e.Temporary }, "a bad token is the channel's"},
		{400, `{"error":{"message":"not on whatsapp","code":131026}}`, func(e *SendError) bool { return e.Blocked }, "a number not on WhatsApp is the recipient's"},
		{400, `{"error":{"message":"template missing","code":132001}}`, func(e *SendError) bool { return !e.Config && !e.Temporary && !e.Blocked }, "an unapproved template fails that message only"},
		{400, `{"error":{"message":"pair rate limit","code":131056}}`, func(e *SendError) bool { return e.Temporary }, "a pair limit is temporary"},
		{429, `{}`, func(e *SendError) bool { return e.Temporary }, "429 is temporary"},
		{503, `{}`, func(e *SendError) bool { return e.Temporary }, "5xx is temporary"},
	}
	var current int
	var body string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(current)
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()
	c := NewWhatsAppCloud("secret-token", "555", "777", "").WithBase(srv.URL)
	for _, tc := range cases {
		current, body = tc.status, tc.body
		_, err := c.SendEvent(context.Background(), "628123456789", EventTest, "id", nil)
		se := AsSendError(err)
		if err == nil || !tc.check(se) {
			t.Errorf("%s: %+v", tc.what, se)
		}
		if strings.Contains(se.Message, "secret-token") {
			t.Errorf("the token must never show in a message")
		}
	}
	srv.Close()
	_, err := c.SendEvent(context.Background(), "628123456789", EventTest, "id", nil)
	if se := AsSendError(err); !se.Temporary || strings.Contains(se.Message, "secret-token") {
		t.Fatalf("unreachable: %+v", se)
	}
}

func TestTemplatesAreMadeOnlyWhereMetHasNone(t *testing.T) {
	meta := newFakeMeta(t)
	c := NewWhatsAppCloud("tok", "555", "777", "").WithBase(meta.URL)
	ctx := context.Background()
	states, err := c.TemplateStates(ctx)
	if err != nil || len(states) != 2*len(catalog) {
		t.Fatalf("%d %v", len(states), err)
	}
	for _, st := range states {
		if st.Status != "MISSING" {
			t.Fatalf("a fresh account has none: %+v", st)
		}
	}
	// one is already there, approved
	meta.templates[templateName(EventTest)+"|id"] = "APPROVED"
	meta.templates[templateName(EventOrderPaid)+"|en_US"] = "PENDING"
	created, err := c.CreateTemplates(ctx)
	if err != nil || created != 2*len(catalog)-2 {
		t.Fatalf("only the missing ones: %d %v", created, err)
	}
	for _, sent := range meta.created {
		if sent["category"] != "UTILITY" {
			t.Fatalf("they are utility messages: %v", sent)
		}
		comp := sent["components"].([]any)[0].(map[string]any)
		if comp["type"] != "BODY" || comp["text"] == "" {
			t.Fatalf("the body: %v", comp)
		}
		if params := strings.Count(comp["text"].(string), "{{"); params > 0 {
			example := comp["example"].(map[string]any)["body_text"].([]any)[0].([]any)
			if len(example) != params {
				t.Fatalf("Meta wants a sample for each of the %d variables, got %d", params, len(example))
			}
		}
		if sent["name"] == templateName(EventTest) && sent["language"] == "id" {
			t.Fatal("an existing template is not made again")
		}
		if sent["name"] == templateName(EventOrderPaid) && sent["language"] == "en" {
			t.Fatal("a regional version counts as the language")
		}
	}
	states, _ = c.TemplateStates(ctx)
	approved := 0
	for _, st := range states {
		if st.Status == "APPROVED" {
			approved++
		}
	}
	if approved != 1 {
		t.Fatalf("only the approved one is approved: %d", approved)
	}
	// a second run has nothing left to make
	if n, err := c.CreateTemplates(ctx); err != nil || n != 0 {
		t.Fatalf("nothing left: %d %v", n, err)
	}
}

func TestThePhoneCheckNamesTheNumberOrRefuses(t *testing.T) {
	meta := newFakeMeta(t)
	c := NewWhatsAppCloud("tok", "555", "777", "").WithBase(meta.URL)
	info, err := c.Phone(context.Background())
	if err != nil || info.Display != "+62 812-0000-1111" || info.VerifiedName != "Reneo" {
		t.Fatalf("%+v %v", info, err)
	}
	bad := NewWhatsAppCloud("wrong", "555", "777", "").WithBase(meta.URL)
	if _, err := bad.Phone(context.Background()); err == nil || !AsSendError(err).Config {
		t.Fatalf("a wrong token is refused as the channel's problem: %v", err)
	}
}

func TestNormalizePhoneWritesNumbersTheWayWhatsAppWantsThem(t *testing.T) {
	good := map[string]string{
		"0812-3456-7890":     "6281234567890",
		"+62 812 3456 7890":  "6281234567890",
		"62812 3456 7890":    "6281234567890",
		"8123456789":         "628123456789",
		"0062 812 3456 7890": "6281234567890",
		"+1 202 555 0143":    "12025550143",
		"(0812) 3456-7890":   "6281234567890",
	}
	for in, want := range good {
		if got, err := NormalizePhone(in); err != nil || got != want {
			t.Errorf("%q: got %q %v want %q", in, got, err, want)
		}
	}
	for _, in := range []string{"", "abc", "123", "0712345678", "0812", "62 21 5555 1234", strings.Repeat("9", 16)} {
		if got, err := NormalizePhone(in); err == nil {
			t.Errorf("%q should be refused, got %q", in, got)
		}
	}
}
