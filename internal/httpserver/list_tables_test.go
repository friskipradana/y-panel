package httpserver

import (
	"net/url"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

func TestParseDockerSize(t *testing.T) {
	for in, want := range map[string]float64{"1.12GB": 1.12e9, "962MB": 962e6, "12.5kB": 12.5e3, "170MB": 170e6, "0B": 0, "": 0, "huge": 0, "2TB": 2e12} {
		if got := parseDockerSize(in); got != want {
			t.Errorf("%q: got %v want %v", in, got, want)
		}
	}
}

func TestParseDockerTime(t *testing.T) {
	if parseDockerTime("2026-10-13 03:12:57 +0700 WIB").IsZero() || parseDockerTime("2026-10-13 03:12:57").IsZero() {
		t.Fatal("docker's date text must be understood")
	}
	if !parseDockerTime("not a date").IsZero() {
		t.Fatal("anything else is a zero time")
	}
}

func TestImageInUse(t *testing.T) {
	img := docker.Image{ID: "sha256:abcdef1234567890", Repository: "nginx", Tag: "latest"}
	for name, used := range map[string]map[string]bool{
		"repo and tag": {"nginx:latest": true},
		"bare repo":    {"nginx": true},
		"by id":        {"abcdef123456": true},
	} {
		if !imageInUse(img, used) {
			t.Errorf("%s must count as in use", name)
		}
	}
	if imageInUse(img, map[string]bool{"nginx:1.25": true, "abc": true, "redis": true}) {
		t.Error("another tag, a short prefix and another repo do not count")
	}
	if imageInUse(docker.Image{ID: "sha256:1", Repository: "nginx", Tag: "1.25"}, map[string]bool{"nginx": true}) {
		t.Error("a bare repo means latest only")
	}
}

func TestContainerTable(t *testing.T) {
	containers := []docker.Container{
		{ID: "a1", Names: []string{"/web"}, Image: "nginx", State: "running", ProjectName: "shop", Ports: []docker.ContainerPort{{PrivatePort: 80, PublicPort: 8080}}},
		{ID: "b2", Names: []string{"/db"}, Image: "postgres", State: "exited", Ports: []docker.ContainerPort{{PrivatePort: 5432}}},
		{ID: "c3", Names: []string{"/api"}, Image: "node", State: "running", Labels: map[string]string{"com.docker.compose.project": "shop"}},
	}
	q := url.Values{"f.stack": {"shop"}, "sort": {"name"}}
	res := tableResponse(containers, containerSpec(), q)
	if len(res.Items) != 2 || containerName(res.Items[0]) != "api" || containerName(res.Items[1]) != "web" {
		t.Fatalf("a stack filter and a name order: %+v", res.Items)
	}
	// ports: the published port wins, the container's own port is the fallback, none is a dash
	if containerPorts(containers[0]) != ":8080" || containerPorts(containers[1]) != ":5432" || containerPorts(containers[2]) != "-" {
		t.Fatal("ports text")
	}
	// a column offers what the OTHER filters leave: with the shop stack ticked the exited db is out of the states,
	// while the stack column still offers every stack
	if _, offered := res.Facets["state"]["exited"]; offered || res.Facets["state"]["running"] != 2 {
		t.Fatalf("state facet: %+v", res.Facets["state"])
	}
	if res.Facets["stack"]["shop"] != 2 || res.Facets["stack"]["standalone"] != 1 {
		t.Fatalf("stack facet: %+v", res.Facets["stack"])
	}
}
