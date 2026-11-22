package projects

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestValidateEnv(t *testing.T) {
	if err := ValidateEnv(map[string]string{"DATABASE_URL": "postgres://x", "NODE_ENV": "production"}); err != nil {
		t.Fatalf("ordinary variables are fine: %v", err)
	}
	for _, key := range []string{"PATH", "PORT", "HOME", "LD_PRELOAD", "BASH_ENV", "1BAD", "has space", "", "RENEO_STATIC_SERVER"} {
		if ValidateEnv(map[string]string{key: "x"}) == nil {
			t.Errorf("%q must be refused", key)
		}
	}
	if ValidateEnv(map[string]string{"A": strings.Repeat("x", MaxEnvValueLen+1)}) == nil {
		t.Error("a value that is too long must be refused")
	}
	many := map[string]string{}
	for i := 0; i <= MaxEnvVars; i++ {
		many[fmt.Sprintf("K%d", i)] = "v"
	}
	if ValidateEnv(many) == nil {
		t.Error("too many variables must be refused")
	}
}

func TestValidateRun(t *testing.T) {
	cases := []struct {
		name    string
		kind    string
		run     database.ProjectRun
		wantErr bool
	}{
		{"node with commands", "nodejs", database.ProjectRun{Install: "bun install", Build: "bun run build", Start: "bun run start"}, false},
		{"commands need a start", "nodejs", database.ProjectRun{Install: "bun install"}, true},
		{"no commands is the old way", "nodejs", database.ProjectRun{}, false},
		{"static runs no commands", "static", database.ProjectRun{Start: "x"}, true},
		{"services only in a stack", "nodejs", database.ProjectRun{Services: []database.ProjectService{{Name: "api", Kind: "process", Command: "x", Path: "/"}}}, true},
		{"a stack needs a process", "stack", database.ProjectRun{}, true},
		{"a stack has no commands of its own", "stack", database.ProjectRun{Start: "x", Services: []database.ProjectService{{Name: "api", Kind: "process", Command: "x", Path: "/"}}}, true},
		{"frontend and backend", "stack", database.ProjectRun{Services: []database.ProjectService{
			{Name: "web", Kind: "static", Dir: "web", Serve: "dist", Path: "/", Build: "bun run build"},
			{Name: "api", Kind: "process", Dir: "api", Command: "bun run start", Path: "/api"},
		}}, false},
		{"two take one path", "stack", database.ProjectRun{Services: []database.ProjectService{
			{Name: "a", Kind: "process", Command: "x", Path: "/"}, {Name: "b", Kind: "process", Command: "x", Path: "/"},
		}}, true},
		{"a name twice", "stack", database.ProjectRun{Services: []database.ProjectService{
			{Name: "a", Kind: "process", Command: "x", Path: "/"}, {Name: "a", Kind: "process", Command: "x", Path: "/api"},
		}}, true},
		{"a process needs a command", "stack", database.ProjectRun{Services: []database.ProjectService{{Name: "a", Kind: "process", Path: "/"}}}, true},
		{"a static one has no command", "stack", database.ProjectRun{Services: []database.ProjectService{{Name: "a", Kind: "static", Command: "x", Path: "/"}}}, true},
		{"a folder cannot leave", "stack", database.ProjectRun{Services: []database.ProjectService{{Name: "a", Kind: "process", Command: "x", Path: "/", Dir: "../etc"}}}, true},
		{"an absolute folder", "stack", database.ProjectRun{Services: []database.ProjectService{{Name: "a", Kind: "process", Command: "x", Path: "/", Dir: "/etc"}}}, true},
		{"the port of the project", "stack", database.ProjectRun{Services: []database.ProjectService{{Name: "a", Kind: "process", Command: "x", Path: "/", Port: 10005}}}, true},
		{"a low port", "stack", database.ProjectRun{Services: []database.ProjectService{{Name: "a", Kind: "process", Command: "x", Path: "/", Port: 80}}}, true},
		{"a bad path", "stack", database.ProjectRun{Services: []database.ProjectService{{Name: "a", Kind: "process", Command: "x", Path: "/a b"}}}, true},
		{"a command with a null", "nodejs", database.ProjectRun{Start: "a\x00b"}, true},
	}
	for _, c := range cases {
		run := c.run
		CleanRun(&run)
		err := ValidateRun(c.kind, run, 10005)
		if (err != nil) != c.wantErr {
			t.Errorf("%s: err=%v, want error %v", c.name, err, c.wantErr)
		}
	}
}

