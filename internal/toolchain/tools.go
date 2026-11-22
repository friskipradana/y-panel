package toolchain

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Tool is a program an account can install for itself.
type Tool struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Binary      string   `json:"binary"`
	Requires    []string `json:"requires,omitempty"`
	// Versioned says the install takes a version (node, bun, and the npm packages)
	Versioned bool `json:"versioned"`
}

// Catalog is what can be installed, in the order the window shows it.
var Catalog = []Tool{
	{ID: "node", Name: "Node.js", Description: "node, npm, npx", Binary: "node", Versioned: true},
	{ID: "bun", Name: "Bun", Description: "bun, bunx", Binary: "bun", Versioned: true},
	{ID: "pm2", Name: "pm2", Description: "process manager for Node.js", Binary: "pm2", Requires: []string{"npm"}, Versioned: true},
	{ID: "pnpm", Name: "pnpm", Description: "fast package manager", Binary: "pnpm", Requires: []string{"npm"}, Versioned: true},
	{ID: "yarn", Name: "Yarn", Description: "package manager", Binary: "yarn", Requires: []string{"npm"}, Versioned: true},
	{ID: "uv", Name: "uv", Description: "Python packages and virtualenvs", Binary: "uv"},
}

func lookup(id string) (Tool, bool) {
	for _, t := range Catalog {
		if t.ID == id {
			return t, true
		}
	}
	return Tool{}, false
}

// What a tool of the account looks like now.
type Status struct {
	Tool
	Installed bool   `json:"installed"`
	Version   string `json:"version,omitempty"`
	Path      string `json:"path,omitempty"`
	// Source is "personal" (in the home of the account, so it can be removed here) or "system"
	Source string `json:"source,omitempty"`
}

// Check is a program that the tools lean on and that only an administrator can install.
type Check struct {
	Binary    string `json:"binary"`
	Installed bool   `json:"installed"`
	Version   string `json:"version,omitempty"`
}

var checks = []string{"npm", "git", "python3", "unzip", "curl"}

const probeScript = `for b in node npm bun pm2 pnpm yarn uv git python3 unzip curl; do
  p=$(command -v "$b" 2>/dev/null || true)
  if [ -n "$p" ]; then
    if [ "$b" = pm2 ]; then
      # pm2 starts its daemon when it is asked for its version: the version is read from its package instead
      v=$(grep -m1 '"version"' "$(dirname "$(readlink -f "$p")")/../package.json" 2>/dev/null | sed 's/[^0-9.]//g' || true)
    else
      v=$("$p" --version 2>/dev/null | tr '\r\n' '  ' | cut -c1-300 || true)
    fi
    printf '%s|%s|%s\n' "$b" "$p" "$v"
  else
    printf '%s||\n' "$b"
  fi
done
`

// Inspect asks the account's own environment which tools it has.
func Inspect(ctx context.Context, run Runner, home string) ([]Status, []Check, error) {
	found := map[string][2]string{}
	err := run(ctx, probeScript, nil, func(line string) {
		parts := strings.SplitN(line, "|", 3)
		if len(parts) == 3 {
			found[parts[0]] = [2]string{parts[1], parts[2]}
		}
	})
	if err != nil {
		return nil, nil, err
	}
	statuses := make([]Status, 0, len(Catalog))
	for _, tool := range Catalog {
		st := Status{Tool: tool}
		if f, ok := found[tool.Binary]; ok && f[0] != "" {
			st.Installed, st.Path, st.Version = true, f[0], cleanVersion(f[1])
			st.Source = "system"
			if strings.HasPrefix(f[0], strings.TrimRight(home, "/")+"/") {
				st.Source = "personal"
			}
		}
		statuses = append(statuses, st)
	}
	extra := make([]Check, 0, len(checks))
	for _, name := range checks {
		c := Check{Binary: name}
		if f, ok := found[name]; ok && f[0] != "" {
			c.Installed, c.Version = true, cleanVersion(f[1])
		}
		extra = append(extra, c)
	}
	return statuses, extra, nil
}

var versionRe = regexp.MustCompile(`v?\d+(\.\d+)+[^\s]*`)

