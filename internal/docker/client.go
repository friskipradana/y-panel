package docker

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/performance"
)

const (
	defaultReadTimeout    = 10 * time.Second
	defaultOpTimeout      = 30 * time.Second
	defaultLongOpTimeout  = 5 * time.Minute
	containersCacheTTL    = 5 * time.Second
	imagesCacheTTL        = 15 * time.Second
	networksCacheTTL      = 15 * time.Second
	volumesCacheTTL       = 15 * time.Second
	versionsCacheTTL      = 5 * time.Minute
	inspectWorkerMax      = 8
	defaultDockerUnixSock = "/var/run/docker.sock"
)

type ttlCache[T any] struct {
	mu       sync.Mutex
	ttl      time.Duration
	val      T
	valid    bool
	fetched  time.Time
	gen      uint64
	inFlight bool
	done     chan struct{}
}

func newTTLCache[T any](ttl time.Duration) *ttlCache[T] {
	return &ttlCache[T]{ttl: ttl}
}

func (c *ttlCache[T]) Get(build func() (T, error)) (T, error) {
	for {
		c.mu.Lock()
		if c.valid && time.Since(c.fetched) < c.ttl {
			val := c.val
			c.mu.Unlock()
			return val, nil
		}
		if c.inFlight {
			done := c.done
			c.mu.Unlock()
			<-done
			continue
		}
		c.inFlight = true
		c.done = make(chan struct{})
		startGen := c.gen
		done := c.done
		c.mu.Unlock()

		val, err := build()

		c.mu.Lock()
		if err == nil && c.gen == startGen {
			c.val = val
			c.valid = true
			c.fetched = time.Now()
		}
		c.inFlight = false
		close(done)
		c.done = nil
		c.mu.Unlock()

		if err != nil {
			var zero T
			return zero, err
		}
		return val, nil
	}
}

// Peek returns a currently cached value if valid without triggering a build.
func (c *ttlCache[T]) Peek() (T, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.valid && time.Since(c.fetched) < c.ttl {
		return c.val, true
	}
	var zero T
	return zero, false
}

func (c *ttlCache[T]) Invalidate() {
	c.mu.Lock()
	c.gen++
	c.valid = false
	c.fetched = time.Time{}
	c.mu.Unlock()
}

var (
	containersCache = newTTLCache[[]Container](containersCacheTTL)
	imagesCache     = newTTLCache[[]Image](imagesCacheTTL)
	networksCache   = newTTLCache[[]Network](networksCacheTTL)
	volumesCache    = newTTLCache[int](volumesCacheTTL)
	versionsCache   = newTTLCache[DockerVersionInfo](versionsCacheTTL)

	invalidatorMu sync.RWMutex
	invalidators  []func()

	watcherStarted atomic.Bool
)

// RegisterInvalidator registers a callback invoked whenever Docker state changes or invalidates.
func RegisterInvalidator(fn func()) {
	if fn == nil {
		return
	}
	invalidatorMu.Lock()
	invalidators = append(invalidators, fn)
	invalidatorMu.Unlock()
}

func notifyInvalidators() {
	invalidatorMu.RLock()
	fns := append([]func(){}, invalidators...)
	invalidatorMu.RUnlock()
	for _, fn := range fns {
		fn()
	}
}

// InvalidateContainers clears container and derived caches after a container mutation.
func InvalidateContainers() {
	containersCache.Invalidate()
	invalidateAllContainerStats()
	notifyInvalidators()
}

// InvalidateAll clears all cached Docker views.
func InvalidateAll() {
	containersCache.Invalidate()
	invalidateAllContainerStats()
	imagesCache.Invalidate()
	networksCache.Invalidate()
	volumesCache.Invalidate()
	notifyInvalidators()
}

type engineClient struct {
	mu      sync.Mutex
	httpCli *http.Client
	baseURL string
	scheme  string // "unix" or "tcp"
}

var defaultEngine = &engineClient{}

var errEngineUnavailable = errors.New("docker engine socket unavailable")

func (e *engineClient) client() (*http.Client, string, error) {
	network, addr, baseURL, err := resolveEngineEndpoint()
	if err != nil {
		return nil, "", err
	}

	e.mu.Lock()
	defer e.mu.Unlock()
	key := network + "|" + addr
	if e.httpCli != nil && e.scheme == key {
		return e.httpCli, e.baseURL, nil
	}

	dialer := &net.Dialer{Timeout: 3 * time.Second}
	tr := &http.Transport{
		MaxIdleConns:        16,
		MaxIdleConnsPerHost: 16,
		IdleConnTimeout:     90 * time.Second,
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, addr)
		},
	}
	e.httpCli = &http.Client{Transport: tr}
	e.baseURL = baseURL
	e.scheme = key
	return e.httpCli, e.baseURL, nil
}

