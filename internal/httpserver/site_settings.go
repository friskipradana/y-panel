package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Public site switches, kept in the state directory like the demo choice so they work before the
// database is reachable:
//   - landing:  the public pages (landing, articles, install guide, MCP guide) exist or not
//   - indexing: search engines and AI crawlers may index what is public
//   - hosting:  hosting mode (plans, demo account, subdomains for buyers)

const maxOrderMessageLen = 600

// cleanOrderMessage keeps the template as plain text: line breaks stay, other control characters go
func cleanOrderMessage(raw string) (string, error) {
	message := strings.TrimSpace(strings.ReplaceAll(raw, "\r\n", "\n"))
	if len([]rune(message)) > maxOrderMessageLen {
		return "", fmt.Errorf("the order message is longer than %d characters", maxOrderMessageLen)
	}
	return strings.Map(func(r rune) rune {
		if r == '\n' || r >= 0x20 && r != 0x7f {
			return r
		}
		return -1
	}, message), nil
}

const siteSettingsFile = "site-settings.json"

type siteSettings struct {
	LandingEnabled  bool `json:"landingEnabled"`
	IndexingEnabled bool `json:"indexingEnabled"`
	HostingEnabled  bool `json:"hostingEnabled"`
	// GraceDays is how long an account keeps working after its plan ended; 0 suspends it at once
	GraceDays int `json:"graceDays"`
	// OrderURL is where the "order" button of a plan leads (web page, wa.me link or mailto:)
	OrderURL string `json:"orderUrl"`
	// OrderMessage is the text sent along with the order button ({plan}, {price} and {period} are filled in);
	// empty means the default text of the buyer's language
	OrderMessage string `json:"orderMessage"`
	// OoklaLicenseAccepted: the superadmin accepted Ookla's licence for its client, which the agent
	// would otherwise have to accept on its own
	OoklaLicenseAccepted bool `json:"ooklaLicenseAccepted"`
	// ExamplePlansSeeded: the three example plans were offered once (or plans already existed), so they
	// are not put back after the superadmin deletes them
	ExamplePlansSeeded bool `json:"examplePlansSeeded"`
	// SelfSignup lets a buyer sign up and pay for a plan from the landing page. Off by default: the seller
	// turns it on once the account to pay to is filled in.
	SelfSignup bool `json:"selfSignup"`
	// OrderMethods are the banks and e-wallets a buyer can pay to; the three fields below are the single account of
	// older settings, still read when no method was saved
	OrderMethods []orderMethod `json:"orderMethods"`
	OrderBank    string        `json:"orderBank"`
	OrderAccount string        `json:"orderAccount"`
	OrderHolder  string        `json:"orderHolder"`
	// OrderExpiryMinutes is how long an order waits for its payment; 0 means a day
	OrderExpiryMinutes int `json:"orderExpiryMinutes"`
	// OrderUniqueMax is the largest code added to a price to make the total unique; 0 means 999
	OrderUniqueMax int `json:"orderUniqueMax"`
	// TrialApproval: a trial waits for the superadmin instead of starting at once
	TrialApproval bool `json:"trialApproval"`
	// The seller as an invoice shows them: name, address (a few lines), a line of contact and a note under every invoice
	InvoiceName    string `json:"invoiceName"`
	InvoiceAddress string `json:"invoiceAddress"`
	InvoiceContact string `json:"invoiceContact"`
	InvoiceNote    string `json:"invoiceNote"`
}

var (
	siteSettingsMu    sync.Mutex
	siteSettingsCache = map[string]siteCacheEntry{}
)

type siteCacheEntry struct {
	value  siteSettings
	loaded time.Time
}

// Every request to a public page asks for these; a short cache keeps that off the disk
const siteSettingsTTL = 2 * time.Second

func (s *Server) siteSettingsPath() string {
	return filepath.Join(s.cfg.StateDir, siteSettingsFile)
}

// loadSiteSettings returns the stored switches. Without a file everything public stays on,
// and hosting mode is on only when a demo account was already running (so an upgrade does not
// switch the demo off).
func (s *Server) loadSiteSettings() siteSettings {
	path := s.siteSettingsPath()
	siteSettingsMu.Lock()
	defer siteSettingsMu.Unlock()
	if entry, ok := siteSettingsCache[path]; ok && time.Since(entry.loaded) < siteSettingsTTL {
		return entry.value
	}
	value := siteSettings{LandingEnabled: true, IndexingEnabled: true}
	if raw, err := os.ReadFile(path); err == nil {
		// fields missing from an older file keep their defaults
		_ = json.Unmarshal(raw, &value)
	} else {
		demo, _ := s.loadDemoSettings()
		value.HostingEnabled = demo.Enabled
	}
	siteSettingsCache[path] = siteCacheEntry{value: value, loaded: time.Now()}
	return value
}

