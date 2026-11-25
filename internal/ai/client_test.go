package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCompleteOpenAICompatible(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			t.Fatalf("missing bearer token")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"content": "```json\n{\"ok\":true}\n```"}},
			},
		})
	}))
	defer srv.Close()

	out, err := Complete(context.Background(), Config{
		Provider: "openai",
		BaseURL:  srv.URL + "/v1",
		Model:    "gpt-4o-mini",
		APIKey:   "sk-test",
	}, "sys", "usr")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got := ExtractJSONObject(out); got != `{"ok":true}` {
		t.Fatalf("got %q", got)
	}
}

func TestCompleteAnthropic(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "ant-key" {
			t.Fatalf("missing x-api-key")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"content": []map[string]string{{"type": "text", "text": "OK"}},
		})
	}))
	defer srv.Close()

	out, err := Complete(context.Background(), Config{
		Provider: "anthropic",
		BaseURL:  srv.URL + "/v1",
		Model:    "claude-3-5-haiku-latest",
		APIKey:   "ant-key",
	}, "sys", "usr")
	if err != nil || out != "OK" {
		t.Fatalf("got %q err=%v", out, err)
	}
}

func TestListModelsOpenAICompatible(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer sk-list" {
			t.Fatalf("missing bearer token")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]string{
				{"id": "gpt-4o-mini"},
				{"id": "claude-3-7-sonnet"},
				{"id": "gpt-4o-mini"},
			},
		})
	}))
	defer srv.Close()

	models, err := ListModels(context.Background(), Config{
		Provider: "custom",
		BaseURL:  srv.URL + "/v1",
		APIKey:   "sk-list",
	})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(models) != 2 || models[0] != "claude-3-7-sonnet" || models[1] != "gpt-4o-mini" {
		t.Fatalf("unexpected models: %#v", models)
	}
}

func TestCompleteOpenAISSEFallback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"O\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"K\"}}]}\n\ndata: [DONE]\n"))
	}))
	defer srv.Close()

	out, err := Complete(context.Background(), Config{
		Provider: "custom",
		BaseURL:  srv.URL + "/v1",
		Model:    "ag/gemini-3.8-flash-medium",
		APIKey:   "sk-9router",
	}, "sys", "usr")
	if err != nil || out != "OK" {
		t.Fatalf("got %q err=%v", out, err)
	}
}
