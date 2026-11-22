package httpserver

import "testing"

func TestNormalizePingHost(t *testing.T) {
	valid := map[string]string{
		"1.1.1.1":         "1.1.1.1",
		" Example.COM ":   "example.com",
		"my-host.local":   "my-host.local",
		"::1":             "::1",
		"2001:db8::1":     "2001:db8::1",
		"a.b.c.d.e.f.g.h": "a.b.c.d.e.f.g.h",
	}
	for in, want := range valid {
		got, err := normalizePingHost(in)
		if err != nil || got != want {
			t.Errorf("normalizePingHost(%q) = %q, %v; want %q", in, got, err, want)
		}
	}

	invalid := []string{
		"",
		"   ",
		"-c 5 1.1.1.1",
		"--help",
		"host; rm -rf /",
		"host name",
		"http://example.com",
		"example.com/path",
		"exa$mple.com",
		"-example.com",
		"example..com",
	}
	for _, in := range invalid {
		if got, err := normalizePingHost(in); err == nil {
			t.Errorf("normalizePingHost(%q) = %q; want error", in, got)
		}
	}
}

func TestPingTimeRegexp(t *testing.T) {
	cases := map[string]string{
		"64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=12.4 ms": "12.4",
		"Reply from 1.1.1.1: bytes=32 time=9ms TTL=57":          "9",
		"Reply from 1.1.1.1: bytes=32 time<1ms TTL=57":          "1",
	}
	for in, want := range cases {
		m := pingTimeRe.FindStringSubmatch(in)
		if len(m) != 2 || m[1] != want {
			t.Errorf("pingTimeRe(%q) = %v; want %q", in, m, want)
		}
	}
}
