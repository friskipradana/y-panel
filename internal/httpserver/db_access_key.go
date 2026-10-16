package httpserver

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// Public addresses of a database (the full-page manager and the Adminer entry) carry an opaque
// key instead of the numeric ID: an HMAC of the ID under the panel's encryption key. Keys cannot
// be enumerated or derived from an ID without the secret, and every use is still checked against
// the signed-in owner.

const dbAccessKeyLen = 32

func (s *Server) databaseAccessKey(id int64) string {
	mac := hmac.New(sha256.New, []byte("reneo.db.access.v1|"+s.cfg.EncryptionKey))
	mac.Write([]byte(strconv.FormatInt(id, 10)))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))[:dbAccessKeyLen]
}

// databaseByAccessKey finds one of the caller's own databases by its key.
func (s *Server) databaseByAccessKey(u *database.User, key string) *database.ManagedDatabase {
	key = strings.TrimSpace(key)
	if u == nil || len(key) != dbAccessKeyLen || s.database == nil {
		return nil
	}
	items, err := s.database.ListManagedDatabases(u.ID, false)
	if err != nil {
		return nil
	}
	for i := range items {
		if subtle.ConstantTimeCompare([]byte(s.databaseAccessKey(items[i].ID)), []byte(key)) == 1 {
			return &items[i]
		}
	}
	return nil
}
