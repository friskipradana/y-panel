package database

import (
	"context"
	"testing"
)

func TestConnectionStatusWithoutDB(t *testing.T) {
	mgr := New(Config{
		Enabled: false,
		DSN:     "postgres://reneo:secret@127.0.0.1:5432/panel?sslmode=disable",
	})
	st := mgr.ConnectionStatus()
	if st.Enabled {
		t.Fatal("expected disabled database")
	}
	if st.Connected {
		t.Fatal("expected disconnected state")
	}
	if st.Host != "127.0.0.1" || st.Port != "5432" || st.Database != "panel" || st.User != "reneo" {
		t.Fatalf("unexpected DSN parsed metadata: %+v", st)
	}
	if _, ok := mgr.PoolStats(); ok {
		t.Fatal("expected PoolStats false when db is nil")
	}
	if counts := mgr.DetailedStatistics(context.Background()); counts.UserCount != 0 {
		t.Fatalf("expected 0 counts when disconnected, got %+v", counts)
	}
}

