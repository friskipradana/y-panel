package notify

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const wahaKind = "waha"

// WAHA session states, as WAHA names them
const (
	SessionStopped  = "STOPPED"
	SessionStarting = "STARTING"
	SessionScanQR   = "SCAN_QR_CODE"
	SessionWorking  = "WORKING"
	SessionFailed   = "FAILED"
)

// Waha talks to the WAHA container the panel runs. The key never leaves the agent.
type Waha struct {
	base string
	key  string
	http *http.Client
}

func NewWaha(base, key string) *Waha {
	return &Waha{base: strings.TrimRight(base, "/"), key: key, http: &http.Client{Timeout: 60 * time.Second}}
}

// WahaSession is what WAHA says about one session
type WahaSession struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Me     *struct {
		ID       string `json:"id"`
		PushName string `json:"pushName"`
	} `json:"me"`
}

// Phone is the number of the connected WhatsApp, digits only
func (s WahaSession) Phone() string {
	if s.Me == nil {
		return ""
	}
	id := s.Me.ID
	if i := strings.IndexAny(id, "@:"); i >= 0 {
		id = id[:i]
	}
	return onlyDigits(id)
}

func onlyDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// do asks WAHA and sorts a failure: the network and 5xx can work later; 401 and 403 mean the key is wrong; 404 is
// "no such session"; 422 is a session that is not in the state the call needs; the rest will never work.
func (w *Waha) do(ctx context.Context, method, path string, body any, accept string) ([]byte, string, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, "", err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, w.base+path, reader)
	if err != nil {
		return nil, "", &SendError{Message: "could not build the request"}
	}
	req.Header.Set("X-Api-Key", w.key)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	res, err := w.http.Do(req)
	if err != nil {
		return nil, "", &SendError{Message: "could not reach WAHA: " + strings.ReplaceAll(err.Error(), w.key, "***"), Temporary: true}
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode >= 200 && res.StatusCode < 300 {
		return data, res.Header.Get("Content-Type"), nil
	}
	var reply struct {
		Message any `json:"message"`
		Error   any `json:"error"`
	}
	_ = json.Unmarshal(data, &reply)
	detail := strings.TrimSpace(fmt.Sprint(firstNonNil(reply.Message, reply.Error)))
	if detail == "" || detail == "<nil>" {
		detail = http.StatusText(res.StatusCode)
	}
	se := &SendError{Message: fmt.Sprintf("WAHA: %s (%d)", detail, res.StatusCode)}
	switch {
	case res.StatusCode == http.StatusTooManyRequests, res.StatusCode >= 500, res.StatusCode == http.StatusUnprocessableEntity:
		se.Temporary = true
	case res.StatusCode == http.StatusUnauthorized, res.StatusCode == http.StatusForbidden:
		se.Config = true
	}
	return nil, "", se
}

func firstNonNil(values ...any) any {
	for _, v := range values {
		if v != nil {
			return v
		}
	}
	return nil
}

// ErrNoSession is a session WAHA does not know
var ErrNoSession = errors.New("the session does not exist in WAHA")

func isNotFound(err error) bool {
	var se *SendError
	return errors.As(err, &se) && strings.HasSuffix(se.Message, "(404)")
}

// Version answers when WAHA is up, with its version and engine
func (w *Waha) Version(ctx context.Context) (version, engine string, err error) {
	data, _, err := w.do(ctx, http.MethodGet, "/api/server/version", nil, "")
	if err != nil {
		return "", "", err
	}
	var v struct {
		Version string `json:"version"`
		Engine  string `json:"engine"`
	}
	_ = json.Unmarshal(data, &v)
	return v.Version, v.Engine, nil
}

// Test checks that WAHA is up and takes the key
func (w *Waha) Test(ctx context.Context) error {
	_, _, err := w.do(ctx, http.MethodGet, "/api/sessions", nil, "")
	return err
}

// WithKey is the same client acting with another key: the key of one session, which WAHA limits to that session
func (w *Waha) WithKey(key string) *Waha {
	return &Waha{base: w.base, key: key, http: w.http}
}

