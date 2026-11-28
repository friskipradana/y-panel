package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/ai"
	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

const reneoPlatformFeatureCatalog = `Reneo Desktop Server Control Panel features:
- Desktop UI & Windows: draggable floating desktop apps, responsive desktop widgets (CPU, RAM, Disk, Bandwidth, Ping), Light/Dark theme, MobileShell
- Docker & Compose: container lifecycle, logs, static IP assignment on custom bridge networks, Compose stacks & templates
- Cloudflare Tunnel & Public Routes: zero-port-forwarding custom domains, wildcard subdomains, automatic SSL
- File Manager & Storage Cleanup: multi-tab file explorer, inline editor, upload, root access elevation, junk/cache/temp/log cleanup scanner
- Database Manager: managed PostgreSQL/MySQL/Redis/MongoDB containers, external access IP whitelist, autostart
- Terminal & KVM: web PTY terminal with presets, live remote desktop screen (KVM)
- Hosting & Billing: multi-user hosting plans, quotas, subdomains, custom domains, vouchers, WhatsApp notifications
- Security & Operations: UFW Firewall & WAF rules, Uptime & SSL monitor, Automated Backup & Restore, Cron & Systemd services
- Developer & Content Tools: Dev Desk (client proposals/invoices/todo), Page Studio (AI landing page & docs builder), Documentation window (/articles), AI Integration & MCP Server`

func computeNextStudioRun(now time.Time, cadence string, runHour int, runWeekday int) time.Time {
	loc := now.Location()
	if runHour < 0 || runHour > 23 {
		runHour = 9
	}
	switch cadence {
	case "hourly":
		return now.Truncate(time.Hour).Add(time.Hour)
	case "weekly":
		if runWeekday < 0 || runWeekday > 6 {
			runWeekday = 1
		}
		target := time.Date(now.Year(), now.Month(), now.Day(), runHour, 0, 0, 0, loc)
		daysAhead := (runWeekday - int(now.Weekday()) + 7) % 7
		target = target.AddDate(0, 0, daysAhead)
		if !target.After(now) {
			target = target.AddDate(0, 0, 7)
		}
		return target
	case "monthly":
		target := time.Date(now.Year(), now.Month(), 1, runHour, 0, 0, 0, loc)
		if !target.After(now) {
			target = target.AddDate(0, 1, 0)
		}
		return target
	default: // daily
		target := time.Date(now.Year(), now.Month(), now.Day(), runHour, 0, 0, 0, loc)
		if !target.After(now) {
			target = target.AddDate(0, 0, 1)
		}
		return target
	}
}

func pickNextScheduleTopic(topics []string, used []string) string {
	usedSet := make(map[string]bool, len(used))
	for _, u := range used {
		usedSet[strings.ToLower(strings.TrimSpace(u))] = true
	}
	for _, t := range topics {
		clean := strings.TrimSpace(t)
		if clean != "" && !usedSet[strings.ToLower(clean)] {
			return clean
		}
	}
	return ""
}

func (s *Server) runStudioSchedulerLoop(interval time.Duration, stop <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			if s.database == nil || !s.database.IsConnected() {
				continue
			}
			due, err := s.database.ListDueStudioSchedules(time.Now())
			if err != nil {
				continue
			}
			for i := range due {
				sc := due[i]
				ctx, cancel := context.WithTimeout(s.bgCtx, 130*time.Second)
				if _, runErr := s.executeStudioSchedule(ctx, &sc); runErr != nil {
					log.Printf("[studio-scheduler] schedule=%d (%s) failed: %v", sc.ID, sc.Name, runErr)
				}
				cancel()
			}
		}
	}
}

