package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/database/dbtest"
)

// These tests run the queue against a real PostgreSQL (see dbtest): that is where the claim, the lease and the
// order of messages are decided. They are skipped unless REN_TEST_DATABASE_URL is set.

const testKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

type sentMessage struct {
	chat string
	text string
	at   time.Time
}

// fakeTelegram is a Telegram that remembers what it was sent and can be told to fail
type fakeTelegram struct {
	*httptest.Server
	mu      sync.Mutex
	sent    []sentMessage
	calls   map[string]int
	fail    func(chat string, call int) (status int, body string, failed bool)
	updates []map[string]any
	offsets []int64
}

func newFakeTelegram(t *testing.T) *fakeTelegram {
	t.Helper()
	f := &fakeTelegram{calls: map[string]int{}}
	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		method := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		w.Header().Set("Content-Type", "application/json")
		switch method {
		case "getMe":
			_, _ = w.Write([]byte(`{"ok":true,"result":{"id":9,"username":"reneo_test_bot","first_name":"Reneo"}}`))
		case "getUpdates":
			offset, _ := body["offset"].(float64)
			f.mu.Lock()
			f.offsets = append(f.offsets, int64(offset))
			var out []map[string]any
			for _, u := range f.updates {
				if id, _ := u["update_id"].(int); int64(id) >= int64(offset) {
					out = append(out, u)
				}
			}
			f.mu.Unlock()
			raw, _ := json.Marshal(map[string]any{"ok": true, "result": out})
			_, _ = w.Write(raw)
		case "sendMessage":
			chat, _ := body["chat_id"].(string)
			text, _ := body["text"].(string)
			f.mu.Lock()
			f.calls[chat]++
			call := f.calls[chat]
			fail := f.fail
			f.mu.Unlock()
			if fail != nil {
				if status, reply, failed := fail(chat, call); failed {
					w.WriteHeader(status)
					_, _ = w.Write([]byte(reply))
					return
				}
			}
			f.mu.Lock()
			f.sent = append(f.sent, sentMessage{chat, text, time.Now()})
			n := len(f.sent)
			f.mu.Unlock()
			_, _ = w.Write([]byte(`{"ok":true,"result":{"message_id":` + strconv.Itoa(n) + `}}`))
		default:
			w.WriteHeader(404)
			_, _ = w.Write([]byte(`{"ok":false,"error_code":404,"description":"no such method"}`))
		}
	}))
	t.Cleanup(f.Close)
	return f
}

func (f *fakeTelegram) sentTo(chat string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []string
	for _, m := range f.sent {
		if m.chat == chat {
			out = append(out, m.text)
		}
	}
	return out
}

func (f *fakeTelegram) total() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.sent)
}

func (f *fakeTelegram) callCount(chat string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls[chat]
}

type fixture struct {
	t   *testing.T
	db  *database.Manager
	svc *Service
	tg  *fakeTelegram
}

// newFixture makes a database, a service with a Telegram channel that is switched on, and no workers yet
func newFixture(t *testing.T) *fixture {
	t.Helper()
	db := dbtest.New(t)
	tg := newFakeTelegram(t)
	svc := New(db, testKey)
	svc.UseTelegramBase(tg.URL)
	token := "123:TEST"
	if err := svc.ConfigureTelegram(context.Background(), &token, true); err != nil {
		t.Fatalf("configure the channel: %v", err)
	}
	return &fixture{t: t, db: db, svc: svc, tg: tg}
}

// quickly makes the waits of the worker short for a test, and puts them back after it; call before start
func quickly(t *testing.T) {
	t.Helper()
	oldDelays, oldMax, oldKind, oldAddr := RetryDelays, MaxAttempts, telegramKindGap, telegramAddressGap
	RetryDelays = []time.Duration{20 * time.Millisecond, 20 * time.Millisecond, 20 * time.Millisecond, 20 * time.Millisecond, 20 * time.Millisecond}
	MaxAttempts = len(RetryDelays) + 1
	telegramKindGap, telegramAddressGap = time.Millisecond, time.Millisecond
	t.Cleanup(func() {
		RetryDelays, MaxAttempts, telegramKindGap, telegramAddressGap = oldDelays, oldMax, oldKind, oldAddr
	})
}

