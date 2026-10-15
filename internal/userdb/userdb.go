// Package userdb runs the databases that panel users create (PostgreSQL, MySQL,
// MariaDB, MongoDB, Redis). Each one is a Docker container bound to 127.0.0.1 with
// its own volume, so it never shares state with the panel's own database.
package userdb

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

const (
	// PortStart..PortEnd is the host port range handed to user databases.
	PortStart = 20000
	PortEnd   = 29999

	labelKind  = "reneo.kind"
	labelOwner = "reneo.owner"
)

// Engine describes how one database product is started.
type Engine struct {
	ID             string `json:"id"`
	Label          string `json:"label"`
	Repository     string `json:"-"`
	DefaultVersion string `json:"defaultVersion"`
	// Versions are the image tags offered in the UI, newest first
	Versions     []string `json:"versions"`
	InternalPort int      `json:"port"`
	DataDir      string   `json:"-"`
	// HasDatabaseName / HasUser say which credentials the engine actually uses
	HasDatabaseName bool `json:"hasDatabase"`
	HasUser         bool `json:"hasUser"`
}

var engines = []Engine{
	{ID: "postgres", Label: "PostgreSQL", Repository: "postgres", DefaultVersion: "16-alpine", Versions: []string{"17-alpine", "16-alpine", "15-alpine", "14-alpine", "13-alpine"}, InternalPort: 5432, DataDir: "/var/lib/postgresql/data", HasDatabaseName: true, HasUser: true},
	{ID: "mysql", Label: "MySQL", Repository: "mysql", DefaultVersion: "8.4", Versions: []string{"9.0", "8.4", "8.0"}, InternalPort: 3306, DataDir: "/var/lib/mysql", HasDatabaseName: true, HasUser: true},
	{ID: "mariadb", Label: "MariaDB", Repository: "mariadb", DefaultVersion: "11.4", Versions: []string{"11.4", "10.11", "10.6"}, InternalPort: 3306, DataDir: "/var/lib/mysql", HasDatabaseName: true, HasUser: true},
	{ID: "mongodb", Label: "MongoDB", Repository: "mongo", DefaultVersion: "7", Versions: []string{"8", "7", "6"}, InternalPort: 27017, DataDir: "/data/db", HasDatabaseName: true, HasUser: true},
	{ID: "redis", Label: "Redis", Repository: "redis", DefaultVersion: "7-alpine", Versions: []string{"8-alpine", "7-alpine", "6-alpine"}, InternalPort: 6379, DataDir: "/data"},
}

// Engines lists the supported products.
func Engines() []Engine { return append([]Engine(nil), engines...) }

// Lookup finds an engine by id.
func Lookup(id string) (Engine, bool) {
	for _, e := range engines {
		if e.ID == id {
			return e, true
		}
	}
	return Engine{}, false
}

