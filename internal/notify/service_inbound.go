package notify

import (
	"strings"
)

// What people send back to the notices: "stop" ends them, "start" brings them back. The words are the ones people
// actually type, in Indonesian and English.

const (
	intentStop   = "stop"
	intentResume = "resume"
)

// allGroups are the notices an account can switch off; "stop" switches every one of them off
var allGroups = []string{"security", "attack", "order", "plan", "domain", "buyer"}

// InboundIntent reads what a message asks for: intentStop, intentResume, or "" when it asks for neither. Only a
// message that is the word itself counts, so a sentence that happens to contain "stop" does not end anything.
func InboundIntent(text string) string {
	word := strings.ToLower(strings.TrimSpace(text))
	word = strings.TrimLeft(word, "/")
	// "/stop@namabot" in a group
	if i := strings.IndexByte(word, '@'); i > 0 {
		word = word[:i]
	}
	word = strings.Trim(word, ".!? ")
	switch word {
	case "stop", "berhenti", "unsubscribe", "batal langganan", "stop notifikasi":
		return intentStop
	case "start", "mulai", "lanjut", "subscribe", "resume":
		return intentResume
	}
	return ""
}

var inboundReplies = map[string]string{
	intentStop:   "Notifikasi dari Reneo dihentikan untuk nomor ini. Balas MULAI untuk menyalakannya lagi.",
	intentResume: "Notifikasi dari Reneo menyala lagi untuk nomor ini. Balas BERHENTI untuk menghentikannya.",
}

// HandleInbound acts on an answer from an address on a channel and returns the reply to send back, or "" for none.
// "stop" is remembered for the address itself (a buyer's number has no account yet) and switches every group off for
// the accounts that use it; "start" undoes both. An address nobody has written to us from before gets no reply
// to a "start", so a stranger cannot make the panel message a number.
func (s *Service) HandleInbound(kind, address, intent string) string {
	if !s.ready() || address == "" {
		return ""
	}
	known := false
	switch intent {
	case intentStop:
		_ = s.db.AddNotifyOptOut(kind, address)
		_, _ = s.db.SetMutedAtAddress(kind, address, allGroups)
		known = true
	case intentResume:
		wasOut, _ := s.db.IsNotifyOptedOut(kind, address)
		_ = s.db.RemoveNotifyOptOut(kind, address)
		n, _ := s.db.SetMutedAtAddress(kind, address, nil)
		known = wasOut || n > 0
	default:
		return ""
	}
	if !known {
		return ""
	}
	return inboundReplies[intent]
}
