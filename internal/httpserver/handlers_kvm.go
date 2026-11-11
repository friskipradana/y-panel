package httpserver

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// handleGetKvmStatus probes local VNC display service on the host and returns its reachability.
func (s *Server) handleGetKvmStatus(w http.ResponseWriter, _ *http.Request) {
	settings := s.loadSiteSettings()
	port := settings.KvmPort
	if port <= 0 {
		port = 5900
	}
	targetAddr := fmt.Sprintf("127.0.0.1:%d", port)
	conn, err := net.DialTimeout("tcp", targetAddr, 1200*time.Millisecond)
	available := err == nil
	if conn != nil {
		_ = conn.Close()
	}

	display := strings.TrimSpace(settings.KvmDisplay)
	if display == "" {
		display = os.Getenv("DISPLAY")
		if display == "" {
			display = ":0"
		}
	}

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":   settings.KvmEnabled,
		"available": available,
		"host":      "127.0.0.1",
		"port":      port,
		"display":   display,
		"os":        runtime.GOOS,
	})
}

// handleKvmWebSocket bridges browser WebSocket (RFB/noVNC binary stream) to local VNC display server.
func (s *Server) handleKvmWebSocket(w http.ResponseWriter, r *http.Request) {
	settings := s.loadSiteSettings()
	if !settings.KvmEnabled {
		http.Error(w, "Fitur KVM / Host Display dinonaktifkan di Pengaturan", http.StatusForbidden)
		return
	}

	port := settings.KvmPort
	if port <= 0 {
		port = 5900
	}
	targetAddr := fmt.Sprintf("127.0.0.1:%d", port)
	tcpConn, err := net.DialTimeout("tcp", targetAddr, 4*time.Second)
	if err != nil {
		log.Printf("[kvm] local vnc connection failed target=%s: %v", targetAddr, err)
		http.Error(w, fmt.Sprintf("Gagal terhubung ke display VNC lokal di port %d: %v", port, err), http.StatusBadGateway)
		return
	}

	// noVNC requests "binary" or "base64" WebSocket subprotocols
	upgrader := websocket.Upgrader{
		ReadBufferSize:  32768,
		WriteBufferSize: 32768,
		CheckOrigin:     s.isWebSocketOriginAllowed,
		Subprotocols:    []string{"binary", "base64"},
	}

	wsConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		_ = tcpConn.Close()
		log.Printf("[kvm] websocket upgrade failed: %v", err)
		return
	}

	var once sync.Once
	closeBoth := func() {
		once.Do(func() {
			_ = wsConn.Close()
			_ = tcpConn.Close()
		})
	}
	defer closeBoth()

	// Forward client WS binary packets to local TCP VNC server
	go func() {
		defer closeBoth()
		for {
			msgType, data, readErr := wsConn.ReadMessage()
			if readErr != nil {
				return
			}
			if msgType == websocket.BinaryMessage || msgType == websocket.TextMessage {
				if _, writeErr := tcpConn.Write(data); writeErr != nil {
					return
				}
			}
		}
	}()

	// Forward raw VNC stream from local TCP to client WS
	buf := make([]byte, 32768)
	for {
		n, readErr := tcpConn.Read(buf)
		if readErr != nil {
			return
		}
		if n > 0 {
			if writeErr := wsConn.WriteMessage(websocket.BinaryMessage, buf[:n]); writeErr != nil {
				return
			}
		}
	}
}

