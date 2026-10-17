package httpserver

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/users"
)

// Rules for the plans the superadmin sells. Kept apart from the handlers so they are testable
// without a database.

const (
	planMaxFeatures    = 12
	planMaxFeatureLen  = 100
	planMaxPrice       = 1_000_000_000
	planMaxSubdomains  = 200
	planMaxGraceDays   = 90
	planMaxOrderURLLen = 300
)

var planSlugRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

var planPeriods = map[string]bool{"monthly": true, "yearly": true, "once": true}

// cleanPlan trims text and drops empty feature lines
func cleanPlan(p *database.HostingPlan) {
	p.Slug = strings.ToLower(strings.TrimSpace(p.Slug))
	p.Name = strings.TrimSpace(p.Name)
	p.Tagline = strings.TrimSpace(p.Tagline)
	p.Period = strings.ToLower(strings.TrimSpace(p.Period))
	features := make([]string, 0, len(p.Features))
	for _, feature := range p.Features {
		if feature = strings.TrimSpace(feature); feature != "" {
			features = append(features, feature)
		}
	}
	p.Features = features
}

func validatePlan(p database.HostingPlan) error {
	switch {
	case !planSlugRe.MatchString(p.Slug) || len(p.Slug) < 2 || len(p.Slug) > 40:
		return errors.New("slug must be 2 to 40 lowercase letters, digits or single dashes")
	case p.Name == "" || utf8.RuneCountInString(p.Name) > 60:
		return errors.New("name is required and at most 60 characters")
	case utf8.RuneCountInString(p.Tagline) > 140:
		return errors.New("tagline is at most 140 characters")
	case p.PriceAmount < 0 || p.PriceAmount > planMaxPrice:
		return fmt.Errorf("price must be between 0 and %d", planMaxPrice)
	case !planPeriods[p.Period]:
		return errors.New("period must be monthly, yearly or once")
	case len(p.Features) > planMaxFeatures:
		return fmt.Errorf("at most %d features", planMaxFeatures)
	case p.MaxSubdomains < 0 || p.MaxSubdomains > planMaxSubdomains:
		return fmt.Errorf("subdomains must be between 0 and %d", planMaxSubdomains)
	case p.SortOrder < -1000 || p.SortOrder > 1000:
		return errors.New("sort order must be between -1000 and 1000")
	}
	for _, feature := range p.Features {
		if utf8.RuneCountInString(feature) > planMaxFeatureLen {
			return fmt.Errorf("a feature is at most %d characters", planMaxFeatureLen)
		}
	}
	// the resource limits are an account quota: the same bounds apply
	return users.ValidateQuota(planQuota(p, 0))
}

// planQuota is the account quota a plan grants
func planQuota(p database.HostingPlan, userID int64) database.UserQuota {
	return database.UserQuota{
		UserID:        userID,
		MaxProjects:   p.MaxProjects,
		MaxTunnels:    p.MaxTunnels,
		MaxDatabases:  p.MaxDatabases,
		DiskQuotaMB:   p.DiskQuotaMB,
		CPULimitPct:   p.CPULimitPct,
		MemoryLimitMB: p.MemoryLimitMB,
	}
}

// validateOrderURL accepts the places a buyer can reach the seller: a web page, wa.me, or an email
func validateOrderURL(raw string) error {
	if raw == "" {
		return nil
	}
	if len(raw) > planMaxOrderURLLen {
		return errors.New("the order link is too long")
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return errors.New("the order link is not a valid address")
	}
	switch strings.ToLower(parsed.Scheme) {
	case "https", "http":
		if parsed.Host == "" {
			return errors.New("the order link needs a host")
		}
	case "mailto":
		if parsed.Opaque == "" && parsed.Path == "" {
			return errors.New("the order link needs an email address")
		}
	default:
		return errors.New("the order link must start with https://, http:// or mailto:")
	}
	return nil
}

// Where an account stands against its plan end
const (
	planStateNone    = "none"
	planStateActive  = "active"
	planStateGrace   = "grace"
	planStateExpired = "expired"
)

func planState(expiresAt *time.Time, graceDays int, now time.Time) (state string, graceEndsAt *time.Time) {
	if expiresAt == nil {
		return planStateActive, nil
	}
	if now.Before(*expiresAt) {
		return planStateActive, nil
	}
	if graceDays > 0 {
		end := expiresAt.Add(time.Duration(graceDays) * 24 * time.Hour)
		if now.Before(end) {
			return planStateGrace, &end
		}
		return planStateExpired, &end
	}
	return planStateExpired, nil
}

// addMonths moves a date by whole months; a day the target month does not have (31 January +
// 1 month) lands on that month's last day instead of spilling into the next one
func addMonths(from time.Time, months int) time.Time {
	year, month, day := from.Date()
	target := time.Date(year, month+time.Month(months), 1, from.Hour(), from.Minute(), from.Second(), from.Nanosecond(), from.Location())
	last := time.Date(target.Year(), target.Month()+1, 0, 0, 0, 0, 0, from.Location()).Day()
	if day > last {
		day = last
	}
	return time.Date(target.Year(), target.Month(), day, from.Hour(), from.Minute(), from.Second(), from.Nanosecond(), from.Location())
}