func TestCleanRunDefaults(t *testing.T) {
	run := database.ProjectRun{Services: []database.ProjectService{{Name: " API ", Path: "/api/", Command: " x "}}}
	CleanRun(&run)
	svc := run.Services[0]
	if svc.Name != "api" || svc.Kind != "process" || svc.Path != "/api" || svc.Command != "x" {
		t.Fatalf("cleaned wrongly: %+v", svc)
	}
	run = database.ProjectRun{Services: []database.ProjectService{{Name: "web", Kind: "static"}}}
	CleanRun(&run)
	if run.Services[0].Path != "/" {
		t.Fatalf("a process without a path takes the rest: %+v", run.Services[0])
	}
}

func TestRouteMatching(t *testing.T) {
	routes := []gatewayRoute{{name: "web", prefix: "", port: 1}, {name: "api", prefix: "/api", port: 2}, {name: "ws", prefix: "/api/socket", port: 3}}
	want := map[string]string{"/": "web", "/index.html": "web", "/api": "api", "/api/users": "api", "/apix": "web", "/api/socket": "ws", "/api/socket/room": "ws", "/other": "web"}
	for path, name := range want {
		if got := pickRoute(routes, path); got == nil || got.name != name {
			t.Errorf("%s goes to %v, want %s", path, got, name)
		}
	}
	if pickRoute(routes[1:2], "/other") != nil {
		t.Error("with no process for the rest, an unknown path has no route")
	}
}

func TestGatewayHandsRequestsToTheirProcess(t *testing.T) {
	web := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprintf(w, "web:%s", r.URL.Path) }))
	defer web.Close()
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprintf(w, "api:%s", r.URL.Path) }))
	defer api.Close()
	portOf := func(s *httptest.Server) int {
		var port int
		fmt.Sscanf(s.Listener.Addr().String()[strings.LastIndex(s.Listener.Addr().String(), ":")+1:], "%d", &port)
		return port
	}
	gwPort, err := freePort()
	if err != nil {
		t.Fatal(err)
	}
	gw, err := startGateway(gwPort, []gatewayRoute{{name: "web", prefix: "", port: portOf(web)}, {name: "api", prefix: "/api", port: portOf(api)}, {name: "gone", prefix: "/gone", port: 1}}, func(string, ...any) {})
	if err != nil {
		t.Fatal(err)
	}
	defer gw.Close()
	get := func(path string) (int, string) {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d%s", gwPort, path))
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, string(body)
	}
	if code, body := get("/page"); code != 200 || body != "web:/page" {
		t.Errorf("/page: %d %q", code, body)
	}
	if code, body := get("/api/users?x=1"); code != 200 || body != "api:/api/users" {
		t.Errorf("/api/users: %d %q (the prefix stays, the query goes along)", code, body)
	}
	if code, body := get("/gone/x"); code != http.StatusBadGateway || !strings.Contains(body, "gone") {
		t.Errorf("a process that does not answer is a 502 that names it: %d %q", code, body)
	}
}

func TestComposeScriptRunsTheStepsOnce(t *testing.T) {
	unixOnly(t)
	dir := t.TempDir()
	script := composeScript("echo i >> steps.log", "echo b >> steps.log", "echo s >> steps.log")
	for i := 0; i < 2; i++ {
		cmd := exec.Command("sh", "-c", script)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("run %d: %v\n%s", i, err, out)
		}
	}
	data, _ := os.ReadFile(filepath.Join(dir, "steps.log"))
	if got := strings.Fields(string(data)); strings.Join(got, "") != "ibss" {
		t.Fatalf("install and build once, start every time: %q", data)
	}
	// "rebuild" takes the markers away: the steps run again
	for _, marker := range RebuildMarkers(dir) {
		_ = os.Remove(marker)
	}
	cmd := exec.Command("sh", "-c", script)
	cmd.Dir = dir
	_ = cmd.Run()
	data, _ = os.ReadFile(filepath.Join(dir, "steps.log"))
	if got := strings.Join(strings.Fields(string(data)), ""); got != "ibssibs" {
		t.Fatalf("after a rebuild: %q", got)
	}
	// a failing step stops the script before the start command
	failDir := t.TempDir()
	cmd = exec.Command("sh", "-c", composeScript("exit 3", "", "echo started > started.txt"))
	cmd.Dir = failDir
	if err := cmd.Run(); err == nil {
		t.Fatal("a failed install must fail the script")
	}
	if _, err := os.Stat(filepath.Join(failDir, "started.txt")); err == nil {
		t.Fatal("the start command must not run after a failed install")
	}
}

