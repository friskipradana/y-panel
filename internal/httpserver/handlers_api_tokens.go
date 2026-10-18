package httpserver

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ─── API Token Handlers ────────────────────────────────────────────────────────

type createAPITokenRequest struct {
	Name      string  `json:"name"`
	ExpiresIn *string `json:"expiresIn,omitempty"` // "30d", "90d", "1y", or null for never
}

type createAPITokenResponse struct {
	Token  string          `json:"token"` // Only returned once
	Record apiTokenDisplay `json:"record"`
}

type apiTokenDisplay struct {
	ID          int64      `json:"id"`
	Name        string     `json:"name"`
	TokenPrefix string     `json:"tokenPrefix"`
	LastUsedAt  *time.Time `json:"lastUsedAt"`
	ExpiresAt   *time.Time `json:"expiresAt"`
	CreatedAt   time.Time  `json:"createdAt"`
}

func (s *Server) handleListAPITokens(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r)
	if user == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	tokens, err := s.database.ListAPITokens(user.ID)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}
	result := make([]apiTokenDisplay, 0, len(tokens))
	for _, t := range tokens {
		result = append(result, apiTokenDisplay{
			ID:          t.ID,
			Name:        t.Name,
			TokenPrefix: t.TokenPrefix,
			LastUsedAt:  t.LastUsedAt,
			ExpiresAt:   t.ExpiresAt,
			CreatedAt:   t.CreatedAt,
		})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"tokens": result})
}

func (s *Server) handleCreateAPIToken(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r)
	if user == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	defer r.Body.Close()
	var req createAPITokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "token name is required"})
		return
	}
	if len(req.Name) > 120 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "token name must be 120 characters or less"})
		return
	}

	// Parse expiry
	var expiresAt *time.Time
	if req.ExpiresIn != nil && strings.TrimSpace(*req.ExpiresIn) != "" {
		t, err := parseTokenExpiry(*req.ExpiresIn)
		if err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
			return
		}
		expiresAt = &t
	}

	// Generate a secure random token: "ypat_" + 40 hex chars
	rawToken, tokenHash, tokenPrefix, err := generateAPIToken()
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "failed to generate token"})
		return
	}

	record, err := s.database.CreateAPIToken(user.ID, req.Name, tokenHash, tokenPrefix, expiresAt)
	if err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}

	s.emitTokenCreated(user, record.Name)
	s.writeJSON(w, http.StatusCreated, createAPITokenResponse{
		Token: rawToken,
		Record: apiTokenDisplay{
			ID:          record.ID,
			Name:        record.Name,
			TokenPrefix: record.TokenPrefix,
			LastUsedAt:  record.LastUsedAt,
			ExpiresAt:   record.ExpiresAt,
			CreatedAt:   record.CreatedAt,
		},
	})
}

func (s *Server) handleDeleteAPIToken(w http.ResponseWriter, r *http.Request) {
	user := userFromCtx(r)
	if user == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid token id"})
		return
	}
	if err := s.database.DeleteAPIToken(id, user.ID); err != nil {
		if err.Error() == "token not found" {
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "token not found"})
			return
		}
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// generateAPIToken creates a new token with format "ypat_<40 random hex chars>".
// Returns (rawToken, sha256Hash, prefix8chars, error).
func generateAPIToken() (string, string, string, error) {
	buf := make([]byte, 20)
	if _, err := rand.Read(buf); err != nil {
		return "", "", "", fmt.Errorf("random generation failed: %w", err)
	}
	rawHex := hex.EncodeToString(buf)
	raw := "ypat_" + rawHex

	h := sha256.Sum256([]byte(raw))
	hash := hex.EncodeToString(h[:])
	prefix := raw[:12] // "ypat_XXXXXXX"

	return raw, hash, prefix, nil
}

// parseTokenExpiry parses human-readable duration strings like "30d", "90d", "1y".
func parseTokenExpiry(s string) (time.Time, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	now := time.Now()
	switch s {
	case "7d":
		return now.Add(7 * 24 * time.Hour), nil
	case "30d":
		return now.Add(30 * 24 * time.Hour), nil
	case "90d":
		return now.Add(90 * 24 * time.Hour), nil
	case "1y":
		return now.Add(365 * 24 * time.Hour), nil
	default:
		return time.Time{}, fmt.Errorf("invalid expiresIn: must be one of 7d, 30d, 90d, 1y")
	}
}

// hashAPIToken hashes a raw token for DB lookup.
func hashAPIToken(rawToken string) string {
	h := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(h[:])
}
