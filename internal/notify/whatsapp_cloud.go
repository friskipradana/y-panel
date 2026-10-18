package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	cloudKind    = "whatsapp_cloud"
	cloudBase    = "https://graph.facebook.com"
	cloudVersion = "v21.0"
	// every template ends with this line: Meta refuses a body that ends with a variable
	cloudFooter = "\n\n- Reneo"
)

// WhatsAppCloud is the official WhatsApp Business Platform of Meta. A message the panel starts must be a template
// that Meta approved, so every event of the catalog has one (made by Templates), and a send fills its variables.
type WhatsAppCloud struct {
	token   string
	phoneID string
	wabaID  string
	version string
	base    string
	http    *http.Client
}

func NewWhatsAppCloud(token, phoneID, wabaID, version string) *WhatsAppCloud {
	if version == "" {
		version = cloudVersion
	}
	return &WhatsAppCloud{
		token: strings.TrimSpace(token), phoneID: strings.TrimSpace(phoneID), wabaID: strings.TrimSpace(wabaID), version: version,
		base: cloudBase, http: &http.Client{Timeout: 20 * time.Second},
	}
}

// WithBase points the client at another address; tests use it to talk to a fake Meta
func (c *WhatsAppCloud) WithBase(base string) *WhatsAppCloud {
	c.base = strings.TrimRight(base, "/")
	return c
}

func (c *WhatsAppCloud) Kind() string { return cloudKind }

// EventSender is a channel that sends the event itself, not the text: WhatsApp Cloud sends an approved template
type EventSender interface {
	SendEvent(ctx context.Context, address, event, locale string, data map[string]any) (providerID string, err error)
}

// Send is not used: a message the panel starts has to be a template, see SendEvent
func (c *WhatsAppCloud) Send(context.Context, string, string) (string, error) {
	return "", &SendError{Message: "WhatsApp Cloud sends templates, not free text"}
}

type graphReply struct {
	Error *struct {
		Message   string `json:"message"`
		Type      string `json:"type"`
		Code      int    `json:"code"`
		Subcode   int    `json:"error_subcode"`
		UserTitle string `json:"error_user_title"`
		UserMsg   string `json:"error_user_msg"`
	} `json:"error"`
}

// call asks the Graph API and sorts the failure like the other channels: the network, 429 and 5xx and the limits of
// Meta can work later; a bad token or no permission is the channel's problem; a number that is not on WhatsApp is the
// recipient's; a template that is not approved fails that message only; the rest will never work.
func (c *WhatsAppCloud) call(ctx context.Context, method, path string, body any) ([]byte, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+"/"+c.version+"/"+strings.TrimLeft(path, "/"), reader)
	if err != nil {
		return nil, &SendError{Message: "could not build the request"}
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, &SendError{Message: "could not reach Meta: " + strings.ReplaceAll(err.Error(), c.token, "***"), Temporary: true}
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode >= 200 && res.StatusCode < 300 {
		return data, nil
	}
	var reply graphReply
	_ = json.Unmarshal(data, &reply)
	se := &SendError{Message: fmt.Sprintf("Meta: %s (%d)", http.StatusText(res.StatusCode), res.StatusCode)}
	if reply.Error != nil {
		detail := reply.Error.UserMsg
		if detail == "" {
			detail = reply.Error.Message
		}
		se.Message = fmt.Sprintf("Meta: %s (code %d)", detail, reply.Error.Code)
		switch code := reply.Error.Code; {
		case code == 4, code == 17, code == 32, code == 613, code == 80007, code == 130429, code == 131056, code == 133016:
			// limits of the app, the number, or one pair of numbers
			se.Temporary = true
		case code == 190, code == 10, code >= 200 && code <= 299, code == 100 && reply.Error.Subcode == 33:
			se.Config = true
		case code == 131026, code == 131021:
			// the number is not on WhatsApp, or is the sender's own
			se.Blocked = true
		case code == 131000, code == 131016:
			se.Temporary = true
		}
	}
	if res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500 {
		se.Temporary = true
	}
	if res.StatusCode == http.StatusUnauthorized {
		se.Config = true
	}
	return nil, se
}

// PhoneInfo is the number the token sends from
type PhoneInfo struct {
	Display      string `json:"display_phone_number"`
	VerifiedName string `json:"verified_name"`
	Quality      string `json:"quality_rating"`
}

// Phone checks the token and the phone number id together, and says whose number it is
func (c *WhatsAppCloud) Phone(ctx context.Context) (*PhoneInfo, error) {
	data, err := c.call(ctx, http.MethodGet, url.PathEscape(c.phoneID)+"?fields=display_phone_number,verified_name,quality_rating", nil)
	if err != nil {
		return nil, err
	}
	var info PhoneInfo
	if err := json.Unmarshal(data, &info); err != nil || info.Display == "" {
		return nil, errors.New("Meta did not say whose number this is")
	}
	return &info, nil
}

