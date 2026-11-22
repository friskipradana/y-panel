//go:build !windows

package main

import (
	"errors"
	"os"
)

// requireRoot refuses the maintenance commands (password reset, migrations, plan seeding) to anyone but root. They read the
// panel's configuration and change its data; an account of the panel, even a superadmin, reaches them only through sudo.
func requireRoot() error {
	if os.Geteuid() != 0 {
		return errors.New("perintah ini hanya untuk root; jalankan dengan sudo (hanya superadmin yang punya sudo)")
	}
	return nil
}