func (f *fixture) start(workers int) {
	f.t.Helper()
	f.svc.Start(workers)
	f.t.Cleanup(f.svc.Stop)
}

// account makes an account whose Telegram is linked to a chat
func (f *fixture) account(username, role, chat string) int64 {
	f.t.Helper()
	u, err := f.db.CreateUser(username, username+"@example.com", "hash", role, username)
	if err != nil {
		f.t.Fatal(err)
	}
	link, err := f.svc.StartTelegramLink(u.ID)
	if err != nil {
		f.t.Fatal(err)
	}
	if id, err := f.db.CompleteNotifyLink("telegram", link.Code, chat); err != nil || id != u.ID {
		f.t.Fatalf("link %s: %d %v", username, id, err)
	}
	return u.ID
}

func waitFor(t *testing.T, what string, within time.Duration, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(within)
	for time.Now().Before(deadline) {
		if ok() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func attention(detail string) map[string]any { return map[string]any{"detail": detail} }

func (f *fixture) outbox(status string) []database.OutboxMessage {
	f.t.Helper()
	rows, err := f.db.ListOutbox(status, 200)
	if err != nil {
		f.t.Fatal(err)
	}
	return rows
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

func TestAMessageLeavesWithinASecond(t *testing.T) {
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	f.start(4)
	// let the workers go idle: from here only the wake-up can make a message leave before the 5 second sweep
	time.Sleep(300 * time.Millisecond)

	began := time.Now()
	f.svc.Emit(Event{Name: EventOrderAttention, UserIDs: []int64{uid}, Key: "latency", Data: attention("cepat")})
	waitFor(t, "the message", 3*time.Second, func() bool { return f.tg.total() == 1 })
	f.tg.mu.Lock()
	took := f.tg.sent[0].at.Sub(began)
	f.tg.mu.Unlock()
	if took > time.Second {
		t.Fatalf("from the event to Telegram took %v, it must be under a second", took)
	}
}

// ─── Exactly once, in order ───────────────────────────────────────────────────

func TestEveryMessageIsSentOnceAndInOrderPerRecipient(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	const recipients, each = 20, 10
	ids := make([]int64, recipients)
	for i := range ids {
		ids[i] = f.account(fmt.Sprintf("user%02d", i), "user", fmt.Sprintf("chat%02d", i))
	}
	f.start(6)

	var wg sync.WaitGroup
	for i, id := range ids {
		wg.Add(1)
		go func(i int, id int64) {
			defer wg.Done()
			for n := 0; n < each; n++ {
				f.svc.Emit(Event{Name: EventOrderAttention, UserIDs: []int64{id}, Key: fmt.Sprintf("m%d", n), Data: attention(fmt.Sprintf("%02d-%02d", i, n))})
			}
		}(i, id)
	}
	wg.Wait()
	waitFor(t, "all 200 messages", 20*time.Second, func() bool { return f.tg.total() >= recipients*each })
	time.Sleep(200 * time.Millisecond)
	if f.tg.total() != recipients*each {
		t.Fatalf("each message exactly once: %d sent, wanted %d", f.tg.total(), recipients*each)
	}
	for i := range ids {
		got := f.tg.sentTo(fmt.Sprintf("chat%02d", i))
		if len(got) != each {
			t.Fatalf("chat%02d got %d messages, wanted %d", i, len(got), each)
		}
		for n, text := range got {
			if !strings.Contains(text, fmt.Sprintf("%02d-%02d", i, n)) {
				t.Fatalf("chat%02d: message %d arrived out of order: %q", i, n, text)
			}
		}
	}
	if rows := f.outbox("sent"); len(rows) != recipients*each {
		t.Fatalf("all are marked sent, got %d", len(rows))
	}
}

func TestTheSameEventQueuedByManyAtOnceIsOneMessage(t *testing.T) {
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	f.start(4)
	var wg sync.WaitGroup
	for g := 0; g < 100; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			f.svc.Emit(Event{Name: EventOrderPaid, UserIDs: []int64{uid}, Key: "order-77", Data: map[string]any{"username": "budi", "plan": "Pro"}})
		}()
	}
	wg.Wait()
	waitFor(t, "the message", 3*time.Second, func() bool { return f.tg.total() >= 1 })
	time.Sleep(300 * time.Millisecond)
	if f.tg.total() != 1 {
		t.Fatalf("one event queued 100 times is one message, got %d", f.tg.total())
	}
	if rows := f.outbox(""); len(rows) != 1 {
		t.Fatalf("one row in the queue, got %d", len(rows))
	}
}

func TestParallelWorkersNeverTakeTheSameMessage(t *testing.T) {
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	const rows = 200
	for i := 0; i < rows; i++ {
		// each to its own address, so the order rule does not hold any back
		_, _, err := f.db.EnqueueOutbox(database.OutboxMessage{Event: EventTest, UserID: uid, Kind: "telegram", Address: fmt.Sprintf("a%03d", i), Key: fmt.Sprintf("k%03d", i), Priority: 1})
		if err != nil {
			t.Fatal(err)
		}
	}
	var mu sync.Mutex
	taken := map[int64]string{}
	var wg sync.WaitGroup
	for w := 0; w < 50; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			worker := fmt.Sprintf("w%02d", w)
			for {
				msgs, err := f.db.ClaimOutbox(worker, 3, time.Minute)
				if err != nil {
					t.Errorf("claim: %v", err)
					return
				}
				if len(msgs) == 0 {
					return
				}
				mu.Lock()
				for _, m := range msgs {
					if other, dup := taken[m.ID]; dup {
						t.Errorf("message %d was taken by %s and by %s", m.ID, other, worker)
					}
					taken[m.ID] = worker
				}
				mu.Unlock()
			}
		}(w)
	}
	wg.Wait()
	if len(taken) != rows {
		t.Fatalf("every message is taken once: %d of %d", len(taken), rows)
	}
}