var (
	nameRe    = regexp.MustCompile(`^[a-z][a-z0-9-]{1,30}[a-z0-9]$`)
	versionRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$`)
)

// ValidateName checks the label a user gives a database.
func ValidateName(name string) error {
	if !nameRe.MatchString(name) {
		return errors.New("name must be 3-32 characters: lowercase letters, numbers and hyphens, starting with a letter")
	}
	return nil
}

// ValidateVersion accepts a plain image tag only (no registry, no digest).
func ValidateVersion(version string) error {
	if version == "" {
		return nil
	}
	if !versionRe.MatchString(version) {
		return errors.New("version must be a plain tag such as 16-alpine or 8.4")
	}
	return nil
}

// SQLIdent turns a database label into an identifier safe for every engine.
func SQLIdent(name string) string {
	return strings.ReplaceAll(name, "-", "_")
}

// ContainerName is the docker container (and volume prefix) for a database row.
func ContainerName(id int64) string { return fmt.Sprintf("reneo-db-%d", id) }

func volumeName(id int64) string { return ContainerName(id) + "-data" }

// RandomPassword returns an alphanumeric secret with no characters that need escaping.
func RandomPassword(length int) (string, error) {
	const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	out := make([]byte, length)
	max := big.NewInt(int64(len(alphabet)))
	for i := range out {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		out[i] = alphabet[n.Int64()]
	}
	return string(out), nil
}

// Spec is everything needed to create one container.
type Spec struct {
	ID         int64
	OwnerID    int64
	OwnerName  string
	Engine     Engine
	Version    string
	HostPort   int
	Database   string
	User       string
	Password   string
	MemoryMB   int
	CPULimit   float64
	envNames   []string
	envValues  []string
	runCommand []string
}

// ImageRef is repository:tag.
func (s Spec) ImageRef() string {
	version := s.Version
	if version == "" {
		version = s.Engine.DefaultVersion
	}
	return s.Engine.Repository + ":" + version
}

// build fills the engine specific environment and command.
func (s *Spec) build() {
	set := func(key, value string) {
		s.envNames = append(s.envNames, key)
		s.envValues = append(s.envValues, key+"="+value)
	}
	switch s.Engine.ID {
	case "postgres":
		set("POSTGRES_DB", s.Database)
		set("POSTGRES_USER", s.User)
		set("POSTGRES_PASSWORD", s.Password)
	case "mysql":
		set("MYSQL_DATABASE", s.Database)
		set("MYSQL_USER", s.User)
		set("MYSQL_PASSWORD", s.Password)
		set("MYSQL_ROOT_PASSWORD", s.Password)
	case "mariadb":
		set("MARIADB_DATABASE", s.Database)
		set("MARIADB_USER", s.User)
		set("MARIADB_PASSWORD", s.Password)
		set("MARIADB_ROOT_PASSWORD", s.Password)
	case "mongodb":
		set("MONGO_INITDB_DATABASE", s.Database)
		set("MONGO_INITDB_ROOT_USERNAME", s.User)
		set("MONGO_INITDB_ROOT_PASSWORD", s.Password)
	case "redis":
		// the password is read from the environment by a shell wrapper so it never shows in `ps`
		set("REDIS_PASSWORD", s.Password)
		s.runCommand = []string{"sh", "-c", `exec redis-server --appendonly yes --requirepass "$REDIS_PASSWORD"`}
	}
}

// RunArgs returns the docker arguments (secrets are passed by name; their values
// go in the process environment, see Create).
func (s Spec) RunArgs() []string {
	s.envNames, s.envValues, s.runCommand = nil, nil, nil
	s.build()
	args := []string{
		"run", "-d",
		"--name", ContainerName(s.ID),
		"--restart", "unless-stopped",
		"-p", fmt.Sprintf("127.0.0.1:%d:%d", s.HostPort, s.Engine.InternalPort),
		"-v", volumeName(s.ID) + ":" + s.Engine.DataDir,
		"--label", labelKind + "=database",
		"--label", fmt.Sprintf("%s=%d", labelOwner, s.OwnerID),
		// the same labels the panel puts on every container it creates, so the Docker window lists this one for its owner
		"--label", fmt.Sprintf("panel.owner_id=%d", s.OwnerID),
		"--label", "panel.owner_username=" + s.OwnerName,
		"--label", "panel.source=database",
	}
	if s.MemoryMB > 0 {
		args = append(args, "--memory", fmt.Sprintf("%dm", s.MemoryMB))
	}
	if s.CPULimit > 0 {
		args = append(args, "--cpus", fmt.Sprintf("%.2f", s.CPULimit))
	}
	for _, name := range s.envNames {
		args = append(args, "-e", name)
	}
	args = append(args, s.ImageRef())
	args = append(args, s.runCommand...)
	return args
}

func docker(ctx context.Context, env []string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", args...)
	if env != nil {
		cmd.Env = append(os.Environ(), env...)
	}
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		if text == "" {
			text = err.Error()
		}
		return text, fmt.Errorf("docker %s: %s", args[0], firstLine(text))
	}
	return text, nil
}

func firstLine(text string) string {
	if i := strings.IndexByte(text, '\n'); i >= 0 {
		text = text[:i]
	}
	if len(text) > 240 {
		text = text[:240]
	}
	return text
}

// Create pulls the image if needed and starts the container.
func Create(spec Spec) error {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()
	s := spec
	s.build()
	if _, err := docker(ctx, nil, "image", "inspect", spec.ImageRef()); err != nil {
		if _, pullErr := docker(ctx, nil, "pull", spec.ImageRef()); pullErr != nil {
			return pullErr
		}
	}
	if _, err := docker(ctx, s.envValues, spec.RunArgs()...); err != nil {
		// do not leave a half-created container or volume behind
		_ = Remove(spec.ID)
		return err
	}
	return nil
}

// State returns running, exited, missing... for one container.
func State(id int64) string {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := docker(ctx, nil, "inspect", "-f", "{{.State.Status}}", ContainerName(id))
	if err != nil {
		return "missing"
	}
	return strings.TrimSpace(out)
}

// States returns the state of every managed database container in one call.
func States() map[string]string {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := docker(ctx, nil, "ps", "-a", "--filter", "label="+labelKind+"=database", "--format", "{{.Names}}\t{{.State}}")
	result := map[string]string{}
	if err != nil {
		return result
	}
	for _, line := range strings.Split(out, "\n") {
		parts := strings.Split(strings.TrimSpace(line), "\t")
		if len(parts) == 2 {
			result[parts[0]] = parts[1]
		}
	}
	return result
}

func Start(id int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	_, err := docker(ctx, nil, "start", ContainerName(id))
	return err
}

func Stop(id int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	_, err := docker(ctx, nil, "stop", ContainerName(id))
	return err
}

// Remove deletes the container and its data volume.
func Remove(id int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	_, rmErr := docker(ctx, nil, "rm", "-f", ContainerName(id))
	_, volErr := docker(ctx, nil, "volume", "rm", "-f", volumeName(id))
	if rmErr != nil && !strings.Contains(rmErr.Error(), "No such container") {
		return rmErr
	}
	if volErr != nil && !strings.Contains(volErr.Error(), "No such volume") {
		return volErr
	}
	return nil
}

// ConnectionURL builds the URI shown to the owner.
func ConnectionURL(engine Engine, host string, port int, database, user, password string) string {
	switch engine.ID {
	case "postgres":
		return fmt.Sprintf("postgresql://%s:%s@%s:%d/%s", user, password, host, port, database)
	case "mysql", "mariadb":
		return fmt.Sprintf("mysql://%s:%s@%s:%d/%s", user, password, host, port, database)
	case "mongodb":
		return fmt.Sprintf("mongodb://%s:%s@%s:%d/%s?authSource=admin", user, password, host, port, database)
	case "redis":
		return fmt.Sprintf("redis://:%s@%s:%d", password, host, port)
	}
	return ""
}
