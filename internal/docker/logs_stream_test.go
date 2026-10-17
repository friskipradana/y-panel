package docker

import "testing"

func TestValidLogTarget(t *testing.T) {
	for _, id := range []string{"web", "reneo-db-1", "a1b2c3d4e5f6", "9router", "my_app.v2"} {
		if !ValidLogTarget(id) {
			t.Errorf("%q must be accepted", id)
		}
	}
	for _, id := range []string{"", "-f", "--since=1h", "a b", "a;b", "a$(id)", "../x", "a/b", "x\nid"} {
		if ValidLogTarget(id) {
			t.Errorf("%q must be refused", id)
		}
	}
}

func TestClampLogTail(t *testing.T) {
	for in, want := range map[int]int{0: 200, -5: 200, 1: 1, 500: 500, MaxLogTail: MaxLogTail, MaxLogTail + 1: MaxLogTail, 1 << 30: MaxLogTail} {
		if got := ClampLogTail(in); got != want {
			t.Errorf("ClampLogTail(%d) = %d, want %d", in, got, want)
		}
	}
}
