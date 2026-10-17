package httpserver

import (
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
)

// The projects table as a spreadsheet: every column can be ordered and narrowed to some of its values.
// The runtime state of a project is known only with its runtime, so the whole match is read first.

const projectScanLimit = 1000

// projectStateOf is the one state a project shows: what the runtime really does wins over what was asked for
func projectStateOf(p projectWithRuntime) string {
	if p.Runtime.Drift {
		return "drift"
	}
	switch status := strings.ToLower(strings.TrimSpace(p.Status)); status {
	case "error", "degraded", "building", "draft":
		return status
	}
	running := p.Running
	if p.Runtime.Known {
		running = p.Runtime.Running
	}
	if running {
		return "running"
	}
	return "stopped"
}

// stateRank orders the state column: what needs a look first, then what runs, then what rests
var stateRank = map[string]int{"error": 0, "degraded": 1, "drift": 2, "building": 3, "running": 4, "stopped": 5, "draft": 6}

func byProjectName(a, b projectWithRuntime) int {
	if c := strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)); c != 0 {
		return c
	}
	return int(a.ID - b.ID)
}

func projectSpec() listquery.Spec[projectWithRuntime] {
	return listquery.Spec[projectWithRuntime]{
		Columns: []listquery.Column[projectWithRuntime]{
			{Key: "name", Value: func(p projectWithRuntime) string { return p.Name }},
			{Key: "state", Value: projectStateOf, Compare: func(a, b projectWithRuntime) int { return stateRank[projectStateOf(a)] - stateRank[projectStateOf(b)] }},
			{Key: "type", Value: func(p projectWithRuntime) string { return p.ProjectType }},
			{Key: "port", Value: func(p projectWithRuntime) string {
				if p.AssignedPort <= 0 {
					return "-"
				}
				return strconv.Itoa(p.AssignedPort)
			}, Compare: func(a, b projectWithRuntime) int { return a.AssignedPort - b.AssignedPort }},
			{Key: "created", Value: func(p projectWithRuntime) string { return p.CreatedAt.Format("2006-01-02") }, Compare: func(a, b projectWithRuntime) int {
				switch {
				case a.CreatedAt.Before(b.CreatedAt):
					return -1
				case a.CreatedAt.After(b.CreatedAt):
					return 1
				}
				return 0
			}},
		},
		Search: func(p projectWithRuntime) string {
			return strings.Join([]string{p.Name, p.Slug, p.Description, p.WorkingDir, p.ProjectType}, " ")
		},
		Tiebreak: byProjectName,
	}
}
