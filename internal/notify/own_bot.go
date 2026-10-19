package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// A plan can include bringing your own notification bot: the account keeps the token of its own Telegram bot, the chat is
// linked through that bot, and the notices of the account leave from it instead of the seller's bot. The token is stored
// encrypted like the seller's. When the plan no longer includes it the bot stays saved but is not used: nothing is sent
// from it, and the notices the account had through it stop (they are not sent through the seller's bot, which the chat
// never started).

// ErrOwnBotNotAllowed is the answer to an account whose plan does not include its own bot
var ErrOwnBotNotAllowed = errors.New("your plan does not include your own notification bot")

// OwnBotState is what an account sees of its own bot
type OwnBotState struct {
	// Allowed: the plan of the account includes its own bot
	Allowed     bool       `json:"allowed"`
	Configured  bool       `json:"configured"`
	Enabled     bool       `json:"enabled"`
	BotUsername string     `json:"botUsername"`
	BotName     string     `json:"botName"`
	Status      string     `json:"status"`
	LastError   string     `json:"lastError"`
	CheckedAt   *time.Time `json:"checkedAt"`
}

func (s *Service) botLock(userID int64) *sync.Mutex {
	lock, _ := s.botLocks.LoadOrStore(userID, &sync.Mutex{})
	return lock.(*sync.Mutex)
}

// OwnBot reads the state of the own bot of an account
func (s *Service) OwnBot(userID int64) (*OwnBotState, error) {
	if !s.ready() {
		return nil, errors.New("the database is not connected")
	}
	allowed, err := s.db.OwnNotifyAllowed(userID)
	if err != nil {
		return nil, err
	}
	state := &OwnBotState{Allowed: allowed}
	bot, err := s.db.GetUserTelegramBot(userID)
	if err != nil {
		return nil, err
	}
	if bot != nil {
		state.Configured, state.Enabled, state.BotUsername, state.BotName = true, bot.Enabled, bot.BotUsername, bot.BotName
		state.Status, state.LastError, state.CheckedAt = bot.Status, bot.LastError, bot.CheckedAt
	}
	return state, nil
}

// ownTelegram gives the working client of the own bot of an account, or nil when there is none, it is off, or the plan no
// longer includes it
func (s *Service) ownTelegram(userID int64) (*Telegram, *database.UserTelegramBot, error) {
	bot, err := s.db.GetUserTelegramBot(userID)
	if err != nil || bot == nil || !bot.Enabled {
		return nil, nil, err
	}
	allowed, err := s.db.OwnNotifyAllowed(userID)
	if err != nil || !allowed {
		return nil, nil, err
	}
	token, err := crypto.Decrypt(s.key, bot.TokenEnc)
	if err != nil {
		return nil, nil, errors.New("the stored token cannot be decrypted")
	}
	t := NewTelegram(token)
	if s.tgBase != "" {
		t.WithBase(s.tgBase)
	}
	return t, bot, nil
}

// OwnChannel is the channel the worker sends through for a chat that was linked through the own bot of the account
func (s *Service) OwnChannel(userID int64) (Channel, error) {
	t, _, err := s.ownTelegram(userID)
	if err != nil || t == nil {
		return nil, err
	}
	return t, nil
}

// ConfigureOwnBot saves the bot of an account (the token is checked with Telegram first) and whether it is on. A nil token
// keeps the saved one. A new token is a new bot: what was linked through the old one is dropped.
func (s *Service) ConfigureOwnBot(ctx context.Context, userID int64, token *string, enabled bool) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	allowed, err := s.db.OwnNotifyAllowed(userID)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrOwnBotNotAllowed
	}
	if token == nil {
		if err := s.db.SaveUserTelegramBot(userID, nil, "", "", enabled); err != nil {
			return errors.New("enter the bot token first")
		}
		return nil
	}
	t := NewTelegram(*token)
	if s.tgBase != "" {
		t.WithBase(s.tgBase)
	}
	bot, err := t.GetMe(ctx)
	if err != nil {
		return fmt.Errorf("Telegram did not accept this token: %w", err)
	}
	// the bot of the panel and the bot of another account are not hers to take
	if row, _ := s.db.GetNotifyChannel(telegramKind); row != nil {
		var cfg struct {
			BotUsername string `json:"botUsername"`
		}
		if json.Unmarshal(row.Config, &cfg) == nil && cfg.BotUsername != "" && strings.EqualFold(cfg.BotUsername, bot.Username) {
			return errors.New("this is the bot of the panel; bring a bot of your own")
		}
	}
	if taken, err := s.db.UserTelegramBotTaken(userID, bot.Username); err != nil {
		return err
	} else if taken {
		return errors.New("this bot is already used by another account")
	}
	encrypted, err := crypto.Encrypt(s.key, strings.TrimSpace(*token))
	if err != nil {
		return err
	}
	return s.db.SaveUserTelegramBot(userID, &encrypted, bot.Username, bot.Name, enabled)
}

// RemoveOwnBot forgets the bot of an account and the chat that was linked through it
func (s *Service) RemoveOwnBot(userID int64) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	return s.db.DeleteUserTelegramBot(userID)
}

// readOwnTelegram reads what was sent to the own bot of an account, once: its link code completes its link, "stop" and
// "/start" switch the notices of that chat off and on. Only the code of this account counts here.
func (s *Service) readOwnTelegram(ctx context.Context, userID int64) error {
	lock := s.botLock(userID)
	lock.Lock()
	defer lock.Unlock()
	tg, bot, err := s.ownTelegram(userID)
	if err != nil {
		return err
	}
	if tg == nil {
		return errors.New("your own bot is not switched on")
	}
	updates, err := tg.GetUpdates(ctx, bot.Offset)
	if err != nil {
		_ = s.db.SetUserTelegramBotStatus(userID, "error", err.Error())
		return err
	}
	if bot.Status != "active" {
		_ = s.db.SetUserTelegramBotStatus(userID, "active", "")
	}
	next := bot.Offset
	for _, u := range updates {
		if u.ID >= next {
			next = u.ID + 1
		}
		if u.Message == nil {
			continue
		}
		chat := strconv.FormatInt(u.Message.Chat.ID, 10)
		if code := StartCode(u.Message.Text); code != "" {
			linked, err := s.db.CompleteNotifyLinkOwn(userID, code, chat)
			if err != nil {
				return err
			}
			if linked {
				_, _ = tg.Send(ctx, chat, Render(EventTest, "id", nil))
			}
			continue
		}
		if answer := InboundIntent(u.Message.Text); answer != "" {
			if reply := s.HandleInbound(telegramKind, chat, answer); reply != "" {
				_, _ = tg.Send(ctx, chat, reply)
			}
		}
	}
	if next != bot.Offset {
		_ = s.db.SetUserTelegramBotOffset(userID, next)
	}
	return nil
}

// ownBotLoop keeps reading the own bots that have a link waiting or a chat linked, so a "stop" is heard within seconds
func (s *Service) ownBotLoop() {
	defer s.wg.Done()
	tick := time.NewTicker(6 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-s.stopSwp:
			return
		case <-tick.C:
		}
		bots, err := s.db.ListUserTelegramBotsToRead()
		if err != nil {
			continue
		}
		for _, bot := range bots {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			if err := s.readOwnTelegram(ctx, bot.UserID); err != nil {
				log.Printf("[notify] reading the own bot of account %d failed: %v", bot.UserID, err)
			}
			cancel()
			select {
			case <-s.stopSwp:
				return
			default:
			}
		}
	}
}
