package docker

import (
	"strings"
	"testing"
)

func TestNormalizeBuiltinNetworks(t *testing.T) {
	cases := []struct {
		name, in string
		has      []string
		hasNot   []string
	}{
		{"list on bridge, with the top-level declaration",
			"services:\n  9router:\n    image: x\n    networks:\n      - bridge\nnetworks:\n  bridge:\n    external: true\n",
			[]string{"    network_mode: bridge", "    image: x"}, []string{"networks:", "external"}},
		{"quoted entry with aliases",
			"services:\n  web:\n    image: x\n    networks:\n      bridge:\n        aliases:\n          - web\n",
			[]string{"    network_mode: bridge"}, []string{"networks:", "aliases"}},
		{"inline list keeps the user network",
			"services:\n  web:\n    image: x\n    networks: [bridge, my-net]\nnetworks:\n  my-net:\n    external: true\n",
			[]string{"networks: [my-net]", "  my-net:", "external: true"}, []string{"network_mode", "bridge"}},
		{"user network only is untouched",
			"services:\n  web:\n    image: x\n    networks:\n      - my-net\nnetworks:\n  my-net:\n    external: true\n",
			[]string{"      - my-net", "  my-net:"}, []string{"network_mode"}},
		{"existing network_mode is not doubled",
			"services:\n  web:\n    image: x\n    network_mode: host\n    networks:\n      - host\n",
			[]string{"network_mode: host"}, []string{"networks:"}},
	}
	for _, c := range cases {
		got := normalizeBuiltinNetworks(c.in)
		for _, want := range c.has {
			if !strings.Contains(got, want) {
				t.Errorf("%s: missing %q in\n%s", c.name, want, got)
			}
		}
		for _, no := range c.hasNot {
			if strings.Contains(got, no) {
				t.Errorf("%s: %q should be gone in\n%s", c.name, no, got)
			}
		}
		if strings.Count(got, "network_mode") > 1 {
			t.Errorf("%s: network_mode twice:\n%s", c.name, got)
		}
	}
	plain := "services:\n  web:\n    image: x\n"
	if normalizeBuiltinNetworks(plain) != plain {
		t.Error("a file without networks must not change")
	}
}
