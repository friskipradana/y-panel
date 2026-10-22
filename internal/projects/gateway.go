package projects

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sort"
	"strings"
	"time"
)

// A project made of several processes has one address: the port the panel gave the project. The gateway listens there, on the loopback
// only, and hands each request to the process whose path is the longest start of the request path ("/api" before "/"). A process
// that is not answering gives a 502 that names it, not a connection that hangs.

type gatewayRoute struct {
	name   string
	prefix string // "" takes the rest; "/api" takes /api and what is under it
	port   int
}

type gateway struct {
	srv *http.Server
}

func routeMatches(prefix, requestPath string) bool {
	if prefix == "" {
		return true
	}
	return requestPath == prefix || strings.HasPrefix(requestPath, prefix+"/")
}

// pickRoute is the route for a request path: the longest prefix that starts it
func pickRoute(routes []gatewayRoute, requestPath string) *gatewayRoute {
	var best *gatewayRoute
	for i := range routes {
		if routeMatches(routes[i].prefix, requestPath) && (best == nil || len(routes[i].prefix) > len(best.prefix)) {
			best = &routes[i]
		}
	}
	return best
}

// startGateway listens on 127.0.0.1:port and sends requests to the routes; logf says what went wrong with a process
func startGateway(port int, routes []gatewayRoute, logf func(format string, args ...any)) (*gateway, error) {
	ordered := append([]gatewayRoute(nil), routes...)
	sort.Slice(ordered, func(i, j int) bool { return len(ordered[i].prefix) > len(ordered[j].prefix) })

	proxies := make(map[string]*httputil.ReverseProxy, len(ordered))
	for _, route := range ordered {
		route := route
		target := &url.URL{Scheme: "http", Host: fmt.Sprintf("%s:%d", loopback, route.port)}
		proxy := httputil.NewSingleHostReverseProxy(target)
		proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
			logf("the process %s did not answer: %v", route.name, err)
			http.Error(w, fmt.Sprintf("the process %q is not answering yet", route.name), http.StatusBadGateway)
		}
		proxies[route.name] = proxy
	}

	mux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		route := pickRoute(ordered, r.URL.Path)
		if route == nil {
			http.NotFound(w, r)
			return
		}
		proxies[route.name].ServeHTTP(w, r)
	})

	ln, err := net.Listen("tcp", fmt.Sprintf("%s:%d", loopback, port))
	if err != nil {
		return nil, fmt.Errorf("the port %d of the project is taken: %w", port, err)
	}
	g := &gateway{srv: &http.Server{Handler: mux, ReadHeaderTimeout: 15 * time.Second}}
	go func() { _ = g.srv.Serve(ln) }()
	return g, nil
}

// Close stops listening and ends the connections still open
func (g *gateway) Close() {
	if g == nil || g.srv == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := g.srv.Shutdown(ctx); err != nil {
		_ = g.srv.Close()
	}
}