func TestUrgentMessagesAreTakenBeforeOrdinaryOnes(t *testing.T) {
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	_, _, _ = f.db.EnqueueOutbox(database.OutboxMessage{Event: EventOrderCreated, UserID: uid, Kind: "telegram", Address: "a", Key: "normal", Priority: PriorityNormal})
	_, _, _ = f.db.EnqueueOutbox(database.OutboxMessage{Event: EventLoginFailed, UserID: uid, Kind: "telegram", Address: "b", Key: "urgent", Priority: PriorityUrgent})
	msgs, err := f.db.ClaimOutbox("w", 1, time.Minute)
	if err != nil || len(msgs) != 1 || msgs[0].Key != "urgent" {
		t.Fatalf("the urgent one goes first even though it came later: %+v %v", msgs, err)
	}
}

func TestAMessageWaitsForTheOlderOneToTheSameRecipient(t *testing.T) {
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	for i := 0; i < 2; i++ {
		_, _, _ = f.db.EnqueueOutbox(database.OutboxMessage{Event: EventTest, UserID: uid, Kind: "telegram", Address: "same", Key: fmt.Sprintf("k%d", i), Priority: 1})
	}
	first, err := f.db.ClaimOutbox("w1", 5, time.Minute)
	if err != nil || len(first) != 1 {
		t.Fatalf("only the older one is taken while both are due: %+v %v", first, err)
	}
	if second, _ := f.db.ClaimOutbox("w2", 5, time.Minute); len(second) != 0 {
		t.Fatal("the newer one must wait while the older one is being sent")
	}
	if ok, err := f.db.CompleteOutbox(first[0].ID, "w1", "1"); err != nil || !ok {
		t.Fatalf("complete: %v %v", ok, err)
	}
	if second, _ := f.db.ClaimOutbox("w2", 5, time.Minute); len(second) != 1 {
		t.Fatal("once the older one is sent the newer one is taken")
	}
}

