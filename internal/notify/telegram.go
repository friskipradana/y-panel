package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const telegramBase = "https://api.telegram.org"

// Telegram sends through a bot made with @BotFather.
type Telegram struct {
	token string
	base  string
	http  *http.Client
}

func NewTelegram(token string) *Telegram {
	return &Telegram{token: strings.TrimSpace(token), base: telegramBase, http: &http.Client{Timeout: 15 * time.Second}}
}

// WithBase points the client at another address; tests use it to talk to a fake Telegram
func (t *Telegram) WithBase(base string) *Telegram {
	t.base = strings.TrimRight(base, "/")
	return t
}

func (t *Telegram) Kind() string { return "telegram" }

type telegramReply struct {
	OK          bool            `json:"ok"`
	Result      json.RawMessage `json:"result"`
	ErrorCode   int             `json:"error_code"`
	Description string          `json:"description"`
	Parameters  struct {
		RetryAfter int `json:"retry_after"`
	} `json:"parameters"`
}

// call asks Telegram and sorts the failure: network problems and 429 or 5xx can work later; 403 means the recipient
// cannot be reached; 401 means the token is wrong; the rest is a request that will never work.
func (t *Telegram) call(ctx context.Context, method string, body any) (json.RawMessage, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.base+"/bot"+t.token+"/"+method, reader)
	if err != nil {
		return nil, &SendError{Message: "could not build the request"}
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := t.http.Do(req)
	if err != nil {
		// the token is part of the address, so it must not reach a log through the error text
		return nil, &SendError{Message: "could not reach Telegram: " + strings.ReplaceAll(err.Error(), t.token, "***"), Temporary: true}
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var reply telegramReply
	if err := json.Unmarshal(data, &reply); err != nil {
		return nil, &SendError{Message: "Telegram answered with something unreadable (status " + strconv.Itoa(res.StatusCode) + ")", Temporary: res.StatusCode >= 500}
	}
	if reply.OK {
		return reply.Result, nil
	}
	code := reply.ErrorCode
	if code == 0 {
		code = res.StatusCode
	}
	se := &SendError{Message: fmt.Sprintf("Telegram: %s (%d)", reply.Description, code)}
	switch {
	case code == http.StatusTooManyRequests:
		se.Temporary = true
		se.RetryAfter = time.Duration(reply.Parameters.RetryAfter) * time.Second
	case code >= 500:
		se.Temporary = true
	case code == http.StatusForbidden:
		se.Blocked = true
	case code == http.StatusUnauthorized, code == http.StatusNotFound:
		se.Config = true
	}
	return nil, se
}

// Send posts a text (with the few HTML tags the catalog uses) to a chat
func (t *Telegram) Send(ctx context.Context, address, text string) (string, error) {
	result, err := t.call(ctx, "sendMessage", map[string]any{
		"chat_id": address, "text": text, "parse_mode": "HTML", "disable_web_page_preview": true,
	})
	if err != nil {
		return "", err
	}
	var sent struct {
		MessageID int64 `json:"message_id"`
	}
	_ = json.Unmarshal(result, &sent)
	return strconv.FormatInt(sent.MessageID, 10), nil
}

// Bot is who the token belongs to
type Bot struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Name     string `json:"first_name"`
}

func (t *Telegram) GetMe(ctx context.Context) (*Bot, error) {
	result, err := t.call(ctx, "getMe", nil)
	if err != nil {
		return nil, err
	}
	var bot Bot
	if err := json.Unmarshal(result, &bot); err != nil {
		return nil, &SendError{Message: "Telegram answered with something unreadable"}
	}
	return &bot, nil
}

func (t *Telegram) Test(ctx context.Context) error {
	_, err := t.GetMe(ctx)
	return err
}

// Update is a message people sent to the bot
type Update struct {
	ID      int64 `json:"update_id"`
	Message *struct {
		Text string `json:"text"`
		Chat struct {
			ID    int64  `json:"id"`
			Type  string `json:"type"`
			Title string `json:"title"`
		} `json:"chat"`
	} `json:"message"`
}

// GetUpdates reads what was sent to the bot since the offset, without waiting
func (t *Telegram) GetUpdates(ctx context.Context, offset int64) ([]Update, error) {
	result, err := t.call(ctx, "getUpdates", map[string]any{"offset": offset, "limit": 100, "timeout": 0, "allowed_updates": []string{"message"}})
	if err != nil {
		return nil, err
	}
	var updates []Update
	if err := json.Unmarshal(result, &updates); err != nil {
		return nil, &SendError{Message: "Telegram answered with something unreadable"}
	}
	return updates, nil
}

// StartCode finds the code in a "/start CODE" message (or "/start@bot CODE" in a group); "" when the message is not one
func StartCode(text string) string {
	fields := strings.Fields(text)
	if len(fields) < 2 || !strings.HasPrefix(fields[0], "/start") {
		return ""
	}
	return strings.ToUpper(fields[len(fields)-1])
}