func cleanVersion(raw string) string {
	if m := versionRe.FindString(raw); m != "" {
		return strings.TrimPrefix(m, "v")
	}
	return strings.TrimSpace(raw)
}

// A version the account asks for: lts, latest, 22, 22.11 or 22.11.0 (a leading v is fine).
var versionSpecRe = regexp.MustCompile(`^(lts|latest|v?\d+(\.\d+){0,2})$`)

// ValidVersion says whether a version request is one this package understands; an empty one means the newest.
func ValidVersion(spec string) bool {
	spec = strings.TrimSpace(strings.ToLower(spec))
	return spec == "" || versionSpecRe.MatchString(spec)
}

type nodeRelease struct {
	Version string          `json:"version"`
	LTS     json.RawMessage `json:"lts"`
}

// ResolveNode picks the release of Node.js a request means from the list nodejs.org publishes (newest first).
func ResolveNode(spec string, releases []nodeRelease) (string, error) {
	spec = strings.TrimSpace(strings.ToLower(spec))
	for _, r := range releases {
		isLTS := len(r.LTS) > 0 && string(r.LTS) != "false"
		switch {
		case spec == "" || spec == "lts":
			if isLTS {
				return r.Version, nil
			}
		case spec == "latest":
			return r.Version, nil
		default:
			want := strings.TrimPrefix(spec, "v")
			have := strings.TrimPrefix(r.Version, "v")
			if have == want || strings.HasPrefix(have, want+".") {
				return r.Version, nil
			}
		}
	}
	return "", fmt.Errorf("versi Node.js %q tidak ditemukan", spec)
}

func fetchNodeReleases(ctx context.Context) ([]nodeRelease, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://nodejs.org/dist/index.json", nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("daftar versi Node.js tidak bisa diambil: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("daftar versi Node.js: status %d", resp.StatusCode)
	}
	var releases []nodeRelease
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&releases); err != nil {
		return nil, err
	}
	return releases, nil
}

const nodeInstallScript = `set -eu
v="$RENEO_NODE_VERSION"
case "$(uname -m)" in x86_64) a=x64 ;; aarch64|arm64) a=arm64 ;; *) echo "arsitektur $(uname -m) belum didukung"; exit 1 ;; esac
command -v curl >/dev/null 2>&1 || { echo "curl belum terpasang"; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum belum terpasang"; exit 1; }
file="node-$v-linux-$a.tar.gz"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "Mengunduh Node.js $v ($a)..."
curl -fL --progress-bar -o "$tmp/$file" "https://nodejs.org/dist/$v/$file"
curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/$v/SHASUMS256.txt"
echo "Memeriksa checksum..."
( cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum -c - )
mkdir -p "$HOME/.reneo/node"
tar -xzf "$tmp/$file" -C "$tmp"
rm -rf "$HOME/.reneo/node/$v"
mv "$tmp/node-$v-linux-$a" "$HOME/.reneo/node/$v"
ln -sfn "$HOME/.reneo/node/$v" "$HOME/.reneo/node/current"
mkdir -p "$HOME/.reneo/npm-global/bin"
echo "Node.js $v terpasang."
"$HOME/.reneo/node/current/bin/node" --version
`

const bunInstallScript = `set -eu
command -v curl >/dev/null 2>&1 || { echo "curl belum terpasang"; exit 1; }
if ! command -v unzip >/dev/null 2>&1; then
  command -v python3 >/dev/null 2>&1 || { echo "unzip dan python3 belum terpasang di server. Minta administrator menjalankan: apt install unzip"; exit 1; }
  # the installer of Bun only needs "unzip -oqd dir file": python can do that
  shim=$(mktemp -d)
  trap 'rm -rf "$shim"' EXIT
  cat > "$shim/unzip" <<'EOS'
#!/bin/sh
dir=.; file=
while [ $# -gt 0 ]; do
  case "$1" in -d|-qd|-oqd) dir="$2"; shift 2 ;; -*) shift ;; *) file="$1"; shift ;; esac
done
exec python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[2]).extractall(sys.argv[1])' "$dir" "$file"
EOS
  chmod +x "$shim/unzip"
  PATH="$shim:$PATH"
  export PATH
fi
export BUN_INSTALL="$HOME/.bun"
# an unknown SHELL keeps the installer from editing the rc files: the panel puts the PATH in place itself
export SHELL=/bin/sh
echo "Mengunduh Bun..."
if [ -n "${RENEO_VERSION:-}" ]; then
  curl -fsSL https://bun.sh/install | bash -s "bun-v$RENEO_VERSION"
else
  curl -fsSL https://bun.sh/install | bash
fi
"$HOME/.bun/bin/bun" --version
`

