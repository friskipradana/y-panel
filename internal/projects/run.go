package projects

import (
	"errors"
	"fmt"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// What a project may be told about how to run: the commands, the variables, and the processes of a project made of several. The
// commands run as the account of the project, inside its limits, so they are not more power than the account already has; the rules
// here keep the data sane and the panel's own variables out of reach.

const (
	MaxCommandLen  = 4000
	MaxEnvVars     = 50
	MaxEnvValueLen = 4096
	MaxServices    = 6
	maxPathLen     = 100
	maxDirLen      = 200
)

var (
	envKeyRe      = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,63}$`)
	serviceNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,29}$`)
	servicePathRe = regexp.MustCompile(`^/[A-Za-z0-9._~/-]*$`)
	relDirRe      = regexp.MustCompile(`^[A-Za-z0-9._@/-]+$`)
)

// reservedEnv are the variables the panel sets for a project; a project cannot change them
var reservedEnv = map[string]bool{
	"PATH": true, "HOME": true, "USER": true, "LOGNAME": true, "SHELL": true, "PWD": true, "PORT": true,
	"IFS": true, "BASH_ENV": true, "ENV": true, "TMPDIR": true, "RENEO_STATIC_SERVER": true,
}

// ValidateEnv checks the variables a project runs with
func ValidateEnv(env map[string]string) error {
	if len(env) > MaxEnvVars {
		return fmt.Errorf("at most %d variables", MaxEnvVars)
	}
	for key, value := range env {
		switch {
		case !envKeyRe.MatchString(key):
			return fmt.Errorf("%q is not a valid variable name (letters, digits and _, not starting with a digit)", key)
		case reservedEnv[key] || strings.HasPrefix(key, "LD_") || strings.HasPrefix(key, "DYLD_"):
			return fmt.Errorf("%s is set by the panel and cannot be changed here", key)
		case len(value) > MaxEnvValueLen:
			return fmt.Errorf("the value of %s is longer than %d characters", key, MaxEnvValueLen)
		case strings.ContainsRune(value, 0):
			return fmt.Errorf("the value of %s has a null character", key)
		}
	}
	return nil
}

// EnvPairs are the variables as KEY=VALUE lines in a stable order
func EnvPairs(env map[string]string) []string {
	keys := make([]string, 0, len(env))
	for key := range env {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	for _, key := range keys {
		pairs = append(pairs, key+"="+env[key])
	}
	return pairs
}

func checkCommand(label, command string) error {
	switch {
	case strings.ContainsRune(command, 0):
		return fmt.Errorf("%s has a null character", label)
	case len(command) > MaxCommandLen:
		return fmt.Errorf("%s is longer than %d characters", label, MaxCommandLen)
	}
	return nil
}

// cleanRelDir is a folder inside the project folder as a clean relative path, or an error when it is not one
func cleanRelDir(label, dir string) (string, error) {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return "", nil
	}
	if len(dir) > maxDirLen || !relDirRe.MatchString(dir) || strings.HasPrefix(dir, "/") {
		return "", fmt.Errorf("%s is a folder inside the project folder, like web or apps/api", label)
	}
	clean := path.Clean(dir)
	if clean == "." {
		return "", nil
	}
	if clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("%s cannot leave the project folder", label)
	}
	return clean, nil
}

// CleanRun trims and normalises how a project runs; ValidateRun then says whether it is acceptable
func CleanRun(run *database.ProjectRun) {
	run.Install = strings.TrimSpace(run.Install)
	run.Build = strings.TrimSpace(run.Build)
	run.Start = strings.TrimSpace(run.Start)
	if run.Services == nil {
		run.Services = []database.ProjectService{}
	}
	for i := range run.Services {
		svc := &run.Services[i]
		svc.Name = strings.ToLower(strings.TrimSpace(svc.Name))
		svc.Kind = strings.ToLower(strings.TrimSpace(svc.Kind))
		if svc.Kind == "" {
			svc.Kind = "process"
		}
		svc.Install = strings.TrimSpace(svc.Install)
		svc.Build = strings.TrimSpace(svc.Build)
		svc.Command = strings.TrimSpace(svc.Command)
		svc.Dir = strings.TrimSpace(svc.Dir)
		svc.Serve = strings.TrimSpace(svc.Serve)
		svc.Path = strings.TrimSpace(svc.Path)
		if svc.Path == "" {
			svc.Path = "/"
		}
		if svc.Path != "/" {
			svc.Path = strings.TrimRight(svc.Path, "/")
		}
	}
}

