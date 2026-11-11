package terminal

import (
	"errors"
	"strings"
	"sync"
	"time"
)

const (
	defaultMaxQueuedChunks = 128
	defaultMaxQueuedBytes  = 512 * 1024
	defaultCoalesceMaxByte = 32 * 1024
)

var (
	errStreamClosed       = errors.New("terminal stream writer closed")
	errStreamBackpressure = errors.New("terminal client slow: outbound queue full")
)

// ControlKind identifies non-output WebSocket control writes serialized through StreamWriter.
type ControlKind int

const (
	ControlJSON ControlKind = iota
	ControlPing
)

type queuedFrame struct {
	isControl bool
	chunk     string
	ctrl      any
	kind      ControlKind
}

// StreamWriter decouples the PTY read loop from slow WebSocket clients using a bounded,
// single-consumer outbound queue that coalesces contiguous output chunks.
type StreamWriter struct {
	mu          sync.Mutex
	cond        *sync.Cond
	queue       []queuedFrame
	queuedBytes int
	maxChunks   int
	maxBytes    int
	closed      bool
	done        chan struct{}
	closeOnce   sync.Once
	failOnce    sync.Once

	writeChunk   func(string) error
	writeControl func(ControlKind, any) error
	onFail       func(error)
}

func NewStreamWriter(
	maxChunks, maxBytes int,
	writeChunk func(string) error,
	writeControl func(ControlKind, any) error,
	onFail func(error),
) *StreamWriter {
	if maxChunks <= 0 {
		maxChunks = defaultMaxQueuedChunks
	}
	if maxBytes <= 0 {
		maxBytes = defaultMaxQueuedBytes
	}
	sw := &StreamWriter{
		maxChunks:    maxChunks,
		maxBytes:     maxBytes,
		done:         make(chan struct{}),
		writeChunk:   writeChunk,
		writeControl: writeControl,
		onFail:       onFail,
	}
	sw.cond = sync.NewCond(&sw.mu)
	go sw.run()
	return sw
}

// EnqueueChunk queues terminal output without blocking on network I/O.
// Returns errStreamBackpressure if the client fails to drain within bounded capacity.
func (sw *StreamWriter) EnqueueChunk(chunk string) error {
	if chunk == "" {
		return nil
	}
	sw.mu.Lock()
	if sw.closed {
		sw.mu.Unlock()
		return errStreamClosed
	}
	if len(sw.queue) >= sw.maxChunks || sw.queuedBytes+len(chunk) > sw.maxBytes {
		sw.queue = nil
		sw.queuedBytes = 0
		sw.closed = true
		sw.cond.Broadcast()
		sw.mu.Unlock()
		sw.triggerFail(errStreamBackpressure)
		return errStreamBackpressure
	}
	sw.queue = append(sw.queue, queuedFrame{chunk: chunk})
	sw.queuedBytes += len(chunk)
	sw.cond.Signal()
	sw.mu.Unlock()
	return nil
}

// EnqueueControl queues a control payload (ready, pong, error, closed, ping) without racing writes.
func (sw *StreamWriter) EnqueueControl(kind ControlKind, payload any) bool {
	sw.mu.Lock()
	if sw.closed {
		sw.mu.Unlock()
		return false
	}
	sw.queue = append(sw.queue, queuedFrame{isControl: true, kind: kind, ctrl: payload})
	sw.cond.Signal()
	sw.mu.Unlock()
	return true
}

// Close closes the writer queue and optionally waits for pending frames to flush.
func (sw *StreamWriter) Close(wait bool) {
	sw.closeOnce.Do(func() {
		sw.mu.Lock()
		sw.closed = true
		sw.cond.Broadcast()
		sw.mu.Unlock()
	})
	if wait {
		<-sw.done
	}
}

// CloseWait closes the writer queue and waits up to timeout for pending frames to drain.
func (sw *StreamWriter) CloseWait(timeout time.Duration) {
	sw.Close(false)
	if timeout <= 0 {
		return
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-sw.done:
	case <-timer.C:
	}
}

func (sw *StreamWriter) run() {
	defer close(sw.done)
	var b strings.Builder

	for {
		sw.mu.Lock()
		for len(sw.queue) == 0 && !sw.closed {
			sw.cond.Wait()
		}
		if len(sw.queue) == 0 && sw.closed {
			sw.mu.Unlock()
			return
		}

		frame := sw.queue[0]
		sw.queue = sw.queue[1:]
		if frame.isControl {
			sw.mu.Unlock()
			if sw.writeControl != nil {
				if err := sw.writeControl(frame.kind, frame.ctrl); err != nil {
					sw.fail(err)
					return
				}
			}
			continue
		}

		// Coalesce consecutive output chunks up to defaultCoalesceMaxByte.
		sw.queuedBytes -= len(frame.chunk)
		b.Reset()
		b.WriteString(frame.chunk)
		for len(sw.queue) > 0 && !sw.queue[0].isControl && b.Len()+len(sw.queue[0].chunk) <= defaultCoalesceMaxByte {
			next := sw.queue[0]
			sw.queue = sw.queue[1:]
			sw.queuedBytes -= len(next.chunk)
			b.WriteString(next.chunk)
		}
		if len(sw.queue) == 0 && cap(sw.queue) > 64 {
			sw.queue = nil
		}
		batch := b.String()
		sw.mu.Unlock()

		if sw.writeChunk != nil {
			if err := sw.writeChunk(batch); err != nil {
				sw.fail(err)
				return
			}
		}
	}
}

func (sw *StreamWriter) fail(err error) {
	sw.closeOnce.Do(func() {
		sw.mu.Lock()
		sw.closed = true
		sw.queue = nil
		sw.queuedBytes = 0
		sw.cond.Broadcast()
		sw.mu.Unlock()
	})
	sw.triggerFail(err)
}

func (sw *StreamWriter) triggerFail(err error) {
	if sw.onFail == nil {
		return
	}
	sw.failOnce.Do(func() {
		sw.onFail(err)
	})
}
