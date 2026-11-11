package httpserver

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// handleGetKvmStatus probes local VNC display service on the host and returns its reachability and installation state.
func (s *Server) handleGetKvmStatus(w http.ResponseWriter, _ *http.Request) {
	settings := s.loadSiteSettings()
	port := settings.KvmPort
	if port <= 0 {
		port = 5900
	}
	targetAddr := fmt.Sprintf("127.0.0.1:%d", port)
	conn, err := net.DialTimeout("tcp", targetAddr, 800*time.Millisecond)
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

	_, lookErr := exec.LookPath("x11vnc")
	installed := lookErr == nil

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":   settings.KvmEnabled,
		"available": available,
		"installed": installed,
		"host":      "127.0.0.1",
		"port":      port,
		"display":   display,
		"os":        runtime.GOOS,
	})
}

// handleInstallKvm installs x11vnc on the host Linux system using the available package manager.
func (s *Server) handleInstallKvm(w http.ResponseWriter, r *http.Request) {
	currentUser := s.currentUserRecord(r)
	if runtime.GOOS != "linux" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "Instalasi x11vnc otomatis hanya didukung pada sistem host Linux"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()

	var cmd *exec.Cmd
	if _, err := exec.LookPath("apt-get"); err == nil {
		_ = exec.CommandContext(ctx, "apt-get", "update").Run()
		cmd = exec.CommandContext(ctx, "apt-get", "install", "-y", "x11vnc")
		cmd.Env = append(os.Environ(), "DEBIAN_FRONTEND=noninteractive")
	} else if _, err := exec.LookPath("dnf"); err == nil {
		cmd = exec.CommandContext(ctx, "dnf", "install", "-y", "x11vnc")
	} else if _, err := exec.LookPath("yum"); err == nil {
		cmd = exec.CommandContext(ctx, "yum", "install", "-y", "x11vnc")
	} else if _, err := exec.LookPath("pacman"); err == nil {
		cmd = exec.CommandContext(ctx, "pacman", "-S", "--noconfirm", "x11vnc")
	} else {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "Tidak ditemukan package manager (apt-get, dnf, yum, pacman) yang didukung pada server host"})
		return
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[kvm] install x11vnc failed: %v, out: %s", err, string(output))
		s.auditSensitiveAction(r, currentUser, "kvm.install", "failed", map[string]any{"error": err.Error(), "output": string(output)})
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{
			"error": fmt.Sprintf("Gagal memasang x11vnc: %v (%s)", err, strings.TrimSpace(string(output))),
		})
		return
	}

	s.auditSensitiveAction(r, currentUser, "kvm.install", "success", map[string]any{"package": "x11vnc"})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": "x11vnc berhasil dipasang"})
}

// handleStartKvm starts the local x11vnc display service.
func (s *Server) handleStartKvm(w http.ResponseWriter, r *http.Request) {
	currentUser := s.currentUserRecord(r)
	settings := s.loadSiteSettings()
	port := settings.KvmPort
	if port <= 0 {
		port = 5900
	}
	display := strings.TrimSpace(settings.KvmDisplay)
	if display == "" {
		display = os.Getenv("DISPLAY")
		if display == "" {
			display = ":0"
		}
	}

	targetAddr := fmt.Sprintf("127.0.0.1:%d", port)
	conn, err := net.DialTimeout("tcp", targetAddr, 500*time.Millisecond)
	if err == nil && conn != nil {
		_ = conn.Close()
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "running": true, "message": "Layanan VNC sudah aktif di port " + strconv.Itoa(port)})
		return
	}

	if _, err := exec.LookPath("x11vnc"); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "Paket x11vnc belum terpasang di host server. Silakan pasang terlebih dahulu."})
		return
	}

	cmd := exec.Command("x11vnc",
		"-display", display,
		"-rfbport", strconv.Itoa(port),
		"-shared",
		"-forever",
		"-auth", "guess",
		"-nopw",
		"-bg",
	)
	cmd.Env = append(os.Environ(), "DISPLAY="+display)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[kvm] start x11vnc failed: %v out: %s", err, string(output))
		s.auditSensitiveAction(r, currentUser, "kvm.start", "failed", map[string]any{"error": err.Error(), "output": string(output)})
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{
			"error": fmt.Sprintf("Gagal menjalankan x11vnc: %v (%s)", err, strings.TrimSpace(string(output))),
		})
		return
	}

	time.Sleep(600 * time.Millisecond)
	conn, err = net.DialTimeout("tcp", targetAddr, 1200*time.Millisecond)
	running := err == nil
	if conn != nil {
		_ = conn.Close()
	}

	s.auditSensitiveAction(r, currentUser, "kvm.start", "success", map[string]any{"port": port, "display": display, "running": running})
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":      true,
		"running": running,
		"message": "Layanan x11vnc berhasil dijalankan",
	})
}

// handleStopKvm terminates the local x11vnc process.
func (s *Server) handleStopKvm(w http.ResponseWriter, r *http.Request) {
	currentUser := s.currentUserRecord(r)
	_ = exec.Command("pkill", "-f", "x11vnc").Run()
	s.auditSensitiveAction(r, currentUser, "kvm.stop", "success", map[string]any{"stopped": true})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "running": false})
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
