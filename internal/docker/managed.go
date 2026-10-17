package docker

import "strings"

// Kinds of container the panel runs for its own features rather than for a user's project
const (
	KindDatabase        = "database"
	KindDatabaseControl = "database-control"
)

// adminerName is the web client of the Database window; containers made before it carried a label are known by it
const adminerName = "reneo-adminer"

// ManagedKind says which panel feature a container belongs to, or "" for an ordinary one
func ManagedKind(c Container) string {
	switch kind := c.Labels["reneo.kind"]; {
	case kind == KindDatabase || kind == KindDatabaseControl:
		return kind
	}
	for _, name := range c.Names {
		if strings.TrimPrefix(name, "/") == adminerName {
			return KindDatabaseControl
		}
	}
	return ""
}
