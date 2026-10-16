package httpserver

import (
	"fmt"
	"net/http"
	"strings"
)

// Targets for the panel-to-internet test. The superadmin picks one; "auto" uses Cloudflare and
// falls back to the file servers when it refuses this server. Every host is a public speed test
// endpoint, nothing here is user supplied, so the agent cannot be pointed at internal addresses.

const speedAutoID = "auto"

type speedServer struct {
	ID       string
	Name     string
	Location string
	Host     string
	// down is a URL that serves a large file (or an endless body for Cloudflare)
	down string
	// up accepts a POST body and discards it; empty means the server is download only
	up string
	// ping is a tiny request for latency; rangePing asks for one byte so a big file is not sent
	ping      string
	rangePing bool
}

func (s speedServer) canUpload() bool { return s.up != "" }

func speedFileServer(id, name, location, host, url string) speedServer {
	return speedServer{ID: id, Name: name, Location: location, Host: host, down: url, ping: url, rangePing: true}
}

func speedCloudflare() speedServer {
	return speedServer{
		ID:       "cloudflare",
		Name:     "Cloudflare",
		Location: "Nearest edge",
		Host:     speedInternetName,
		down:     fmt.Sprintf("%s/__down?bytes=%d", speedInternetHost, speedDownloadBytes),
		up:       speedInternetHost + "/__up",
		ping:     speedInternetHost + "/__down?bytes=0",
	}
}

// speedCatalog lists the concrete servers, Cloudflare first
func speedCatalog() []speedServer {
	return []speedServer{
		speedCloudflare(),
		speedFileServer("hetzner-sin", "Hetzner", "Singapore", "sin-speed.hetzner.com", "https://sin-speed.hetzner.com/100MB.bin"),
		speedFileServer("hetzner-fsn", "Hetzner", "Falkenstein, Germany", "fsn1-speed.hetzner.com", "https://fsn1-speed.hetzner.com/100MB.bin"),
		speedFileServer("hetzner-ash", "Hetzner", "Ashburn, USA", "ash-speed.hetzner.com", "https://ash-speed.hetzner.com/100MB.bin"),
		{
			ID: "tele2", Name: "Tele2", Location: "Stockholm, Sweden", Host: "speedtest.tele2.net",
			down: "http://speedtest.tele2.net/100MB.zip", up: "http://speedtest.tele2.net/upload.php",
			ping: "http://speedtest.tele2.net/100MB.zip", rangePing: true,
		},
	}
}

// resolveSpeedServers returns the servers to try, in order, for a requested id
func resolveSpeedServers(id string) ([]speedServer, bool) {
	id = strings.TrimSpace(id)
	if id == "" || id == speedAutoID {
		return speedCatalog(), true
	}
	for _, server := range speedCatalog() {
		if server.ID == id {
			return []speedServer{server}, true
		}
	}
	return nil, false
}

type speedServerInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Location  string `json:"location"`
	Host      string `json:"host"`
	CanUpload bool   `json:"canUpload"`
}

func (s *Server) handleSpeedtestServers(w http.ResponseWriter, _ *http.Request) {
	list := []speedServerInfo{{ID: speedAutoID, Name: "Auto", Location: "Cloudflare, other hosts as fallback", Host: speedInternetName, CanUpload: true}}
	for _, server := range speedCatalog() {
		list = append(list, speedServerInfo{ID: server.ID, Name: server.Name, Location: server.Location, Host: server.Host, CanUpload: server.canUpload()})
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"servers": list})
}
