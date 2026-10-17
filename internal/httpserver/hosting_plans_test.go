package httpserver

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func validPlan() database.HostingPlan {
	return database.HostingPlan{
		Slug: "starter", Name: "Starter", Tagline: "For one site", PriceAmount: 25000, Period: "monthly",
		Features: []string{"1 project"}, MaxProjects: 2, MaxTunnels: 2, MaxDatabases: 1, DiskQuotaMB: 2048,
		CPULimitPct: 100, MemoryLimitMB: 512, MaxSubdomains: 1, Visible: true,
	}
}

func TestValidatePlan(t *testing.T) {
	if err := validatePlan(validPlan()); err != nil {
		t.Fatalf("a normal plan must pass: %v", err)
	}
	cases := map[string]func(p *database.HostingPlan){
		"slug with spaces":    func(p *database.HostingPlan) { p.Slug = "my plan" },
		"slug with uppercase": func(p *database.HostingPlan) { p.Slug = "Starter" },
		"slug double dash":    func(p *database.HostingPlan) { p.Slug = "a--b" },
		"empty name":          func(p *database.HostingPlan) { p.Name = "" },
		"negative price":      func(p *database.HostingPlan) { p.PriceAmount = -1 },
		"unknown period":      func(p *database.HostingPlan) { p.Period = "weekly" },
		"too many features":   func(p *database.HostingPlan) { p.Features = make([]string, 13) },
		"absurd disk":         func(p *database.HostingPlan) { p.DiskQuotaMB = 1 << 40 },
		"negative projects":   func(p *database.HostingPlan) { p.MaxProjects = -1 },
		"too many subdomains": func(p *database.HostingPlan) { p.MaxSubdomains = 500 },
	}
	for name, mutate := range cases {
		p := validPlan()
		mutate(&p)
		if validatePlan(p) == nil {
			t.Errorf("%s must be rejected", name)
		}
	}
}

func TestCleanPlanTrimsAndDropsEmptyFeatures(t *testing.T) {
	p := validPlan()
	p.Slug, p.Name, p.Period = "  Starter ", "  Starter  ", " MONTHLY "
	p.Features = []string{" a ", "", "  ", "b"}
	cleanPlan(&p)
	if p.Slug != "starter" || p.Name != "Starter" || p.Period != "monthly" || len(p.Features) != 2 || p.Features[0] != "a" {
		t.Fatalf("unexpected clean result: %+v", p)
	}
}

func TestValidateOrderURL(t *testing.T) {
	for _, ok := range []string{"", "https://wa.me/628123456789", "https://example.com/order", "mailto:sales@example.com"} {
		if err := validateOrderURL(ok); err != nil {
			t.Errorf("%q must be accepted: %v", ok, err)
		}
	}
	for _, bad := range []string{"javascript:alert(1)", "ftp://example.com", "data:text/html,x", "//example.com", "https://", "mailto:", "example.com"} {
		if validateOrderURL(bad) == nil {
			t.Errorf("%q must be rejected", bad)
		}
	}
}

func TestPlanState(t *testing.T) {
	now := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	past := now.Add(-48 * time.Hour)
	future := now.Add(48 * time.Hour)
	if state, _ := planState(nil, 3, now); state != planStateActive {
		t.Fatalf("no end date never expires, got %s", state)
	}
	if state, _ := planState(&future, 3, now); state != planStateActive {
		t.Fatalf("before the end it is active, got %s", state)
	}
	if state, end := planState(&past, 3, now); state != planStateGrace || end == nil || !end.After(now) {
		t.Fatalf("two days after the end with 3 days grace is grace, got %s %v", state, end)
	}
	if state, _ := planState(&past, 1, now); state != planStateExpired {
		t.Fatalf("grace of one day is over after two, got %s", state)
	}
	if state, end := planState(&past, 0, now); state != planStateExpired || end != nil {
		t.Fatalf("no grace means expired at once, got %s %v", state, end)
	}
}