func (s *Server) executeStudioSchedule(ctx context.Context, sc *database.StudioSchedule) (*database.StudioPage, error) {
	if s.database == nil || !s.database.IsConnected() {
		return nil, errors.New("database not connected")
	}
	aiCfg, err := s.loadAIConfigForUser(sc.OwnerUserID, true)
	if err != nil {
		return nil, err
	}
	if aiCfg == nil || !aiCfg.Enabled {
		return nil, errors.New("AI integration is not configured or disabled in Settings > AI Integration")
	}

	// Mark running
	sc.LastStatus = "running"
	sc.LastError = ""
	_, _ = s.database.UpdateStudioSchedule(sc)

	fail := func(runErr error) (*database.StudioPage, error) {
		now := time.Now()
		next := computeNextStudioRun(now, sc.Cadence, sc.RunHour, sc.RunWeekday)
		sc.LastRunAt = &now
		sc.NextRunAt = &next
		sc.LastStatus = "error"
		sc.LastError = runErr.Error()
		_, _ = s.database.UpdateStudioSchedule(sc)
		return nil, runErr
	}

	// Gather existing docs & studio pages to prevent duplicates and guide enrichment
	var existingTitles []string
	if docs, _, dErr := s.database.ListDocs("", 120, 0, true); dErr == nil {
		for _, d := range docs {
			existingTitles = append(existingTitles, fmt.Sprintf("- %s (slug: %s)", d.Title, d.Slug))
		}
	}
	if pages, pErr := s.database.ListStudioPages(sc.OwnerUserID, true, "docs"); pErr == nil {
		for _, p := range pages {
			existingTitles = append(existingTitles, fmt.Sprintf("- %s (slug: %s)", p.Title, p.Slug))
		}
	}
	existingBlock := strings.Join(existingTitles, "\n")
	if existingBlock == "" {
		existingBlock = "(belum ada dokumen)"
	}

	lang := "Bahasa Indonesia"
	if sc.Language == "en" {
		lang = "English"
	}

	nextTopic := pickNextScheduleTopic(sc.Topics, sc.UsedTopics)
	sysPrompt := `You are an automated documentation & article author for ` + sc.BrandName + `.
Return ONLY one valid JSON object matching this exact schema (no markdown prose outside JSON):
{
  "slug": "url-friendly-slug",
  "title": "Clear, specific article or documentation title",
  "subtitle": "1-2 concise sentences summarizing the article",
  "brandName": "` + sc.BrandName + `",
  "themeTone": "blue",
  "seoDescription": "Concise meta description under 155 characters",
  "markdownBody": "## Pendahuluan\n\nThorough, well-structured Markdown guide with ## headings, ### subheadings, numbered steps, practical examples, and troubleshooting tips."
}
Rules:
- Language: ` + lang + `.
- Never use em dashes or empty marketing fluff.
- Do NOT repeat any title or slug already in the existing documentation list.
- Write at least 4 clear ## sections with concrete, practical details.`

	var userPrompt string
	if sc.Mode == "enrich_docs" {
		topicHint := "Analyze the existing Reneo documentation list and pick the single most useful MISSING documentation guide or how-to article that complements the existing docs."
		if nextTopic != "" {
			topicHint = "Priority topic from queue: " + nextTopic
		}
		userPrompt = fmt.Sprintf("Mode: Enrich Existing Reneo Documentation\nCategory: %s\nTheme & writing guidance: %s\n%s\n\n%s\n\nExisting documentation already published (DO NOT duplicate these):\n%s",
			sc.Category, sc.Theme, topicHint, reneoPlatformFeatureCatalog, existingBlock)
	} else {
		topicHint := "Choose a fresh, practical, non-duplicate article topic that strictly fits the theme and category."
		if nextTopic != "" {
			topicHint = "Write the article for this specific scheduled topic: " + nextTopic
		}
		userPrompt = fmt.Sprintf("Mode: Scheduled Thematic Article\nBrand: %s\nCategory: %s\nTheme & target audience: %s\n%s\n\nPreviously published titles (DO NOT repeat):\n%s",
			sc.BrandName, sc.Category, sc.Theme, topicHint, existingBlock)
	}

	raw, err := ai.Complete(ctx, *aiCfg, sysPrompt, userPrompt)
	if err != nil {
		return fail(err)
	}
	gen, err := parseGeneratedStudioPage(raw, "docs")
	if err != nil {
		return fail(err)
	}

	status := "draft"
	if sc.AutoPublish {
		status = "published"
	}
	slugBase := gen.Slug
	if slugBase == "" {
		slugBase = gen.Title
	}
	nowStr := time.Now().UTC().Format(time.RFC3339)
	page := &database.StudioPage{
		OwnerUserID:    sc.OwnerUserID,
		Kind:           "docs",
		Slug:           s.ensureUniqueStudioSlug(slugBase, 0),
		Title:          gen.Title,
		Subtitle:       gen.Subtitle,
		Status:         status,
		ShowInDocs:     sc.ShowInDocs,
		BrandName:      sc.BrandName,
		ThemeTone:      gen.ThemeTone,
		SEODescription: gen.SEODescription,
		MarkdownBody:   gen.MarkdownBody,
		SourcePrompt:   fmt.Sprintf("[Auto:%s] %s", sc.Name, nextTopic),
		ScheduleID:     sc.ID,
		ChatHistory: []database.StudioChatMessage{
			{Role: "assistant", Content: fmt.Sprintf("Dibuat otomatis oleh jadwal \"%s\".", sc.Name), CreatedAt: nowStr},
		},
	}
	created, err := s.database.CreateStudioPage(page)
	if err != nil {
		return fail(err)
	}
	s.syncStudioPageToDocsWindow(sc.OwnerUserID, created)

	now := time.Now()
	next := computeNextStudioRun(now, sc.Cadence, sc.RunHour, sc.RunWeekday)
	if nextTopic != "" {
		sc.UsedTopics = append(sc.UsedTopics, nextTopic)
	} else if created.Title != "" {
		sc.UsedTopics = append(sc.UsedTopics, created.Title)
	}
	sc.RunCount++
	sc.LastRunAt = &now
	sc.NextRunAt = &next
	sc.LastStatus = "success"
	sc.LastError = ""
	sc.LastPageID = created.ID
	sc.LastTitle = created.Title
	_, _ = s.database.UpdateStudioSchedule(sc)

	return created, nil
}

