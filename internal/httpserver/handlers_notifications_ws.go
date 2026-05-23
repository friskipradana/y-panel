package httpserver

import (
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

// ─── Notification WebSocket Handlers ────────────────────────────────────────

func (s *Server) handleNotificationsWebSocket(w http.ResponseWriter, r *http.Request) {
	if !s.isWebSocketOriginAllowed(r) {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		return
	}

	actor := s.currentUserRecord(r)
	if actor == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[notifications] ws upgrade failed user=%s remote=%s err=%v", actor.Username, remoteAddr(r), err)
		return
	}

	log.Printf("[notifications] ws attached user=%s remote=%s", actor.Username, remoteAddr(r))
	writeMu := &syncWriter{}
	closed := make(chan struct{})

	safeWrite := func(payload any) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteJSON(payload)
	}

	// Register connection for this user
	s.notificationMu.Lock()
	s.notificationWSConns[actor.ID] = append(s.notificationWSConns[actor.ID], &wsConn{
		conn:      conn,
		writeMu:   writeMu,
		closed:    closed,
		safeWrite: safeWrite,
	})
	s.notificationMu.Unlock()

	defer func() {
		log.Printf("[notifications] ws detached user=%s remote=%s", actor.Username, remoteAddr(r))
		s.removeNotificationWSConn(actor.ID, conn)
		closeChannel(closed)
		_ = conn.Close()
	}()

	// Send ping keepalive every 25s
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-closed:
				return
			case <-ticker.C:
				writeMu.Lock()
				_ = conn.WriteMessage(websocket.PingMessage, nil)
				writeMu.Unlock()
			}
		}
	}()

	// Read loop (ignore all messages; just keep connection alive)
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			return
		}
	}
}
