package httpserver

import (
	"log"
	"net/http"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/gorilla/websocket"
)

// ─── Captured Notifications WebSocket ────────────────────────────────────────

// handleCapturedNotificationsWS upgrades the connection to a WebSocket and
// streams real-time captured notification events to admin clients.
func (s *Server) handleCapturedNotificationsWS(w http.ResponseWriter, r *http.Request) {
	actor := userFromCtx(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}

	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[captured-ws] upgrade failed: %v", err)
		return
	}

	writeMu := &syncWriter{}
	sc := &wsConn{
		conn:    conn,
		writeMu: writeMu,
		closed:  make(chan struct{}),
		safeWrite: func(payload any) error {
			writeMu.Lock()
			defer writeMu.Unlock()
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			return conn.WriteJSON(payload)
		},
	}

	// Register the connection under the user ID
	s.capturedNotificationsMu.Lock()
	s.capturedNotificationsWSConns[actor.ID] = append(s.capturedNotificationsWSConns[actor.ID], sc)
	s.capturedNotificationsMu.Unlock()

	log.Printf("[captured-ws] admin %d connected (total=%d)", actor.ID, len(s.capturedNotificationsWSConns[actor.ID]))

	// Send an initial snapshot so the client knows the connection is alive
	s.sendCapturedSnapshot(sc)

	// Keep-alive reader loop (discard incoming messages; this is server→client only)
	defer func() {
		s.removeCapturedNotifWSConn(actor.ID, conn)
		closeChannel(sc.closed)
		_ = conn.Close()
		log.Printf("[captured-ws] admin %d disconnected", actor.ID)
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

// capturedNotificationSocketPayload is the WebSocket event payload.
type capturedNotificationSocketPayload struct {
	Type         string                            `json:"type"`
	Notification *database.CapturedNotification    `json:"notification,omitempty"`
	Devices      []database.NotificationDevice     `json:"devices,omitempty"`
	Timestamp    time.Time                         `json:"ts"`
}

// sendCapturedSnapshot sends a snapshot event with the list of active devices.
func (s *Server) sendCapturedSnapshot(sc *wsConn) {
	if s.database == nil {
		return
	}
	devices, _ := s.database.ListNotificationDevices()
	if devices == nil {
		devices = []database.NotificationDevice{}
	}
	payload := capturedNotificationSocketPayload{
		Type:      "snapshot",
		Devices:   devices,
		Timestamp: time.Now().UTC(),
	}
	if err := sc.safeWrite(payload); err != nil {
		log.Printf("[captured-ws] snapshot write failed: %v", err)
		_ = sc.conn.Close()
	}
}

// pushCapturedNotificationToAdmins broadcasts a new captured notification
// event to all connected admin WebSocket clients.
func (s *Server) pushCapturedNotificationToAdmins(captured *database.CapturedNotification) {
	if captured == nil {
		return
	}

	payload := capturedNotificationSocketPayload{
		Type:         "captured",
		Notification: captured,
		Timestamp:    time.Now().UTC(),
	}

	s.capturedNotificationsMu.RLock()
	// Collect all active connections across all admin users
	var targets []*wsConn
	for _, conns := range s.capturedNotificationsWSConns {
		targets = append(targets, conns...)
	}
	s.capturedNotificationsMu.RUnlock()

	for _, ws := range targets {
		if err := ws.safeWrite(payload); err != nil {
			log.Printf("[captured-ws] push failed: %v", err)
			_ = ws.conn.Close()
		}
	}

	log.Printf("[captured-ws] pushed notification_id=%d to %d admin clients", captured.ID, len(targets))
}

// removeCapturedNotifWSConn removes a WebSocket connection from the pool.
func (s *Server) removeCapturedNotifWSConn(userID int64, conn *websocket.Conn) {
	s.capturedNotificationsMu.Lock()
	defer s.capturedNotificationsMu.Unlock()
	conns := s.capturedNotificationsWSConns[userID]
	for i, candidate := range conns {
		if candidate.conn == conn {
			s.capturedNotificationsWSConns[userID] = append(conns[:i], conns[i+1:]...)
			break
		}
	}
	if len(s.capturedNotificationsWSConns[userID]) == 0 {
		delete(s.capturedNotificationsWSConns, userID)
	}
}

// notifyAllAdmins creates a panel notification for every admin user.
func (s *Server) notifyAllAdmins(title, body, notifType string) {
	if s.database == nil {
		return
	}
	// List all admin/superadmin users (limit 50)
	users, _, err := s.database.ListUsersFiltered("", 50, 0)
	if err != nil {
		log.Printf("[notif-all] failed to list users: %v", err)
		return
	}
	for _, u := range users {
		if u.Role == "admin" || u.Role == "superadmin" {
			s.notifyUserAction(u.ID, title, body, notifType)
		}
	}
}
