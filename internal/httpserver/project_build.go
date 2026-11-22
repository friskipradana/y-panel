package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	panelosuser "github.com/friskipradana/panel-desktop-ui/internal/osuser"
)

// A site uploaded as source (a package.json with a build script and no index.html) is built on the server, as the account that
// owns the project, and the folder the build makes is what is put in place. The package manager is the one the lock file names.

const buildTimeout = 20 * time.Minute

type buildPlan struct {
	Dir     string
	Manager string
	Install string
	Build   string
}

// findSourceDir is the folder of the source: the requested one, the root of the archive, or the one folder the archive holds
func findSourceDir(stage, requestedRoot string) string {
	has := func(dir string) bool {
		info, err := os.Stat(filepath.Join(dir, "package.json"))
		return err == nil && !info.IsDir()
	}
	if root := strings.TrimSpace(requestedRoot); root != "" && !filepath.IsAbs(root) {
		dir := filepath.Clean(filepath.Join(stage, root))
		if pathWithinRoot(dir, stage) && has(dir) {
			return dir
		}
	}
	if has(stage) {
		return stage
	}
	entries, err := os.ReadDir(stage)
	if err != nil {
		return ""
	}
	var dirs []string
	for _, entry := range entries {
		if entry.IsDir() {
			dirs = append(dirs, entry.Name())
		}
	}
	// a project zipped with its own folder, or with the folder of a git repository next to nothing else
	for _, name := range dirs {
		if dir := filepath.Join(stage, name); has(dir) {
			return dir
		}
	}
	return ""
}

func planBuild(dir string) (*buildPlan, error) {
	raw, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return nil, errors.New("tidak ada package.json")
	}
	var pkg struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(raw, &pkg); err != nil {
		return nil, errors.New("package.json tidak valid")
	}
	if strings.TrimSpace(pkg.Scripts["build"]) == "" {
		return nil, errors.New("package.json tidak punya script build")
	}
	exists := func(name string) bool {
		_, err := os.Stat(filepath.Join(dir, name))
		return err == nil
	}
	plan := &buildPlan{Dir: dir}
	switch {
	case exists("bun.lock") || exists("bun.lockb"):
		plan.Manager, plan.Install, plan.Build = "bun", "bun install", "bun run build"
	case exists("pnpm-lock.yaml"):
		plan.Manager, plan.Install, plan.Build = "pnpm", "pnpm install --frozen-lockfile || pnpm install", "pnpm run build"
	case exists("yarn.lock"):
		plan.Manager, plan.Install, plan.Build = "yarn", "yarn install --frozen-lockfile || yarn install", "yarn run build"
	case exists("package-lock.json"):
		plan.Manager, plan.Install, plan.Build = "npm", "npm ci --no-audit --no-fund || npm install --no-audit --no-fund", "npm run build"
	default:
		plan.Manager, plan.Install, plan.Build = "npm", "npm install --no-audit --no-fund", "npm run build"
	}
	return plan, nil
}

// findBuiltOutput is the folder a build leaves its site in
func findBuiltOutput(dir string) string {
	for _, name := range []string{"dist", "build", "out", ".output/public", "public", "www", "docs"} {
		candidate := filepath.Join(dir, filepath.FromSlash(name))
		if _, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil {
			return candidate
		}
	}
	// a build into a folder of its own name (dist/browser, dist/<app>)
	for _, parent := range []string{"dist", "build"} {
		entries, err := os.ReadDir(filepath.Join(dir, parent))
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() {
				for _, sub := range []string{"", "browser"} {
					candidate := filepath.Join(dir, parent, entry.Name(), sub)
					if _, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil {
						return candidate
					}
				}
			}
		}
	}
	return ""
}

// logLines hands each line a command prints to emit; a carriage return ends a line too
type logLines struct {
	emit func(string)
	buf  bytes.Buffer
}

func (w *logLines) Write(p []byte) (int, error) {
	for _, b := range p {
		if b == '\n' || b == '\r' {
			w.flush()
			continue
		}
		w.buf.WriteByte(b)
	}
	return len(p), nil
}

func (w *logLines) flush() {
	if line := strings.TrimSpace(w.buf.String()); line != "" {
		w.emit(line)
	}
	w.buf.Reset()
}

var errToolMissing = errors.New("tool missing")

// runAs runs a shell script in a folder as the account, with the log lines handed on
func runAs(ctx context.Context, dir, osUsername, script string, emit func(string)) error {
	cmd := exec.CommandContext(ctx, "/bin/sh", "-c", script)
	cmd.Dir = dir
	cmd.Env = panelosuser.BaseEnv("CI=1", "NO_COLOR=1", "FORCE_COLOR=0", "npm_config_update_notifier=false", "npm_config_fund=false", "npm_config_audit=false")
	wrapped, err := panelosuser.WrapCommand(cmd, osUsername)
	if err != nil {
		return err
	}
	out := &logLines{emit: emit}
	wrapped.Stdout = out
	wrapped.Stderr = out
	runErr := wrapped.Run()
	out.flush()
	var exitErr *exec.ExitError
	if errors.As(runErr, &exitErr) && exitErr.ExitCode() == 127 {
		return errToolMissing
	}
	return runErr
}

// buildSource installs the packages and builds, logging what the tools print. It returns the folder with the built site.
func buildSource(ctx context.Context, plan *buildPlan, osUsername string, phase func(string), emit func(string)) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()
	check := fmt.Sprintf("command -v %s >/dev/null 2>&1 || { echo '%s tidak ditemukan untuk akun ini'; exit 127; }; ", plan.Manager, plan.Manager)
	for _, step := range []struct{ name, script string }{{"installing", plan.Install}, {"building", plan.Build}} {
		phase(step.name)
		emit("$ " + strings.SplitN(step.script, " || ", 2)[0])
		if err := runAs(ctx, plan.Dir, osUsername, check+step.script, emit); err != nil {
			if errors.Is(err, errToolMissing) {
				return "", fmt.Errorf("%s belum terpasang untuk akun ini: pasang lewat Profil, bagian Alat pengembangan, atau di terminal", plan.Manager)
			}
			if ctx.Err() == context.DeadlineExceeded {
				return "", fmt.Errorf("proses melebihi batas %d menit", int(buildTimeout.Minutes()))
			}
			return "", fmt.Errorf("%s gagal: %v", strings.SplitN(step.script, " ", 2)[0], err)
		}
	}
	out := findBuiltOutput(plan.Dir)
	if out == "" {
		return "", errors.New("build selesai, tetapi tidak ada folder hasil (dist, build, out, public) yang berisi index.html")
	}
	return out, nil
}
