package httpserver

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestFindSourceDirFindsTheFolderWithThePackage(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "package.json"), `{}`)
	if findSourceDir(root, "") != root {
		t.Fatal("the root of the archive")
	}
	one := t.TempDir()
	write(t, filepath.Join(one, "my-app", "package.json"), `{}`)
	if findSourceDir(one, "") != filepath.Join(one, "my-app") {
		t.Fatal("the one folder the archive holds")
	}
	asked := t.TempDir()
	write(t, filepath.Join(asked, "a", "package.json"), `{}`)
	write(t, filepath.Join(asked, "b", "package.json"), `{}`)
	if findSourceDir(asked, "b") != filepath.Join(asked, "b") {
		t.Fatal("the folder that was asked for")
	}
	if findSourceDir(asked, "../x") == filepath.Join(asked, "..", "x") || findSourceDir(t.TempDir(), "") != "" {
		t.Fatal("nothing outside the archive, and nothing when there is no package")
	}
}

func TestPlanBuildFollowsTheLockFile(t *testing.T) {
	for lock, manager := range map[string]string{"bun.lockb": "bun", "bun.lock": "bun", "pnpm-lock.yaml": "pnpm", "yarn.lock": "yarn", "package-lock.json": "npm", "": "npm"} {
		dir := t.TempDir()
		write(t, filepath.Join(dir, "package.json"), `{"scripts":{"build":"vite build"}}`)
		if lock != "" {
			write(t, filepath.Join(dir, lock), "x")
		}
		plan, err := planBuild(dir)
		if err != nil || plan.Manager != manager {
			t.Errorf("lock %q: got %+v, %v; want %s", lock, plan, err, manager)
		}
	}
	noScript := t.TempDir()
	write(t, filepath.Join(noScript, "package.json"), `{"scripts":{"start":"node x"}}`)
	if _, err := planBuild(noScript); err == nil || !strings.Contains(err.Error(), "build") {
		t.Fatalf("a package without a build script cannot be built: %v", err)
	}
	if _, err := planBuild(t.TempDir()); err == nil {
		t.Fatal("no package.json")
	}
}

func TestFindBuiltOutput(t *testing.T) {
	cases := map[string]string{
		"dist/index.html":                "dist",
		"build/index.html":               "build",
		".output/public/index.html":      ".output/public",
		"dist/my-app/browser/index.html": "dist/my-app/browser",
		"dist/site/index.html":           "dist/site",
	}
	for file, want := range cases {
		dir := t.TempDir()
		write(t, filepath.Join(dir, filepath.FromSlash(file)), "<html>")
		if got := findBuiltOutput(dir); got != filepath.Join(dir, filepath.FromSlash(want)) {
			t.Errorf("%s: got %q, want %q", file, got, want)
		}
	}
	if findBuiltOutput(t.TempDir()) != "" {
		t.Fatal("no output, no folder")
	}
}

func TestBuildSourceRunsInstallAndBuildAndFindsTheSite(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("needs /bin/sh")
	}
	dir := t.TempDir()
	var phases, lines []string
	plan := &buildPlan{Dir: dir, Manager: "sh", Install: "echo installing packages", Build: "mkdir -p dist && echo '<h1>ok</h1>' > dist/index.html && echo built"}
	out, err := buildSource(context.Background(), plan, "", func(p string) { phases = append(phases, p) }, func(l string) { lines = append(lines, l) })
	if err != nil {
		t.Fatal(err)
	}
	if out != filepath.Join(dir, "dist") {
		t.Fatalf("output %q", out)
	}
	if strings.Join(phases, ",") != "installing,building" {
		t.Fatalf("phases %v", phases)
	}
	joined := strings.Join(lines, "\n")
	if !strings.Contains(joined, "installing packages") || !strings.Contains(joined, "built") {
		t.Fatalf("the log shows what the tools print:\n%s", joined)
	}
}

func TestBuildSourceExplainsAMissingToolAndAFailingBuild(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("needs /bin/sh")
	}
	noop := func(string) {}
	_, err := buildSource(context.Background(), &buildPlan{Dir: t.TempDir(), Manager: "no-such-manager-xyz", Install: "no-such-manager-xyz install", Build: "true"}, "", noop, noop)
	if err == nil || !strings.Contains(err.Error(), "belum terpasang") {
		t.Fatalf("a missing package manager is explained: %v", err)
	}
	_, err = buildSource(context.Background(), &buildPlan{Dir: t.TempDir(), Manager: "sh", Install: "true", Build: "echo broken >&2; exit 3"}, "", noop, noop)
	if err == nil || !strings.Contains(err.Error(), "gagal") {
		t.Fatalf("a failing build is reported: %v", err)
	}
	_, err = buildSource(context.Background(), &buildPlan{Dir: t.TempDir(), Manager: "sh", Install: "true", Build: "true"}, "", noop, noop)
	if err == nil || !strings.Contains(err.Error(), "index.html") {
		t.Fatalf("a build that leaves no site is reported: %v", err)
	}
}
