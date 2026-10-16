package accountusage

import "testing"

func TestParseSize(t *testing.T) {
	cases := map[string]uint64{"12MiB": 12 << 20, "1.5GiB": uint64(1.5 * (1 << 30)), "512KiB": 512 << 10, "0B": 0, "bogus": 0}
	for in, want := range cases {
		if got := parseSize(in); got != want {
			t.Errorf("%q: got %d want %d", in, got, want)
		}
	}
}
