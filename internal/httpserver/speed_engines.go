package httpserver

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// A speed test server can be one of three kinds: the plain HTTP hosts of handlers_speedtest_servers.go,
// M-Lab NDT7 (Google's speed test), or Ookla's client (speedtest.net and CBN). They all stream the
// same events, so the browser does not care which one it asked for.

const (
	engineHTTP  = "http"
	engineNDT7  = "ndt7"
	engineOokla = "ookla"

	speedMLabID = "mlab"
)

func speedEngineOf(id string) string {
	switch {
	case id == speedMLabID:
		return engineNDT7
	case strings.HasPrefix(id, speedOoklaPrefix):
		return engineOokla
	}
	return engineHTTP
}

// Why a server cannot be used yet; the interface turns these into instructions
const (
	reasonNoCLI   = "no-cli"
	reasonLicense = "license"
)

// ooklaStatus says whether Ookla's client can run: where it is, and the reason when it cannot
func (s *Server) ooklaStatus() (bin, reason string) {
	bin = ooklaBinary()
	switch {
	case bin == "":
		return "", reasonNoCLI
	case !s.loadSiteSettings().OoklaLicenseAccepted:
		return bin, reasonLicense
	}
	return bin, ""
}

// ooklaServerInfos lists the Ookla servers: the nearest one, the CBN servers, and the ones around this server
func (s *Server) ooklaServerInfos(ctx context.Context) []speedServerInfo {
	bin, reason := s.ooklaStatus()
	entry := func(id, name, location, host string) speedServerInfo {
		return speedServerInfo{ID: id, Name: name, Location: location, Host: host, CanUpload: true, Engine: engineOokla, Available: reason == "", Reason: reason, Note: "ookla-public"}
	}
	list := []speedServerInfo{entry(speedOoklaPrefix+"auto", "Speedtest.net (Ookla)", "Nearest Ookla server", "speedtest.net")}
	taken := map[int]bool{}
	for _, fixed := range ooklaFixedServers {
		taken[fixed.ID] = true
		list = append(list, entry(speedOoklaPrefix+strconv.Itoa(fixed.ID), fixed.Name, fixed.Location, fixed.Host))
	}
	if reason == "" {
		for _, near := range ooklaNearest(ctx, bin) {
			if taken[near.ID] {
				continue
			}
			list = append(list, entry(speedOoklaPrefix+strconv.Itoa(near.ID), near.Name, strings.Trim(near.Location+", "+near.Country, ", "), near.Host))
		}
	}
	return list
}

func newSpeedStream(w http.ResponseWriter) *speedStream {
	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")
	// stop nginx style proxies from holding the stream back
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, _ := w.(http.Flusher)
	return &speedStream{w: w, f: flusher}
}

// handleSpeedtestEngine runs a test on M-Lab or Ookla; the HTTP hosts keep their own handler
func (s *Server) handleSpeedtestEngine(w http.ResponseWriter, r *http.Request, id, engine string) {
	var run func(ctx context.Context, out *speedStream) (*speedInternetResult, error)
	switch engine {
	case engineNDT7:
		run = runNDT7
	case engineOokla:
		serverID, ok := parseOoklaID(id)
		if !ok {
			s.writeError(w, http.StatusBadRequest, errors.New("unknown speed test server"))
			return
		}
		bin, reason := s.ooklaStatus()
		if reason != "" {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "the Ookla client is not ready: " + reason, "reason": reason})
			return
		}
		run = func(ctx context.Context, out *speedStream) (*speedInternetResult, error) {
			return runOokla(ctx, out, bin, serverID)
		}
	}
	if !speedInternetMu.TryLock() {
		s.writeError(w, http.StatusConflict, errors.New("a speed test is already running on this server"))
		return
	}
	defer speedInternetMu.Unlock()

	out := newSpeedStream(w)
	ctx, cancel := context.WithTimeout(r.Context(), 150*time.Second)
	defer cancel()
	result, err := run(ctx, out)
	if err != nil {
		out.send(speedEvent{Type: "error", Error: err.Error()})
		return
	}
	out.send(speedEvent{Type: "done", Result: result})
}
