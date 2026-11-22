package httpserver

import (
	"net/url"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestUserTableFiltersByRoleAndOrdersByExpiry(t *testing.T) {
	soon, later := time.Now().Add(24*time.Hour), time.Now().Add(30*24*time.Hour)
	planA, planB := int64(1), int64(2)
	rows := []userTableRow{
		{User: database.User{ID: 1, Username: "root", Role: "superadmin", Status: "active"}},
		{User: database.User{ID: 2, Username: "ana", Role: "user", Status: "active"}, Hosting: &userHostingView{PlanID: &planA, PlanName: "Pro", ExpiresAt: &later, State: "active"}},
		{User: database.User{ID: 3, Username: "budi", Role: "user", Status: "suspended"}, Hosting: &userHostingView{PlanID: &planB, PlanName: "Starter", ExpiresAt: &soon, State: "active"}},
		{User: database.User{ID: 4, Username: "cici", Role: "user", Status: "active"}, Hosting: &userHostingView{State: "none"}},
	}
	res := tableResponse(rows, userSpec(), url.Values{"f.role": {"user"}, "sort": {"expires"}, "order": {"asc"}})
	if res.Total != 3 || res.Items[0].Username != "budi" || res.Items[2].Username != "cici" {
		t.Fatalf("got %+v", res.Items)
	}
	if res.Facets["role"]["superadmin"] != 1 {
		t.Fatalf("the role column keeps offering the other roles: %v", res.Facets["role"])
	}
	if res.Facets["plan"]["none"] != 1 {
		t.Fatalf("an account without a plan counts as none: %v", res.Facets["plan"])
	}
}

func TestDocTableMergesVisibilityAndSearchesContent(t *testing.T) {
	now := time.Now()
	rows := []docTableRow{
		{Doc: database.Doc{ID: 1, Title: "Catatan", Status: "draft", UpdatedAt: now}, Source: "local"},
		{Doc: database.Doc{ID: 2, Title: "Publik", Status: "published", IsPublic: true, UpdatedAt: now.Add(-time.Hour)}, Source: "local"},
		{Doc: database.Doc{ID: -1, Title: "Memasang Reneo", Content: "pasang database", Status: "published", IsPublic: true, UpdatedAt: now.Add(-2 * time.Hour)}, Source: "official"},
	}
	res := tableResponse(rows, docSpec(), url.Values{"q": {"database"}})
	if res.Total != 1 || res.Items[0].ID != -1 {
		t.Fatalf("search reads the content: %+v", res.Items)
	}
	all := tableResponse(rows, docSpec(), url.Values{})
	if all.Facets["status"]["draft"] != 1 || all.Facets["status"]["public"] != 1 || all.Facets["status"]["official"] != 1 {
		t.Fatalf("status facets: %v", all.Facets["status"])
	}
	if all.Items[0].ID != 1 {
		t.Fatal("newest first by default")
	}
}
