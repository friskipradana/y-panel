package notify

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

// The seller can word a notice in their own way. A changed text uses the same {name} placeholders as the text that comes
// with Reneo, and only the tags Telegram and WhatsApp can show.

// MaxTemplateRunes is the longest text the seller can save for one event
const MaxTemplateRunes = 1200

// extraVars are values an event carries that its own text does not use, so a seller can add them to a changed text
var extraVars = map[string][]string{
	EventOrderCreated:      {"invoice"},
	EventOrderPaid:         {"invoice"},
	EventBuyerOrderCreated: {"order", "invoice"},
	EventBuyerOrderPaid:    {"order", "amount", "invoice"},
}

var placeholderRe = regexp.MustCompile(`\{([A-Za-z][A-Za-z0-9]*)\}`)

// eventOrder is the order the events are listed in: what the seller works with first, then what the buyer gets, then the alerts
var eventOrder = []string{
	EventOrderCreated, EventOrderReview, EventOrderPaid, EventOrderAttention, EventPlanEnded, EventDomainError,
	EventBuyerOrderCreated, EventBuyerOrderPaid, EventBuyerPlanReminder, EventBuyerPlanEnded,
	EventLoginFailed, EventLoginLocked, EventLoginNew, EventPasswordChanged, EventTokenCreated,
	EventAccountScan, EventLoginFlood, EventRequestFlood, EventOrderAbuse, EventWebhookProbe, EventTest,
}

// Events lists every event that has a text, in the order of eventOrder; an event it does not name comes last
func Events() []string {
	rank := map[string]int{}
	for i, event := range eventOrder {
		rank[event] = i
	}
	out := make([]string, 0, len(catalog))
	for event := range catalog {
		out = append(out, event)
	}
	position := func(event string) int {
		if r, ok := rank[event]; ok {
			return r
		}
		return len(eventOrder)
	}
	sort.Slice(out, func(i, j int) bool {
		if pi, pj := position(out[i]), position(out[j]); pi != pj {
			return pi < pj
		}
		return out[i] < out[j]
	})
	return out
}

// DefaultText is the text that comes with Reneo, without the brand line that is added to every notice
func DefaultText(event, locale string) string {
	t, ok := catalog[event]
	if !ok {
		return ""
	}
	if locale == "en" {
		return t.en
	}
	return t.id
}

// Variables are the {names} a text of this event may use
func Variables(event string) []string {
	seen := map[string]bool{}
	out := []string{}
	add := func(name string) {
		if !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	for _, text := range []string{DefaultText(event, "id"), DefaultText(event, "en")} {
		for _, m := range placeholderRe.FindAllStringSubmatch(text, -1) {
			add(m[1])
		}
	}
	for _, name := range extraVars[event] {
		add(name)
	}
	return out
}

// A lone ">" is plain text (the menus are written "Settings > Security"); a "<" has to start one of the allowed tags
var tagRe = regexp.MustCompile(`</?[A-Za-z][^>]*>|<`)

// ValidateTemplate says what is wrong with a text the seller wrote, or nil when it can be saved
func ValidateTemplate(event, body string) error {
	if !Known(event) {
		return errors.New("unknown event")
	}
	if strings.TrimSpace(body) == "" {
		return errors.New("write the message")
	}
	if utf8.RuneCountInString(body) > MaxTemplateRunes {
		return fmt.Errorf("the message is longer than %d characters", MaxTemplateRunes)
	}
	allowed := map[string]bool{}
	for _, name := range Variables(event) {
		allowed[name] = true
	}
	for _, m := range placeholderRe.FindAllStringSubmatch(body, -1) {
		if !allowed[m[1]] {
			return fmt.Errorf("unknown variable {%s}", m[1])
		}
	}
	open := map[string]int{}
	for _, tag := range tagRe.FindAllString(body, -1) {
		name := strings.ToLower(strings.Trim(tag, "</>"))
		if name != "b" && name != "i" && name != "code" {
			return errors.New("only the tags <b>, <i> and <code> are allowed")
		}
		if strings.HasPrefix(tag, "</") {
			open[name]--
			if open[name] < 0 {
				return errors.New("a tag is closed that was not opened")
			}
		} else {
			open[name]++
		}
	}
	for _, n := range open {
		if n != 0 {
			return errors.New("a tag is not closed")
		}
	}
	return nil
}
