// Package toolchain gives every account its own development tools (Node.js, Bun, pm2 and others) without root, and lets it
// shape its environment: the folders on its PATH, its variables and a piece of shell of its own. Everything lives in the home
// of the account, under ~/.reneo, and is written by the account itself (through a Runner), never by the agent as root.
package toolchain

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Runner runs a shell script as the account, in its home, with extra environment entries, handing on each line it prints.
type Runner func(ctx context.Context, script string, env []string, emit func(string)) error

const (
	rootDir  = ".reneo"
	prefsRel = ".reneo/toolchain.json"
	envRel   = ".reneo/env.sh"
)

// Dirs are the folders of the account's own tools that go on its PATH, first one first.
func Dirs(home string) []string {
	return []string{
		filepath.Join(home, rootDir, "bin"),
		filepath.Join(home, rootDir, "node", "current", "bin"),
		filepath.Join(home, rootDir, "npm-global", "bin"),
		filepath.Join(home, ".bun", "bin"),
		filepath.Join(home, ".local", "bin"),
	}
}

// Prefs is what the account chose for its environment.
type Prefs struct {
	// Path is more folders for the PATH, after the folders of the tools
	Path []string `json:"path"`
	// Env is variables set in every shell and every project of the account
	Env map[string]string `json:"env"`
	// Shell is a piece of shell run when a shell starts: aliases, functions, anything
	Shell string `json:"shell"`
}

const (
	maxPathEntries = 20
	maxEnvEntries  = 50
	maxShellBytes  = 8 << 10
)