// ─── A worker that dies ───────────────────────────────────────────────────────

func TestAMessageOfADeadWorkerComesBackAndIsSentOnce(t *testing.T) {
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	id, _, _ := f.db.EnqueueOutbox(database.OutboxMessage{Event: EventTest, UserID: uid, Kind: "telegram", Address: "100", Key: "lease", Priority: 0, Payload: json.RawMessage(`{}`)})

	held, err := f.db.ClaimOutbox("dead", 1, time.Second)
	if err != nil || len(held) != 1 {
		t.Fatalf("the dead worker takes it: %+v %v", held, err)
	}
	if again, _ := f.db.ClaimOutbox("alive", 1, time.Minute); len(again) != 0 {
		t.Fatal("while the lease runs nobody else takes it")
	}
	time.Sleep(1200 * time.Millisecond)
	n, err := f.db.ReleaseExpiredOutboxLeases(MaxAttempts)
	if err != nil || n != 1 {
		t.Fatalf("the lease ran out and the message came back: %d %v", n, err)
	}
	f.start(2)
	waitFor(t, "the message", 3*time.Second, func() bool { return f.tg.total() == 1 })

	// the dead worker, if it ever wakes, must not be able to report on it
	if ok, _ := f.db.CompleteOutbox(id, "dead", "x"); ok {
		t.Fatal("a worker whose lease was taken away must not complete the message")
	}
	if ok, _ := f.db.RetryOutbox(id, "dead", time.Second, "x"); ok {
		t.Fatal("nor send it back")
	}
	time.Sleep(200 * time.Millisecond)
	if f.tg.total() != 1 {
		t.Fatalf("sent once, got %d", f.tg.total())
	}
}

func TestAMessageThatKeepsKillingItsWorkerEventuallyFails(t *testing.T) {
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	id, _, _ := f.db.EnqueueOutbox(database.OutboxMessage{Event: EventTest, UserID: uid, Kind: "telegram", Address: "100", Key: "poison", Priority: 0})
	for i := 0; i < MaxAttempts; i++ {
		if got, _ := f.db.ClaimOutbox("w", 1, 50*time.Millisecond); len(got) != 1 {
			t.Fatalf("claim %d: %+v", i, got)
		}
		time.Sleep(80 * time.Millisecond)
		if _, err := f.db.ReleaseExpiredOutboxLeases(MaxAttempts); err != nil {
			t.Fatal(err)
		}
	}
	msg, _ := f.db.GetOutbox(id)
	if msg.Status != database.OutboxFailed {
		t.Fatalf("after %d tries that never reported, it is failed, got %q", MaxAttempts, msg.Status)
	}
}

// ─── Failures ─────────────────────────────────────────────────────────────────

func TestATemporaryFailureIsTriedAgainAndThenSent(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	f.tg.fail = func(chat string, call int) (int, string, bool) {
		if call <= 2 {
			return 500, `{"ok":false,"error_code":500,"description":"down"}`, true
		}
		return 0, "", false
	}
	f.start(2)
	f.svc.Emit(Event{Name: EventOrderAttention, UserIDs: []int64{uid}, Key: "retry", Data: attention("coba lagi")})
	waitFor(t, "the message", 5*time.Second, func() bool { return f.tg.total() == 1 })
	waitFor(t, "it to be marked sent", 2*time.Second, func() bool { return len(f.outbox("sent")) == 1 })
	if sent := f.outbox("sent")[0]; sent.Attempts != 3 {
		t.Fatalf("two failures and then the send is three attempts, got %d", sent.Attempts)
	}
}