func resolveEngineEndpoint() (network, addr, baseURL string, err error) {
	host := strings.TrimSpace(os.Getenv("DOCKER_HOST"))
	if host != "" {
		switch {
		case strings.HasPrefix(host, "unix://"):
			sock := strings.TrimPrefix(host, "unix://")
			if sock == "" {
				sock = defaultDockerUnixSock
			}
			if _, statErr := os.Stat(sock); statErr != nil {
				return "", "", "", errEngineUnavailable
			}
			return "unix", sock, "http://localhost", nil
		case strings.HasPrefix(host, "tcp://"), strings.HasPrefix(host, "http://"):
			u, parseErr := url.Parse(host)
			if parseErr != nil || u.Host == "" {
				return "", "", "", errEngineUnavailable
			}
			return "tcp", u.Host, "http://" + u.Host, nil
		default:
			return "", "", "", errEngineUnavailable
		}
	}

	if runtime.GOOS == "windows" {
		// Windows named pipes require go-winio; fall back cleanly to Docker CLI unless DOCKER_HOST=tcp:// is set.
		return "", "", "", errEngineUnavailable
	}
	if _, statErr := os.Stat(defaultDockerUnixSock); statErr != nil {
		return "", "", "", errEngineUnavailable
	}
	return "unix", defaultDockerUnixSock, "http://localhost", nil
}

func (e *engineClient) doRequest(ctx context.Context, method, path string, out any) (int, []byte, error) {
	cli, baseURL, err := e.client()
	if err != nil {
		return 0, nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, nil)
	if err != nil {
		return 0, nil, err
	}
	resp, err := cli.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()

	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return resp.StatusCode, nil, readErr
	}
	if resp.StatusCode >= 400 {
		var msg struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(body, &msg) == nil && msg.Message != "" {
			return resp.StatusCode, body, errors.New(msg.Message)
		}
		return resp.StatusCode, body, fmt.Errorf("docker api %s %s returned HTTP %d: %s", method, path, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if out != nil && len(body) > 0 {
		if err := json.Unmarshal(body, out); err != nil {
			return resp.StatusCode, body, err
		}
	}
	return resp.StatusCode, body, nil
}

// StartEventWatcher listens to Docker Engine events over the socket and invalidates caches on changes.
// When the Docker socket is unavailable, it backs off quietly and retries until ctx is cancelled.
func StartEventWatcher(ctx context.Context) {
	if !watcherStarted.CompareAndSwap(false, true) {
		return
	}
	go func() {
		defer watcherStarted.Store(false)
		backoff := 2 * time.Second
		for {
			if ctx.Err() != nil {
				return
			}
			err := watchEventsOnce(ctx)
			if ctx.Err() != nil {
				return
			}
			if !errors.Is(err, errEngineUnavailable) {
				performance.DefaultRegistry.RecordBackgroundWorker(0, err)
			}
			timer := time.NewTimer(backoff)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
			if err == nil {
				backoff = 2 * time.Second
			} else if backoff < 30*time.Second {
				backoff *= 2
				if backoff > 30*time.Second {
					backoff = 30 * time.Second
				}
			}
		}
	}()
}

func watchEventsOnce(ctx context.Context) error {
	cli, baseURL, err := defaultEngine.client()
	if err != nil {
		return err
	}
	filters := url.QueryEscape(`{"type":["container","image","network","volume"]}`)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/events?filters="+filters, nil)
	if err != nil {
		return err
	}
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("docker events HTTP %d", resp.StatusCode)
	}

	// Ensure cache starts fresh whenever a stream reconnect completes.
	InvalidateAll()

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 16*1024), 256*1024)
	for scanner.Scan() {
		var ev struct {
			Type   string `json:"Type"`
			Action string `json:"Action"`
		}
		if json.Unmarshal(scanner.Bytes(), &ev) != nil {
			continue
		}
		switch ev.Type {
		case "container":
			InvalidateContainers()
		case "image":
			imagesCache.Invalidate()
			notifyInvalidators()
		case "network":
			networksCache.Invalidate()
			notifyInvalidators()
		case "volume":
			volumesCache.Invalidate()
			notifyInvalidators()
		}
	}
	return scanner.Err()
}

