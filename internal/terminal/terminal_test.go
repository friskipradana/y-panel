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

	oldGen, err := m.Attach("a", func(string) error { return nil }, func() {}, func() {})
	if err != nil {
		t.Fatal(err)
	}
	newGen, err := m.Attach("a", func(string) error { return nil }, func() {}, func() {})
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
	if _, err := m.Attach("b", func(string) error { return nil }, func() {}, func() { replaced = true }); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Attach("b", func(string) error { return nil }, func() {}, func() {}); err != nil {
		t.Fatal(err)
	}
	if !replaced {
		t.Fatal("previous connection was not told it was replaced")
	}
}

func TestOutputIsBufferedWhenDeliveryFails(t *testing.T) {
	m, s := newTestManager("c")

	if _, err := m.Attach("c", func(string) error { return errors.New("broken pipe") }, func() {}, func() {}); err != nil {
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
	if _, err := m.Attach("c", func(chunk string) error { got.WriteString(chunk); return nil }, func() {}, func() {}); err != nil {
		t.Fatal(err)
	}
	if got.String() != "hello" {
		t.Fatalf("re-attach should flush buffered output, got %q", got.String())
	}
}
