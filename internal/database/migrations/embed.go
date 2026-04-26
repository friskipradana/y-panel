package migrations

import "embed"

// Files contains embedded Goose SQL migration assets.
//
//go:embed *.sql
var Files embed.FS
