package database

import (
	"regexp"
	"strconv"
	"testing"
	"time"
)

var placeholderRe = regexp.MustCompile(`\$(\d+)`)

// every argument must be used by a placeholder and every placeholder must have an argument
func checkPlaceholders(t *testing.T, name, where string, args []any) {
	t.Helper()
	used := map[int]bool{}
	for _, m := range placeholderRe.FindAllStringSubmatch(where, -1) {
		n, _ := strconv.Atoi(m[1])
		if n < 1 || n > len(args) {
			t.Fatalf("%s: placeholder $%d has no argument (%d args): %s", name, n, len(args), where)
		}
		used[n] = true
	}
	for i := 1; i <= len(args); i++ {
		if !used[i] {
			t.Fatalf("%s: argument %d is never used: %s", name, i, where)
		}
	}
}

func TestUserListWhere(t *testing.T) {
	now := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	if where, args := userListWhere(UserListOptions{}, now); where != "" || len(args) != 0 {
		t.Fatalf("no options means no filter, got %q %v", where, args)
	}
	cases := map[string]UserListOptions{
		"ids":         {IDs: []int64{1, 2}},
		"empty ids":   {IDs: []int64{}},
		"query":       {Query: " Dewi "},
		"status":      {Status: "suspended"},
		"role":        {Role: "admin"},
		"plan id":     {Plan: "7"},
		"plan none":   {Plan: "none"},
		"state none":  {PlanState: "none"},
		"state act":   {PlanState: "active"},
		"state grace": {PlanState: "grace", GraceDays: 3},
		"state exp":   {PlanState: "expired", GraceDays: 0},
		"expiring":    {PlanState: "expiring"},
		"everything":  {IDs: []int64{3}, Query: "a", Status: "active", Role: "user", Plan: "2", PlanState: "grace", GraceDays: 5},
	}
	for name, opts := range cases {
		where, args := userListWhere(opts, now)
		if where == "" {
			t.Errorf("%s: expected a filter", name)
			continue
		}
		checkPlaceholders(t, name, where, args)
	}

	// values that are not filters are ignored instead of reaching the query
	for name, opts := range map[string]UserListOptions{
		"unknown status": {Status: "banned"},
		"bad plan id":    {Plan: "1; DROP TABLE users"},
		"unknown state":  {PlanState: "whatever"},
	} {
		if where, args := userListWhere(opts, now); where != "" || len(args) != 0 {
			t.Errorf("%s must add no filter, got %q %v", name, where, args)
		}
	}
}

func TestUserListWhereQueryIsLowercasedAndWrapped(t *testing.T) {
	_, args := userListWhere(UserListOptions{Query: " DeWi "}, time.Now())
	if len(args) != 1 || args[0] != "%dewi%" {
		t.Fatalf("query must be trimmed, lowercased and wrapped, got %v", args)
	}
}