// CreateSessionKey makes a key that works for one session only, and returns its id (to delete it later) and the key
func (w *Waha) CreateSessionKey(ctx context.Context, session string) (id, key string, err error) {
	data, _, err := w.do(ctx, http.MethodPost, "/api/keys", map[string]any{"isAdmin": false, "session": session, "isActive": true}, "")
	if err != nil {
		return "", "", err
	}
	var made struct {
		ID  string `json:"id"`
		Key string `json:"key"`
	}
	if err := json.Unmarshal(data, &made); err != nil || made.Key == "" {
		return "", "", errors.New("WAHA did not return the key")
	}
	return made.ID, made.Key, nil
}

// DeleteKey removes a key; one that is already gone is fine
func (w *Waha) DeleteKey(ctx context.Context, id string) error {
	_, _, err := w.do(ctx, http.MethodDelete, "/api/keys/"+url.PathEscape(id), nil, "")
	if err != nil && isNotFound(err) {
		return nil
	}
	return err
}

func (w *Waha) Kind() string { return wahaKind }

// Send is not used by itself: WhatsApp sends from the session of an account, see WahaChannel
func (w *Waha) Send(context.Context, string, string) (string, error) {
	return "", &SendError{Message: "WhatsApp needs the session of an account", Config: true}
}

func (w *Waha) Session(ctx context.Context, name string) (*WahaSession, error) {
	data, _, err := w.do(ctx, http.MethodGet, "/api/sessions/"+url.PathEscape(name), nil, "")
	if err != nil {
		if isNotFound(err) {
			return nil, ErrNoSession
		}
		return nil, err
	}
	var s WahaSession
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, errors.New("WAHA answered with something unreadable")
	}
	return &s, nil
}

// Sessions counts the sessions WAHA has
func (w *Waha) Sessions(ctx context.Context) (int, error) {
	data, _, err := w.do(ctx, http.MethodGet, "/api/sessions?all=true", nil, "")
	if err != nil {
		return 0, err
	}
	var list []json.RawMessage
	if err := json.Unmarshal(data, &list); err != nil {
		return 0, errors.New("WAHA answered with something unreadable")
	}
	return len(list), nil
}

// CreateSession makes the session and starts it. Creating one that exists is not an error.
func (w *Waha) CreateSession(ctx context.Context, name string) error {
	_, _, err := w.do(ctx, http.MethodPost, "/api/sessions", map[string]any{"name": name, "start": true}, "")
	var se *SendError
	if errors.As(err, &se) && strings.HasSuffix(se.Message, "(422)") && strings.Contains(strings.ToLower(se.Message), "already") {
		return nil
	}
	return err
}

func (w *Waha) StartSession(ctx context.Context, name string) error {
	_, _, err := w.do(ctx, http.MethodPost, "/api/sessions/"+url.PathEscape(name)+"/start", nil, "")
	var se *SendError
	if errors.As(err, &se) && strings.Contains(strings.ToLower(se.Message), "already started") {
		return nil
	}
	return err
}

// StopSession stops a session without logging the phone out; one that is already stopped is fine
func (w *Waha) StopSession(ctx context.Context, name string) error {
	_, _, err := w.do(ctx, http.MethodPost, "/api/sessions/"+url.PathEscape(name)+"/stop", nil, "")
	var se *SendError
	if errors.As(err, &se) && (strings.HasSuffix(se.Message, "(422)") || strings.HasSuffix(se.Message, "(404)")) {
		return nil
	}
	return err
}

// DeleteSession logs the phone out and removes the session; a session that is already gone is fine
func (w *Waha) DeleteSession(ctx context.Context, name string) error {
	_, _, _ = w.do(ctx, http.MethodPost, "/api/sessions/"+url.PathEscape(name)+"/logout", nil, "")
	_, _, err := w.do(ctx, http.MethodDelete, "/api/sessions/"+url.PathEscape(name), nil, "")
	if err != nil && isNotFound(err) {
		return nil
	}
	return err
}

