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


func TestTheEndOfDockerOutputIsWhatTheOwnerSees(t *testing.T) {
	out := "gows: Pulling from devlikeapro/waha\nea1: Pulling fs layer\nea1: Downloading\n\nerror pulling image configuration: download failed after attempts=6: dial tcp: i/o timeout\n"
	got := lastLines(out, 2)
	if strings.Contains(got, "Pulling from") || !strings.Contains(got, "i/o timeout") {
		t.Fatalf("the error is at the end, not the first line of progress: %q", got)
	}
	if lastLines("one", 3) != "one" || lastLines("", 3) != "" {
		t.Fatal("short and empty output stay as they are")
	}
}

func TestAFailedPullSaysWhyAndTheImageHasNoBrowser(t *testing.T) {
	if strings.HasSuffix(wahaImage(), ":latest") {
		t.Fatalf("the image carries no browser: %s", wahaImage())
	}
	var seen []string
	original := DockerRun
	DockerRun = func(_ context.Context, _ []string, args ...string) (string, error) {
		seen = append(seen, strings.Join(args, " "))
		if args[0] == "pull" {
			return "gows: Pulling from devlikeapro/waha\nabc: Downloading\nabc: Retrying in 2 seconds\nabc: Retrying in 4 seconds\nerror pulling image configuration: i/o timeout", &SendError{Message: "docker pull failed"}
		}
		return "", nil
	}
	defer func() { DockerRun = original }()
	s := &Service{}
	err := s.runWahaContainer(context.Background(), wahaConfig{Image: wahaImage(), Engine: "GOWS", Port: 1, BaseURL: "http://127.0.0.1:1"}, "k", "p")
	if err == nil || !strings.Contains(err.Error(), "i/o timeout") || strings.Contains(err.Error(), "Pulling from") {
		t.Fatalf("the reason of the failure, not the first line of progress: %v", err)
	}
	if len(seen) != 1 || !strings.HasPrefix(seen[0], "pull -q ") {
		t.Fatalf("a quiet pull, and nothing runs after it failed: %v", seen)
	}
}
