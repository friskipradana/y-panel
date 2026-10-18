package httpserver

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/metrics"
	"github.com/friskipradana/panel-desktop-ui/internal/system"
)

// Live stream for the widgets: one WebSocket carries a system sample every second (CPU, RAM,
// disk, temperature and network rates) and the results of ping subscriptions, so the widgets
// update as the numbers change instead of on a polling timer.

const (
	liveStatsEvery     = time.Second
	liveMaxPingSubs    = 8
	liveMinPingEvery   = 2 * time.Second
	liveMaxPingEvery   = 300 * time.Second
	liveClientMaxBytes = 4096
)

type liveCommand struct {
	Op          string `json:"op"`
	ID          string `json:"id"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	IntervalSec int    `json:"intervalSec"`
}

type liveStatsMessage struct {
	Type  string   `json:"type"`
	T     int64    `json:"t"`
	CPU   float64  `json:"cpu"`
	RAM   float64  `json:"ram"`
	Disk  float64  `json:"disk"`
	Temp  *float64 `json:"temp,omitempty"`
	NetRx float64  `json:"netRx"`
	NetTx float64  `json:"netTx"`
	RxSum uint64   `json:"rxTotal"`
	TxSum uint64   `json:"txTotal"`
}

type livePingMessage struct {
	Type      string  `json:"type"`
	ID        string  `json:"id"`
	OK        bool    `json:"ok"`
	LatencyMs float64 `json:"latencyMs"`
	Mode      string  `json:"mode"`
	Resolved  string  `json:"resolved,omitempty"`
	Error     string  `json:"error,omitempty"`
	At        int64   `json:"at"`
}

func (s *Server) handleLiveWebSocket(w http.ResponseWriter, r *http.Request) {
	if !s.isWebSocketOriginAllowed(r) {
		http.Error(w, "origin not allowed", http.StatusForbidden)
		return
	}
	user := userFromCtx(r)
	if user == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	hostView := auth.IsSuperAdmin(user.Role)
	// probes are open to every account except the public demo; non-superadmins reach public hosts only
	canPing := !s.isDemoUser(user)
	superadmin := auth.IsSuperAdmin(user.Role)

	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.SetReadLimit(liveClientMaxBytes)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var writeMu sync.Mutex
	send := func(payload any) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		return conn.WriteJSON(payload)
	}

	// samples every second; the network rate comes from the counter difference
	go func() {
		ticker := time.NewTicker(liveStatsEvery)
		defer ticker.Stop()
		var prevRx, prevTx uint64
		var prevAt time.Time
		for {
			now := time.Now()
			var msg liveStatsMessage
			if hostView {
				sm := system.TakeSample(s.cfg.StateDir)
				msg = liveStatsMessage{Type: "stats", T: now.UnixMilli(), CPU: sm.CPUPercent, RAM: sm.RAMPercent, Disk: sm.DiskPercent, RxSum: sm.BytesRecv, TxSum: sm.BytesSent}
				if sm.CPUTemp > 0 {
					temp := sm.CPUTemp
					msg.Temp = &temp
				}
				if !prevAt.IsZero() && sm.BytesRecv >= prevRx && sm.BytesSent >= prevTx {
					if secs := now.Sub(prevAt).Seconds(); secs > 0.2 {
						msg.NetRx = float64(sm.BytesRecv-prevRx) / secs
						msg.NetTx = float64(sm.BytesSent-prevTx) / secs
					}
				}
				prevRx, prevTx, prevAt = sm.BytesRecv, sm.BytesSent, now
			} else {
				// the account's own share: processes of its OS account plus its containers
				res := s.accountResources(user, true)
				msg = liveStatsMessage{Type: "stats", T: now.UnixMilli(), CPU: res.CPUPercent}
				if res.MemLimit > 0 {
					msg.RAM = float64(res.MemUsed) / float64(res.MemLimit) * 100
				}
				if res.DiskLimit > 0 {
					msg.Disk = float64(res.DiskUsed) / float64(res.DiskLimit) * 100
				}
			}
			if send(msg) != nil {
				cancel()
				return
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()

	// the slower things the pages used to poll for: the summary, the recorded history and the
	// revision of the installed panel. They ride the same socket, so an open page asks for none of them.
	go s.pushLiveState(ctx, user, hostView, send, cancel)

	subs := map[string]context.CancelFunc{}
	defer func() {
		for _, stop := range subs {
			stop()
		}
	}()

	// keep half-open links from lingering: the client answers pings automatically
	_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	})
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				writeMu.Lock()
				err := conn.WriteMessage(websocket.PingMessage, nil)
				writeMu.Unlock()
				if err != nil {
					cancel()
					return
				}
			}
		}
	}()

	for {
		var cmd liveCommand
		if err := conn.ReadJSON(&cmd); err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
		switch cmd.Op {
		case "unping":
			if stop, ok := subs[cmd.ID]; ok {
				stop()
				delete(subs, cmd.ID)
			}
		case "ping":
			if !canPing || cmd.ID == "" || len(cmd.ID) > 64 {
				continue
			}
			host, err := normalizePingHost(cmd.Host)
			if err != nil || cmd.Port < 0 || cmd.Port > 65535 {
				_ = send(livePingMessage{Type: "ping", ID: cmd.ID, Error: "host atau port tidak valid", At: time.Now().UnixMilli()})
				continue
			}
			if stop, ok := subs[cmd.ID]; ok {
				stop()
				delete(subs, cmd.ID)
			}
			if len(subs) >= liveMaxPingSubs {
				continue
			}
			every := time.Duration(cmd.IntervalSec) * time.Second
			if every < liveMinPingEvery {
				every = liveMinPingEvery
			}
			if every > liveMaxPingEvery {
				every = liveMaxPingEvery
			}
			subCtx, stop := context.WithCancel(ctx)
			subs[cmd.ID] = stop
			go s.runLivePing(subCtx, send, cmd.ID, host, cmd.Port, every, superadmin)
		}
	}
}

// runLivePing probes the target on its own schedule until the subscription ends.
func (s *Server) runLivePing(ctx context.Context, send func(any) error, id, host string, port int, every time.Duration, superadmin bool) {
	for {
		probeCtx, cancel := context.WithTimeout(ctx, pingTimeout)
		msg := livePingMessage{Type: "ping", ID: id, At: time.Now().UnixMilli()}
		target, policyErr := pingTarget(probeCtx, host, superadmin)
		if policyErr != nil {
			cancel()
			_ = send(livePingMessage{Type: "ping", ID: id, Error: policyErr.Error(), At: msg.At})
			return
		}
		if port > 0 {
			msg.Mode = "tcp"
			latency, resolved, err := tcpPing(probeCtx, target, port)
			if err != nil {
				msg.Error = err.Error()
			} else {
				msg.OK, msg.LatencyMs, msg.Resolved = true, latency, resolved
			}
		} else {
			msg.Mode = "icmp"
			latency, err := icmpPing(probeCtx, target)
			if err != nil {
				msg.Error = err.Error()
			} else {
				msg.OK, msg.LatencyMs = true, latency
			}
		}
		cancel()
		if ctx.Err() != nil {
			return
		}
		if send(msg) != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(every):
		}
	}
}

const (
	liveSummaryEvery  = 10 * time.Second
	liveHistoryEvery  = 5 * time.Second
	liveRevisionEvery = 5 * time.Second
)

type liveSummaryMessage struct {
	Type string       `json:"type"`
	Data jsonResponse `json:"data"`
}

type liveHistoryMessage struct {
	Type   string                      `json:"type"`
	Series map[string][]metrics.Point `json:"series"`
}

type liveRevisionMessage struct {
	Type     string `json:"type"`
	Revision string `json:"revision"`
	Version  string `json:"version"`
}

// pushLiveState sends the summary every few seconds, new history points for the superadmin, and
// the frontend revision when it changes. Everything is sent once on connect.
func (s *Server) pushLiveState(ctx context.Context, user *database.User, hostView bool, send func(any) error, cancel context.CancelFunc) {
	fail := func(err error) bool {
		if err != nil {
			cancel()
			return true
		}
		return false
	}
	var lastRevision string
	var lastHistory int64
	pushRevision := func() bool {
		revision := s.frontendRevision()
		if revision == lastRevision {
			return false
		}
		lastRevision = revision
		return fail(send(liveRevisionMessage{Type: "revision", Revision: revision, Version: s.appVersion()}))
	}
	pushHistory := func() bool {
		if !hostView || s.metrics == nil {
			return false
		}
		series := s.metrics.Since(lastHistory)
		var newest int64
		for _, points := range series {
			if n := len(points); n > 0 && points[n-1].T > newest {
				newest = points[n-1].T
			}
		}
		if newest == 0 {
			return false
		}
		// overlap by one point, so a slow tick never leaves a hole
		lastHistory = newest - 1
		return fail(send(liveHistoryMessage{Type: "history", Series: series}))
	}
	pushSummary := func() bool {
		return fail(send(liveSummaryMessage{Type: "summary", Data: s.systemSummaryPayload(user)}))
	}

	if pushRevision() || pushHistory() || pushSummary() {
		return
	}
	summaryTick := time.NewTicker(liveSummaryEvery)
	historyTick := time.NewTicker(liveHistoryEvery)
	revisionTick := time.NewTicker(liveRevisionEvery)
	defer summaryTick.Stop()
	defer historyTick.Stop()
	defer revisionTick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-summaryTick.C:
			if pushSummary() {
				return
			}
		case <-historyTick.C:
			if pushHistory() {
				return
			}
		case <-revisionTick.C:
			if pushRevision() {
				return
			}
		}
	}
}