// QR is the code to scan, as an image
func (w *Waha) QR(ctx context.Context, name string) (image []byte, contentType string, err error) {
	data, ctype, err := w.do(ctx, http.MethodGet, "/api/"+url.PathEscape(name)+"/auth/qr", nil, "application/json")
	if err != nil {
		return nil, "", err
	}
	if strings.HasPrefix(ctype, "image/") {
		return data, ctype, nil
	}
	var reply struct {
		Mimetype string `json:"mimetype"`
		Data     string `json:"data"`
	}
	if err := json.Unmarshal(data, &reply); err != nil || reply.Data == "" {
		return nil, "", errors.New("WAHA has no code to scan yet")
	}
	img, err := base64.StdEncoding.DecodeString(reply.Data)
	if err != nil {
		return nil, "", errors.New("WAHA answered with a code that cannot be read")
	}
	if reply.Mimetype == "" {
		reply.Mimetype = "image/png"
	}
	return img, reply.Mimetype, nil
}

// SendText sends one text from a session to a number
func (w *Waha) SendText(ctx context.Context, session, phone, text string) (string, error) {
	data, _, err := w.do(ctx, http.MethodPost, "/api/sendText", map[string]any{
		"session": session, "chatId": onlyDigits(phone) + "@c.us", "text": text,
	}, "")
	if err != nil {
		return "", err
	}
	var sent struct {
		ID json.RawMessage `json:"id"`
	}
	_ = json.Unmarshal(data, &sent)
	var plain string
	if json.Unmarshal(sent.ID, &plain) == nil {
		return plain, nil
	}
	var obj struct {
		Serialized string `json:"_serialized"`
	}
	_ = json.Unmarshal(sent.ID, &obj)
	return obj.Serialized, nil
}

// WahaChannel sends from the session that belongs to the account of each notice
type WahaChannel struct {
	*Waha
	send func(ctx context.Context, userID int64, phone, text string) (string, error)
}

// NewWahaChannel makes the channel; send sends a text from the session of an account, with the key of that session
func NewWahaChannel(w *Waha, send func(ctx context.Context, userID int64, phone, text string) (string, error)) *WahaChannel {
	return &WahaChannel{Waha: w, send: send}
}

func (c *WahaChannel) SendToUser(ctx context.Context, userID int64, address, text string) (string, error) {
	return c.send(ctx, userID, address, ToWhatsApp(text))
}

var tagPattern = regexp.MustCompile(`<[^>]+>`)

// ToWhatsApp turns a catalog text (the few HTML tags Telegram takes) into the marks of WhatsApp: bold between asterisks
func ToWhatsApp(text string) string {
	text = strings.NewReplacer("<b>", "*", "</b>", "*").Replace(text)
	return html.UnescapeString(tagPattern.ReplaceAllString(text, ""))
}

// SessionName is the name of the session of an account: its role and username, in letters, digits and hyphens
func SessionName(role, username string) string {
	clean := func(s string) string {
		var b strings.Builder
		for _, r := range strings.ToLower(s) {
			switch {
			case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
				b.WriteRune(r)
			case b.Len() > 0 && !strings.HasSuffix(b.String(), "-"):
				b.WriteRune('-')
			}
		}
		return strings.Trim(b.String(), "-")
	}
	name := clean(role) + "-" + clean(username)
	if len(name) > 60 {
		name = strings.TrimRight(name[:60], "-")
	}
	return name
}

// NormalizePhone makes a number the way WhatsApp wants it: international, digits only, no plus and no zero in front.
// A number that starts with 0 is taken as Indonesian. A number that cannot be a mobile number is refused.
func NormalizePhone(input string) (string, error) {
	digits := onlyDigits(input)
	switch {
	case strings.HasPrefix(digits, "00"):
		digits = digits[2:]
	case strings.HasPrefix(digits, "0"):
		digits = "62" + digits[1:]
	case strings.HasPrefix(digits, "8") && !strings.HasPrefix(strings.TrimSpace(input), "+"):
		// 8123456789 without the zero is the usual slip
		digits = "62" + digits
	}
	if len(digits) < 9 || len(digits) > 15 {
		return "", errors.New("the WhatsApp number must be 9 to 15 digits with the country code, for example 628123456789")
	}
	if strings.HasPrefix(digits, "62") && (len(digits) < 10 || digits[2] != '8') {
		return "", errors.New("an Indonesian mobile number starts with 08 or 628")
	}
	return digits, nil
}
