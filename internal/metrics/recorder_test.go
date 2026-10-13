package metrics

import (
	"testing"
	"time"
)

func TestRecordDerivesRatesAndSince(t *testing.T) {
	r := New("", nil)
	base := time.Now()
	r.Record(map[string]float64{"cpu": 10}, map[string]uint64{"net-rx": 1000}, base)
	r.Record(map[string]float64{"cpu": 20}, map[string]uint64{"net-rx": 3000}, base.Add(5*time.Second))

	all := r.Since(0)
	if len(all["cpu"]) != 2 {
		t.Fatalf("cpu points = %d, want 2", len(all["cpu"]))
	}
	rx := all["net-rx"]
	if len(rx) != 1 || rx[0].V != 400 {
		t.Fatalf("net-rx = %+v, want one point of 400 B/s", rx)
	}
	later := r.Since(base.UnixMilli())
	if len(later["cpu"]) != 1 || later["cpu"][0].V != 20 {
		t.Fatalf("since filter = %+v", later["cpu"])
	}
}

func TestRecordTrimsOldAndCapsPoints(t *testing.T) {
	r := New("", nil)
	start := time.Now().Add(-3 * time.Hour)
	for i := 0; i < maxPoints+100; i++ {
		r.Record(map[string]float64{"cpu": 1}, nil, start.Add(time.Duration(i)*time.Second))
	}
	if n := len(r.Since(0)["cpu"]); n > maxPoints {
		t.Fatalf("points = %d exceeds cap %d", n, maxPoints)
	}
}
