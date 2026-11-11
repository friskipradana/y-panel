package terminal

import (
	"errors"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func newTestManager(id string) (*Manager, *Session) {
	m := &Manager{sessions: map[string]*Session{}}
	s := &Session{id: id, cmd: &exec.Cmd{}, detachedAt: time.Now()}
	m.sessions[id] = s
	return m, s
}

func TestStaleDetachDoesNotWipeNewAttachment(t *testing.T) {
	m, s := newTestManager("a")

	oldGen, err := m.Attach("a", false, func(string) error { return nil }, func() {}, func() {})
	if err != nil {
		t.Fatal(err)
	}
	newGen, err := m.Attach("a", false, func(string) error { return nil }, func() {}, func() {})
	if err != nil {
		t.Fatal(err)
	}
	if newGen == oldGen {
		t.Fatalf("generation must change, got %d twice", newGen)
	}

	_ = m.Detach("a", oldGen)

	s.callbackMu.RLock()
	attached := s.onChunk != nil
	s.callbackMu.RUnlock()
	if !attached {
		t.Fatal("stale detach removed the callbacks of the newer attachment")
	}
}

func TestAttachReplacesPreviousConnection(t *testing.T) {
	m, _ := newTestManager("b")

	replaced := false
	if _, err := m.Attach("b", false, func(string) error { return nil }, func() {}, func() { replaced = true }); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Attach("b", false, func(string) error { return nil }, func() {}, func() {}); err != nil {
		t.Fatal(err)
	}
	if !replaced {
		t.Fatal("previous connection was not told it was replaced")
	}
}

func TestOutputIsBufferedWhenDeliveryFails(t *testing.T) {
	m, s := newTestManager("c")

	if _, err := m.Attach("c", false, func(string) error { return errors.New("broken pipe") }, func() {}, func() {}); err != nil {
		t.Fatal(err)
	}
	m.deliver(s, "hello", []byte("hello"))

	s.outputMu.RLock()
	buffered := string(s.outputBuf)
	s.outputMu.RUnlock()
	if buffered != "hello" {
		t.Fatalf("expected chunk to be buffered after failed write, got %q", buffered)
	}

	var got strings.Builder
	if _, err := m.Attach("c", false, func(chunk string) error { got.WriteString(chunk); return nil }, func() {}, func() {}); err != nil {
		t.Fatal(err)
	}
	if got.String() != "hello" {
		t.Fatalf("re-attach should flush buffered output, got %q", got.String())
	}
}

func TestAttachReplayFlushesHistory(t *testing.T) {
	m, s := newTestManager("d")
	s.appendHistory([]byte("historical output"))

	var got strings.Builder
	if _, err := m.Attach("d", true, func(chunk string) error { got.WriteString(chunk); return nil }, func() {}, func() {}); err != nil {
		t.Fatal(err)
	}
	if got.String() != "historical output" {
		t.Fatalf("expected history replay, got %q", got.String())
	}
}

func TestListOwned(t *testing.T) {
	m := &Manager{sessions: map[string]*Session{}}
	m.sessions["s1"] = &Session{id: "s1", owner: 10, meta: SessionMeta{Target: "local", Cwd: "/home/user"}}
	m.sessions["s2"] = &Session{id: "s2", owner: 10, meta: SessionMeta{Target: "remote", Cwd: "/var/log"}}
	m.sessions["s3"] = &Session{id: "s3", owner: 20, meta: SessionMeta{Target: "local", Cwd: "/home/other"}}

	owned10 := m.ListOwned(10)
	if len(owned10) != 2 {
		t.Fatalf("expected 2 sessions for owner 10, got %d", len(owned10))
	}
	owned20 := m.ListOwned(20)
	if len(owned20) != 1 {
		t.Fatalf("expected 1 session for owner 20, got %d", len(owned20))
	}
}
