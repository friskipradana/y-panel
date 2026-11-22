package httpserver

import (
	"encoding/json"
	"net/http"

	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// The texts of the notices, for the superadmin: what comes with Reneo, and what was changed

type templateView struct {
	Event   string   `json:"event"`
	Group   string   `json:"group"`
	Seller  bool     `json:"seller"`
	Vars    []string `json:"vars"`
	Default struct {
		ID string `json:"id"`
		EN string `json:"en"`
	} `json:"default"`
	// Custom holds a language only when the seller changed it
	Custom map[string]string `json:"custom"`
}

func (s *Server) handleListNotifyTemplates(w http.ResponseWriter, _ *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	rows, err := s.database.ListNotificationTemplates()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	custom := map[string]map[string]string{}
	for _, row := range rows {
		if custom[row.Event] == nil {
			custom[row.Event] = map[string]string{}
		}
		custom[row.Event][row.Locale] = row.Body
	}
	items := []templateView{}
	for _, event := range notify.Events() {
		view := templateView{Event: event, Group: notify.Group(event), Seller: notify.ForSeller(event), Vars: notify.Variables(event), Custom: custom[event]}
		if view.Custom == nil {
			view.Custom = map[string]string{}
		}
		view.Default.ID = notify.DefaultText(event, "id")
		view.Default.EN = notify.DefaultText(event, "en")
		items = append(items, view)
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items, "maxLength": notify.MaxTemplateRunes})
}

func validTemplateLocale(locale string) bool { return locale == "id" || locale == "en" }

func (s *Server) handleSaveNotifyTemplate(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.notifyReady(w) {
		return
	}
	event, locale := r.PathValue("event"), r.PathValue("locale")
	if !notify.Known(event) || !validTemplateLocale(locale) {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	var req struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := notify.ValidateTemplate(event, req.Body); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	actor := userFromCtx(r)
	var by int64
	if actor != nil {
		by = actor.ID
	}
	if err := s.database.SetNotificationTemplate(event, locale, req.Body, by); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if actor != nil {
		s.auditSensitiveAction(r, actor, "notify.template.save", "ok", map[string]any{"event": event, "locale": locale})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleResetNotifyTemplate(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	event, locale := r.PathValue("event"), r.PathValue("locale")
	if !notify.Known(event) || !validTemplateLocale(locale) {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
		return
	}
	if err := s.database.DeleteNotificationTemplate(event, locale); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "notify.template.reset", "ok", map[string]any{"event": event, "locale": locale})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}
