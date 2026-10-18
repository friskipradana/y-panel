package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

const (
	// the lease is longer than the time a send may take, so a message is only taken from a worker that is really gone
	leaseTime   = 60 * time.Second
	sendTimeout = 15 * time.Second
	claimBatch  = 5
	// the sweep is only a safety net for retries that come due and for what a restart left behind
	sweepEvery = 5 * time.Second
	reapEvery  = 15 * time.Second
	// waiting this long for the rate limit is done in place; longer than that the message goes back to the queue
	maxInlineWait = 2 * time.Second
)

// Worker sends what is in the queue. Several run side by side; the queue gives each message to only one of them.
type Worker struct {
	db      *database.Manager
	channel func(kind string) (Channel, error)
	n       int
	wake    chan struct{}
	stop    chan struct{}
	wg      sync.WaitGroup
	limiter *limiter
	once    sync.Once
	prefix  string
}

// NewWorker makes a worker pool of n goroutines. channel gives the channel of a kind, or nil when it is off.
func NewWorker(db *database.Manager, n int, channel func(kind string) (Channel, error)) *Worker {
	if n < 1 {
		n = 1
	}
	host, _ := os.Hostname()
	return &Worker{
		db: db, channel: channel, n: n,
		wake: make(chan struct{}, 1), stop: make(chan struct{}),
		limiter: newLimiter(), prefix: fmt.Sprintf("%s-%d", host, os.Getpid()),
	}
}

// Wake tells a worker to look at the queue now. It never blocks, and many calls at once are one.
func (w *Worker) Wake() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

func (w *Worker) Start() {
	for i := 0; i < w.n; i++ {
		w.wg.Add(1)
		go w.run(fmt.Sprintf("%s-%d", w.prefix, i))
	}
	w.wg.Add(1)
	go w.maintain()
	w.Wake()
}

// Stop stops taking messages, lets those being sent finish (for up to ten seconds), and gives back what is still held
func (w *Worker) Stop() {
	w.once.Do(func() { close(w.stop) })
	done := make(chan struct{})
	go func() { w.wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		log.Printf("[notify] the workers did not stop in 10 seconds; their messages return to the queue when the lease runs out")
	}
	for i := 0; i < w.n; i++ {
		_ = w.db.ReleaseWorkerOutbox(fmt.Sprintf("%s-%d", w.prefix, i))
	}
}

func (w *Worker) stopping() bool {
	select {
	case <-w.stop:
		return true
	default:
		return false
	}
}

func (w *Worker) run(id string) {
	defer w.wg.Done()
	tick := time.NewTicker(sweepEvery)
	defer tick.Stop()
	for {
		for !w.stopping() {
			msgs, err := w.db.ClaimOutbox(id, claimBatch, leaseTime)
			if err != nil {
				log.Printf("[notify] claim failed: %v", err)
				break
			}
			if len(msgs) == 0 {
				break
			}
			// a full batch means more may be waiting: let another worker start on it while this one sends
			if len(msgs) == claimBatch {
				w.Wake()
			}
			for _, msg := range msgs {
				if w.stopping() {
					_ = w.db.ReleaseWorkerOutbox(id)
					return
				}
				w.process(id, msg)
			}
		}
		select {
		case <-w.wake:
		case <-tick.C:
		case <-w.stop:
			return
		}
	}
}

// maintain gives back messages whose worker is gone, and clears away what is old
func (w *Worker) maintain() {
	defer w.wg.Done()
	reap := time.NewTicker(reapEvery)
	defer reap.Stop()
	clean := time.NewTicker(time.Hour)
	defer clean.Stop()
	for {
		select {
		case <-reap.C:
			if n, err := w.db.ReleaseExpiredOutboxLeases(MaxAttempts); err != nil {
				log.Printf("[notify] releasing leases failed: %v", err)
			} else if n > 0 {
				log.Printf("[notify] %d messages came back to the queue: their worker did not answer in time", n)
				w.Wake()
			}
		case <-clean.C:
			if _, err := w.db.PurgeOutbox(time.Now().Add(-30 * 24 * time.Hour)); err != nil {
				log.Printf("[notify] purge failed: %v", err)
			}
			_ = w.db.ForgetOldDevices()
		case <-w.stop:
			return
		}
	}
}

