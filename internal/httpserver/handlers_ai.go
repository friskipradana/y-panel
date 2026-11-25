package httpserver

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/ai"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

type aiSettingsResponse struct {
	Provider    string              `json:"provider"`
	BaseURL     string              `json:"baseUrl"`
	Model       string              `json:"model"`
	HasAPIKey   bool                `json:"hasApiKey"`
	Temperature float64             `json:"temperature"`
	Enabled     bool                `json:"enabled"`
	Presets     []ai.ProviderPreset `json:"presets"`
}

func (s *Server) handleGetAISettings(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if u == nil {
		s.writeError(w, http.StatusUnauthorized, errors.New("unauthorized"))
		return
	}
	if u.Role == "demo" {
		s.writeError(w, http.StatusForbidden, errors.New("demo account cannot configure AI"))
		return
	}
	cfg, err := s.database.GetAIIntegration(u.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	resp := aiSettingsResponse{
		Provider:    "openai",
		BaseURL:     ai.PresetOf("openai").DefaultBaseURL,
		Model:       ai.PresetOf("openai").DefaultModel,
		Temperature: 0.3,
		Enabled:     false,
		Presets:     ai.Presets,
	}
	if cfg != nil {
		resp.Provider = cfg.Provider
		resp.BaseURL = cfg.BaseURL
		resp.Model = cfg.Model
		resp.HasAPIKey = cfg.HasAPIKey
		resp.Temperature = cfg.Temperature
		resp.Enabled = cfg.Enabled
	}
	s.writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleUpdateAISettings(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if u == nil {
		s.writeError(w, http.StatusUnauthorized, errors.New("unauthorized"))
		return
	}
	if u.Role == "demo" {
		s.writeError(w, http.StatusForbidden, errors.New("demo account cannot configure AI"))
		return
	}
	var req struct {
		Provider    string  `json:"provider"`
		BaseURL     string  `json:"baseUrl"`
		Model       string  `json:"model"`
		APIKey      string  `json:"apiKey"`
		ClearAPIKey bool    `json:"clearApiKey"`
		Temperature float64 `json:"temperature"`
		Enabled     bool    `json:"enabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	existing, err := s.database.GetAIIntegration(u.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	preset := ai.PresetOf(req.Provider)
	baseURL := strings.TrimSpace(req.BaseURL)
	if baseURL == "" {
		baseURL = preset.DefaultBaseURL
	}
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = preset.DefaultModel
	}
	temp := req.Temperature
	if temp < 0 || temp > 2 {
		temp = 0.3
	}

	apiKeyEnc := ""
	if existing != nil && !req.ClearAPIKey {
		apiKeyEnc = existing.APIKeyEnc
	}
	if trimmedKey := strings.TrimSpace(req.APIKey); trimmedKey != "" {
		enc, encErr := crypto.Encrypt(s.cfg.EncryptionKey, trimmedKey)
		if encErr != nil {
			s.writeError(w, http.StatusInternalServerError, encErr)
			return
		}
		apiKeyEnc = enc
	}

	saved, err := s.database.UpsertAIIntegration(&database.AIIntegration{
		OwnerUserID: u.ID,
		Provider:    preset.ID,
		BaseURL:     baseURL,
		Model:       model,
		APIKeyEnc:   apiKeyEnc,
		Temperature: temp,
		Enabled:     req.Enabled,
	})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, aiSettingsResponse{
		Provider:    saved.Provider,
		BaseURL:     saved.BaseURL,
		Model:       saved.Model,
		HasAPIKey:   saved.HasAPIKey,
		Temperature: saved.Temperature,
		Enabled:     saved.Enabled,
		Presets:     ai.Presets,
	})
}

func (s *Server) handleTestAISettings(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if u == nil {
		s.writeError(w, http.StatusUnauthorized, errors.New("unauthorized"))
		return
	}
	var req struct {
		Provider    string  `json:"provider"`
		BaseURL     string  `json:"baseUrl"`
		Model       string  `json:"model"`
		APIKey      string  `json:"apiKey"`
		Temperature float64 `json:"temperature"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req)

	cfg, err := s.loadAIConfigForUser(u.ID, false)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if cfg == nil {
		cfg = &ai.Config{Provider: "openai", Temperature: 0.3}
	}
	if strings.TrimSpace(req.Provider) != "" {
		cfg.Provider = req.Provider
	}
	if strings.TrimSpace(req.BaseURL) != "" {
		cfg.BaseURL = req.BaseURL
	}
	if strings.TrimSpace(req.Model) != "" {
		cfg.Model = req.Model
	}
	if strings.TrimSpace(req.APIKey) != "" {
		cfg.APIKey = strings.TrimSpace(req.APIKey)
	}
	if req.Temperature >= 0 && req.Temperature <= 2 {
		cfg.Temperature = req.Temperature
	}

	reply, err := ai.TestConnection(r.Context(), *cfg)
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "reply": reply})
}

// loadAIConfigForUser returns decrypted AI settings for userID, optionally falling back to superadmin (id=1).
func (s *Server) loadAIConfigForUser(userID int64, allowSuperFallback bool) (*ai.Config, error) {
	if s.database == nil || !s.database.IsConnected() {
		return nil, nil
	}
	rec, err := s.database.GetAIIntegration(userID)
	if err != nil {
		return nil, err
	}
	if (rec == nil || !rec.Enabled) && allowSuperFallback && userID != 1 {
		fallback, fErr := s.database.GetAIIntegration(1)
		if fErr == nil && fallback != nil && fallback.Enabled {
			rec = fallback
		}
	}
	if rec == nil {
		return nil, nil
	}
	plainKey := ""
	if rec.APIKeyEnc != "" {
		dec, decErr := crypto.Decrypt(s.cfg.EncryptionKey, rec.APIKeyEnc)
		if decErr != nil {
			return nil, decErr
		}
		plainKey = dec
	}
	return &ai.Config{
		Provider:    rec.Provider,
		BaseURL:     rec.BaseURL,
		Model:       rec.Model,
		APIKey:      plainKey,
		Temperature: rec.Temperature,
		Enabled:     rec.Enabled,
	}, nil
}
