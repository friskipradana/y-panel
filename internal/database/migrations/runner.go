package migrations

import (
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pressly/goose/v3"
)

const dialect = "postgres"

func init() {
	goose.SetBaseFS(Files)
}

type StatusRow struct {
	Version int64
	State   string
}

func Open(dsn string) (*sql.DB, error) {
	db, err := sql.Open(dialect, dsn)
	if err != nil {
		return nil, err
	}
	if err := goose.SetDialect(dialect); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func Up(db *sql.DB) error {
	return goose.Up(db, ".")
}

func Down(db *sql.DB) error {
	return goose.Down(db, ".")
}

func Version(db *sql.DB) (int64, error) {
	return goose.GetDBVersion(db)
}

func Status(db *sql.DB) ([]StatusRow, error) {
	appliedVersions, err := loadAppliedVersions(db)
	if err != nil {
		return nil, err
	}

	migrationVersions, err := listEmbeddedMigrationVersions()
	if err != nil {
		return nil, err
	}

	if len(migrationVersions) == 0 && len(appliedVersions) == 0 {
		return nil, nil
	}

	versionSet := make(map[int64]struct{}, len(migrationVersions)+len(appliedVersions))
	for _, version := range migrationVersions {
		versionSet[version] = struct{}{}
	}
	for version := range appliedVersions {
		versionSet[version] = struct{}{}
	}

	ordered := make([]int64, 0, len(versionSet))
	for version := range versionSet {
		ordered = append(ordered, version)
	}
	sort.Slice(ordered, func(i, j int) bool { return ordered[i] < ordered[j] })

	result := make([]StatusRow, 0, len(ordered))
	for _, version := range ordered {
		state := "pending"
		if appliedVersions[version] {
			state = "applied"
		}
		result = append(result, StatusRow{Version: version, State: state})
	}
	return result, nil
}

func loadAppliedVersions(db *sql.DB) (map[int64]bool, error) {
	const query = `
		SELECT version_id, is_applied
		FROM goose_db_version
		ORDER BY id ASC
	`

	rows, err := db.Query(query)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "does not exist") {
			return map[int64]bool{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	result := make(map[int64]bool)
	for rows.Next() {
		var version int64
		var applied bool
		if err := rows.Scan(&version, &applied); err != nil {
			return nil, err
		}
		result[version] = applied
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func listEmbeddedMigrationVersions() ([]int64, error) {
	entries, err := fs.ReadDir(Files, ".")
	if err != nil {
		return nil, err
	}
	versions := make([]int64, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		version, err := parseMigrationVersion(entry.Name())
		if err != nil {
			return nil, err
		}
		versions = append(versions, version)
	}
	sort.Slice(versions, func(i, j int) bool { return versions[i] < versions[j] })
	return versions, nil
}

func parseMigrationVersion(filename string) (int64, error) {
	prefix, _, ok := strings.Cut(filename, "_")
	if !ok {
		return 0, fmt.Errorf("format nama migration tidak valid: %s", filename)
	}
	version, err := strconv.ParseInt(prefix, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("gagal membaca version migration %s: %w", filename, err)
	}
	return version, nil
}

func CreateMigrationFile(dir, name string) (string, error) {
	trimmedName := sanitizeName(name)
	if trimmedName == "" {
		return "", fmt.Errorf("nama migration tidak valid")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}

	filename := fmt.Sprintf("%s_%s.sql", time.Now().UTC().Format("20060102150405"), trimmedName)
	fullPath := filepath.Join(dir, filename)
	content := "-- +goose Up\n-- SQL in section 'Up' is executed when this migration is applied.\n\n-- +goose Down\n-- SQL in section 'Down' is executed when this migration is rolled back.\n"
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		return "", err
	}
	return fullPath, nil
}

func sanitizeName(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return ""
	}
	replacer := strings.NewReplacer(" ", "_", "-", "_", "/", "_", "\\", "_")
	value = replacer.Replace(value)
	var builder strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
		case r == '_':
			builder.WriteRune(r)
		}
	}
	return strings.Trim(builder.String(), "_")
}
