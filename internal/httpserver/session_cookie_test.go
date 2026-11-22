package httpserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
)

// The session cookie is Secure over https, whether the connection is https itself or a proxy says so, and is not over plain http
func TestSessionCookieIsSecureOverHTTPS(t *testing.T) {
	s := &Server{cfg: config.Config{SessionTTL: time.Hour}}
	cookie := func(r *http.Request) *http.Cookie {
		rec := httptest.NewRecorder()
		s.issueSessionCookie(rec, r, "token")
		for _, c := range rec.Result().Cookies() {
			if c.Name == sessionCookieName {
				return c
			}
		}
		t.Fatal("no session cookie")
		return nil
	}
	plain := httptest.NewRequest(http.MethodPost, "http://panel.test/login", nil)
	if c := cookie(plain); c.Secure || !c.HttpOnly {
		t.Fatalf("plain http: %+v", c)
	}
	behind := httptest.NewRequest(http.MethodPost, "http://panel.test/login", nil)
	behind.Header.Set("X-Forwarded-Proto", "https")
	if c := cookie(behind); !c.Secure || !c.HttpOnly {
		t.Fatalf("behind a proxy that says https: %+v", c)
	}
	direct := httptest.NewRequest(http.MethodPost, "https://panel.test/login", nil)
	if c := cookie(direct); !c.Secure {
		t.Fatalf("https itself: %+v", c)
	}
}
