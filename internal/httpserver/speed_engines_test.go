package httpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
)

// ─── Ookla ────────────────────────────────────────────────────────────────────

func TestParseOoklaID(t *testing.T) {
	for id, want := range map[string]int{"ookla-auto": 0, "ookla-12807": 12807, "ookla-1": 1} {
		got, ok := parseOoklaID(id)
		if !ok || got != want {
			t.Errorf("%s: got %d %v, want %d", id, got, ok, want)
		}
	}
	for _, bad := range []string{"ookla-", "ookla-0", "ookla--5", "ookla-12a", "ookla-1234567890", "ookla-1; rm -rf /", "ookla- 12"} {
		if _, ok := parseOoklaID(bad); ok {
			t.Errorf("%q must be rejected", bad)
		}
	}
}

func TestIsOoklaVersion(t *testing.T) {
	if !isOoklaVersion("Speedtest by Ookla 1.2.0.84 (ea6b6773cf) Linux/x86_64-linux-musl\n") {
		t.Fatal("Ookla's client must be recognised")
	}
	// the Python client has the same command name and a different protocol
	if isOoklaVersion("speedtest-cli 2.1.3\nPython 3.11.2") {
		t.Fatal("speedtest-cli is not Ookla's client")
	}
}

// lines as the client prints them with -f jsonl (taken from a real run against CBN Jakarta)
var ooklaFixture = []string{
	`{"type":"testStart","timestamp":"2026-10-17T02:15:24Z","isp":"Biznet Networks","server":{"id":12807,"host":"speedtest.cbn.id","port":8080,"name":"CBN","location":"Jakarta","country":"Indonesia","ip":"202.158.8.14"}}`,
	`{"type":"ping","timestamp":"2026-10-17T02:15:24Z","ping":{"jitter":0.000,"latency":32.680,"progress":0.200}}`,
	`{"type":"ping","timestamp":"2026-10-17T02:15:24Z","ping":{"jitter":0.757,"latency":32.235,"progress":1.000}}`,
	`{"type":"download","timestamp":"2026-10-17T02:15:25Z","download":{"bandwidth":3683098,"bytes":738476,"elapsed":200,"progress":0.013}}`,
	`{"type":"download","timestamp":"2026-10-17T02:15:26Z","download":{"bandwidth":4929078,"bytes":9348596,"elapsed":2451,"progress":0.5}}`,
	`{"type":"upload","timestamp":"2026-10-17T02:15:35Z","upload":{"bandwidth":11087755,"bytes":89479545,"elapsed":2119,"progress":0.4}}`,
	`{"type":"result","timestamp":"2026-10-17T02:15:44Z","ping":{"jitter":0.757,"latency":32.235,"low":31.381,"high":33.111},"download":{"bandwidth":4929078,"bytes":47348596,"elapsed":9709},"upload":{"bandwidth":11087755,"bytes":89479545,"elapsed":8119},"server":{"id":12807,"host":"speedtest.cbn.id","name":"CBN","location":"Jakarta","country":"Indonesia"},"result":{"url":"https://www.speedtest.net/result/c/x"}}`,
}

func TestOoklaRunFoldsTheClientsLines(t *testing.T) {
	rec := httptest.NewRecorder()
	run := &ooklaRun{out: &speedStream{w: rec}}
	for _, line := range ooklaFixture {
		run.consume([]byte(line))
	}
	if run.result == nil {
		t.Fatal("the result line must produce a result")
	}
	if run.result.DownloadMbps != 39.4 || run.result.UploadMbps != 88.7 || run.result.LatencyMs != 32.2 || run.result.JitterMs != 0.8 {
		t.Fatalf("bytes per second must become Mbps (4929078 B/s is 39.4): %+v", *run.result)
	}
	if run.result.ServerID != "ookla-12807" || run.result.Server != "speedtest.cbn.id" || !strings.Contains(run.result.ServerName, "CBN, Jakarta, Indonesia") {
		t.Fatalf("the server must be named from the start line: %+v", *run.result)
	}

	var phases, kinds []string
	for _, line := range strings.Split(strings.TrimSpace(rec.Body.String()), "\n") {
		var ev speedEvent
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			t.Fatalf("an event is not JSON: %q", line)
		}
		kinds = append(kinds, ev.Type)
		if ev.Type == "phase" {
			phases = append(phases, ev.Phase)
		}
	}
	if strings.Join(phases, ",") != "ping,download,upload" {
		t.Fatalf("phases must go ping, download, upload: %v", phases)
	}
	// the final latency comes between the ping samples and the first download figure
	joined := strings.Join(kinds, ",")
	if !strings.Contains(joined, "ping,ping,latency,phase,download") {
		t.Fatalf("unexpected event order: %s", joined)
	}
}

