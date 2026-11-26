package httpserver

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/ai"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

type aiGeneratedTodo struct {
	Title    string `json:"title"`
	Notes    string `json:"notes"`
	Priority string `json:"priority"`
}

type aiGeneratedDevDoc struct {
	ClientName    string                `json:"clientName,omitempty"`
	ClientCompany string                `json:"clientCompany,omitempty"`
	ClientContact string                `json:"clientContact,omitempty"`
	Title         string                `json:"title"`
	Summary       string                `json:"summary"`
	Discount      int64                 `json:"discount,omitempty"`
	DPPercent     int                   `json:"dpPercent"`
	PaymentInfo   string                `json:"paymentInfo,omitempty"`
	Items         []database.DevDocItem `json:"items"`
	Terms         []string              `json:"terms"`
	WAMessage     string                `json:"waMessage"`
	Todos         []aiGeneratedTodo     `json:"todos"`
}

var nonNumericRe = regexp.MustCompile(`[^0-9.,-]`)

func parseFlexibleInt64(v any) int64 {
	switch val := v.(type) {
	case nil:
		return 0
	case float64:
		if math.IsNaN(val) || math.IsInf(val, 0) {
			return 0
		}
		return int64(math.Round(val))
	case int64:
		return val
	case int:
		return int64(val)
	case json.Number:
		if i, err := val.Int64(); err == nil {
			return i
		}
		if f, err := val.Float64(); err == nil {
			return int64(math.Round(f))
		}
	case string:
		raw := strings.TrimSpace(strings.ToLower(val))
		if raw == "" {
			return 0
		}
		// Handle Indonesian shorthand like "4 juta", "300rb", "1.5jt"
		multiplier := 1.0
		switch {
		case strings.Contains(raw, "juta") || strings.Contains(raw, "jt"):
			multiplier = 1_000_000
		case strings.Contains(raw, "ribu") || strings.Contains(raw, "rb") || strings.HasSuffix(raw, "k"):
			multiplier = 1_000
		}
		cleaned := nonNumericRe.ReplaceAllString(raw, "")
		if cleaned == "" {
			return 0
		}
		if multiplier > 1 {
			cleaned = strings.ReplaceAll(cleaned, ",", ".")
			if f, err := strconv.ParseFloat(cleaned, 64); err == nil {
				return int64(math.Round(f * multiplier))
			}
			return 0
		}
		// Distinguish thousand separators ("2.900.000" / "2,900,000") from decimal ("50.0")
		if strings.Count(cleaned, ".") > 1 || (strings.Count(cleaned, ".") == 1 && len(cleaned)-strings.Index(cleaned, ".")-1 == 3) {
			cleaned = strings.ReplaceAll(cleaned, ".", "")
		}
		if strings.Count(cleaned, ",") > 1 || (strings.Count(cleaned, ",") == 1 && len(cleaned)-strings.Index(cleaned, ",")-1 == 3) {
			cleaned = strings.ReplaceAll(cleaned, ",", "")
		} else {
			cleaned = strings.ReplaceAll(cleaned, ",", ".")
		}
		if f, err := strconv.ParseFloat(cleaned, 64); err == nil {
			return int64(math.Round(f))
		}
	}
	return 0
}

func firstStringField(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			if s, ok := v.(string); ok {
				if trimmed := strings.TrimSpace(s); trimmed != "" {
					return trimmed
				}
			}
		}
	}
	return ""
}

func firstAnyField(m map[string]any, keys ...string) any {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			return v
		}
	}
	return nil
}

func stripEmDash(s string) string {
	return strings.TrimSpace(strings.ReplaceAll(s, "—", ","))
}

