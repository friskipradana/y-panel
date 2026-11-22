package httpserver

import (
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
)

// The databases of the Database window as a spreadsheet, like the Docker tables (list_tables.go)
func databaseSpec() listquery.Spec[managedDatabaseView] {
	return listquery.Spec[managedDatabaseView]{
		Columns: []listquery.Column[managedDatabaseView]{
			{Key: "name", Value: func(d managedDatabaseView) string { return d.Name }},
			{Key: "engine", Value: func(d managedDatabaseView) string { return d.EngineLabel }},
			{Key: "state", Value: func(d managedDatabaseView) string { return d.State }},
			{Key: "port", Value: func(d managedDatabaseView) string { return strconv.Itoa(d.HostPort) }, Compare: func(a, b managedDatabaseView) int { return a.HostPort - b.HostPort }},
		},
		Search: func(d managedDatabaseView) string {
			return strings.ToLower(d.Name + " " + d.EngineLabel + " " + d.DatabaseName + " " + d.OwnerName)
		},
		Tiebreak: func(a, b managedDatabaseView) int { return int(a.ID - b.ID) },
	}
}
