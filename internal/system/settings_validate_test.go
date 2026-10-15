package system

import "testing"

func TestValidateHostname(t *testing.T) {
	for _, ok := range []string{"node1", "reneo-node", "srv.example.com", "A1"} {
		if err := ValidateHostname(ok); err != nil {
			t.Errorf("%q rejected: %v", ok, err)
		}
	}
	for _, bad := range []string{"", "-flag", "host-", "has space", "under_score", "a..b", "semi;colon", "--help", "x.-y.z"} {
		if ValidateHostname(bad) == nil {
			t.Errorf("%q must be rejected", bad)
		}
	}
}

func TestValidateTimezoneShape(t *testing.T) {
	for _, bad := range []string{"", "-h", "../etc/passwd", "UTC; reboot", "Asia/ Jakarta"} {
		if ValidateTimezone(bad) == nil {
			t.Errorf("%q must be rejected", bad)
		}
	}
}

func TestSanitizeNameserversDropsUnusable(t *testing.T) {
	got := sanitizeNameservers([]string{"1.1.1.1", " 8.8.8.8 ", "127.0.0.1", "not-an-ip", "1.1.1.1", "169.254.1.1", "0.0.0.0"})
	if len(got) != 2 || got[0] != "1.1.1.1" || got[1] != "8.8.8.8" {
		t.Fatalf("unexpected result: %v", got)
	}
}

func TestSameStrings(t *testing.T) {
	if !sameStrings([]string{"a", "b"}, []string{"a", "b"}) || sameStrings([]string{"a"}, []string{"b"}) || sameStrings([]string{"a"}, nil) {
		t.Fatal("sameStrings is wrong")
	}
}
