package docker

import "strings"

// Kinds of container the panel runs for its own features rather than for a user's project
const (
	KindDatabase        = "database"
	KindDatabaseControl = "database-control"
)

// Web clients of the Database window; containers made before they carried a label are known by name
const (
	adminerName = "reneo-adminer"
	dbxName     = "reneo-dbx"
)

// ManagedKind says which panel feature a container belongs to, or "" for an ordinary one
func ManagedKind(c Container) string {
	switch kind := c.Labels["reneo.kind"]; {
	case kind == KindDatabase || kind == KindDatabaseControl:
		return kind
	}
	for _, name := range c.Names {
		clean := strings.TrimPrefix(name, "/")
		if clean == adminerName || clean == dbxName {
			return KindDatabaseControl
		}
	}
	return ""
}
