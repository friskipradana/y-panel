package notify

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Channel is a way to reach a person: Telegram, and later WhatsApp.
type Channel interface {
	Kind() string
	// Send delivers one text to an address and returns the id the channel gave the message
	Send(ctx context.Context, address, text string) (providerID string, err error)
	// Test checks that the credentials work, without sending anything to anyone
	Test(ctx context.Context) error
}

// SendError says what kind of failure a channel had, so the worker knows whether to try again.
type SendError struct {
	Message string
	// Temporary: the same message may work later (network, 429, 5xx)
	Temporary bool
	// RetryAfter is how long the channel asked to wait, when it said
	RetryAfter time.Duration
	// Blocked: the recipient cannot be reached any more (blocked the bot, left the chat); stop sending to them
	Blocked bool
	// Config: the channel itself is not set up right (a wrong token); the channel is marked as having a problem
	Config bool
}

func (e *SendError) Error() string { return e.Message }

// AsSendError turns any error into a SendError; one that is not already one is taken as temporary
func AsSendError(err error) *SendError {
	var se *SendError
	if errors.As(err, &se) {
		return se
	}
	return &SendError{Message: fmt.Sprint(err), Temporary: true}
}

// RetryDelays is the wait before each new try: the first retry after 5 seconds, then 30 seconds, 5 minutes, 30 minutes, 2 hours
var RetryDelays = []time.Duration{5 * time.Second, 30 * time.Second, 5 * time.Minute, 30 * time.Minute, 2 * time.Hour}

// MaxAttempts is the first try and the retries after it
var MaxAttempts = len(RetryDelays) + 1

// DelayAfter is how long to wait after the nth failed attempt (1 is the first)
func DelayAfter(attempts int, asked time.Duration) time.Duration {
	i := attempts - 1
	if i < 0 {
		i = 0
	}
	if i >= len(RetryDelays) {
		i = len(RetryDelays) - 1
	}
	delay := RetryDelays[i]
	if asked > delay {
		delay = asked
	}
	return delay
}