func (s *Server) saveSiteSettings(value siteSettings) error {
	path := s.siteSettingsPath()
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.cfg.StateDir, 0o750); err != nil {
		return err
	}
	siteSettingsMu.Lock()
	defer siteSettingsMu.Unlock()
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return err
	}
	siteSettingsCache[path] = siteCacheEntry{value: value, loaded: time.Now()}
	return nil
}

func (s *Server) landingEnabled() bool { return s.loadSiteSettings().LandingEnabled }

// landingFor says whether the public pages exist at the address a request came to. The address of a buyer's panel (a sold
// subdomain, or a domain of their own) opens the login of that panel and nothing of the seller's public site: no landing page,
// articles, install guide, ordering or crawler files.
func (s *Server) landingFor(r *http.Request) bool {
	return s.landingEnabled() && s.hostingHostOwner(normalizeHost(r.Host)) == 0
}
func (s *Server) indexingAllowed() bool {
	settings := s.loadSiteSettings()
	return settings.LandingEnabled && settings.IndexingEnabled
}
func (s *Server) hostingEnabled() bool { return s.loadSiteSettings().HostingEnabled }

// requireLanding hides public data (articles, contributors) while the public pages are off
func (s *Server) requireLanding(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.landingFor(r) {
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "not found"})
			return
		}
		next(w, r)
	}
}

// handlePublicSite tells the frontend which public pages exist
func (s *Server) handlePublicSite(w http.ResponseWriter, r *http.Request) {
	settings := s.loadSiteSettings()
	w.Header().Set("Cache-Control", "no-store")
	s.writeJSON(w, http.StatusOK, jsonResponse{"landing": s.landingFor(r), "hosting": settings.HostingEnabled})
}

func (s *Server) handleGetSiteSettings(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, s.loadSiteSettings())
}