func (c *WhatsAppCloud) Test(ctx context.Context) error {
	_, err := c.Phone(ctx)
	return err
}

// ─── Templates ────────────────────────────────────────────────────────────────

// CloudTemplate is one template to make in Meta: the body of an event in one language, with its variables
type CloudTemplate struct {
	Name     string   `json:"name"`
	Language string   `json:"language"`
	Event    string   `json:"event"`
	Body     string   `json:"body"`
	Params   []string `json:"params"`
	Samples  []string `json:"samples"`
}

var placeholderPattern = regexp.MustCompile(`\{([a-zA-Z]+)\}`)

// templateName is the name of the template of an event: the same in both languages, which Meta keeps apart by language
func templateName(event string) string {
	return "reneo_" + strings.NewReplacer(".", "_", "-", "_").Replace(event)
}

// variantEvents carry a line that changes (first, raised, ongoing, ended); a template cannot change, so the line is a variable
func hasVariant(event string) bool {
	for _, e := range DetectorEvents {
		if e == event {
			return true
		}
	}
	return false
}

var sampleValues = map[string]string{
	"plan": "Starter", "amount": "Rp 50.123", "bank": "BCA", "account": "1234567890", "holder": "Reneo", "deadline": "20 Okt 2026 10:00",
	"url": "https://panel.example.com/login", "username": "andi", "note": "transfer cocok", "detail": "Pesanan 12 menunggu", "hostname": "andi.example.com",
	"time": "20 Okt 2026 10:00", "ip": "203.0.113.5", "browser": "Chrome", "count": "5", "minutes": "10", "ips": "3", "samples": "203.0.113.5",
	"name": "deploy", "order": "12", "reason": "perlu persetujuan", "variantLine": "Meningkat ke tingkat 2.",
}

// Templates is every template the catalog needs, in both languages
func Templates() []CloudTemplate {
	events := make([]string, 0, len(catalog))
	for event := range catalog {
		events = append(events, event)
	}
	sort.Strings(events)
	var out []CloudTemplate
	for _, event := range events {
		for _, lang := range []string{"id", "en"} {
			out = append(out, buildTemplate(event, lang))
		}
	}
	return out
}

func buildTemplate(event, lang string) CloudTemplate {
	x := catalog[event]
	text := x.id
	if lang == "en" {
		text = x.en
	}
	text = strings.NewReplacer("<b>", "*", "</b>", "*").Replace(text)
	if hasVariant(event) {
		text += "\n{variantLine}"
	}
	var params []string
	body := placeholderPattern.ReplaceAllStringFunc(text, func(m string) string {
		params = append(params, m[1:len(m)-1])
		return fmt.Sprintf("{{%d}}", len(params))
	})
	// the title line is the only line break Meta keeps in a body; variables do not take any
	samples := make([]string, len(params))
	for i, p := range params {
		samples[i] = sampleValues[p]
		if samples[i] == "" {
			samples[i] = "contoh"
		}
	}
	return CloudTemplate{Name: templateName(event), Language: lang, Event: event, Body: body + cloudFooter, Params: params, Samples: samples}
}

var spaceRun = regexp.MustCompile(`\s{2,}`)

// templateValue makes a value fit a variable: one line, no runs of spaces, not empty, not longer than Meta allows
func templateValue(v any) string {
	s := strings.TrimSpace(spaceRun.ReplaceAllString(strings.NewReplacer("\n", " ", "\t", " ").Replace(strings.TrimSpace(fmt.Sprint(v))), " "))
	if v == nil || s == "" || s == "<nil>" {
		return "-"
	}
	if len(s) > 1000 {
		s = s[:1000]
	}
	return s
}

