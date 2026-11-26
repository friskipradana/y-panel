package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

// Config holds decrypted runtime settings for an AI provider.
type Config struct {
	Provider    string  `json:"provider"`
	BaseURL     string  `json:"baseUrl"`
	Model       string  `json:"model"`
	APIKey      string  `json:"-"`
	Temperature float64 `json:"temperature"`
	Enabled     bool    `json:"enabled"`
}

// ProviderPreset defines default base URL and model per provider key.
type ProviderPreset struct {
	ID             string `json:"id"`
	Label          string `json:"label"`
	DefaultBaseURL string `json:"defaultBaseUrl"`
	DefaultModel   string `json:"defaultModel"`
	KeyRequired    bool   `json:"keyRequired"`
}

var Presets = []ProviderPreset{
	{ID: "openai", Label: "OpenAI", DefaultBaseURL: "https://api.openai.com/v1", DefaultModel: "gpt-4o-mini", KeyRequired: true},
	{ID: "gemini", Label: "Google Gemini", DefaultBaseURL: "https://generativelanguage.googleapis.com/v1beta/openai", DefaultModel: "gemini-2.5-flash", KeyRequired: true},
	{ID: "openrouter", Label: "OpenRouter", DefaultBaseURL: "https://openrouter.ai/api/v1", DefaultModel: "google/gemini-2.5-flash", KeyRequired: true},
	{ID: "deepseek", Label: "DeepSeek", DefaultBaseURL: "https://api.deepseek.com/v1", DefaultModel: "deepseek-chat", KeyRequired: true},
	{ID: "groq", Label: "Groq", DefaultBaseURL: "https://api.groq.com/openai/v1", DefaultModel: "llama-3.3-70b-versatile", KeyRequired: true},
	{ID: "anthropic", Label: "Anthropic Claude", DefaultBaseURL: "https://api.anthropic.com/v1", DefaultModel: "claude-3-5-haiku-latest", KeyRequired: true},
	{ID: "ollama", Label: "Ollama (Local)", DefaultBaseURL: "http://127.0.0.1:11434/v1", DefaultModel: "llama3.1", KeyRequired: false},
	{ID: "custom", Label: "OpenAI-Compatible Custom", DefaultBaseURL: "", DefaultModel: "", KeyRequired: false},
}

func PresetOf(provider string) ProviderPreset {
	p := strings.ToLower(strings.TrimSpace(provider))
	for _, item := range Presets {
		if item.ID == p {
			return item
		}
	}
	return Presets[0]
}

func (c Config) resolved() (provider, baseURL, model string, temp float64, err error) {
	preset := PresetOf(c.Provider)
	provider = preset.ID
	baseURL = strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	if baseURL == "" {
		baseURL = preset.DefaultBaseURL
	}
	if baseURL == "" {
		return "", "", "", 0, errors.New("AI base URL is required")
	}
	model = strings.TrimSpace(c.Model)
	if model == "" {
		model = preset.DefaultModel
	}
	if model == "" {
		return "", "", "", 0, errors.New("AI model is required")
	}
	if preset.KeyRequired && strings.TrimSpace(c.APIKey) == "" {
		return "", "", "", 0, fmt.Errorf("API key is required for %s", preset.Label)
	}
	temp = c.Temperature
	if temp < 0 || temp > 2 {
		temp = 0.3
	}
	return provider, baseURL, model, temp, nil
}

// Complete sends a chat completion prompt and returns the assistant text.
func Complete(ctx context.Context, cfg Config, systemPrompt, userPrompt string) (string, error) {
	provider, baseURL, model, temp, err := cfg.resolved()
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 120 * time.Second}
	if provider == "anthropic" {
		return completeAnthropic(ctx, client, baseURL, model, cfg.APIKey, temp, systemPrompt, userPrompt)
	}
	return completeOpenAI(ctx, client, baseURL, model, cfg.APIKey, temp, systemPrompt, userPrompt)
}

// TestConnection verifies credentials and model reachability with a tiny prompt.
func TestConnection(ctx context.Context, cfg Config) (string, error) {
	tctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	reply, err := Complete(tctx, cfg, "Reply with OK only.", "Ping")
	if err != nil {
		return "", err
	}
	reply = strings.TrimSpace(reply)
	if len(reply) > 120 {
		reply = reply[:120]
	}
	return reply, nil
}

