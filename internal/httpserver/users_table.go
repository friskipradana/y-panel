package httpserver

import (
	"net/http"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
)

// The accounts of the Users window as a spreadsheet: each column can be ordered and narrowed to some of
// its values, on the agent, over every account the viewer manages.

type userTableRow struct {
	database.User
	ParentID *int64           `json:"parentId"`
	Hosting  *userHostingView `json:"hosting,omitempty"`
}

func planNameOf(u userTableRow) string {
	if u.Hosting == nil || u.Hosting.PlanID == nil {
		return "none"
	}
	return u.Hosting.PlanName
}

func planStateOf(u userTableRow) string {
	if u.Hosting == nil {
		return ""
	}
	return u.Hosting.State
}

func userSpec() listquery.Spec[userTableRow] {
	return listquery.Spec[userTableRow]{
		Columns: []listquery.Column[userTableRow]{
			{Key: "name", Value: func(u userTableRow) string { return u.Username }},
			{Key: "role", Value: func(u userTableRow) string { return u.Role }},
			{Key: "status", Value: func(u userTableRow) string { return u.Status }},
			{Key: "plan", Value: planNameOf},
			{Key: "state", Value: planStateOf},
			{Key: "expires", Value: func(u userTableRow) string {
				if u.Hosting == nil || u.Hosting.ExpiresAt == nil {
					return ""
				}
				return u.Hosting.ExpiresAt.Format("2006-01-02")
			}, Compare: func(a, b userTableRow) int {
				// no end date sorts last: such a plan never ends
				ea, eb := a.Hosting, b.Hosting
				var ta, tb *time.Time
				if ea != nil {
					ta = ea.ExpiresAt
				}
				if eb != nil {
					tb = eb.ExpiresAt
				}
				switch {
				case ta == nil && tb == nil:
					return 0
				case ta == nil:
					return 1
				case tb == nil:
					return -1
				case ta.Before(*tb):
					return -1
				case ta.After(*tb):
					return 1
				}
				return 0
			}},
			{Key: "login", Value: func(u userTableRow) string {
				if u.LastLoginAt == nil {
					return ""
				}
				return u.LastLoginAt.Format("2006-01-02")
			}, Compare: func(a, b userTableRow) int {
				switch {
				case a.LastLoginAt == nil && b.LastLoginAt == nil:
					return 0
				case a.LastLoginAt == nil:
					return -1
				case b.LastLoginAt == nil:
					return 1
				case a.LastLoginAt.Before(*b.LastLoginAt):
					return -1
				case a.LastLoginAt.After(*b.LastLoginAt):
					return 1
				}
				return 0
			}},
		},
		Search: func(u userTableRow) string {
			return strings.ToLower(u.Username + " " + u.Email + " " + u.Role + " " + u.DisplayName)
		},
		Tiebreak: func(a, b userTableRow) int { return int(a.ID - b.ID) },
	}
}

// userRowsFor decorates accounts with the account that manages each and, in hosting mode, their plan
func (s *Server) userRowsFor(userList []database.User, hosting bool, graceDays int) []userTableRow {
	ids := make([]int64, 0, len(userList))
	for _, u := range userList {
		ids = append(ids, u.ID)
	}
	parents, _ := s.database.UserParentIDs(ids)
	var info map[int64]database.UserHosting
	if hosting {
		info, _ = s.database.UserHostingInfo(ids)
	}
	now := time.Now()
	rows := make([]userTableRow, 0, len(userList))
	for _, u := range userList {
		row := userTableRow{User: u}
		if p, ok := parents[u.ID]; ok {
			parent := p
			row.ParentID = &parent
		}
		if hosting && u.Role != auth.SuperadminRole {
			view := hostingViewFor(info[u.ID], graceDays, now)
			row.Hosting = &view
		}
		rows = append(rows, row)
	}
	return rows
}

// handleUsersTable answers the Users window: every account in the viewer's scope, narrowed, ordered and paged
func (s *Server) handleUsersTable(w http.ResponseWriter, r *http.Request) {
	limit, offset, err := parseLimitOffset(r, 50, 200)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	actor := userFromCtx(r)
	// plans belong to the superadmin and only exist while hosting mode is on
	hosting := actor != nil && actor.Role == auth.SuperadminRole && s.hostingEnabled()
	site := s.loadSiteSettings()
	opts := database.UserListOptions{GraceDays: site.GraceDays, Limit: 200}
	if scope := s.ownerScopeFor(actor); !scope.all {
		opts.IDs = scope.list()
	}

	var all []database.User
	for page := 0; page < 50; page++ {
		opts.Offset = page * opts.Limit
		part, total, err := s.database.ListUsersAdvanced(opts)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		all = append(all, part...)
		if int64(len(all)) >= total || len(part) == 0 {
			break
		}
	}

	res := tableResponse(s.userRowsFor(all, hosting, site.GraceDays), userSpec(), r.URL.Query())
	end := offset + limit
	if offset > len(res.Items) {
		offset = len(res.Items)
	}
	if end > len(res.Items) {
		end = len(res.Items)
	}
	res.Items = res.Items[offset:end]
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": res.Items, "total": res.Total, "all": res.All, "facets": res.Facets, "limit": limit, "offset": offset})
}
