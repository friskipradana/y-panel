package notify

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestToWhatsAppUsesItsOwnMarksAndDropsHTML(t *testing.T) {
	got := ToWhatsApp("<b>Pesanan baru</b>\nandi memesan &lt;Pro&gt; &amp; lainnya <i>x</i>")
	want := "*Pesanan baru*\nandi memesan <Pro> & lainnya x"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestSessionNameIsRoleAndUsernameInSafeLetters(t *testing.T) {
	cases := map[[2]string]string{
		{"superadmin", "Owner"}:           "superadmin-owner",
		{"admin", "budi.santoso"}:         "admin-budi-santoso",
		{"user", "  Andi__99  "}:          "user-andi-99",
		{"USER", "ünï cödé"}:              "user-n-c-d",
		{"user", strings.Repeat("a", 90)}: "user-" + strings.Repeat("a", 55),
	}
	for in, want := range cases {
		if got := SessionName(in[0], in[1]); got != want {
			t.Errorf("%v: got %q want %q", in, got, want)
		}
	}
}

func TestSessionPhoneIsDigitsOfTheConnectedNumber(t *testing.T) {
	s := WahaSession{Me: &struct {
		ID       string `json:"id"`
		PushName string `json:"pushName"`
	}{ID: "628123456789:12@c.us"}}
	if s.Phone() != "628123456789" {
		t.Fatalf("got %q", s.Phone())
	}
	if (WahaSession{}).Phone() != "" {
		t.Fatal("no number before the scan")
	}
}

func TestWahaFailuresAreSortedForTheWorker(t *testing.T) {
	status := http.StatusOK
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"message":"nope"}`))
	}))
	defer srv.Close()
	w := NewWaha(srv.URL, "secret-key")
	ctx := context.Background()
	for code, check := range map[int]func(*SendError) bool{
		http.StatusTooManyRequests:     func(e *SendError) bool { return e.Temporary },
		http.StatusBadGateway:          func(e *SendError) bool { return e.Temporary },
		http.StatusUnprocessableEntity: func(e *SendError) bool { return e.Temporary },
		http.StatusUnauthorized:        func(e *SendError) bool { return e.Config && !e.Temporary },
		http.StatusBadRequest:          func(e *SendError) bool { return !e.Temporary && !e.Config && !e.Blocked },
	} {
		status = code
		_, err := w.SendText(ctx, "user-andi", "62812", "hi")
		se := AsSendError(err)
		if err == nil || !check(se) {
			t.Errorf("status %d: %+v", code, se)
		}
	}
	// an unreachable WAHA is temporary and the key never shows in the message
	srv.Close()
	_, err := w.SendText(ctx, "s", "62812", "hi")
	if se := AsSendError(err); !se.Temporary || strings.Contains(se.Message, "secret-key") {
		t.Fatalf("unreachable: %+v", se)
	}
}

func TestWahaChannelWithoutASessionStopsInsteadOfRetrying(t *testing.T) {
	c := NewWahaChannel(NewWaha("http://127.0.0.1:1", "k"), func(int64) (string, error) { return "", nil })
	_, err := c.SendToUser(context.Background(), 5, "62812", "hi")
	if se := AsSendError(err); !se.Blocked || se.Temporary {
		t.Fatalf("no session is final: %+v", se)
	}
}