// ListModels fetches available model IDs from the configured AI provider endpoint.
func ListModels(ctx context.Context, cfg Config) ([]string, error) {
	preset := PresetOf(cfg.Provider)
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = preset.DefaultBaseURL
	}
	if baseURL == "" {
		return nil, errors.New("AI base URL is required")
	}
	apiKey := strings.TrimSpace(cfg.APIKey)
	if preset.KeyRequired && apiKey == "" {
		return nil, fmt.Errorf("API key is required for %s", preset.Label)
	}

	lctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	client := &http.Client{Timeout: 15 * time.Second}

	endpoint := baseURL
	endpoint = strings.TrimSuffix(endpoint, "/chat/completions")
	endpoint = strings.TrimSuffix(endpoint, "/messages")
	if !strings.HasSuffix(endpoint, "/models") {
		endpoint += "/models"
	}

	models, err := fetchModelsEndpoint(lctx, client, preset.ID, endpoint, apiKey)
	if (err != nil || len(models) == 0) && preset.ID == "ollama" {
		root := strings.TrimSuffix(strings.TrimSuffix(baseURL, "/v1"), "/")
		if alt, altErr := fetchModelsEndpoint(lctx, client, preset.ID, root+"/api/tags", apiKey); altErr == nil && len(alt) > 0 {
			return alt, nil
		}
	}
	if err != nil {
		return nil, err
	}
	return models, nil
}

func fetchModelsEndpoint(ctx context.Context, client *http.Client, provider, endpoint, apiKey string) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if provider == "anthropic" {
		if apiKey != "" {
			req.Header.Set("x-api-key", apiKey)
		}
		req.Header.Set("anthropic-version", "2023-06-01")
	} else if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, formatTransportError("failed to fetch models", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("model list HTTP %d: %s", resp.StatusCode, extractProviderError(body))
	}
	var out struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
		Models []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("invalid models JSON: %w", err)
	}
	seen := map[string]struct{}{}
	result := make([]string, 0, len(out.Data)+len(out.Models))
	add := func(id string) {
		id = strings.TrimSpace(id)
		if id == "" {
			return
		}
		if _, exists := seen[id]; exists {
			return
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}
	for _, m := range out.Data {
		add(m.ID)
	}
	for _, m := range out.Models {
		if m.ID != "" {
			add(m.ID)
		} else {
			add(m.Name)
		}
	}
	sort.Strings(result)
	if len(result) > 500 {
		result = result[:500]
	}
	return result, nil
}

func completeOpenAI(ctx context.Context, client *http.Client, baseURL, model, apiKey string, temp float64, systemPrompt, userPrompt string) (string, error) {
	endpoint := baseURL
	if !strings.HasSuffix(endpoint, "/chat/completions") {
		endpoint += "/chat/completions"
	}
	payload := map[string]any{
		"model":       model,
		"temperature": temp,
		"stream":      false,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
	}
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", formatTransportError("AI request failed", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("AI provider HTTP %d: %s", resp.StatusCode, extractProviderError(body))
	}
	trimmedBody := bytes.TrimSpace(body)
	if strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") || bytes.HasPrefix(trimmedBody, []byte("data:")) {
		text, sseErr := parseOpenAISSE(trimmedBody)
		if sseErr != nil {
			return "", sseErr
		}
		return text, nil
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content any `json:"content"`
			} `json:"message"`
			Delta struct {
				Content string `json:"content"`
			} `json:"delta"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(trimmedBody, &out); err != nil {
		return "", fmt.Errorf("invalid AI response JSON: %w", err)
	}
	if len(out.Choices) == 0 {
		return "", errors.New("AI provider returned empty content")
	}
	content := extractOpenAIContent(out.Choices[0].Message.Content)
	if content == "" {
		content = strings.TrimSpace(out.Choices[0].Delta.Content)
	}
	if content == "" {
		return "", errors.New("AI provider returned empty content")
	}
	return content, nil
}

func extractOpenAIContent(v any) string {
	switch val := v.(type) {
	case string:
		return strings.TrimSpace(val)
	case []any:
		var b strings.Builder
		for _, item := range val {
			if m, ok := item.(map[string]any); ok {
				if txt, ok := m["text"].(string); ok {
					b.WriteString(txt)
				}
			}
		}
		return strings.TrimSpace(b.String())
	}
	return ""
}

// parseOpenAISSE reassembles text from SSE `data: {...}` chunks when a router forces streaming.
func parseOpenAISSE(body []byte) (string, error) {
	var b strings.Builder
	for _, rawLine := range strings.Split(string(body), "\n") {
		line := strings.TrimSpace(rawLine)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		chunk := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if chunk == "" || chunk == "[DONE]" {
			continue
		}
		var ev struct {
			Choices []struct {
				Delta struct {
					Content any `json:"content"`
				} `json:"delta"`
				Message struct {
					Content any `json:"content"`
				} `json:"message"`
			} `json:"choices"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(chunk), &ev); err != nil {
			continue
		}
		if ev.Error != nil && strings.TrimSpace(ev.Error.Message) != "" {
			return "", errors.New(strings.TrimSpace(ev.Error.Message))
		}
		if len(ev.Choices) > 0 {
			if s, ok := ev.Choices[0].Delta.Content.(string); ok {
				b.WriteString(s)
			} else if s := extractOpenAIContent(ev.Choices[0].Delta.Content); s != "" {
				b.WriteString(s)
			} else if s := extractOpenAIContent(ev.Choices[0].Message.Content); s != "" {
				b.WriteString(s)
			}
		}
	}
	res := strings.TrimSpace(b.String())
	if res == "" {
		return "", errors.New("AI provider returned empty stream content")
	}
	return res, nil
}

