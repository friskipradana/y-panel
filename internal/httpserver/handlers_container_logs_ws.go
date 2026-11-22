package httpserver

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

// Live container logs over a WebSocket: the agent follows `docker logs` once and pushes batches of lines,
// instead of the browser asking for the whole tail again every few seconds.

const (
	maxLogStreamsPerUser = 4
	logWriteWait         = 10 * time.Second
	logPongWait          = 60 * time.Second
	logPingPeriod        = 25 * time.Second
)

type logStreamMessage struct {
	Type  string   `json:"type"`
	Lines []string `json:"lines,omitempty"`
	Error string   `json:"error,omitempty"`
}

var (
	logStreamsMu sync.Mutex
	logStreams   = map[int64]int{}
)

// takeLogStream reserves one of the account's streams; false when it already has the maximum open
func takeLogStream(userID int64) bool {
	logStreamsMu.Lock()
	defer logStreamsMu.Unlock()
	if logStreams[userID] >= maxLogStreamsPerUser {
		return false
	}
	logStreams[userID]++
	return true
}

func releaseLogStream(userID int64) {
	logStreamsMu.Lock()
	defer logStreamsMu.Unlock()
	if logStreams[userID] <= 1 {
		delete(logStreams, userID)
		return
	}
	logStreams[userID]--
}

func (s *Server) handleContainerLogsSocket(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !docker.ValidLogTarget(id) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid container id"})
		return
	}
	actor, err := s.ensureContainerAccess(r, id)
	if err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	tail := 200
	if raw := strings.TrimSpace(r.URL.Query().Get("tail")); raw != "" {
		if parsed, convErr := strconv.Atoi(raw); convErr == nil {
			tail = parsed
		}
	}
	if !takeLogStream(actor.ID) {
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many log streams are open; close one first"})
		return
	}
	defer releaseLogStream(actor.ID)

	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	var writeMu sync.Mutex
	send := func(msg logStreamMessage) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(logWriteWait))
		return conn.WriteJSON(msg)
	}

	// the browser sends nothing but pings; reading is how a closed page is noticed
	conn.SetReadLimit(1024)
	_ = conn.SetReadDeadline(time.Now().Add(logPongWait))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(logPongWait)) })
	go func() {
		defer cancel()
		for {
			if _, _, readErr := conn.ReadMessage(); readErr != nil {
				return
			}
			_ = conn.SetReadDeadline(time.Now().Add(logPongWait))
		}
	}()
	go func() {
		ticker := time.NewTicker(logPingPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				writeMu.Lock()
				pingErr := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(logWriteWait))
				writeMu.Unlock()
				if pingErr != nil {
					cancel()
					return
				}
			}
		}
	}()

	streamErr := docker.StreamLogs(ctx, id, tail, func(lines []string) error {
		return send(logStreamMessage{Type: "lines", Lines: append([]string(nil), lines...)})
	})
	if ctx.Err() != nil && !errors.Is(streamErr, context.Canceled) {
		return
	}
	if streamErr != nil && !errors.Is(streamErr, context.Canceled) {
		log.Printf("[docker] log stream of %s ended: %v", id, streamErr)
		_ = send(logStreamMessage{Type: "end", Error: streamErr.Error()})
		return
	}
	_ = send(logStreamMessage{Type: "end"})
}
