package database

import "testing"

func TestNormalizeAmount(t *testing.T) {
	cases := map[string]int64{
		"Rp 50.123":      50123,
		"Rp50.123,00":    50123,
		"50,123.00":      50123,
		"IDR 1.250.456":  1250456,
		"50123":          50123,
		"  Rp 999 ":      999,
		"":               0,
		"tidak ada uang": 0,
	}
	for in, want := range cases {
		if got := NormalizeAmount(in); got != want {
			t.Errorf("NormalizeAmount(%q) = %d, want %d", in, got, want)
		}
	}
}
