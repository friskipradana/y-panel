package httpserver

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestPathAllowedJudgesWhereAPathReallyLeads(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need privileges on windows")
	}
	home := t.TempDir()
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(home, "mine"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	_ = os.Symlink(outside, filepath.Join(home, "escape"))
	_ = os.Symlink(filepath.Join(outside, "secret"), filepath.Join(home, "peek"))
	_ = os.Symlink(filepath.Join(outside, "nothing-yet"), filepath.Join(home, "dangling"))
	_ = os.Symlink(filepath.Join(home, "mine"), filepath.Join(home, "inside"))
	roots := []string{home}

	if _, err := pathAllowed(roots, filepath.Join(home, "mine"), false, true); err != nil {
		t.Errorf("a file in the folder is allowed: %v", err)
	}
	if _, err := pathAllowed(roots, filepath.Join(home, "new", "file"), false, true); err != nil {
		t.Errorf("a file that does not exist yet is allowed: %v", err)
	}
	if _, err := pathAllowed(roots, filepath.Join(home, "inside"), false, true); err != nil {
		t.Errorf("a link that stays inside is allowed: %v", err)
	}
	for _, p := range []string{filepath.Join(home, "escape"), filepath.Join(home, "escape", "secret"), filepath.Join(home, "peek"), filepath.Join(home, "dangling"), filepath.Join(home, "escape", "new")} {
		if _, err := pathAllowed(roots, p, false, true); err == nil {
			t.Errorf("%s leads outside and must be refused", p)
		}
	}
	// the link itself can be deleted or renamed, though what it points at cannot be reached
	if _, err := pathAllowed(roots, filepath.Join(home, "peek"), false, false); err != nil {
		t.Errorf("a link is its own thing when it is the one acted on: %v", err)
	}
	if _, err := pathAllowed(roots, filepath.Join(home, "escape", "secret"), false, false); err == nil {
		t.Error("a path through a link to the outside is still refused when the last part is not followed")
	}
	if _, err := pathAllowed([]string{string(filepath.Separator)}, filepath.Join(home, "escape", "secret"), true, true); err != nil {
		t.Errorf("root access reaches everywhere: %v", err)
	}
}

func TestCopyKeepsLinksAsLinksAndFilesMasked(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need privileges on windows")
	}
	src := t.TempDir()
	outside := filepath.Join(t.TempDir(), "secret")
	_ = os.WriteFile(outside, []byte("secret"), 0o600)
	_ = os.Symlink(outside, filepath.Join(src, "link"))
	_ = os.WriteFile(filepath.Join(src, "tool"), []byte("x"), 0o4755)
	dst := filepath.Join(t.TempDir(), "copy")
	if err := copyPathRecursive(src, dst); err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(filepath.Join(dst, "link"))
	if err != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("the link must be copied as a link: %v %v", info, err)
	}
	if tool, _ := os.Lstat(filepath.Join(dst, "tool")); tool.Mode()&os.ModeSetuid != 0 {
		t.Fatal("a copied file must not keep a setuid bit")
	}
}
