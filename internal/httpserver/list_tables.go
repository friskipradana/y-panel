package httpserver

import (
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/docker"
	"github.com/friskipradana/panel-desktop-ui/internal/listquery"
)

// The tables of the Docker window as spreadsheets: each column can be ordered and narrowed to some of its values,
// on the agent, over the whole list. One spec per table says what a column shows, how it orders and what a search reads.

func lower(s string) string { return strings.ToLower(s) }

func containerName(c docker.Container) string {
	if len(c.Names) > 0 {
		return strings.TrimPrefix(c.Names[0], "/")
	}
	if len(c.ID) > 12 {
		return c.ID[:12]
	}
	return c.ID
}

func containerStack(c docker.Container) string {
	if c.ProjectName != "" {
		return c.ProjectName
	}
	if stack := c.Labels["com.docker.compose.project"]; stack != "" {
		return stack
	}
	return "standalone"
}

// containerPorts is the ports a container shows: the ones published on the host, else its own
func containerPorts(c docker.Container) string {
	var published, own []string
	seenPublished, seenOwn := map[int]bool{}, map[int]bool{}
	for _, p := range c.Ports {
		if p.PublicPort > 0 && !seenPublished[p.PublicPort] {
			seenPublished[p.PublicPort] = true
			published = append(published, ":"+strconv.Itoa(p.PublicPort))
		} else if p.PublicPort == 0 && !seenOwn[p.PrivatePort] {
			seenOwn[p.PrivatePort] = true
			own = append(own, ":"+strconv.Itoa(p.PrivatePort))
		}
	}
	if len(published) > 0 {
		return strings.Join(published, " ")
	}
	if len(own) > 0 {
		return strings.Join(own, " ")
	}
	return "-"
}

func firstPort(c docker.Container) int {
	for _, p := range c.Ports {
		if p.PublicPort > 0 {
			return p.PublicPort
		}
	}
	for _, p := range c.Ports {
		return p.PrivatePort
	}
	return 0
}

func containerSpec() listquery.Spec[docker.Container] {
	return listquery.Spec[docker.Container]{
		Columns: []listquery.Column[docker.Container]{
			{Key: "name", Value: containerName},
			{Key: "stack", Value: containerStack},
			{Key: "image", Value: func(c docker.Container) string { return c.Image }},
			{Key: "state", Value: func(c docker.Container) string { return c.State }},
			{Key: "port", Value: containerPorts, Compare: func(a, b docker.Container) int { return firstPort(a) - firstPort(b) }},
		},
		Search: func(c docker.Container) string {
			return strings.Join([]string{containerName(c), containerStack(c), c.Image, c.State, c.Status, c.ID, c.Health, strings.Join(c.Networks, " "), strings.Join(c.IPAddresses, " "), containerPorts(c)}, " ")
		},
		Tiebreak: func(a, b docker.Container) int {
			return strings.Compare(lower(containerName(a)), lower(containerName(b)))
		},
	}
}

// ─── images ───────────────────────────────────────────────────────────────────

type imageRow struct {
	docker.Image
	InUse bool `json:"inUse"`
}

// imageInUse: a container names the image as repo:tag, as a bare repo (latest), or by id
func imageInUse(img docker.Image, used map[string]bool) bool {
	if used[img.Repository+":"+img.Tag] || (img.Tag == "latest" && used[img.Repository]) {
		return true
	}
	id := strings.TrimPrefix(img.ID, "sha256:")
	for name := range used {
		wanted := strings.TrimPrefix(name, "sha256:")
		if len(wanted) >= 8 && isHex(wanted) && strings.HasPrefix(id, wanted) {
			return true
		}
	}
	return false
}

func isHex(s string) bool {
	for _, r := range s {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f') {
			return false
		}
	}
	return s != ""
}

// parseDockerSize reads "1.12GB", "962MB", "12.5kB" (docker's own SI units) as bytes; 0 when it cannot
func parseDockerSize(s string) float64 {
	s = strings.TrimSpace(s)
	units := []struct {
		suffix string
		factor float64
	}{{"TB", 1e12}, {"GB", 1e9}, {"MB", 1e6}, {"kB", 1e3}, {"KB", 1e3}, {"B", 1}}
	for _, u := range units {
		if strings.HasSuffix(s, u.suffix) {
			if n, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(s, u.suffix)), 64); err == nil {
				return n * u.factor
			}
			return 0
		}
	}
	return 0
}

// parseDockerTime reads "2026-10-13 03:12:57 +0700 WIB" (how docker writes a date); zero when it cannot
func parseDockerTime(s string) time.Time {
	if len(s) >= 25 {
		if t, err := time.Parse("2006-01-02 15:04:05 -0700", s[:25]); err == nil {
			return t
		}
	}
	if len(s) >= 19 {
		if t, err := time.Parse("2006-01-02 15:04:05", s[:19]); err == nil {
			return t
		}
	}
	return time.Time{}
}

func compareTimes(a, b time.Time) int {
	switch {
	case a.Before(b):
		return -1
	case a.After(b):
		return 1
	}
	return 0
}

func usageWord(inUse bool) string {
	if inUse {
		return "in-use"
	}
	return "unused"
}