func waitFor(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if ok() {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func TestProjectWithCommandsAndVariables(t *testing.T) {
	unixOnly(t)
	const key = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
	enc, err := crypto.Encrypt(key, `{"GREETING":"halo","API_KEY":"s3cret"}`)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	port, _ := freePort()
	p := &database.Project{ID: 41, ProjectType: "nodejs", WorkingDir: dir, AssignedPort: port, Run: database.ProjectRun{
		Install: "echo installed >> steps.log",
		Build:   "echo built >> steps.log",
		Start:   `echo "$GREETING $API_KEY $PORT" > env.txt; exec python3 -m http.server "$PORT" --bind 127.0.0.1`,
		EnvEnc:  enc,
	}}
	m := NewManager(t.TempDir())
	m.SetEnvKey(key)
	ready, err := m.StartAndWait(nil, p, 15*time.Second)
	if err != nil || !ready {
		t.Fatalf("ready=%v err=%v", ready, err)
	}
	defer m.Stop(p.ID)
	env, _ := os.ReadFile(filepath.Join(dir, "env.txt"))
	if strings.TrimSpace(string(env)) != fmt.Sprintf("halo s3cret %d", port) {
		t.Fatalf("the variables and PORT reach the process: %q", env)
	}
	steps, _ := os.ReadFile(filepath.Join(dir, "steps.log"))
	if strings.Join(strings.Fields(string(steps)), " ") != "installed built" {
		t.Fatalf("install, then build: %q", steps)
	}
}

func TestStackServesFrontendAndBackendOnOneAddress(t *testing.T) {
	unixOnly(t)
	dir := t.TempDir()
	mustWrite := func(rel, content string) {
		full := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	mustWrite("web/dist/index.html", "<h1>frontend</h1>")
	mustWrite("api/api/hello.txt", "from the backend")
	port, _ := freePort()
	p := &database.Project{ID: 42, ProjectType: "stack", WorkingDir: dir, AssignedPort: port, Run: database.ProjectRun{Services: []database.ProjectService{
		{Name: "web", Kind: "static", Dir: "web", Serve: "dist", Path: "/", Build: "echo built > ../built.txt"},
		{Name: "api", Kind: "process", Dir: "api", Path: "/api", Command: `python3 -m http.server "$PORT" --bind 127.0.0.1`},
	}}}
	m := NewManager(t.TempDir())
	ready, err := m.StartAndWait(nil, p, 20*time.Second)
	if err != nil || !ready {
		t.Fatalf("ready=%v err=%v", ready, err)
	}
	get := func(path string) string {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d%s", port, path))
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		return string(body)
	}
	if got := get("/"); !strings.Contains(got, "frontend") {
		t.Errorf("/ is the frontend: %q", got)
	}
	if got := get("/some/route"); !strings.Contains(got, "frontend") {
		t.Errorf("a route of the single-page app falls back to index.html: %q", got)
	}
	if got := get("/api/hello.txt"); got != "from the backend" {
		t.Errorf("/api is the backend: %q", got)
	}
	if built, _ := os.ReadFile(filepath.Join(dir, "built.txt")); !strings.Contains(string(built), "built") {
		t.Error("the build step of the frontend ran in its folder")
	}
	if !m.Snapshot(p.ID, "active").Running {
		t.Error("a running stack reports running")
	}
	if log, _ := m.ReadLog(p.ID, 50); !strings.Contains(strings.Join(log, "\n"), "[api]") {
		t.Errorf("the log names the process: %v", log)
	}

	if err := m.Stop(p.ID); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the gateway to close", func() bool { return !isLocalPortOpen(port) })
	if m.Snapshot(p.ID, "stopped").Running {
		t.Error("a stopped stack is not running")
	}
}

func TestStackWithAFolderThatIsMissingStartsNothing(t *testing.T) {
	unixOnly(t)
	dir := t.TempDir()
	port, _ := freePort()
	p := &database.Project{ID: 43, ProjectType: "stack", WorkingDir: dir, AssignedPort: port, Run: database.ProjectRun{Services: []database.ProjectService{
		{Name: "api", Kind: "process", Dir: "nope", Path: "/", Command: "sleep 30"},
	}}}
	m := NewManager(t.TempDir())
	if err := m.Start(nil, p); err == nil {
		t.Fatal("a folder that does not exist must be refused")
	}
	if isLocalPortOpen(port) || m.Snapshot(p.ID, "").Running {
		t.Fatal("nothing must be left running")
	}
}

func TestEnvIsStoredAsJSONPairs(t *testing.T) {
	raw, _ := json.Marshal(map[string]string{"B": "2", "A": "1"})
	if len(raw) == 0 || strings.Join(EnvPairs(map[string]string{"B": "2", "A": "1"}), ",") != "A=1,B=2" {
		t.Fatal("pairs are sorted")
	}
}
