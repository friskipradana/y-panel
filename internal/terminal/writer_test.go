package terminal

import (
	"errors"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestStreamWriterCoalescesChunksAndPreservesControlOrder(t *testing.T) {
	var mu sync.Mutex
	var events []string
	blockFirst := make(chan struct{})
	firstStarted := make(chan struct{})
	var firstOnce sync.Once

	sw := NewStreamWriter(
		64,
		1024*1024,
		func(batch string) error {
			firstOnce.Do(func() {
				close(firstStarted)
				<-blockFirst
			})
			mu.Lock()
			events = append(events, "chunk:"+batch)
			mu.Unlock()
			return nil
		},
		func(kind ControlKind, payload any) error {
			mu.Lock()
			events = append(events, "ctrl:"+payload.(string))
			mu.Unlock()
			return nil
		},
		nil,
	)

	// Start one chunk so consumer blocks while subsequent chunks coalesce in queue.
	if err := sw.EnqueueChunk("a"); err != nil {
		t.Fatal(err)
	}
	<-firstStarted
	for _, s := range []string{"b", "c", "d"} {
		if err := sw.EnqueueChunk(s); err != nil {
			t.Fatal(err)
		}
	}
	if !sw.EnqueueControl(ControlJSON, "pong") {
		t.Fatal("EnqueueControl returned false unexpectedly")
	}
	if err := sw.EnqueueChunk("e"); err != nil {
		t.Fatal(err)
	}
	if err := sw.EnqueueChunk("f"); err != nil {
		t.Fatal(err)
	}
	close(blockFirst)
	sw.CloseWait(2 * time.Second)

	mu.Lock()
	defer mu.Unlock()
	if len(events) != 4 {
		t.Fatalf("expected 4 ordered frames (a, bcd coalesced, pong, ef coalesced), got %v", events)
	}
	if events[0] != "chunk:a" || events[1] != "chunk:bcd" || events[2] != "ctrl:pong" || events[3] != "chunk:ef" {
		t.Fatalf("unexpected frame order/coalescing: %v", events)
	}
}

func TestStreamWriterBackpressureDoesNotBlockAndFailsOnce(t *testing.T) {
	release := make(chan struct{})
	started := make(chan struct{})
	var failCount atomic.Int32
	var lastErr atomic.Value

	sw := NewStreamWriter(
		4,
		1024,
		func(batch string) error {
			select {
			case <-started:
			default:
				close(started)
			}
			<-release
			return errors.New("socket closed")
		},
		nil,
		func(err error) {
			failCount.Add(1)
			lastErr.Store(err)
		},
	)

	if err := sw.EnqueueChunk("0"); err != nil {
		t.Fatal(err)
	}
	<-started

	start := time.Now()
	var backpressureErr error
	for i := 0; i < 20; i++ {
		if err := sw.EnqueueChunk("x"); err != nil {
			backpressureErr = err
			break
		}
	}
	if time.Since(start) > 100*time.Millisecond {
		t.Fatalf("EnqueueChunk blocked for %v; expected immediate return", time.Since(start))
	}
	if !errors.Is(backpressureErr, errStreamBackpressure) {
		t.Fatalf("expected errStreamBackpressure, got %v", backpressureErr)
	}

	close(release)
	sw.CloseWait(2 * time.Second)

	if failCount.Load() != 1 {
		t.Fatalf("expected onFail to fire once, got %d", failCount.Load())
	}
	if got, _ := lastErr.Load().(error); !errors.Is(got, errStreamBackpressure) {
		t.Fatalf("expected stored error errStreamBackpressure, got %v", got)
	}
}

func TestManagerDeliverBuffersOnStreamBackpressure(t *testing.T) {
	m, s := newTestManager("slow-client")
	release := make(chan struct{})
	started := make(chan struct{})

	sw := NewStreamWriter(
		2,
		64,
		func(batch string) error {
			select {
			case <-started:
			default:
				close(started)
			}
			<-release
			return nil
		},
		nil,
		nil,
	)

	_, err := m.Attach("slow-client", false, func(chunk string) error {
		return sw.EnqueueChunk(chunk)
	}, func() {}, func() {})
	if err != nil {
		t.Fatal(err)
	}

	m.deliver(s, "init", []byte("init"))
	<-started

	// Fill queue past cap=2; the failing chunk must detach and buffer in outputBuf.
	for i := 0; i < 10; i++ {
		chunk := "burst-" + strings.Repeat("Z", 16)
		m.deliver(s, chunk, []byte(chunk))
	}

	close(release)
	sw.CloseWait(2 * time.Second)

	s.callbackMu.RLock()
	stillAttached := s.onChunk != nil
	s.callbackMu.RUnlock()
	if stillAttached {
		t.Fatal("expected slow StreamWriter client to detach after backpressure")
	}

	s.outputMu.RLock()
	buffered := len(s.outputBuf)
	s.outputMu.RUnlock()
	if buffered == 0 {
		t.Fatal("expected overflow output after backpressure to be buffered for reconnect")
	}
}

func BenchmarkStreamWriterThroughput(b *testing.B) {
	sw := NewStreamWriter(
		4096,
		64*1024*1024,
		func(batch string) error { return nil },
		func(ControlKind, any) error { return nil },
		nil,
	)
	chunk := strings.Repeat("A", 256)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := sw.EnqueueChunk(chunk); err != nil {
			b.StopTimer()
			sw.Close(false)
			sw = NewStreamWriter(
				4096,
				64*1024*1024,
				func(batch string) error { return nil },
				func(ControlKind, any) error { return nil },
				nil,
			)
			b.StartTimer()
		}
		if i&63 == 63 {
			runtime.Gosched()
		}
	}
	b.StopTimer()
	sw.CloseWait(2 * time.Second)
}

func BenchmarkDeliverBuffered(b *testing.B) {
	m, s := newTestManager("bench")
	raw := []byte("benchmark terminal line\r\n")
	chunk := string(raw)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		m.deliver(s, chunk, raw)
	}
}