func TestOoklaRunIgnoresGarbageAndKeepsTheClientsError(t *testing.T) {
	rec := httptest.NewRecorder()
	run := &ooklaRun{out: &speedStream{w: rec}}
	run.consume([]byte("not json at all"))
	run.consume([]byte(`{"type":"log","timestamp":"x","message":"Configuration - Could not resolve host name","level":"error"}`))
	if run.result != nil || run.failure != "Configuration - Could not resolve host name" {
		t.Fatalf("an error line must be kept as the failure: %+v", run)
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("an error line is not an event: %q", rec.Body.String())
	}
}

func TestLastLineSkipsTheLicenceBanner(t *testing.T) {
	text := "==========\n\nYou may only use this Speedtest software...\n\n==========\n\n[error] Cannot open socket\n"
	if got := lastLine(text); got != "[error] Cannot open socket" {
		t.Fatalf("got %q", got)
	}
}

func TestOoklaServersNeedTheClientAndTheLicence(t *testing.T) {
	t.Setenv("RENEO_SPEEDTEST_BIN", "/nonexistent/speedtest")
	t.Setenv("PATH", "")
	ooklaBinChecked = time.Time{}
	s := newSiteTestServer(t, config.Config{})

	infos := s.ooklaServerInfos(context.Background())
	if len(infos) < 3 || infos[0].ID != "ookla-auto" {
		t.Fatalf("the nearest server and CBN must be listed even when the client is missing: %+v", infos)
	}
	var cbn int
	for _, info := range infos {
		if info.Available || info.Reason != reasonNoCLI || info.Engine != engineOokla || info.Note != "ookla-public" {
			t.Fatalf("without the client nothing can run: %+v", info)
		}
		if strings.HasPrefix(info.Name, "CBN") {
			cbn++
		}
	}
	if cbn != 2 {
		t.Fatalf("both CBN servers must be listed, got %d", cbn)
	}

	// asking for a run anyway is refused, with the reason, before anything starts
	rec := httptest.NewRecorder()
	s.handleSpeedtestServer(rec, httptest.NewRequest(http.MethodPost, "/api/v1/speedtest/server?server=ookla-12807", nil))
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), reasonNoCLI) {
		t.Fatalf("a missing client must answer 409 with the reason: %d %s", rec.Code, rec.Body.String())
	}
	rec = httptest.NewRecorder()
	s.handleSpeedtestServer(rec, httptest.NewRequest(http.MethodPost, "/api/v1/speedtest/server?server=ookla-12x", nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a bad Ookla id must answer 400, got %d", rec.Code)
	}
}

func TestSpeedEngineOf(t *testing.T) {
	cases := map[string]string{"auto": engineHTTP, "cloudflare": engineHTTP, "": engineHTTP, "mlab": engineNDT7, "ookla-auto": engineOokla, "ookla-12807": engineOokla}
	for id, want := range cases {
		if got := speedEngineOf(id); got != want {
			t.Errorf("%q: got %s, want %s", id, got, want)
		}
	}
}

// ─── M-Lab NDT7 ───────────────────────────────────────────────────────────────

func TestPickNDT7Server(t *testing.T) {
	var reply ndt7LocateReply
	raw := `{"results":[
		{"machine":"a","hostname":"a.example","location":{"city":"Jakarta","country":"ID"},"urls":{"ws:///ndt/v7/download":"ws://a/d"}},
		{"machine":"b","hostname":"b.example","location":{"city":"Malang","country":"ID"},"urls":{"ws:///ndt/v7/download":"ws://b/d","ws:///ndt/v7/upload":"ws://b/u","wss:///ndt/v7/download":"wss://b/d","wss:///ndt/v7/upload":"wss://b/u"}}]}`
	if err := json.Unmarshal([]byte(raw), &reply); err != nil {
		t.Fatal(err)
	}
	server, err := pickNDT7Server(reply)
	if err != nil || server.Hostname != "b.example" || server.Download != "wss://b/d" || server.Upload != "wss://b/u" || server.City != "Malang" {
		t.Fatalf("a server with both directions, secure first: %+v %v", server, err)
	}
	if _, err := pickNDT7Server(ndt7LocateReply{}); err == nil {
		t.Fatal("no server must be an error")
	}
}