func TestAFailureThatNeverEndsStopsAfterTheLastTry(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	f.tg.fail = func(string, int) (int, string, bool) {
		return 500, `{"ok":false,"error_code":500,"description":"down"}`, true
	}
	f.start(2)
	f.svc.Emit(Event{Name: EventOrderAttention, UserIDs: []int64{uid}, Key: "never", Data: attention("tidak pernah")})
	waitFor(t, "it to fail", 5*time.Second, func() bool { return len(f.outbox("failed")) == 1 })
	failed := f.outbox("failed")[0]
	if failed.Attempts != MaxAttempts || !strings.Contains(failed.Error, "gave up") {
		t.Fatalf("it stops after %d tries and says so: %+v", MaxAttempts, failed)
	}
	if got := f.tg.callCount("100"); got != MaxAttempts {
		t.Fatalf("Telegram was asked %d times, wanted %d", got, MaxAttempts)
	}
	// a failed message can be sent again by hand
	if ok, _ := f.db.RequeueOutbox(failed.ID); !ok {
		t.Fatal("a failed message can be queued again")
	}
}

func TestARecipientWhoBlockedTheBotIsLeftAlone(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	f.tg.fail = func(string, int) (int, string, bool) {
		return 403, `{"ok":false,"error_code":403,"description":"Forbidden: bot was blocked by the user"}`, true
	}
	f.start(2)
	f.svc.Emit(Event{Name: EventOrderAttention, UserIDs: []int64{uid}, Key: "one", Data: attention("satu")})
	waitFor(t, "it to fail", 3*time.Second, func() bool { return len(f.outbox("failed")) == 1 })
	rec, _ := f.db.GetNotifyRecipient(uid, "telegram")
	if rec.BlockedAt == nil {
		t.Fatal("the recipient is marked as unreachable")
	}
	f.svc.Emit(Event{Name: EventOrderAttention, UserIDs: []int64{uid}, Key: "two", Data: attention("dua")})
	time.Sleep(200 * time.Millisecond)
	if rows := f.outbox(""); len(rows) != 1 {
		t.Fatalf("nothing more is queued for an unreachable recipient, got %d rows", len(rows))
	}
	if got := f.tg.callCount("100"); got != 1 {
		t.Fatalf("and Telegram is not asked again: %d calls", got)
	}
}

func TestAWrongTokenFailsTheMessageAndMarksTheChannel(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	f.tg.fail = func(string, int) (int, string, bool) {
		return 401, `{"ok":false,"error_code":401,"description":"Unauthorized"}`, true
	}
	f.start(1)
	f.svc.Emit(Event{Name: EventOrderAttention, UserIDs: []int64{uid}, Key: "token", Data: attention("token")})
	waitFor(t, "it to fail", 3*time.Second, func() bool { return len(f.outbox("failed")) == 1 })
	row, _ := f.db.GetNotifyChannel("telegram")
	if row.Status != "error" || !strings.Contains(row.LastError, "Unauthorized") {
		t.Fatalf("the channel shows what is wrong: %+v", row)
	}
}

func TestWhatWasSwitchedOffBeforeSendingIsNotSent(t *testing.T) {
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	// queued, but the worker has not started yet
	f.svc.Emit(Event{Name: EventAccountScan, UserIDs: []int64{uid}, Key: "muted", Data: map[string]any{"ip": "1.1.1.1", "count": 10, "minutes": 10}})
	if err := f.db.SetNotifyMuted(uid, "telegram", []string{"attack"}); err != nil {
		t.Fatal(err)
	}
	f.start(2)
	waitFor(t, "it to be cancelled", 3*time.Second, func() bool { return len(f.outbox("cancelled")) == 1 })
	if f.tg.total() != 0 {
		t.Fatal("a notice switched off after it was queued must not be sent")
	}
}

func TestSwitchingTheChannelOffCancelsWhatWaits(t *testing.T) {
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	f.svc.Emit(Event{Name: EventOrderAttention, UserIDs: []int64{uid}, Key: "off", Data: attention("mati")})
	if err := f.svc.ConfigureTelegram(context.Background(), nil, false); err != nil {
		t.Fatal(err)
	}
	f.start(2)
	waitFor(t, "it to be cancelled", 3*time.Second, func() bool { return len(f.outbox("cancelled")) == 1 })
	if f.tg.total() != 0 {
		t.Fatal("nothing is sent through a channel that is off")
	}
}