// SendEvent sends the template of an event, filled from the data of the event
func (c *WhatsAppCloud) SendEvent(ctx context.Context, address, event, locale string, data map[string]any) (string, error) {
	if !Known(event) {
		return "", &SendError{Message: "no template is known for the event " + event}
	}
	lang := "id"
	if locale == "en" {
		lang = "en"
	}
	tpl := buildTemplate(event, lang)
	values := map[string]any{}
	for k, v := range data {
		values[k] = v
	}
	if variant, _ := data["variant"].(string); variant != "" {
		if line, ok := variantLines[variant]; ok {
			picked := line.id
			if lang == "en" {
				picked = line.en
			}
			values["variantLine"] = fill(picked, data)
		}
	}
	if _, ok := values["variantLine"]; !ok {
		values["variantLine"] = "-"
	}
	parameters := make([]map[string]string, len(tpl.Params))
	for i, name := range tpl.Params {
		parameters[i] = map[string]string{"type": "text", "text": templateValue(values[name])}
	}
	components := []map[string]any{}
	if len(parameters) > 0 {
		components = append(components, map[string]any{"type": "body", "parameters": parameters})
	}
	data2, err := c.call(ctx, http.MethodPost, url.PathEscape(c.phoneID)+"/messages", map[string]any{
		"messaging_product": "whatsapp", "to": onlyDigits(address), "type": "template",
		"template": map[string]any{"name": tpl.Name, "language": map[string]string{"code": lang}, "components": components},
	})
	if err != nil {
		return "", err
	}
	var sent struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	_ = json.Unmarshal(data2, &sent)
	if len(sent.Messages) == 0 {
		return "", nil
	}
	return sent.Messages[0].ID, nil
}

// TemplateState is what Meta says about one template of the catalog
type TemplateState struct {
	CloudTemplate
	// Status is APPROVED, PENDING, REJECTED, PAUSED, or MISSING when Meta has none by that name and language
	Status string `json:"status"`
}

// TemplateStates asks Meta which of the catalog's templates exist and where each one stands
func (c *WhatsAppCloud) TemplateStates(ctx context.Context) ([]TemplateState, error) {
	if c.wabaID == "" {
		return nil, errors.New("the WhatsApp Business Account id is not set")
	}
	have := map[string]string{}
	next := url.PathEscape(c.wabaID) + "/message_templates?fields=name,language,status&limit=200"
	for next != "" {
		data, err := c.call(ctx, http.MethodGet, next, nil)
		if err != nil {
			return nil, err
		}
		var page struct {
			Data []struct {
				Name, Language, Status string
			} `json:"data"`
			Paging struct {
				Next string `json:"next"`
			} `json:"paging"`
		}
		if err := json.Unmarshal(data, &page); err != nil {
			return nil, errors.New("Meta answered with something unreadable")
		}
		for _, t := range page.Data {
			have[t.Name+"|"+t.Language] = t.Status
		}
		next = ""
		if page.Paging.Next != "" {
			if u, err := url.Parse(page.Paging.Next); err == nil && u.RawQuery != "" {
				next = url.PathEscape(c.wabaID) + "/message_templates?" + u.RawQuery
			}
		}
	}
	var out []TemplateState
	for _, tpl := range Templates() {
		status := have[tpl.Name+"|"+tpl.Language]
		if status == "" {
			// Meta writes "id" as "id" and English as "en"; a region such as en_US counts as English
			for key, st := range have {
				if strings.HasPrefix(key, tpl.Name+"|"+tpl.Language+"_") {
					status = st
				}
			}
		}
		if status == "" {
			status = "MISSING"
		}
		out = append(out, TemplateState{CloudTemplate: tpl, Status: status})
	}
	return out, nil
}

// CreateTemplates makes the templates Meta does not have yet, as utility messages for review. It returns how many it
// sent and the first error, if any; one that already exists is not an error.
func (c *WhatsAppCloud) CreateTemplates(ctx context.Context) (created int, err error) {
	states, err := c.TemplateStates(ctx)
	if err != nil {
		return 0, err
	}
	for _, st := range states {
		if st.Status != "MISSING" {
			continue
		}
		_, callErr := c.call(ctx, http.MethodPost, url.PathEscape(c.wabaID)+"/message_templates", map[string]any{
			"name": st.Name, "language": st.Language, "category": "UTILITY",
			"components": bodyComponent(st),
		})
		if callErr != nil {
			var se *SendError
			if errors.As(callErr, &se) && strings.Contains(strings.ToLower(se.Message), "already") {
				continue
			}
			if err == nil {
				err = fmt.Errorf("%s (%s): %w", st.Name, st.Language, callErr)
			}
			continue
		}
		created++
	}
	return created, err
}

func bodyComponent(st TemplateState) []map[string]any {
	body := map[string]any{"type": "BODY", "text": st.Body}
	if len(st.Samples) > 0 {
		body["example"] = map[string]any{"body_text": [][]string{st.Samples}}
	}
	return []map[string]any{body}
}

// SendText sends plain text. Meta only allows it to a number that wrote to us in the last 24 hours, so it is used
// for the answer to a message, never to start one.
func (c *WhatsAppCloud) SendText(ctx context.Context, to, text string) error {
	_, err := c.call(ctx, http.MethodPost, url.PathEscape(c.phoneID)+"/messages", map[string]any{
		"messaging_product": "whatsapp", "to": onlyDigits(to), "type": "text", "text": map[string]any{"body": text},
	})
	return err
}