// fakeNDT7 speaks enough of NDT7 for the client: it floods the download and counts the upload
func fakeNDT7(t *testing.T, flood time.Duration) *httptest.Server {
	t.Helper()
	upgrader := websocket.Upgrader{Subprotocols: []string{ndt7Subprotocol}, CheckOrigin: func(*http.Request) bool { return true }}
	mux := http.NewServeMux()
	mux.HandleFunc("/ndt/v7/download", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		chunk := make([]byte, 1<<16)
		for end := time.Now().Add(flood); time.Now().Before(end); {
			if conn.WriteMessage(websocket.BinaryMessage, chunk) != nil {
				return
			}
		}
	})
	mux.HandleFunc("/ndt/v7/upload", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		var received atomic.Int64
		started := time.Now()
		go func() {
			ticker := time.NewTicker(100 * time.Millisecond)
			defer ticker.Stop()
			for range ticker.C {
				m, _ := json.Marshal(map[string]any{"TCPInfo": map[string]any{"BytesReceived": received.Load(), "ElapsedTime": time.Since(started).Microseconds()}})
				if conn.WriteMessage(websocket.TextMessage, m) != nil {
					return
				}
			}
		}()
		for {
			kind, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if kind == websocket.BinaryMessage {
				received.Add(int64(len(data)))
			}
		}
	})
	return httptest.NewServer(mux)
}

func TestNDT7AgainstAFakeServer(t *testing.T) {
	old := ndt7Duration
	ndt7Duration = 1200 * time.Millisecond
	defer func() { ndt7Duration = old }()

	server := fakeNDT7(t, 1500*time.Millisecond)
	defer server.Close()
	wsBase := "ws" + strings.TrimPrefix(server.URL, "http")

	locate := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("client_name") == "" {
			http.Error(w, "client_name is required", http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"results": []any{map[string]any{
			"machine": "fake", "hostname": "fake.local", "location": map[string]string{"city": "Test", "country": "ID"},
			"urls": map[string]string{"ws:///ndt/v7/download": wsBase + "/ndt/v7/download", "ws:///ndt/v7/upload": wsBase + "/ndt/v7/upload"},
		}}})
	}))
	defer locate.Close()
	oldLocate := ndt7LocateURL
	ndt7LocateURL = locate.URL
	defer func() { ndt7LocateURL = oldLocate }()

	rec := httptest.NewRecorder()
	out := &speedStream{w: rec}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	result, err := runNDT7(ctx, out)
	if err != nil {
		t.Fatalf("the test must run against a server that speaks NDT7: %v", err)
	}
	if result.DownloadMbps <= 0 || result.UploadMbps <= 0 || result.LatencyMs < 0 || !result.CanUpload {
		t.Fatalf("both directions must measure something: %+v", *result)
	}
	if result.ServerID != speedMLabID || !strings.Contains(result.ServerName, "Test, ID") || result.Server != "fake.local" {
		t.Fatalf("the server must be named from the locate reply: %+v", *result)
	}
	body := rec.Body.String()
	for _, want := range []string{`"phase":"ping"`, `"phase":"download"`, `"phase":"upload"`, `"type":"download"`, `"type":"upload"`, `"type":"latency"`} {
		if !strings.Contains(body, want) {
			t.Errorf("the stream must contain %s", want)
		}
	}
}

func TestNDT7RejectsAServerThatDoesNotSpeakIt(t *testing.T) {
	plain := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// upgrades without agreeing to the NDT7 subprotocol
		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
		if conn, err := upgrader.Upgrade(w, r, nil); err == nil {
			_ = conn.Close()
		}
	}))
	defer plain.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := ndt7Connect(ctx, "ws"+strings.TrimPrefix(plain.URL, "http")); err == nil {
		t.Fatal("a server without the NDT7 subprotocol must be refused")
	}
}