// ─── Notices raised by what people do ─────────────────────────────────────────

func TestFailedSignInsTellTheOwnerOnlyAfterThree(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	f.account("budi", "user", "200")
	f.start(2)
	f.svc.LoginFailed("budi", "1.1.1.1")
	f.svc.LoginFailed("Budi", "1.1.1.2")
	time.Sleep(400 * time.Millisecond)
	if f.tg.total() != 0 {
		t.Fatal("two failures are only counted")
	}
	f.svc.LoginFailed("budi", "1.1.1.3")
	waitFor(t, "the warning", 3*time.Second, func() bool { return f.tg.total() == 1 })
	text := f.tg.sentTo("200")[0]
	if !strings.Contains(text, "Percobaan gagal: 3") || !strings.Contains(text, "budi") || !strings.Contains(text, "3 berbeda") {
		t.Fatalf("the warning says how many, which account and from how many addresses: %q", text)
	}
	for i := 0; i < 5; i++ {
		f.svc.LoginFailed("budi", "1.1.1.4")
	}
	time.Sleep(400 * time.Millisecond)
	if f.tg.total() != 1 {
		t.Fatalf("more failures at the same level are not new messages, got %d", f.tg.total())
	}
}

func TestAnAccountThatDoesNotExistHasNoOwnerToTell(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	f.account("owner", "superadmin", "100")
	f.start(2)
	for i := 0; i < 6; i++ {
		f.svc.LoginFailed("ghost", fmt.Sprintf("1.1.1.%d", i))
	}
	time.Sleep(500 * time.Millisecond)
	if f.tg.total() != 0 {
		t.Fatalf("guesses at a name that is no account tell nobody, got %d messages", f.tg.total())
	}
}

func TestARequestFloodTellsTheSellerOnceNotForEveryRequest(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	f.account("owner", "superadmin", "100")
	f.start(2)
	for i := 0; i < 99; i++ {
		f.svc.RequestRefused(fmt.Sprintf("9.9.%d.%d", i/200, i%200))
	}
	time.Sleep(300 * time.Millisecond)
	if f.tg.total() != 0 {
		t.Fatal("99 refused requests are under the threshold")
	}
	for i := 0; i < 400; i++ {
		f.svc.RequestRefused(fmt.Sprintf("8.8.%d.%d", i/200, i%200))
	}
	waitFor(t, "the alert", 3*time.Second, func() bool { return f.tg.total() >= 1 })
	time.Sleep(500 * time.Millisecond)
	if f.tg.total() != 1 {
		t.Fatalf("500 refused requests are one message to the seller, got %d", f.tg.total())
	}
	if text := f.tg.sentTo("100")[0]; !strings.Contains(text, "Lonjakan permintaan") {
		t.Fatalf("what the message is about: %q", text)
	}
}

func TestANewDeviceIsToldButTheFirstSignInIsNot(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	uid := f.account("budi", "user", "300")
	f.start(2)
	chrome := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
	phone := "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"

	f.svc.SignedIn(uid, "budi", "203.0.113.5", chrome)
	time.Sleep(300 * time.Millisecond)
	if f.tg.total() != 0 {
		t.Fatal("the first sign-in of an account is no surprise")
	}
	f.svc.SignedIn(uid, "budi", "203.0.113.77", chrome)
	time.Sleep(300 * time.Millisecond)
	if f.tg.total() != 0 {
		t.Fatal("the same network and browser is the same device")
	}
	f.svc.SignedIn(uid, "budi", "198.51.100.9", phone)
	waitFor(t, "the notice", 3*time.Second, func() bool { return f.tg.total() == 1 })
	if text := f.tg.sentTo("300")[0]; !strings.Contains(text, "perangkat baru") || !strings.Contains(text, "Android") {
		t.Fatalf("the notice names the device: %q", text)
	}
	f.svc.SignedIn(uid, "budi", "198.51.100.9", phone)
	time.Sleep(300 * time.Millisecond)
	if f.tg.total() != 1 {
		t.Fatal("a device that was told once is known now")
	}
}

