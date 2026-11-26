package ai

import (
	"regexp"
	"strings"
)

var (
	thinkTagRe     = regexp.MustCompile(`(?is)<think>.*?</think>`)
	fencedBlockRe  = regexp.MustCompile("(?is)```(?:json)?\\s*(\\{[\\s\\S]*?\\})\\s*```")
	trailingCommaRe = regexp.MustCompile(`,\s*([}\]])`)
)

// ExtractJSONObject strips reasoning blocks and markdown code fences, extracts the first
// balanced JSON object, and repairs common LLM formatting glitches (literal newlines inside
// JSON strings and trailing commas).
func ExtractJSONObject(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	s = strings.TrimSpace(thinkTagRe.ReplaceAllString(s, ""))

	if m := fencedBlockRe.FindStringSubmatch(s); len(m) >= 2 {
		if candidate := repairJSONString(strings.TrimSpace(m[1])); candidate != "" {
			return candidate
		}
	}

	if balanced := extractBalancedObject(s); balanced != "" {
		return repairJSONString(balanced)
	}

	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return repairJSONString(strings.TrimSpace(s[start : end+1]))
	}
	return repairJSONString(s)
}

func extractBalancedObject(s string) string {
	start := -1
	depth := 0
	inString := false
	escaped := false

	for i := 0; i < len(s); i++ {
		ch := s[i]
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == '"' {
				inString = false
			}
			continue
		}
		switch ch {
		case '"':
			if start >= 0 {
				inString = true
			}
		case '{':
			if start < 0 {
				start = i
			}
			depth++
		case '}':
			if start >= 0 {
				depth--
				if depth == 0 {
					return strings.TrimSpace(s[start : i+1])
				}
			}
		}
	}
	return ""
}

// repairJSONString escapes raw control newlines inside JSON string literals and removes
// trailing commas before closing braces/brackets.
func repairJSONString(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 16)
	inString := false
	escaped := false

	for i := 0; i < len(s); i++ {
		ch := s[i]
		if inString {
			if escaped {
				b.WriteByte(ch)
				escaped = false
				continue
			}
			if ch == '\\' {
				b.WriteByte(ch)
				escaped = true
				continue
			}
			if ch == '"' {
				inString = false
				b.WriteByte(ch)
				continue
			}
			if ch == '\n' {
				b.WriteString(`\n`)
				continue
			}
			if ch == '\r' {
				continue
			}
			if ch == '\t' {
				b.WriteString(`\t`)
				continue
			}
			b.WriteByte(ch)
			continue
		}
		if ch == '"' {
			inString = true
		}
		b.WriteByte(ch)
	}
	cleaned := trailingCommaRe.ReplaceAllString(b.String(), "$1")
	return strings.TrimSpace(cleaned)
}
