package httpserver

import (
	"net/http"
	"testing"
)

// ServeMux panics when two patterns overlap without one being more specific; a route added
// next to a wildcard (users/summary beside users/{id}) must not take the server down at start.
func TestRoutesRegisterWithoutConflict(t *testing.T) {
	s := &Server{mux: http.NewServeMux(), authedFrontend: http.NotFoundHandler()}
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("route registration panicked: %v", r)
		}
	}()
	s.routes()
}
