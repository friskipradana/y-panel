package notify

// Localized is a value of an event that reads differently per language: a kind of order, a period, a reason. The
// event is stored once and rendered for each recipient, so the words that come from the code, not from a person, are given in
// both languages and the recipient gets theirs. After a round trip through JSON it is a plain map with the same keys.
type Localized map[string]string

// TimeLayout is how a moment is written in a notice: day/month/year, which is the same in every language
const TimeLayout = "02/01/2006 15:04"

// resolve gives the text of a value for a language: a Localized value is picked by language (Indonesian when it has none for
// that language), anything else is left as it is
func resolve(v any, locale string) any {
	var pick func(get func(string) (string, bool)) (string, bool)
	pick = func(get func(string) (string, bool)) (string, bool) {
		if text, ok := get(locale); ok && text != "" {
			return text, true
		}
		if text, ok := get("id"); ok && text != "" {
			return text, true
		}
		return "", false
	}
	switch value := v.(type) {
	case Localized:
		if text, ok := pick(func(k string) (string, bool) { s, ok := value[k]; return s, ok }); ok {
			return text
		}
	case map[string]string:
		if text, ok := pick(func(k string) (string, bool) { s, ok := value[k]; return s, ok }); ok {
			return text
		}
	case map[string]any:
		_, hasID := value["id"]
		_, hasEN := value["en"]
		if hasID || hasEN {
			if text, ok := pick(func(k string) (string, bool) { s, isString := value[k].(string); return s, isString }); ok {
				return text
			}
		}
	}
	return v
}