type studioSchedulePayload struct {
	Name        string   `json:"name"`
	Mode        string   `json:"mode"`
	Theme       string   `json:"theme"`
	BrandName   string   `json:"brandName"`
	Category    string   `json:"category"`
	Topics      []string `json:"topics"`
	Language    string   `json:"language"`
	Cadence     string   `json:"cadence"`
	RunHour     int      `json:"runHour"`
	RunWeekday  int      `json:"runWeekday"`
	AutoPublish bool     `json:"autoPublish"`
	ShowInDocs  bool     `json:"showInDocs"`
	Enabled     bool     `json:"enabled"`
}

func (s *Server) handleStudioListSchedules(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	list, err := s.database.ListStudioSchedules(u.ID, u.Role == auth.SuperadminRole)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"schedules": list})
}

func (s *Server) handleStudioCreateSchedule(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	var req studioSchedulePayload
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		s.writeError(w, http.StatusBadRequest, errors.New("schedule name is required"))
		return
	}
	next := computeNextStudioRun(time.Now(), req.Cadence, req.RunHour, req.RunWeekday)
	sc := &database.StudioSchedule{
		OwnerUserID: u.ID,
		Name:        req.Name,
		Mode:        req.Mode,
		Theme:       req.Theme,
		BrandName:   req.BrandName,
		Category:    req.Category,
		Topics:      req.Topics,
		Language:    req.Language,
		Cadence:     req.Cadence,
		RunHour:     req.RunHour,
		RunWeekday:  req.RunWeekday,
		AutoPublish: req.AutoPublish,
		ShowInDocs:  req.ShowInDocs,
		Enabled:     req.Enabled,
		NextRunAt:   &next,
		LastStatus:  "idle",
	}
	created, err := s.database.CreateStudioSchedule(sc)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleStudioUpdateSchedule(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid schedule id"))
		return
	}
	existing, err := s.database.GetStudioSchedule(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("schedule not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	var req studioSchedulePayload
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid JSON payload"))
		return
	}
	if strings.TrimSpace(req.Name) != "" {
		existing.Name = req.Name
	}
	existing.Mode = req.Mode
	existing.Theme = req.Theme
	existing.BrandName = req.BrandName
	existing.Category = req.Category
	existing.Topics = req.Topics
	existing.Language = req.Language
	existing.Cadence = req.Cadence
	existing.RunHour = req.RunHour
	existing.RunWeekday = req.RunWeekday
	existing.AutoPublish = req.AutoPublish
	existing.ShowInDocs = req.ShowInDocs
	existing.Enabled = req.Enabled
	next := computeNextStudioRun(time.Now(), existing.Cadence, existing.RunHour, existing.RunWeekday)
	existing.NextRunAt = &next

	updated, err := s.database.UpdateStudioSchedule(existing)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleStudioToggleSchedule(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid schedule id"))
		return
	}
	existing, err := s.database.GetStudioSchedule(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("schedule not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<14)).Decode(&req); err != nil {
		req.Enabled = !existing.Enabled
	}
	existing.Enabled = req.Enabled
	if existing.Enabled {
		next := computeNextStudioRun(time.Now(), existing.Cadence, existing.RunHour, existing.RunWeekday)
		existing.NextRunAt = &next
	}
	updated, err := s.database.UpdateStudioSchedule(existing)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleStudioDeleteSchedule(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid schedule id"))
		return
	}
	existing, err := s.database.GetStudioSchedule(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("schedule not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	if err := s.database.DeleteStudioSchedule(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleStudioRunScheduleNow(w http.ResponseWriter, r *http.Request) {
	u := s.currentUserRecord(r)
	if !canAccessDevDesk(u) {
		s.writeError(w, http.StatusForbidden, errors.New("admin access required"))
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		s.writeError(w, http.StatusBadRequest, errors.New("invalid schedule id"))
		return
	}
	existing, err := s.database.GetStudioSchedule(id)
	if err != nil || existing == nil {
		s.writeError(w, http.StatusNotFound, errors.New("schedule not found"))
		return
	}
	if !s.canManageDevDoc(u, existing.OwnerUserID) {
		s.writeError(w, http.StatusForbidden, errors.New("forbidden"))
		return
	}
	if existing.LastStatus == "running" {
		s.writeError(w, http.StatusConflict, errors.New("schedule is already running"))
		return
	}
	page, runErr := s.executeStudioSchedule(r.Context(), existing)
	if runErr != nil {
		s.writeError(w, http.StatusUnprocessableEntity, runErr)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"schedule": existing, "page": page})
}
