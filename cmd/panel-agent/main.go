package main

import (
	"bufio"
	"database/sql"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/database/migrations"
	"github.com/friskipradana/panel-desktop-ui/internal/httpserver"
	"github.com/friskipradana/panel-desktop-ui/internal/users"
)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "reset-primary-password":
			if err := runResetPrimaryPassword(os.Args[2:]); err != nil {
				log.Fatalf("reset primary password: %v", err)
			}
			return
		case "migrate":
			if err := runMigrate(os.Args[2:]); err != nil {
				log.Fatalf("migrate: %v", err)
			}
			return
		}
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	srv := httpserver.New(cfg)
	defer func() {
		if err := srv.Close(); err != nil {
			log.Printf("ui-panel-agent close warning: %v", err)
		}
	}()

	srv.RestoreTunnels()

	log.Printf("ui-panel-agent listening on %s", cfg.BindAddr)
	if err := http.ListenAndServe(cfg.BindAddr, srv); err != nil {
		log.Fatalf("listen and serve: %v", err)
	}
}

func runResetPrimaryPassword(args []string) error {
	fs := flag.NewFlagSet("reset-primary-password", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	passwordStdin := fs.Bool("password-stdin", false, "read the new password from stdin")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if !*passwordStdin {
		return fmt.Errorf("gunakan --password-stdin")
	}

	cfg, err := loadRuntimeConfig()
	if err != nil {
		return err
	}

	password, err := readPasswordFromStdin()
	if err != nil {
		return err
	}
	if err := users.ValidatePassword(password); err != nil {
		return err
	}

	db := database.New(database.Config{
		Enabled: cfg.DatabaseEnable,
		DSN:     cfg.DatabaseDSN,
	})
	defer db.Close()

	dbStatus := db.Status()
	if !dbStatus.Connected {
		if dbStatus.LastError != "" {
			return fmt.Errorf("database not connected: %s", dbStatus.LastError)
		}
		return fmt.Errorf("database not connected")
	}

	authMgr := auth.NewManager(db, cfg.SessionTTL)
	targetUser, err := db.GetPrimarySuperadmin()
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "no rows") {
			return fmt.Errorf("akun utama panel tidak ditemukan: tabel users kosong")
		}
		return fmt.Errorf("gagal menemukan akun utama panel: %w", err)
	}
	if targetUser == nil {
		return fmt.Errorf("akun utama panel tidak ditemukan")
	}
	if err := authMgr.ResetPassword(targetUser.ID, password); err != nil {
		return err
	}

	log.Printf("[auth] primary panel password reset actor=%q target=%q source=runtime-cli", "root", targetUser.Username)
	fmt.Printf("Password akun utama panel (%s) berhasil diperbarui.\n", targetUser.Username)
	return nil
}

func readPasswordFromStdin() (string, error) {
	reader := bufio.NewReader(os.Stdin)
	value, err := reader.ReadString('\n')
	if err != nil && err != io.EOF {
		return "", fmt.Errorf("gagal membaca password dari stdin: %w", err)
	}
	password := strings.TrimSpace(value)
	if password == "" {
		return "", fmt.Errorf("password baru tidak boleh kosong")
	}
	return password, nil
}

func loadRuntimeEnv() error {
	envPath := strings.TrimSpace(os.Getenv("PANEL_ENV_FILE"))
	if envPath == "" {
		envPath = filepath.Join("/etc", "ui-panel", "agent.env")
	}
	data, err := os.ReadFile(envPath)
	if err != nil {
		return err
	}
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		key, value, ok := strings.Cut(trimmed, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		_ = os.Setenv(key, strings.TrimSpace(value))
	}
	_ = os.Setenv("PANEL_ENV_FILE", envPath)
	return nil
}

func loadRuntimeConfig() (config.Config, error) {
	if err := loadRuntimeEnv(); err != nil {
		return config.Config{}, fmt.Errorf("load runtime env: %w", err)
	}
	cfg, err := config.Load()
	if err != nil {
		return config.Config{}, fmt.Errorf("load config: %w", err)
	}
	return cfg, nil
}

func openMigrationDB() (*sql.DB, error) {
	cfg, err := loadRuntimeConfig()
	if err != nil {
		return nil, err
	}
	if !cfg.DatabaseEnable {
		return nil, fmt.Errorf("database dinonaktifkan")
	}
	db, err := migrations.Open(cfg.DatabaseDSN)
	if err != nil {
		return nil, err
	}
	return db, nil
}

func runMigrate(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("gunakan subcommand: up | down | status | create")
	}

	switch args[0] {
	case "up":
		db, err := openMigrationDB()
		if err != nil {
			return err
		}
		defer db.Close()
		if err := migrations.Up(db); err != nil {
			return err
		}
		version, err := migrations.Version(db)
		if err != nil {
			return err
		}
		fmt.Printf("Migration up berhasil. Version saat ini: %d\n", version)
		return nil
	case "down", "rollback":
		db, err := openMigrationDB()
		if err != nil {
			return err
		}
		defer db.Close()
		if err := migrations.Down(db); err != nil {
			return err
		}
		version, err := migrations.Version(db)
		if err != nil {
			return err
		}
		fmt.Printf("Rollback migration terakhir berhasil. Version saat ini: %d\n", version)
		return nil
	case "status":
		db, err := openMigrationDB()
		if err != nil {
			return err
		}
		defer db.Close()
		rows, err := migrations.Status(db)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			fmt.Println("Belum ada migration yang terdaftar.")
			return nil
		}
		fmt.Println("Version\tState")
		for _, row := range rows {
			fmt.Printf("%d\t%s\n", row.Version, row.State)
		}
		return nil
	case "create":
		if len(args) < 2 {
			return fmt.Errorf("gunakan: migrate create <nama_migration>")
		}
		path, err := migrations.CreateMigrationFile(filepath.Join("internal", "database", "migrations"), strings.Join(args[1:], "_"))
		if err != nil {
			return err
		}
		fmt.Printf("Migration template dibuat: %s\n", path)
		return nil
	default:
		return fmt.Errorf("subcommand migration tidak dikenal: %s", args[0])
	}
}
