package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/httpserver"
)

// runSeedPlans brings the example hosting plans (Starter, Pro, Bisnis) into the database: `seed-plans [--force] [--dry-run] [--yes] [--only starter,pro]`
func runSeedPlans(args []string) error {
	fs := flag.NewFlagSet("seed-plans", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	force := fs.Bool("force", false, "")
	dryRun := fs.Bool("dry-run", false, "")
	yes := fs.Bool("yes", false, "")
	only := fs.String("only", "", "")
	if err := fs.Parse(args); err != nil {
		return fmt.Errorf("opsi tidak dikenal; pakai --force, --dry-run, --yes, --only starter,pro,bisnis")
	}
	var slugs []string
	for _, slug := range strings.Split(*only, ",") {
		if slug = strings.TrimSpace(slug); slug != "" {
			slugs = append(slugs, slug)
		}
	}

	cfg, err := loadRuntimeConfig()
	if err != nil {
		return err
	}
	db := database.New(database.Config{Enabled: cfg.DatabaseEnable, DSN: cfg.DatabaseDSN})
	defer db.Close()

	// what would happen first, so a forced overwrite is confirmed with the real differences in front of the operator
	preview, err := httpserver.SeedHostingPlans(db, httpserver.SeedPlansOptions{Force: *force, DryRun: true, Slugs: slugs})
	if err != nil {
		return err
	}
	printSeedResults(preview, true)
	if *dryRun {
		return nil
	}
	overwrites := 0
	for _, r := range preview {
		if r.Action == "updated" {
			overwrites++
		}
	}
	if overwrites > 0 && !*yes {
		fmt.Printf("\n%d paket akan ditimpa dengan nilai contoh. Akun yang sudah memakai paket itu tetap pada kuotanya; harga baru berlaku di pembelian dan perpanjangan berikutnya.\nLanjutkan? [y/N]: ", overwrites)
		answer, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		switch strings.ToLower(strings.TrimSpace(answer)) {
		case "y", "ya", "yes":
		default:
			fmt.Println("Dibatalkan.")
			return nil
		}
	}
	if _, err := httpserver.SeedHostingPlans(db, httpserver.SeedPlansOptions{Force: *force, Slugs: slugs}); err != nil {
		return err
	}
	fmt.Println("\nSelesai.")
	return nil
}

func printSeedResults(results []httpserver.SeedPlanResult, dryRun bool) {
	label := map[string]string{
		"created":   "dibuat",
		"unchanged": "sudah sama",
		"updated":   "ditimpa",
		"kept":      "dibiarkan (berbeda dari contoh; pakai --force untuk menimpa)",
	}
	if dryRun {
		label["created"], label["updated"] = "akan dibuat", "akan ditimpa"
	}
	for _, r := range results {
		fmt.Printf("  %-8s %s\n", r.Slug, label[r.Action])
		for _, change := range r.Changes {
			fmt.Printf("             %s\n", change)
		}
	}
	if len(results) == 0 {
		fmt.Println("  tidak ada paket contoh yang dipilih")
	}
}
