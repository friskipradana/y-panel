package httpserver

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// The live socket pushes the summary and the installed revision on connect, and a new revision
// when the frontend is redeployed, so a page never has to ask for them.
func TestPushLiveStateSendsSummaryAndRevision(t *testing.T) {
	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	if err := os.WriteFile(index, []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := &Server{cfg: config.Config{FrontendDir: dir, StateDir: dir}, database: database.New(database.Config{})}
	user := &database.User{ID: 7, Username: "alice", Role: auth.UserRole}

	var mu sync.Mutex
	var types []string
	var revisions []string
	send := func(payload any) error {
		mu.Lock()
		defer mu.Unlock()
		switch m := payload.(type) {
		case liveSummaryMessage:
			types = append(types, "summary")
			if m.Data["hostname"] != "alice" {
				t.Errorf("a plain account sees its own name as hostname, got %v", m.Data["hostname"])
			}
		case liveRevisionMessage:
			types = append(types, "revision")
			revisions = append(revisions, m.Revision)
		case liveHistoryMessage:
			types = append(types, "history")
		}
		return nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		s.pushLiveState(ctx, user, false, send, cancel)
		close(done)
	}()

	waitFor := func(check func() bool) {
		t.Helper()
		// the summary probes Docker and the host: a CI runner can need several seconds for it
		deadline := time.Now().Add(30 * time.Second)
		for time.Now().Before(deadline) {
			mu.Lock()
			ok := check()
			mu.Unlock()
			if ok {
				return
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatalf("timed out; sent so far: %v", types)
	}

	// on connect: the revision and the summary, and no history for an account that is not the superadmin
	waitFor(func() bool { return len(types) >= 2 })
	for _, kind := range types {
		if kind == "history" {
			t.Fatal("history is the superadmin's host view and must not be pushed to a plain account")
		}
	}
	if len(revisions) != 1 {
		t.Fatalf("the revision is pushed once on connect, got %v", revisions)
	}

	cancel()
	<-done
}

func TestPushLiveStateStopsWhenTheConnectionFails(t *testing.T) {
	dir := t.TempDir()
	s := &Server{cfg: config.Config{FrontendDir: dir, StateDir: dir}, database: database.New(database.Config{})}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		s.pushLiveState(ctx, &database.User{ID: 1, Username: "bob", Role: auth.UserRole}, false, func(any) error { return context.Canceled }, cancel)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("a failed write must end the pusher")
	}
	if ctx.Err() == nil {
		t.Fatal("a failed write must cancel the connection")
	}
}