var (
	envKeyRe   = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,63}$`)
	pathPartRe = regexp.MustCompile(`^[A-Za-z0-9 _./+@~-]+$`)
	reserved   = map[string]bool{
		"PATH": true, "HOME": true, "USER": true, "LOGNAME": true, "SHELL": true, "PWD": true, "OLDPWD": true, "IFS": true,
		"LD_PRELOAD": true, "LD_LIBRARY_PATH": true, "BASH_ENV": true, "ENV": true, "PROMPT_COMMAND": true,
		"NPM_CONFIG_PREFIX": true, "BUN_INSTALL": true,
	}
)

// Clean checks the choices and returns them in the form they are kept: folders as $HOME/... or absolute, no empty entries.
func (p Prefs) Clean() (Prefs, error) {
	out := Prefs{Path: []string{}, Env: map[string]string{}}
	for _, raw := range p.Path {
		entry := strings.TrimSpace(raw)
		if entry == "" {
			continue
		}
		if strings.HasPrefix(entry, "$HOME/") {
			entry = "~/" + strings.TrimPrefix(entry, "$HOME/")
		}
		if !(strings.HasPrefix(entry, "/") || strings.HasPrefix(entry, "~/")) || !pathPartRe.MatchString(entry) || strings.Contains(entry, "..") {
			return Prefs{}, fmt.Errorf("folder PATH tidak valid: %q (pakai path absolut atau ~/folder)", raw)
		}
		out.Path = append(out.Path, entry)
	}
	if len(out.Path) > maxPathEntries {
		return Prefs{}, fmt.Errorf("paling banyak %d folder PATH", maxPathEntries)
	}
	if len(p.Env) > maxEnvEntries {
		return Prefs{}, fmt.Errorf("paling banyak %d variabel", maxEnvEntries)
	}
	for key, value := range p.Env {
		key = strings.TrimSpace(key)
		if !envKeyRe.MatchString(key) {
			return Prefs{}, fmt.Errorf("nama variabel tidak valid: %q", key)
		}
		if reserved[key] {
			return Prefs{}, fmt.Errorf("variabel %s diatur oleh panel dan tidak bisa diubah", key)
		}
		if len(value) > 1024 || strings.ContainsAny(value, "\x00\n\r") {
			return Prefs{}, fmt.Errorf("nilai variabel %s tidak valid (satu baris, paling panjang 1024 karakter)", key)
		}
		out.Env[key] = value
	}
	if len(p.Shell) > maxShellBytes {
		return Prefs{}, fmt.Errorf("skrip shell paling panjang %d byte", maxShellBytes)
	}
	if strings.ContainsRune(p.Shell, 0) {
		return Prefs{}, errors.New("skrip shell tidak boleh berisi karakter NUL")
	}
	out.Shell = strings.ReplaceAll(strings.TrimRight(p.Shell, " \t\r\n"), "\r\n", "\n")
	return out, nil
}

func expandHome(entry, home string) string {
	if strings.HasPrefix(entry, "~/") {
		return filepath.Join(home, entry[2:])
	}
	return entry
}

// LoadPrefs reads what the account chose; an account that chose nothing gets empty choices.
func LoadPrefs(home string) Prefs {
	empty := Prefs{Path: []string{}, Env: map[string]string{}}
	raw, err := readFileInHome(home, prefsRel)
	if err != nil {
		return empty
	}
	var prefs Prefs
	if json.Unmarshal(raw, &prefs) != nil {
		return empty
	}
	// the file is the account's own, so it is judged again as if it had just been sent
	clean, err := prefs.Clean()
	if err != nil {
		return empty
	}
	return clean
}

// EnvFor puts the tools of the account into the environment of a command run for it: the PATH starts with its tool folders
// and its own folders, then what was there, and its variables are added.
func EnvFor(env []string, home string) []string {
	prefs := LoadPrefs(home)
	dirs := Dirs(home)
	for _, entry := range prefs.Path {
		dirs = append(dirs, expandHome(entry, home))
	}
	out := make([]string, 0, len(env)+len(prefs.Env)+3)
	pathSet := false
	for _, entry := range env {
		if strings.HasPrefix(entry, "PATH=") {
			out = append(out, "PATH="+strings.Join(dirs, ":")+":"+strings.TrimPrefix(entry, "PATH="))
			pathSet = true
			continue
		}
		out = append(out, entry)
	}
	if !pathSet {
		out = append(out, "PATH="+strings.Join(dirs, ":"))
	}
	out = append(out, "NPM_CONFIG_PREFIX="+filepath.Join(home, rootDir, "npm-global"), "BUN_INSTALL="+filepath.Join(home, ".bun"))
	keys := make([]string, 0, len(prefs.Env))
	for key := range prefs.Env {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		out = append(out, key+"="+prefs.Env[key])
	}
	return out
}

// ResolveCommand finds the program of a command among the tool folders of the account: a command named "node" or "bun" runs
// the node or bun the account installed, not the one of the system. A name that is not found there is left alone.
func ResolveCommand(name, home string) string {
	if name == "" || strings.ContainsRune(name, '/') {
		return ""
	}
	dirs := Dirs(home)
	for _, entry := range LoadPrefs(home).Path {
		dirs = append(dirs, expandHome(entry, home))
	}
	for _, dir := range dirs {
		candidate := filepath.Join(dir, name)
		if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0o111 != 0 {
			return candidate
		}
	}
	return ""
}

func shQuote(value string) string { return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'" }

// EnvScript is the file the shells of the account read: it puts the tool folders on the PATH once, sets the variables and runs
// the shell of the account's own.
func EnvScript(prefs Prefs) string {
	var b bytes.Buffer
	b.WriteString("# Made by Reneo from Profile > Development tools. Changes made here are overwritten.\n")
	b.WriteString("reneo_path_add() { case \":$PATH:\" in *\":$1:\"*) ;; *) PATH=\"$1:$PATH\" ;; esac; }\n")
	b.WriteString("export NPM_CONFIG_PREFIX=\"$HOME/.reneo/npm-global\"\nexport BUN_INSTALL=\"$HOME/.bun\"\n")
	entries := []string{"$HOME/.reneo/bin", "$HOME/.reneo/node/current/bin", "$HOME/.reneo/npm-global/bin", "$HOME/.bun/bin", "$HOME/.local/bin"}
	for _, entry := range prefs.Path {
		entries = append(entries, strings.Replace(entry, "~/", "$HOME/", 1))
	}
	// added last to first, so the PATH ends in the order listed
	for i := len(entries) - 1; i >= 0; i-- {
		fmt.Fprintf(&b, "reneo_path_add \"%s\"\n", entries[i])
	}
	b.WriteString("export PATH\n")
	keys := make([]string, 0, len(prefs.Env))
	for key := range prefs.Env {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		fmt.Fprintf(&b, "export %s=%s\n", key, shQuote(prefs.Env[key]))
	}
	if strings.TrimSpace(prefs.Shell) != "" {
		b.WriteString("\n# your own shell\n")
		b.WriteString(prefs.Shell)
		b.WriteString("\n")
	}
	return b.String()
}

const hookScript = `set -eu
mkdir -p "$HOME/.reneo"
printf '%s\n' "$RENEO_ENV_SH" > "$HOME/.reneo/env.sh.tmp" && mv -f "$HOME/.reneo/env.sh.tmp" "$HOME/.reneo/env.sh"
printf '%s\n' "$RENEO_PREFS_JSON" > "$HOME/.reneo/toolchain.json.tmp" && mv -f "$HOME/.reneo/toolchain.json.tmp" "$HOME/.reneo/toolchain.json"
for rc in "$HOME/.bashrc" "$HOME/.profile"; do
  [ -e "$rc" ] || : > "$rc"
  if ! grep -q 'reneo toolchain >>>' "$rc"; then
    { printf '%s\n' '# >>> reneo toolchain >>>' '[ -f "$HOME/.reneo/env.sh" ] && . "$HOME/.reneo/env.sh"' '# <<< reneo toolchain <<<'; cat "$rc"; } > "$rc.reneo.tmp"
    cat "$rc.reneo.tmp" > "$rc"
    rm -f "$rc.reneo.tmp"
  fi
done
`

// Apply writes the choices and the file the shells read, and hooks that file into .bashrc and .profile of the account (once).
// It runs as the account, so a link in its own home can only lead to its own files.
func Apply(ctx context.Context, run Runner, prefs Prefs) error {
	clean, err := prefs.Clean()
	if err != nil {
		return err
	}
	raw, err := json.Marshal(clean)
	if err != nil {
		return err
	}
	return run(ctx, hookScript, []string{"RENEO_ENV_SH=" + EnvScript(clean), "RENEO_PREFS_JSON=" + string(raw)}, func(string) {})
}
