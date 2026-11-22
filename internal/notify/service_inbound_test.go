package notify

import "testing"

func TestOnlyTheWordItselfStopsOrResumes(t *testing.T) {
	stop := []string{"stop", "STOP", " Berhenti ", "/stop", "/stop@reneo_bot", "berhenti.", "Unsubscribe", "STOP!"}
	for _, in := range stop {
		if got := InboundIntent(in); got != intentStop {
			t.Errorf("%q should stop, got %q", in, got)
		}
	}
	resume := []string{"mulai", "MULAI", "/start", "/start@reneo_bot", "lanjut", "Start"}
	for _, in := range resume {
		if got := InboundIntent(in); got != intentResume {
			t.Errorf("%q should resume, got %q", in, got)
		}
	}
	for _, in := range []string{"", "please do not stop the server", "berhenti dulu ya", "stopwatch", "/start ABCD2345", "terima kasih", "1"} {
		if got := InboundIntent(in); got != "" {
			t.Errorf("%q asks for nothing, got %q", in, got)
		}
	}
}
