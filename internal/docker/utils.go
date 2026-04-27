package docker

import "strings"

func splitNonEmptyLines(input string) []string {
	lines := make([]string, 0)
	current := ""
	for _, r := range input {
		if r == '\n' {
			if current != "" {
				lines = append(lines, current)
				current = ""
			}
			continue
		}
		if r != '\r' {
			current += string(r)
		}
	}
	if current != "" {
		lines = append(lines, current)
	}
	return lines
}

func normalizeState(state string) string {
	switch state {
	case "running", "exited", "paused", "restarting", "dead":
		return state
	default:
		return "dead"
	}
}

func normalizeEnvVars(mode, raw string, items []EnvVar) ([]EnvVar, error) {
	if strings.EqualFold(strings.TrimSpace(mode), "raw") {
		return parseRawEnv(raw)
	}
	return normalizeEnvList(items), nil
}

func normalizeEnvList(items []EnvVar) []EnvVar {
	env := make([]EnvVar, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		key := strings.TrimSpace(item.Key)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		env = append(env, EnvVar{Key: key, Value: item.Value})
	}
	return env
}

func parseRawEnv(raw string) ([]EnvVar, error) {
	lines := strings.Split(raw, "\n")
	env := make([]EnvVar, 0, len(lines))
	seen := map[string]struct{}{}
	for idx, line := range lines {
		trimmed := strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		parts := strings.SplitN(trimmed, "=", 2)
		if len(parts) != 2 {
			return nil, &EnvParseError{Line: idx + 1, Message: "expected KEY=value"}
		}
		key := strings.TrimSpace(parts[0])
		if key == "" {
			return nil, &EnvParseError{Line: idx + 1, Message: "key is required"}
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		env = append(env, EnvVar{Key: key, Value: parts[1]})
	}
	return env, nil
}

func envVarsToRaw(items []EnvVar) string {
	var lines []string
	for _, item := range normalizeEnvList(items) {
		lines = append(lines, item.Key+"="+item.Value)
	}
	return strings.Join(lines, "\n")
}

type EnvParseError struct {
	Line    int
	Message string
}

func (e *EnvParseError) Error() string {
	return "invalid env entry on line " + itoa(e.Line) + ": " + e.Message
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	var digits [20]byte
	i := len(digits)
	for value > 0 {
		i--
		digits[i] = byte('0' + value%10)
		value /= 10
	}
	return string(digits[i:])
}

func cpuQuota(limitPct int) float64 {
	if limitPct <= 0 {
		return 1
	}
	cpu := float64(limitPct) / 100
	if cpu < 0.1 {
		return 0.1
	}
	return cpu
}

func slugify(input string) string {
	input = strings.ToLower(strings.TrimSpace(input))
	var b strings.Builder
	lastDash := false
	for _, r := range input {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case r == '-' || r == '_' || r == ' ':
			if !lastDash && b.Len() > 0 {
				b.WriteRune('-')
				lastDash = true
			}
		}
	}
	result := strings.Trim(b.String(), "-")
	if len(result) > 48 {
		result = result[:48]
	}
	return result
}