// ─── Linking ──────────────────────────────────────────────────────────────────

func TestLinkingAnAccountToTelegramByTheCodeItsOwnerSends(t *testing.T) {
	f := newFixture(t)
	a, _ := f.db.CreateUser("ana", "ana@example.com", "hash", "superadmin", "Ana")
	b, _ := f.db.CreateUser("bob", "bob@example.com", "hash", "user", "Bob")
	linkA, err := f.svc.StartTelegramLink(a.ID)
	if err != nil || !strings.HasPrefix(linkA.URL, "https://t.me/reneo_test_bot?start=") {
		t.Fatalf("the link to open: %+v %v", linkA, err)
	}
	f.tg.mu.Lock()
	f.tg.updates = []map[string]any{
		{"update_id": 10, "message": map[string]any{"text": "/start " + strings.ToLower(linkA.Code), "chat": map[string]any{"id": 555, "type": "private"}}},
		{"update_id": 11, "message": map[string]any{"text": "hello there", "chat": map[string]any{"id": 777, "type": "private"}}},
		{"update_id": 12, "message": map[string]any{"text": "/start NOSUCHCD", "chat": map[string]any{"id": 888, "type": "private"}}},
	}
	f.tg.mu.Unlock()

	linked, err := f.svc.CheckTelegramLink(context.Background(), a.ID)
	if err != nil || !linked {
		t.Fatalf("the code arrived: %v %v", linked, err)
	}
	rec, _ := f.db.GetNotifyRecipient(a.ID, "telegram")
	if rec.Address != "555" || rec.VerifiedAt == nil || rec.LinkCode != "" {
		t.Fatalf("the chat is kept and the code is used up: %+v", rec)
	}
	if got, _ := f.db.GetNotifySetting(telegramOffsetKey); got != "13" {
		t.Fatalf("what was read is not read again: offset %q", got)
	}
	if linked, _ := f.svc.CheckTelegramLink(context.Background(), b.ID); linked {
		t.Fatal("another account is not linked by someone else's code")
	}
	// a code works once, and not when it ran out
	if id, _ := f.db.CompleteNotifyLink("telegram", linkA.Code, "999"); id != 0 {
		t.Fatal("a used code does nothing")
	}
	_ = f.db.StartNotifyLink(b.ID, "telegram", "OLDCODE1", -time.Second)
	if id, _ := f.db.CompleteNotifyLink("telegram", "OLDCODE1", "999"); id != 0 {
		t.Fatal("a code that ran out does nothing")
	}
}

func TestConfiguringTelegramChecksTheToken(t *testing.T) {
	f := newFixture(t)
	bad := newFakeTelegram(t)
	bad.Server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		_, _ = w.Write([]byte(`{"ok":false,"error_code":401,"description":"Unauthorized"}`))
	})
	f.svc.UseTelegramBase(bad.URL)
	token := "wrong"
	if err := f.svc.ConfigureTelegram(context.Background(), &token, true); err == nil {
		t.Fatal("a token Telegram refuses is not saved")
	}
	views, _ := f.svc.ChannelViews()
	if len(views) != 3 || !views[0].Configured || views[0].BotUsername != "reneo_test_bot" {
		t.Fatalf("the earlier good token is still in use: %+v", views)
	}
	row, _ := f.db.GetNotifyChannel("telegram")
	if strings.Contains(row.SecretEncrypted, "TEST") || row.SecretEncrypted == "" {
		t.Fatal("the token is stored encrypted, never as it was typed")
	}
}