func TestAddMonthsClampsToMonthEnd(t *testing.T) {
	jan31 := time.Date(2026, 1, 31, 8, 0, 0, 0, time.UTC)
	if got := addMonths(jan31, 1); got.Month() != time.February || got.Day() != 28 {
		t.Fatalf("31 Jan + 1 month must be 28 Feb, got %v", got)
	}
	if got := addMonths(jan31, 12); got.Year() != 2027 || got.Month() != time.January || got.Day() != 31 {
		t.Fatalf("a year later must keep the date, got %v", got)
	}
	if got := addMonths(time.Date(2026, 11, 15, 0, 0, 0, 0, time.UTC), 3); got.Year() != 2027 || got.Month() != time.February {
		t.Fatalf("months roll over the year, got %v", got)
	}
}

func TestPlanEnd(t *testing.T) {
	now := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC)
	monthly := &database.HostingPlan{ID: 1, Period: "monthly"}
	once := &database.HostingPlan{ID: 2, Period: "once"}

	if end, err := planEnd(monthly, nil, nil, nil, now); err != nil || end == nil || end.Month() != time.November {
		t.Fatalf("a monthly plan runs one month, got %v %v", end, err)
	}
	if end, err := planEnd(once, nil, nil, nil, now); err != nil || end != nil {
		t.Fatalf("a one-time plan never ends, got %v %v", end, err)
	}
	// renewing before the end extends from the end, not from today
	planID := int64(1)
	ahead := now.Add(10 * 24 * time.Hour)
	previous := &database.UserPlan{PlanID: &planID, ExpiresAt: &ahead}
	months := 1
	if end, _ := planEnd(monthly, previous, nil, &months, now); end == nil || !end.After(ahead) {
		t.Fatalf("a renewal must extend the current end, got %v", end)
	}
	// changing plan starts from today
	other := int64(9)
	switched := &database.UserPlan{PlanID: &other, ExpiresAt: &ahead}
	if end, _ := planEnd(monthly, switched, nil, &months, now); end == nil || !end.Equal(addMonths(now, 1)) {
		t.Fatalf("a different plan starts from today, got %v", end)
	}
	bad := 0
	if _, err := planEnd(monthly, nil, nil, &bad, now); err == nil {
		t.Fatal("zero months must be rejected")
	}
	garbage := "tomorrow"
	if _, err := planEnd(monthly, nil, &garbage, nil, now); err == nil {
		t.Fatal("a non-RFC3339 date must be rejected")
	}
}

func TestPublicHostingIsClosedWithoutHostingMode(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	rec := httptest.NewRecorder()
	s.handlePublicHosting(rec, httptest.NewRequest(http.MethodGet, "/api/v1/public/hosting", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"enabled":false`) {
		t.Fatalf("hosting off: nothing is offered, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestPlanMutationsNeedHostingMode(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	for name, call := range map[string]func(http.ResponseWriter, *http.Request){
		"create": s.handleCreateHostingPlan,
		"update": s.handleUpdateHostingPlan,
		"delete": s.handleDeleteHostingPlan,
		"assign": s.handleSetUserPlan,
	} {
		rec := httptest.NewRecorder()
		call(rec, httptest.NewRequest(http.MethodPost, "/x", strings.NewReader("{}")))
		if rec.Code != http.StatusConflict {
			t.Errorf("%s with hosting off must answer 409, got %d", name, rec.Code)
		}
	}
}

func TestSiteSettingsRejectBadTerms(t *testing.T) {
	s := newSiteTestServer(t, config.Config{})
	for _, body := range []string{`{"graceDays":-1}`, `{"graceDays":91}`, `{"orderUrl":"javascript:alert(1)"}`} {
		rec := httptest.NewRecorder()
		s.handleSetSiteSettings(rec, httptest.NewRequest(http.MethodPut, "/api/v1/settings/site", strings.NewReader(body)))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s must be rejected, got %d", body, rec.Code)
		}
	}
	rec := httptest.NewRecorder()
	s.handleSetSiteSettings(rec, httptest.NewRequest(http.MethodPut, "/api/v1/settings/site", strings.NewReader(`{"graceDays":7,"orderUrl":" https://wa.me/628123 "}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("valid terms must be saved, got %d %s", rec.Code, rec.Body.String())
	}
	if got := s.loadSiteSettings(); got.GraceDays != 7 || got.OrderURL != "https://wa.me/628123" {
		t.Fatalf("terms not stored: %+v", got)
	}
}
