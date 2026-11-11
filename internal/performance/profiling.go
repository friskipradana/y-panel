package performance

import (
	"net/http"
	"net/http/pprof"
)

// RegisterPprofRoutes attaches standard Go pprof handlers to a mux under /debug/pprof/.
// Callers must ensure this is gated behind strict authentication and config flags.
func RegisterPprofRoutes(mux *http.ServeMux, wrap func(http.Handler) http.Handler) {
	if mux == nil {
		return
	}
	if wrap == nil {
		wrap = func(h http.Handler) http.Handler { return h }
	}
	mux.Handle("GET /debug/pprof/", wrap(http.HandlerFunc(pprof.Index)))
	mux.Handle("GET /debug/pprof/cmdline", wrap(http.HandlerFunc(pprof.Cmdline)))
	mux.Handle("GET /debug/pprof/profile", wrap(http.HandlerFunc(pprof.Profile)))
	mux.Handle("GET /debug/pprof/symbol", wrap(http.HandlerFunc(pprof.Symbol)))
	mux.Handle("GET /debug/pprof/trace", wrap(http.HandlerFunc(pprof.Trace)))
}