// parseGeneratedDevDoc tolerantly decodes LLM output into a clean Dev Desk draft, handling
// markdown fences, reasoning tags, formatted IDR strings, snake_case keys, and envelope wrappers.
func parseGeneratedDevDoc(raw string) (*aiGeneratedDevDoc, error) {
	cleanJSON := ai.ExtractJSONObject(raw)
	if cleanJSON == "" {
		return nil, fmt.Errorf("AI mengembalikan respons kosong")
	}
	var root map[string]any
	if err := json.Unmarshal([]byte(cleanJSON), &root); err != nil {
		snippet := strings.TrimSpace(raw)
		if len(snippet) > 160 {
			snippet = snippet[:160] + "..."
		}
		return nil, fmt.Errorf("format JSON dari AI tidak dapat dibaca (%v). Cuplikan respons: %s", err, snippet)
	}

	// Unwrap single-key envelopes such as {"document": {...}} or {"data": {...}}
	for _, wrapper := range []string{"document", "doc", "result", "data", "quotation", "invoice"} {
		if inner, ok := root[wrapper].(map[string]any); ok && firstStringField(root, "title") == "" {
			root = inner
			break
		}
	}

	out := &aiGeneratedDevDoc{
		ClientName:    stripEmDash(firstStringField(root, "clientName", "client_name")),
		ClientCompany: stripEmDash(firstStringField(root, "clientCompany", "client_company")),
		ClientContact: stripEmDash(firstStringField(root, "clientContact", "client_contact")),
		Title:         stripEmDash(firstStringField(root, "title", "projectTitle", "project_title")),
		Summary:       stripEmDash(firstStringField(root, "summary", "description", "overview")),
		Discount:      maxInt64(0, parseFlexibleInt64(firstAnyField(root, "discount", "discountAmount", "discount_amount"))),
		DPPercent:     int(parseFlexibleInt64(firstAnyField(root, "dpPercent", "dp_percent", "downPaymentPercent"))),
		PaymentInfo:   stripEmDash(firstStringField(root, "paymentInfo", "payment_info")),
		WAMessage:     stripEmDash(firstStringField(root, "waMessage", "wa_message", "whatsappMessage", "whatsapp_message")),
		Items:         []database.DevDocItem{},
		Terms:         []string{},
		Todos:         []aiGeneratedTodo{},
	}
	if out.DPPercent < 0 {
		out.DPPercent = 0
	}
	if out.DPPercent > 100 {
		out.DPPercent = 100
	}
	if firstAnyField(root, "dpPercent", "dp_percent", "downPaymentPercent") == nil {
		out.DPPercent = 50
	}

	// Parse items
	if rawItems, ok := firstAnyField(root, "items", "lineItems", "line_items").([]any); ok {
		for _, entry := range rawItems {
			m, ok := entry.(map[string]any)
			if !ok {
				continue
			}
			title := stripEmDash(firstStringField(m, "title", "name", "item"))
			if title == "" {
				continue
			}
			qty := parseFlexibleInt64(firstAnyField(m, "qty", "quantity"))
			if qty <= 0 {
				qty = 1
			}
			unitPrice := maxInt64(0, parseFlexibleInt64(firstAnyField(m, "unitPrice", "unit_price", "price", "amount")))
			unit := stripEmDash(firstStringField(m, "unit"))
			if unit == "" {
				unit = "Paket"
			}
			out.Items = append(out.Items, database.DevDocItem{
				Title:       title,
				Description: stripEmDash(firstStringField(m, "description", "desc", "scope")),
				Qty:         qty,
				Unit:        unit,
				UnitPrice:   unitPrice,
				Subtotal:    qty * unitPrice,
			})
		}
	}

	// Parse terms (array or newline-separated string)
	switch rawTerms := firstAnyField(root, "terms", "conditions", "syarat").(type) {
	case []any:
		for _, entry := range rawTerms {
			if s, ok := entry.(string); ok {
				if clean := stripEmDash(strings.TrimPrefix(strings.TrimSpace(s), "- ")); clean != "" {
					out.Terms = append(out.Terms, clean)
				}
			}
		}
	case string:
		for _, line := range strings.Split(rawTerms, "\n") {
			if clean := stripEmDash(strings.TrimPrefix(strings.TrimSpace(line), "- ")); clean != "" {
				out.Terms = append(out.Terms, clean)
			}
		}
	}

	// Parse todos (array of objects or array of strings)
	if rawTodos, ok := firstAnyField(root, "todos", "checklist", "tasks").([]any); ok {
		for _, entry := range rawTodos {
			switch v := entry.(type) {
			case string:
				if clean := stripEmDash(v); clean != "" {
					out.Todos = append(out.Todos, aiGeneratedTodo{Title: clean, Priority: "medium"})
				}
			case map[string]any:
				title := stripEmDash(firstStringField(v, "title", "task", "name"))
				if title == "" {
					continue
				}
				prio := strings.ToLower(firstStringField(v, "priority"))
				if prio != "high" && prio != "medium" && prio != "low" {
					prio = "medium"
				}
				out.Todos = append(out.Todos, aiGeneratedTodo{
					Title:    title,
					Notes:    stripEmDash(firstStringField(v, "notes", "description", "detail")),
					Priority: prio,
				})
			}
		}
	}

	if out.Title == "" && len(out.Items) == 0 && out.Summary == "" {
		return nil, fmt.Errorf("AI tidak menghasilkan rincian dokumen. Coba perjelas catatan klien atau ganti model AI.")
	}
	if out.Title == "" && len(out.Items) > 0 {
		out.Title = out.Items[0].Title
	}
	return out, nil
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
