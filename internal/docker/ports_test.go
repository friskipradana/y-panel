package docker

import (
	"reflect"
	"sort"
	"strconv"
	"testing"
)

func keys(ports []HostPort) []string {
	out := make([]string, 0, len(ports))
	for _, p := range ports {
		out = append(out, p.Proto+":"+strconv.Itoa(p.Port))
	}
	sort.Strings(out)
	return out
}

func TestComposeHostPorts(t *testing.T) {
	yaml := `services:
  web:
    image: nginx
    ports:
      - "8080:80"
      - 127.0.0.1:8443:443
      - "5353:53/udp"
      - "9000-9002:9000-9002"
      - "80"
      - target: 3000
        published: 3001
        protocol: tcp
      - ${PORT}:8000
  db:
    image: postgres
    ports: ["5432:5432", "127.0.0.1:5433:5432"]
    environment:
      - A=1
  worker:
    image: x
    expose:
      - "9999"
`
	got := keys(ComposeHostPorts(yaml))
	// only the host side of each mapping counts
	want := []string{"tcp:3001", "tcp:5432", "tcp:5433", "tcp:8080", "tcp:8443", "tcp:9000", "tcp:9001", "tcp:9002", "udp:5353"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v\nwant %v", got, want)
	}
}

func TestHostPortsOf(t *testing.T) {
	ports, err := HostPortsOf([]PortBinding{{HostPort: "8080", ContainerPort: "80"}, {HostPort: "9000-9001", ContainerPort: "9000", Protocol: "udp"}, {ContainerPort: "81"}})
	if err != nil {
		t.Fatal(err)
	}
	if got := keys(ports); !reflect.DeepEqual(got, []string{"tcp:8080", "udp:9000", "udp:9001"}) {
		t.Fatalf("got %v", got)
	}
	if _, err := HostPortsOf([]PortBinding{{HostPort: "70000", ContainerPort: "80"}}); err == nil {
		t.Fatal("a port past 65535 must be refused")
	}
	if _, err := HostPortsOf([]PortBinding{{HostPort: "abc", ContainerPort: "80"}}); err == nil {
		t.Fatal("a port that is not a number must be refused")
	}
}