// process sends one message and reports what happened to the queue. The state of the recipient and the channel is
// read now, not when the message was queued, so what was switched off since is not sent.
func (w *Worker) process(id string, msg database.OutboxMessage) {
	report := func(ok bool, err error) {
		if err != nil {
			log.Printf("[notify] could not report message %d: %v", msg.ID, err)
		} else if !ok {
			log.Printf("[notify] message %d was taken from this worker: its lease ran out", msg.ID)
		}
	}
	cancel := func(reason string) { report(w.db.StopOutbox(msg.ID, id, database.OutboxCancelled, reason)) }
	fail := func(reason string) { report(w.db.StopOutbox(msg.ID, id, database.OutboxFailed, reason)) }
	// a message put back is looked at again the moment it is due, not at the next sweep
	again := func(delay time.Duration) { time.AfterFunc(delay+10*time.Millisecond, w.Wake) }
	retry := func(delay time.Duration, reason string) {
		report(w.db.RetryOutbox(msg.ID, id, delay, reason))
		again(delay)
	}
	// a wait that is not a failure does not use up one of the tries
	later := func(delay time.Duration, reason string) {
		report(w.db.DeferOutbox(msg.ID, id, delay, reason))
		again(delay)
	}

	// a notice to a buyer goes to the number from the order form, which is not verified yet
	var rec *database.NotifyRecipient
	var err error
	if Group(msg.Event) == "buyer" {
		rec, err = w.db.GetNotifyRecipient(msg.UserID, msg.Kind)
		if rec != nil && rec.Address != msg.Address {
			rec = nil
		}
	} else {
		rec, err = w.db.NotifyRecipientAt(msg.UserID, msg.Kind, msg.Address)
	}
	if err != nil {
		retry(DelayAfter(msg.Attempts, 0), "could not read the recipient: "+err.Error())
		return
	}
	if rec == nil || rec.BlockedAt != nil {
		cancel("the recipient was removed or can no longer be reached")
		return
	}
	if Group(msg.Event) == "buyer" {
		if out, _ := w.db.IsNotifyOptedOut(msg.Kind, msg.Address); out {
			cancel("the number asked to stop")
			return
		}
	}
	if msg.Event != EventTest && IsMuted(rec.MutedEvents, msg.Event) {
		cancel("the recipient switched this notice off")
		return
	}
	ch, err := w.channel(msg.Kind)
	if err != nil {
		retry(DelayAfter(msg.Attempts, 0), "the channel is not ready: "+err.Error())
		return
	}
	if ch == nil {
		cancel("the channel is switched off")
		return
	}
	var data map[string]any
	_ = json.Unmarshal(msg.Payload, &data)
	text := Render(msg.Event, rec.Locale, data)
	if text == "" {
		fail("no text is known for the event " + msg.Event)
		return
	}

	if wait := w.limiter.reserve(msg.Kind, msg.Address, time.Now()); wait > 0 {
		if wait > maxInlineWait {
			// the lease keeps running while it waits, so it is given back and tried again at its time
			later(wait, "waiting for the rate limit of the channel")
			return
		}
		select {
		case <-time.After(wait):
		case <-w.stop:
			later(0, "stopped while waiting")
			return
		}
	}

	ctx, stop := context.WithTimeout(context.Background(), sendTimeout)
	defer stop()
	var providerID string
	if es, ok := ch.(EventSender); ok {
		providerID, err = es.SendEvent(ctx, msg.Address, msg.Event, rec.Locale, data)
	} else if us, ok := ch.(UserSender); ok {
		owner := msg.UserID
		if msg.SenderUserID > 0 {
			owner = msg.SenderUserID
		}
		providerID, err = us.SendToUser(ctx, owner, msg.Address, text)
	} else {
		providerID, err = ch.Send(ctx, msg.Address, text)
	}
	if err == nil {
		report(w.db.CompleteOutbox(msg.ID, id, providerID))
		return
	}
	se := AsSendError(err)
	switch {
	case se.Blocked:
		_ = w.db.BlockNotifyRecipient(msg.UserID, msg.Kind, msg.Address)
		fail(se.Message)
	case se.Config:
		_ = w.db.SetNotifyChannelStatus(msg.Kind, "error", se.Message)
		fail(se.Message)
	case se.Temporary && msg.Attempts < MaxAttempts:
		retry(DelayAfter(msg.Attempts, se.RetryAfter), se.Message)
	case se.Temporary:
		fail(fmt.Sprintf("gave up after %d tries: %s", msg.Attempts, se.Message))
	default:
		fail(se.Message)
	}
}

// limiter spaces the sends of a channel, and the sends to one address, so the limits of the channel are not hit
type limiter struct {
	mu         sync.Mutex
	nextKind   map[string]time.Time
	nextAddr   map[string]time.Time
	kindGap    map[string]time.Duration
	addressGap map[string]time.Duration
}

// Telegram allows about 30 messages a second overall and one a second to a chat. Variables so a test need not wait.
var (
	telegramKindGap    = 40 * time.Millisecond
	telegramAddressGap = time.Second
	// WhatsApp is not an official channel and numbers get blocked for bursts, so it is sent slowly
	wahaKindGap    = 1500 * time.Millisecond
	wahaAddressGap = 4 * time.Second
	// Meta allows far more, but one number is not sent to faster than this
	cloudKindGap    = 50 * time.Millisecond
	cloudAddressGap = time.Second
)

func newLimiter() *limiter {
	return &limiter{
		nextKind: map[string]time.Time{}, nextAddr: map[string]time.Time{},
		kindGap:    map[string]time.Duration{"telegram": telegramKindGap, "waha": wahaKindGap, "whatsapp_cloud": cloudKindGap},
		addressGap: map[string]time.Duration{"telegram": telegramAddressGap, "waha": wahaAddressGap, "whatsapp_cloud": cloudAddressGap},
	}
}

// reserve books the next free moment to send to an address and says how long to wait for it
func (l *limiter) reserve(kind, address string, now time.Time) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	at := now
	if t := l.nextKind[kind]; t.After(at) {
		at = t
	}
	key := kind + "|" + address
	if t := l.nextAddr[key]; t.After(at) {
		at = t
	}
	l.nextKind[kind] = at.Add(l.kindGap[kind])
	l.nextAddr[key] = at.Add(l.addressGap[kind])
	if len(l.nextAddr) > 5000 {
		for k, t := range l.nextAddr {
			if t.Before(now) {
				delete(l.nextAddr, k)
			}
		}
	}
	return at.Sub(now)
}

// SetWhatsAppGaps changes how far apart WhatsApp messages (WAHA and Cloud) are sent, and returns what puts the old values back; tests
// in other packages use it so they need not wait seconds
func SetWhatsAppGaps(kind, address time.Duration) (restore func()) {
	oldKind, oldAddress, oldCloudKind, oldCloudAddress := wahaKindGap, wahaAddressGap, cloudKindGap, cloudAddressGap
	wahaKindGap, wahaAddressGap, cloudKindGap, cloudAddressGap = kind, address, kind, address
	return func() {
		wahaKindGap, wahaAddressGap, cloudKindGap, cloudAddressGap = oldKind, oldAddress, oldCloudKind, oldCloudAddress
	}
}
