package httpserver

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// A way to look at the real DBX through the gate by hand: DBX_HARNESS_ADDR=127.0.0.1:18999 DBX_HARNESS_UPSTREAM=http://127.0.0.1:14224
// DBX_HARNESS_DB=15432 go test ./internal/httpserver -run TestDbxHarness. The DBX container must have been started with the password
// the test prints. Skipped otherwise.
func TestDbxHarness(t *testing.T) {
	addr := os.Getenv("DBX_HARNESS_ADDR")
	if addr == "" {
		t.Skip("manual harness")
	}
	s := &Server{cfg: config.Config{EncryptionKey: "harness-key"}}
	port, _ := strconv.Atoi(os.Getenv("DBX_HARNESS_DB"))
	conns := func(*database.User) []dbxConn {
		return []dbxConn{{ID: "rdb-1", Name: "Shop", Type: "postgres", Host: "127.0.0.1", Port: port, User: "postgres", Password: "pgpass", Database: "appdb"}}
	}
	upstream := os.Getenv("DBX_HARNESS_UPSTREAM")
	handler := s.newDbxProxy(func() string { return upstream }, conns, false)
	fmt.Println("DBX_PASSWORD=" + s.dbxPassword())
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	_ = http.Serve(listener, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), ctxUser, &database.User{ID: 1, Username: "harness"})
		handler.ServeHTTP(w, r.WithContext(ctx))
	}))
}

// With docker at hand (DBX_LIVE_DOCKER=1 PANEL_DBX_PORT=24224): a DBX made the old way, open on every address without a password,
// is replaced by one on loopback behind the password of the panel, and the panel can log in to it.
func TestDbxEnsureReplacesTheOldContainer(t *testing.T) {
	if os.Getenv("DBX_LIVE_DOCKER") == "" {
		t.Skip("needs docker")
	}
	ctx := context.Background()
	s := &Server{cfg: config.Config{EncryptionKey: "live-key"}}
	_, _ = dockerOutput(ctx, "rm", "-f", dbxContainer)
	if out, err := dockerOutput(ctx, "run", "-d", "--name", dbxContainer, "--network", "host", "-e", "DBX_PORT="+strconv.Itoa(dbxPort()),
		"-e", "DBX_PUBLIC_BASE_PATH=/dbx", "-e", "DBX_DISABLE_PASSWORD=true", dbxImage); err != nil {
		t.Fatalf("old container: %s", out)
	}
	t.Cleanup(func() { _, _ = dockerOutput(ctx, "rm", "-f", dbxContainer) })
	if err := s.ensureDbx(ctx); err != nil {
		t.Fatal(err)
	}
	setup, _ := dockerOutput(ctx, "inspect", "-f", `{{index .Config.Labels "`+dbxSetupLabel+`"}}`, dbxContainer)
	if setup != dbxSetup {
		t.Fatalf("the old container was not replaced: label %q", setup)
	}
	base := "http://127.0.0.1:" + strconv.Itoa(dbxPort())
	resp, err := http.Get(base + "/dbx/api/connection/list")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("DBX must refuse a request without the session of the panel, got %d", resp.StatusCode)
	}
	cookie, err := s.dbxSession(ctx, base)
	if err != nil || cookie == "" {
		t.Fatalf("the panel must be able to log in: %v", err)
	}
	// a second call finds the right container and leaves it be
	if err := s.ensureDbx(ctx); err != nil {
		t.Fatal(err)
	}
}
