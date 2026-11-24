package userdb

import (
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
)

const (
	exportTimeout = 15 * time.Minute
	importTimeout = 45 * time.Minute
)

// ExportSQL streams a full SQL dump of a PostgreSQL, MySQL, or MariaDB user database
// directly from the database container to w using pg_dump / mysqldump / mariadb-dump.
func ExportSQL(ctx context.Context, c Conn, w io.Writer) error {
	if !isSQL(c.Engine) {
		return errors.New("SQL export is available for PostgreSQL, MySQL, and MariaDB only")
	}
	ctx, cancel := context.WithTimeout(ctx, exportTimeout)
	defer cancel()

	var (
		env  map[string]string
		args []string
	)
	switch c.Engine.ID {
	case "postgres":
		env = map[string]string{"PGPASSWORD": c.Password}
		args = []string{"pg_dump", "--no-owner", "--no-acl", "-U", c.User, "-d", c.Database}
	case "mariadb":
		env = map[string]string{"MYSQL_PWD": c.Password}
		args = []string{"mariadb-dump", "--single-transaction", "--routines", "--triggers", "-u", c.User, c.Database}
	default:
		env = map[string]string{"MYSQL_PWD": c.Password}
		args = []string{"mysqldump", "--single-transaction", "--routines", "--triggers", "-u", c.User, c.Database}
	}

	dockerArgs := []string{"exec", "-i"}
	environ := os.Environ()
	for k, v := range env {
		dockerArgs = append(dockerArgs, "-e", k)
		environ = append(environ, k+"="+v)
	}
	dockerArgs = append(dockerArgs, containerName(c))
	dockerArgs = append(dockerArgs, args...)

	cmd := exec.CommandContext(ctx, "docker", dockerArgs...)
	cmd.Env = environ
	cmd.Stdout = w
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("export failed: %s", msg)
	}
	return nil
}

// ImportSQL streams a .sql or .sql.gz dump directly into the database container via psql / mysql / mariadb.
func ImportSQL(ctx context.Context, c Conn, src io.Reader, isGzip bool) (string, error) {
	if !isSQL(c.Engine) {
		return "", errors.New("SQL import is available for PostgreSQL, MySQL, and MariaDB only")
	}
	ctx, cancel := context.WithTimeout(ctx, importTimeout)
	defer cancel()

	reader := src
	if isGzip {
		gz, err := gzip.NewReader(src)
		if err != nil {
			return "", fmt.Errorf("invalid gzip archive: %w", err)
		}
		defer gz.Close()
		reader = gz
	}

	var (
		env  map[string]string
		args []string
	)
	switch c.Engine.ID {
	case "postgres":
		env = map[string]string{"PGPASSWORD": c.Password}
		args = []string{"psql", "-v", "ON_ERROR_STOP=1", "-U", c.User, "-d", c.Database}
	case "mariadb":
		env = map[string]string{"MYSQL_PWD": c.Password}
		args = []string{"mariadb", "-u", c.User, c.Database}
	default:
		env = map[string]string{"MYSQL_PWD": c.Password}
		args = []string{"mysql", "-u", c.User, c.Database}
	}

	dockerArgs := []string{"exec", "-i"}
	environ := os.Environ()
	for k, v := range env {
		dockerArgs = append(dockerArgs, "-e", k)
		environ = append(environ, k+"="+v)
	}
	dockerArgs = append(dockerArgs, containerName(c))
	dockerArgs = append(dockerArgs, args...)

	cmd := exec.CommandContext(ctx, "docker", dockerArgs...)
	cmd.Env = environ
	cmd.Stdin = reader
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(out.String())
		if len(msg) > 800 {
			msg = msg[len(msg)-800:]
		}
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("import failed: %s", msg)
	}
	summary := strings.TrimSpace(out.String())
	if len(summary) > 400 {
		summary = summary[:400]
	}
	return summary, nil
}

// ImportSQLFile imports a .sql, .sql.gz, or .zip (extracting the first .sql entry on the fly) from disk.
func ImportSQLFile(ctx context.Context, c Conn, filePath, originalName string) (string, error) {
	lower := strings.ToLower(strings.TrimSpace(originalName))
	if strings.HasSuffix(lower, ".zip") {
		zr, err := zip.OpenReader(filePath)
		if err != nil {
			return "", fmt.Errorf("invalid zip archive: %w", err)
		}
		defer zr.Close()
		var target *zip.File
		for _, f := range zr.File {
			if f.FileInfo().IsDir() || strings.HasPrefix(f.Name, "__MACOSX/") {
				continue
			}
			if strings.HasSuffix(strings.ToLower(f.Name), ".sql") {
				target = f
				break
			}
		}
		if target == nil {
			return "", errors.New("no .sql file found inside the .zip archive")
		}
		rc, err := target.Open()
		if err != nil {
			return "", fmt.Errorf("could not read %s from zip: %w", target.Name, err)
		}
		defer rc.Close()
		return ImportSQL(ctx, c, rc, false)
	}

	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	return ImportSQL(ctx, c, f, strings.HasSuffix(lower, ".gz"))
}