// ValidateRun checks how a project of this type is told to run
func ValidateRun(projectType string, run database.ProjectRun, assignedPort int) error {
	for label, command := range map[string]string{"the install command": run.Install, "the build command": run.Build, "the start command": run.Start} {
		if err := checkCommand(label, command); err != nil {
			return err
		}
	}
	if err := ValidateEnv(run.Env); err != nil {
		return err
	}

	if projectType == "stack" {
		if run.Install != "" || run.Build != "" || run.Start != "" {
			return errors.New("a project of several processes has its commands on each process")
		}
		return validateServices(run.Services, assignedPort)
	}
	if len(run.Services) > 0 {
		return errors.New("processes belong to a project of several processes")
	}
	if projectType == "static" {
		if run.Install != "" || run.Build != "" || run.Start != "" {
			return errors.New("a static project serves its folder and runs no commands; upload a build, or make it a project of several processes to build it here")
		}
		return nil
	}
	if (run.Install != "" || run.Build != "") && run.Start == "" {
		return errors.New("set the start command too: the install and build commands run before it")
	}
	return nil
}

func validateServices(services []database.ProjectService, assignedPort int) error {
	if len(services) == 0 {
		return errors.New("a project of several processes needs at least one process")
	}
	if len(services) > MaxServices {
		return fmt.Errorf("at most %d processes", MaxServices)
	}
	names, paths, ports := map[string]bool{}, map[string]bool{}, map[int]bool{}
	for _, svc := range services {
		switch {
		case !serviceNameRe.MatchString(svc.Name):
			return fmt.Errorf("the name of a process is lowercase letters, digits and dashes (got %q)", svc.Name)
		case names[svc.Name]:
			return fmt.Errorf("the process %q is listed twice", svc.Name)
		case svc.Kind != "process" && svc.Kind != "static":
			return fmt.Errorf("process %s: the kind is process or static", svc.Name)
		case !servicePathRe.MatchString(svc.Path) || len(svc.Path) > maxPathLen || strings.Contains(svc.Path, "//"):
			return fmt.Errorf("process %s: the path starts with / and has letters, digits and . _ ~ - /", svc.Name)
		case paths[svc.Path]:
			return fmt.Errorf("two processes take the path %s", svc.Path)
		case svc.Port != 0 && (svc.Port < 1024 || svc.Port > 65535 || svc.Port == assignedPort):
			return fmt.Errorf("process %s: the port is 0 (picked for you) or from 1024 to 65535, not the one of the project", svc.Name)
		case svc.Port != 0 && ports[svc.Port]:
			return fmt.Errorf("two processes use the port %d", svc.Port)
		}
		for label, command := range map[string]string{"install command": svc.Install, "build command": svc.Build, "start command": svc.Command} {
			if err := checkCommand("process "+svc.Name+": the "+label, command); err != nil {
				return err
			}
		}
		if _, err := cleanRelDir("process "+svc.Name+": the folder", svc.Dir); err != nil {
			return err
		}
		if _, err := cleanRelDir("process "+svc.Name+": the folder it serves", svc.Serve); err != nil {
			return err
		}
		if svc.Kind == "process" && svc.Command == "" {
			return fmt.Errorf("process %s needs a start command", svc.Name)
		}
		if svc.Kind == "static" && svc.Command != "" {
			return fmt.Errorf("process %s serves a folder and has no start command", svc.Name)
		}
		names[svc.Name], paths[svc.Path] = true, true
		if svc.Port != 0 {
			ports[svc.Port] = true
		}
	}
	return nil
}

// RunChanged says whether two ways of running a project differ in anything that needs a new process
func RunChanged(a, b database.ProjectRun) bool {
	if a.Install != b.Install || a.Build != b.Build || a.Start != b.Start || a.EnvEnc != b.EnvEnc || len(a.Services) != len(b.Services) {
		return true
	}
	for i := range a.Services {
		if a.Services[i] != b.Services[i] {
			return true
		}
	}
	return false
}

// composeScript is the shell script that runs a project: the install step and the build step once (a marker file in the folder
// says they were done; "rebuild" takes the markers away), then the start command.
// A failed step ends the script, and the supervisor tries again the way it does for any process that dies.
func composeScript(install, build, start string) string {
	var b strings.Builder
	b.WriteString("set -e\n")
	if install != "" || build != "" {
		b.WriteString("mkdir -p .reneo\n")
	}
	if install != "" {
		b.WriteString("if [ ! -f .reneo/installed ]; then\n  echo '[reneo] install' || true\n")
		b.WriteString(install + "\n")
		b.WriteString("  touch .reneo/installed\nfi\n")
	}
	if build != "" {
		b.WriteString("if [ ! -f .reneo/built ]; then\n  echo '[reneo] build' || true\n")
		b.WriteString(build + "\n")
		b.WriteString("  touch .reneo/built\nfi\n")
	}
	// not "exec": the start command may be several commands joined with && or a script; a stop ends the whole process group
	b.WriteString(start + "\n")
	return b.String()
}

// RebuildMarkers are the files in a folder that say the install and the build were done
func RebuildMarkers(dir string) []string {
	return []string{filepath.Join(dir, ".reneo", "installed"), filepath.Join(dir, ".reneo", "built")}
}