func TestThresholdsAreSavedAndAppliedAtOnce(t *testing.T) {
	f := newFixture(t)
	var flood DetectorConfig
	for _, cfg := range f.svc.Thresholds() {
		if cfg.Event == EventRequestFlood {
			flood = cfg
		}
	}
	flood.Levels = []int{5, 20}
	if err := f.svc.SaveThresholds([]DetectorConfig{flood}); err != nil {
		t.Fatal(err)
	}
	if got := f.svc.detector(EventRequestFlood).Config().Levels; fmt.Sprint(got) != "[5 20]" {
		t.Fatalf("the detector uses the new levels at once: %v", got)
	}
	// a new service reads what was saved
	again := New(f.db, testKey)
	if err := again.LoadDetectors(); err != nil {
		t.Fatal(err)
	}
	if got := again.detector(EventRequestFlood).Config().Levels; fmt.Sprint(got) != "[5 20]" {
		t.Fatalf("saved thresholds survive a restart: %v", got)
	}
	flood.Levels = []int{20, 5}
	if f.svc.SaveThresholds([]DetectorConfig{flood}) == nil {
		t.Fatal("levels that do not rise are refused")
	}
	if err := f.svc.ResetThresholds(); err != nil {
		t.Fatal(err)
	}
	if got := f.svc.detector(EventRequestFlood).Config().Levels; fmt.Sprint(got) != "[100 500 2000]" {
		t.Fatalf("reset goes back to the defaults: %v", got)
	}
}

func TestAnAlertSentJustBeforeARestartIsNotRepeated(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	f.account("owner", "superadmin", "100")
	f.start(2)
	flood := func() {
		for i := 0; i < 150; i++ {
			f.svc.RequestRefused(fmt.Sprintf("7.7.%d.%d", i/200, i%200))
		}
	}
	flood()
	waitFor(t, "the alert", 3*time.Second, func() bool { return f.tg.total() == 1 })

	// a new process has empty counters: the same flood must not send the message again so soon
	restarted := New(f.db, testKey)
	restarted.UseTelegramBase(f.tg.URL)
	restarted.Start(2)
	defer restarted.Stop()
	for i := 0; i < 150; i++ {
		restarted.RequestRefused(fmt.Sprintf("6.6.%d.%d", i/200, i%200))
	}
	time.Sleep(600 * time.Millisecond)
	if f.tg.total() != 1 {
		t.Fatalf("the message that was just sent is not repeated after a restart, got %d", f.tg.total())
	}
}

func TestOutboxListIsNewestFirstAndCounted(t *testing.T) {
	f := newFixture(t)
	uid := f.account("owner", "superadmin", "100")
	for i := 0; i < 3; i++ {
		_, _, _ = f.db.EnqueueOutbox(database.OutboxMessage{Event: EventTest, UserID: uid, Kind: "telegram", Address: fmt.Sprintf("a%d", i), Key: fmt.Sprintf("k%d", i)})
	}
	rows := f.outbox("")
	ids := []int64{rows[0].ID, rows[1].ID, rows[2].ID}
	if !sort.SliceIsSorted(ids, func(i, j int) bool { return ids[i] > ids[j] }) {
		t.Fatalf("newest first: %v", ids)
	}
	pending, failed, err := f.db.OutboxCounts()
	if err != nil || pending != 3 || failed != 0 {
		t.Fatalf("counts: %d %d %v", pending, failed, err)
	}
}

func TestAScanAlertNamesTheAddressNotTheNamesTried(t *testing.T) {
	quickly(t)
	f := newFixture(t)
	f.account("owner", "superadmin", "100")
	f.start(2)
	for i := 0; i < 12; i++ {
		f.svc.LoginFailed(fmt.Sprintf("guess%d", i), "192.0.2.77")
	}
	waitFor(t, "the scan alert", 3*time.Second, func() bool { return f.tg.total() >= 1 })
	text := f.tg.sentTo("100")[0]
	if !strings.Contains(text, "Pemindaian akun") || !strings.Contains(text, "192.0.2.77") || strings.Contains(text, "guess") {
		t.Fatalf("the message names the address that scanned: %q", text)
	}
}