const npmInstallScript = `set -eu
command -v npm >/dev/null 2>&1 || { echo "npm belum ada: pasang Node.js lebih dulu"; exit 1; }
export NPM_CONFIG_PREFIX="$HOME/.reneo/npm-global"
mkdir -p "$NPM_CONFIG_PREFIX/bin"
echo "npm install -g $RENEO_PACKAGE"
npm install -g --no-audit --no-fund "$RENEO_PACKAGE"
`

const uvInstallScript = `set -eu
command -v curl >/dev/null 2>&1 || { echo "curl belum terpasang"; exit 1; }
mkdir -p "$HOME/.reneo/bin"
echo "Mengunduh uv..."
curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="$HOME/.reneo/bin" UV_NO_MODIFY_PATH=1 sh
"$HOME/.reneo/bin/uv" --version
`

// Install puts a tool in the home of the account, handing on what the installer prints.
func Install(ctx context.Context, run Runner, toolID, version string, emit func(string)) error {
	tool, ok := lookup(toolID)
	if !ok {
		return errors.New("alat tidak dikenal")
	}
	version = strings.TrimSpace(strings.ToLower(version))
	if !ValidVersion(version) {
		return errors.New("versi tidak valid: pakai lts, latest, atau angka seperti 22 atau 22.11.0")
	}
	switch tool.ID {
	case "node":
		emit("Mencari versi Node.js " + orDefault(version, "lts") + "...")
		releases, err := fetchNodeReleases(ctx)
		if err != nil {
			return err
		}
		resolved, err := ResolveNode(version, releases)
		if err != nil {
			return err
		}
		return run(ctx, nodeInstallScript, []string{"RENEO_NODE_VERSION=" + resolved}, emit)
	case "bun":
		if version == "lts" || version == "latest" {
			version = ""
		}
		return run(ctx, bunInstallScript, []string{"RENEO_VERSION=" + strings.TrimPrefix(version, "v")}, emit)
	case "pm2", "pnpm", "yarn":
		pkg := tool.ID
		if version != "" && version != "latest" && version != "lts" {
			pkg += "@" + strings.TrimPrefix(version, "v")
		}
		return run(ctx, npmInstallScript, []string{"RENEO_PACKAGE=" + pkg}, emit)
	case "uv":
		return run(ctx, uvInstallScript, nil, emit)
	}
	return errors.New("alat tidak dikenal")
}

func orDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

// Remove takes away what Install put in the home of the account. A tool that came with the system is not touched.
func Remove(ctx context.Context, run Runner, toolID string, emit func(string)) error {
	tool, ok := lookup(toolID)
	if !ok {
		return errors.New("alat tidak dikenal")
	}
	switch tool.ID {
	case "node":
		return run(ctx, `set -eu; rm -rf "$HOME/.reneo/node"; echo "Node.js dihapus dari akun ini."`, nil, emit)
	case "bun":
		return run(ctx, `set -eu; rm -rf "$HOME/.bun"; echo "Bun dihapus dari akun ini."`, nil, emit)
	case "uv":
		return run(ctx, `set -eu; rm -f "$HOME/.reneo/bin/uv" "$HOME/.reneo/bin/uvx"; echo "uv dihapus dari akun ini."`, nil, emit)
	case "pm2", "pnpm", "yarn":
		return run(ctx, `set -eu
export NPM_CONFIG_PREFIX="$HOME/.reneo/npm-global"
command -v npm >/dev/null 2>&1 || { echo "npm tidak ada; hapus manual folder $NPM_CONFIG_PREFIX"; exit 1; }
npm uninstall -g --no-audit --no-fund "$RENEO_PACKAGE"
`, []string{"RENEO_PACKAGE=" + tool.ID}, emit)
	}
	return errors.New("alat tidak dikenal")
}
