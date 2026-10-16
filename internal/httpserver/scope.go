package httpserver

import (
	"net/http"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// Account isolation, hosting style: everything an account owns is private to it. The superadmin
// sees every account; an admin sees itself and the accounts created below it; a user sees only
// itself. The parent relation is users.parent_id.

type ownerScope struct {
	all bool
	ids map[int64]bool
}

func (sc ownerScope) has(id int64) bool { return sc.all || sc.ids[id] }

// list returns the owner IDs for a SQL filter. It is only meaningful when !all.
func (sc ownerScope) list() []int64 {
	out := make([]int64, 0, len(sc.ids))
	for id := range sc.ids {
		out = append(out, id)
	}
	return out
}

func (s *Server) ownerScopeFor(actor *database.User) ownerScope {
	if actor == nil {
		return ownerScope{ids: map[int64]bool{}}
	}
	if auth.IsSuperAdmin(actor.Role) {
		return ownerScope{all: true}
	}
	ids := map[int64]bool{actor.ID: true}
	if auth.IsAdmin(actor.Role) && s.database != nil && s.database.IsConnected() {
		if subtree, err := s.database.UserSubtreeIDs(actor.ID); err == nil {
			for _, id := range subtree {
				ids[id] = true
			}
		}
	}
	return ownerScope{ids: ids}
}

// requireUserScope guards routes that name an account in the path ({id}): the target must be
// the caller itself or below it.
func (s *Server) requireUserScope(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor := userFromCtx(r)
		if actor == nil {
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
			return
		}
		if !s.ownerScopeFor(actor).has(parsePathID(r, "id")) {
			// same answer as a missing account, so ids of other accounts are not confirmed
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "user not found"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// listProjectsScoped lists projects of the caller; with includeAll it spans the caller's whole
// scope (every account for the superadmin, the subtree for an admin).
func (s *Server) listProjectsScoped(u *database.User, includeAll bool, query string, limit, offset int) ([]database.Project, int64, error) {
	if !includeAll {
		return s.database.ListProjectsFiltered(u.ID, false, query, limit, offset)
	}
	scope := s.ownerScopeFor(u)
	if scope.all {
		return s.database.ListProjectsFiltered(u.ID, true, query, limit, offset)
	}
	return s.database.ListProjectsForOwners(scope.list(), query, limit, offset)
}