func (s *Server) handleSetSiteSettings(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		LandingEnabled  *bool   `json:"landingEnabled"`
		IndexingEnabled *bool   `json:"indexingEnabled"`
		HostingEnabled  *bool   `json:"hostingEnabled"`
		GraceDays       *int    `json:"graceDays"`
		OrderURL        *string `json:"orderUrl"`
		OrderMessage    *string `json:"orderMessage"`
		// OoklaLicenseAccepted can be given and taken back
		OoklaLicenseAccepted *bool `json:"ooklaLicenseAccepted"`
		SelfSignup           *bool   `json:"selfSignup"`
		OrderMethods         *[]orderMethod `json:"orderMethods"`
		OrderBank            *string        `json:"orderBank"`
		OrderAccount         *string        `json:"orderAccount"`
		OrderHolder          *string        `json:"orderHolder"`
		OrderExpiryMinutes   *int    `json:"orderExpiryMinutes"`
		OrderUniqueMax       *int    `json:"orderUniqueMax"`
		TrialApproval        *bool   `json:"trialApproval"`
		InvoiceName          *string `json:"invoiceName"`
		InvoiceAddress       *string `json:"invoiceAddress"`
		InvoiceContact       *string `json:"invoiceContact"`
		InvoiceNote          *string `json:"invoiceNote"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	current := s.loadSiteSettings()
	next := current
	if req.LandingEnabled != nil {
		next.LandingEnabled = *req.LandingEnabled
	}
	if req.IndexingEnabled != nil {
		next.IndexingEnabled = *req.IndexingEnabled
	}
	if req.HostingEnabled != nil {
		next.HostingEnabled = *req.HostingEnabled
	}
	if req.GraceDays != nil {
		if *req.GraceDays < 0 || *req.GraceDays > planMaxGraceDays {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": fmt.Sprintf("grace period must be between 0 and %d days", planMaxGraceDays)})
			return
		}
		next.GraceDays = *req.GraceDays
	}
	if req.OrderURL != nil {
		link := strings.TrimSpace(*req.OrderURL)
		if err := validateOrderURL(link); err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
			return
		}
		next.OrderURL = link
	}
	if req.OrderMessage != nil {
		message, err := cleanOrderMessage(*req.OrderMessage)
		if err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
			return
		}
		next.OrderMessage = message
	}
	if req.OoklaLicenseAccepted != nil {
		next.OoklaLicenseAccepted = *req.OoklaLicenseAccepted
	}
	for _, field := range []struct {
		in  *string
		out *string
	}{{req.OrderBank, &next.OrderBank}, {req.OrderAccount, &next.OrderAccount}, {req.OrderHolder, &next.OrderHolder}} {
		if field.in == nil {
			continue
		}
		text := strings.TrimSpace(*field.in)
		if utf8.RuneCountInString(text) > orderTextMax || strings.ContainsAny(text, "\r\n") {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": fmt.Sprintf("the payment details are one line of at most %d characters each", orderTextMax)})
			return
		}
		*field.out = text
	}
	if req.OrderMethods != nil {
		methods, err := cleanOrderMethods(*req.OrderMethods)
		if err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
			return
		}
		next.OrderMethods = methods
		// the list replaces the single account of older settings
		next.OrderBank, next.OrderAccount, next.OrderHolder = "", "", ""
	}
	if req.OrderExpiryMinutes != nil {
		if *req.OrderExpiryMinutes != 0 && (*req.OrderExpiryMinutes < orderMinExpiryMinutes || *req.OrderExpiryMinutes > orderMaxExpiryMinutes) {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": fmt.Sprintf("an order waits between %d minutes and %d days", orderMinExpiryMinutes, orderMaxExpiryMinutes/1440)})
			return
		}
		next.OrderExpiryMinutes = *req.OrderExpiryMinutes
	}
	if req.OrderUniqueMax != nil {
		if *req.OrderUniqueMax != 0 && (*req.OrderUniqueMax < 9 || *req.OrderUniqueMax > 9999) {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "the unique code goes up to a number between 9 and 9999"})
			return
		}
		next.OrderUniqueMax = *req.OrderUniqueMax
	}
	if req.TrialApproval != nil {
		next.TrialApproval = *req.TrialApproval
	}
	for _, field := range []struct {
		in        *string
		out       *string
		max       int
		multiline bool
	}{{req.InvoiceName, &next.InvoiceName, 80, false}, {req.InvoiceContact, &next.InvoiceContact, 120, false}, {req.InvoiceAddress, &next.InvoiceAddress, 240, true}, {req.InvoiceNote, &next.InvoiceNote, 240, true}} {
		if field.in == nil {
			continue
		}
		text := strings.TrimSpace(strings.ReplaceAll(*field.in, "\r\n", "\n"))
		if utf8.RuneCountInString(text) > field.max || (!field.multiline && strings.Contains(text, "\n")) || strings.Count(text, "\n") > 4 {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "the invoice details are too long"})
			return
		}
		*field.out = text
	}
	if req.SelfSignup != nil {
		// buyers pay to an account: it has to be named before orders are taken
		if *req.SelfSignup && len(activeOrderMethods(next)) == 0 {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "add a bank or e-wallet to pay to, with its number and holder, before turning on orders"})
			return
		}
		next.SelfSignup = *req.SelfSignup
	}
	if err := s.saveSiteSettings(next); err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("could not save the site settings"))
		return
	}
	// without hosting mode there is no demo account and no sold subdomain is served
	if current.HostingEnabled && !next.HostingEnabled {
		s.disableDemoAccount()
	}
	if current.HostingEnabled != next.HostingEnabled {
		go s.syncHostingRoutes()
	}
	// the first time hosting mode is on there is something to show on the landing page
	if next.HostingEnabled {
		s.seedExamplePlans()
		next = s.loadSiteSettings()
	}
	if u := userFromCtx(r); u != nil {
		changes := map[string]any{}
		if next.LandingEnabled != current.LandingEnabled {
			changes["landing"] = next.LandingEnabled
		}
		if next.IndexingEnabled != current.IndexingEnabled {
			changes["indexing"] = next.IndexingEnabled
		}
		if next.HostingEnabled != current.HostingEnabled {
			changes["hosting"] = next.HostingEnabled
		}
		if next.GraceDays != current.GraceDays {
			changes["graceDays"] = next.GraceDays
		}
		if next.OrderURL != current.OrderURL {
			changes["orderUrlChanged"] = true
		}
		if next.OrderMessage != current.OrderMessage {
			changes["orderMessageChanged"] = true
		}
		if next.OoklaLicenseAccepted != current.OoklaLicenseAccepted {
			changes["ooklaLicense"] = next.OoklaLicenseAccepted
		}
		s.auditSensitiveAction(r, u, "settings.site", "ok", changes)
	}
	s.writeJSON(w, http.StatusOK, next)
}