func completeAnthropic(ctx context.Context, client *http.Client, baseURL, model, apiKey string, temp float64, systemPrompt, userPrompt string) (string, error) {
	endpoint := baseURL
	if !strings.HasSuffix(endpoint, "/messages") {
		endpoint += "/messages"
	}
	payload := map[string]any{
		"model":       model,
		"max_tokens":  2048,
		"temperature": temp,
		"system":      systemPrompt,
		"messages": []map[string]string{
			{"role": "user", "content": userPrompt},
		},
	}
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", strings.TrimSpace(apiKey))
	req.Header.Set("anthropic-version", "2023-06-01")
	resp, err := client.Do(req)
	if err != nil {
		return "", formatTransportError("Anthropic request failed", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("Anthropic HTTP %d: %s", resp.StatusCode, extractProviderError(body))
	}
	var out struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("invalid Anthropic response JSON: %w", err)
	}
	var parts []string
	for _, block := range out.Content {
		if block.Text != "" {
			parts = append(parts, block.Text)
		}
	}
	text := strings.TrimSpace(strings.Join(parts, "\n"))
	if text == "" {
		return "", errors.New("Anthropic returned empty content")
	}
	return text, nil
}

func formatTransportError(prefix string, err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	if strings.Contains(msg, "server gave HTTP response to HTTPS client") {
		return errors.New("Endpoint merespons HTTP biasa, bukan HTTPS. Ubah Base URL dari https:// menjadi http://.")
	}
	if strings.Contains(msg, "connection refused") {
		return fmt.Errorf("Koneksi ke endpoint AI ditolak (%s). Pastikan layanan aktif dan port benar.", msg)
	}
	if strings.Contains(msg, "context deadline exceeded") || strings.Contains(msg, "Client.Timeout") {
		return errors.New("Koneksi ke endpoint AI timeout. Periksa URL endpoint atau coba model yang lebih cepat.")
	}
	return fmt.Errorf("%s: %w", prefix, err)
}

func extractProviderError(body []byte) string {
	var parsed struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if json.Unmarshal(body, &parsed) == nil {
		if parsed.Error.Message != "" {
			return parsed.Error.Message
		}
		if parsed.Message != "" {
			return parsed.Message
		}
	}
	s := strings.TrimSpace(string(body))
	if len(s) > 220 {
		s = s[:220]
	}
	return s
}

// ExtractJSONObject strips markdown code fences and extracts the outermost JSON object.
func ExtractJSONObject(raw string) string {
	s := strings.TrimSpace(raw)
	if strings.HasPrefix(s, "```") {
		if idx := strings.Index(s, "\n"); idx >= 0 {
			s = s[idx+1:]
		}
		s = strings.TrimSuffix(strings.TrimSpace(s), "```")
	}
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return strings.TrimSpace(s[start : end+1])
	}
	return strings.TrimSpace(s)
}