func imageSpec() listquery.Spec[imageRow] {
	return listquery.Spec[imageRow]{
		Columns: []listquery.Column[imageRow]{
			{Key: "name", Value: func(i imageRow) string { return i.Repository }},
			{Key: "tag", Value: func(i imageRow) string { return i.Tag }},
			{Key: "usage", Value: func(i imageRow) string { return usageWord(i.InUse) }},
			{Key: "size", Value: func(i imageRow) string { return i.Size }, Compare: func(a, b imageRow) int {
				switch x, y := parseDockerSize(a.Size), parseDockerSize(b.Size); {
				case x < y:
					return -1
				case x > y:
					return 1
				}
				return 0
			}},
			{Key: "created", Value: func(i imageRow) string {
				if t := parseDockerTime(i.CreatedAt); !t.IsZero() {
					return t.Format("2006-01-02")
				}
				return i.CreatedAt
			}, Compare: func(a, b imageRow) int {
				return compareTimes(parseDockerTime(a.CreatedAt), parseDockerTime(b.CreatedAt))
			}},
		},
		Search: func(i imageRow) string { return i.Repository + ":" + i.Tag + " " + i.ID },
		Tiebreak: func(a, b imageRow) int {
			return strings.Compare(lower(a.Repository+":"+a.Tag), lower(b.Repository+":"+b.Tag))
		},
	}
}

// ─── networks ─────────────────────────────────────────────────────────────────

type networkRow struct {
	docker.Network
	Containers int `json:"containers"`
}

func networkSpec() listquery.Spec[networkRow] {
	return listquery.Spec[networkRow]{
		Columns: []listquery.Column[networkRow]{
			{Key: "name", Value: func(n networkRow) string { return n.Name }},
			{Key: "driver", Value: func(n networkRow) string { return n.Driver }},
			{Key: "scope", Value: func(n networkRow) string { return n.Scope }},
			{Key: "subnet", Value: func(n networkRow) string {
				if n.Subnet == "" {
					return "-"
				}
				return n.Subnet
			}},
			{Key: "containers", Value: func(n networkRow) string { return strconv.Itoa(n.Containers) }, Compare: func(a, b networkRow) int { return a.Containers - b.Containers }},
		},
		Search: func(n networkRow) string {
			return strings.Join([]string{n.Name, n.Driver, n.Scope, n.Subnet, n.Gateway, n.ID}, " ")
		},
		Tiebreak: func(a, b networkRow) int { return strings.Compare(lower(a.Name), lower(b.Name)) },
	}
}

// ─── volumes (mounts of running containers) ───────────────────────────────────

func mountLabel(m docker.ContainerMount) string {
	switch {
	case m.Type == "volume" && m.Name != "":
		return m.Name
	case m.Source != "":
		return m.Source
	}
	return m.Destination
}

func mountMode(m docker.ContainerMount) string {
	if m.ReadOnly {
		return "ro"
	}
	return "rw"
}

func mountSpec() listquery.Spec[docker.ContainerMount] {
	return listquery.Spec[docker.ContainerMount]{
		Columns: []listquery.Column[docker.ContainerMount]{
			{Key: "mount", Value: mountLabel},
			{Key: "type", Value: func(m docker.ContainerMount) string { return m.Type }},
			{Key: "container", Value: func(m docker.ContainerMount) string { return m.ContainerName }},
			{Key: "path", Value: func(m docker.ContainerMount) string { return m.Destination }},
			{Key: "mode", Value: mountMode},
		},
		Search: func(m docker.ContainerMount) string {
			return strings.Join([]string{m.ContainerName, m.ProjectName, m.Name, m.Source, m.Destination, m.Type}, " ")
		},
		Tiebreak: func(a, b docker.ContainerMount) int {
			if c := strings.Compare(lower(a.ContainerName), lower(b.ContainerName)); c != 0 {
				return c
			}
			return strings.Compare(a.Destination, b.Destination)
		},
	}
}

// ─── templates ────────────────────────────────────────────────────────────────

func templateSpec() listquery.Spec[database.DockerComposeTemplate] {
	return listquery.Spec[database.DockerComposeTemplate]{
		Columns: []listquery.Column[database.DockerComposeTemplate]{
			{Key: "name", Value: func(t database.DockerComposeTemplate) string { return t.Name }},
			{Key: "description", Value: func(t database.DockerComposeTemplate) string { return t.Description }},
			{Key: "created", Value: func(t database.DockerComposeTemplate) string { return t.CreatedAt.Format("2006-01-02") }, Compare: func(a, b database.DockerComposeTemplate) int {
				return compareTimes(a.CreatedAt, b.CreatedAt)
			}},
		},
		Search:   func(t database.DockerComposeTemplate) string { return t.Name + " " + t.Description },
		Tiebreak: func(a, b database.DockerComposeTemplate) int { return strings.Compare(lower(a.Name), lower(b.Name)) },
	}
}

// tableResponse is what a list endpoint answers: the rows, and what each column can be narrowed to
func tableResponse[T any](items []T, spec listquery.Spec[T], query url.Values) listquery.Result[T] {
	res := listquery.Apply(items, spec, listquery.Parse(query, spec.Keys()))
	if res.Items == nil {
		res.Items = []T{}
	}
	return res
}
