# Reneo Performance & Concurrency Architecture

> **Scope**: Hybrid Control Plane (Go), Realtime Telemetry & Streaming, Non-Blocking Lifecycle, Frontend Polling Discipline  
> **Applies to Branch**: `main-runtime-dev`

---

## 1. Architectural Pattern: Non-Blocking Go Control Plane

Reneo retains Go as the single Control Plane binary (`cmd/panel-agent`) responsible for HTTP routing, session authentication, RBAC, PostgreSQL persistence, project orchestration, Cloudflare integration, MCP, and WebSockets. Rather than splitting internal subsystems into microservices, CPU- or I/O-bound probes are decoupled from HTTP request handlers using background collectors, bounded worker pools, singleflight TTL caches, and bounded asynchronous stream queues.

```
                   React 19 + TypeScript UI
       (useWindowPollingActive + liveSocket + React Query)
                              |
              HTTPS REST  /  WSS Live & Terminal
                              v
                 Go Control Plane (httpserver)
    +-------------------------+-------------------------+
    |                         |                         |
Non-Blocking Readers    Bounded Action Paths     Async Lifecycle
- system.Collector     - per-project op lock   - net.Listen first
- database.statsCache  - Docker Engine socket  - RestoreAsync (4x)
- docker.ttlCache      - terminal.StreamWriter - SIGINT/SIGTERM drain
- projects.portProber
```

---

## 2. Backend Performance Layers

### 2.1 Observability & Gated Profiling (`internal/performance`)
- **Registry ([`internal/performance/metrics.go`](../../internal/performance/metrics.go))**: Lock-free atomic counters (`apiRequestsTotal`, `apiErrorsTotal`, `dbQueriesTotal`, `dockerOpsTotal`, `terminalSessions`, `terminalBytesTotal`, background worker runs) plus a bounded 500-sample rolling quantile estimator (`p50`, `p95`, `p99`) fed by HTTP middleware ([`withAccessLog`](../../internal/httpserver/middleware.go)) and subsystem hooks.
- **Superadmin-Only Endpoints ([`internal/httpserver/routes.go`](../../internal/httpserver/routes.go))**:
  - `GET /api/v1/system/metrics/app` (JSON) and `GET /api/v1/system/metrics/prometheus` (Prometheus text exposition), protected by `requireRole(auth.SuperadminRole, ...)`.
  - `/debug/pprof/*` (`Index`, `Cmdline`, `Profile`, `Symbol`, `Trace`) via [`RegisterPprofRoutes`](../../internal/performance/profiling.go), **disabled by default** (`PANEL_PROFILING_ENABLED=false`) and gated behind `SuperadminRole` when explicitly enabled.

### 2.2 Snapshot Host Telemetry (`internal/system`)
- **Collector ([`internal/system/snapshot.go`](../../internal/system/snapshot.go))**: Replaces request-path `time.Sleep(180ms)` and per-request CLI forks (`docker info`, `uname -r`) with two background loops:
  - Fast host metrics loop (`2s` interval): non-blocking `/proc/stat` delta computation guarded by `cpuMu` (never held across external I/O), `/proc/meminfo`, `/proc/uptime`, thermal sysfs, disk stats, and network interfaces.
  - Docker health probe loop (`15s` interval, `dockerTimeout=5s`, single-flight `dockerBusy` flag): keeps daemon reachability fresh without stalling `/api/v1/system/summary` or live WebSockets.
- **Consumer ([`internal/system/sample.go`](../../internal/system/sample.go))**: `TakeSample()` and `Inspect()` read the pre-built snapshot in `~14 ns` with zero heap allocations.

### 2.3 Database Status Decoupling (`internal/database`)
- **Metadata vs. Expensive Counts ([`internal/database/status.go`](../../internal/database/status.go))**:
  - [`ConnectionStatus`](../../internal/database/status.go) returns enabled/connected flags and parsed DSN fields with zero SQL queries.
  - [`DetailedStatistics`](../../internal/database/status.go) executes all 6 `COUNT(*)` subqueries in **1 round-trip** with a `3s` statement timeout, deduplicated by an in-flight channel (singleflight), cached for `30s` (with `5m` stale fallback on transient errors), and skipped completely when `systemSummaryPayload` serves a non-superadmin viewer.
  - [`InvalidateStatsCache`](../../internal/database/status.go) clears the cache immediately when mutating routes need fresh counts.

### 2.4 Direct Docker Engine Client & Event Invalidation (`internal/docker`)
- **Engine Client ([`internal/docker/client.go`](../../internal/docker/client.go))**: Persistent `http.Client` over `/var/run/docker.sock` (or TCP `DOCKER_HOST`) eliminates subprocess forks (`docker ps`, `docker inspect`, `docker images`, `docker network`, container lifecycle, logs/inspect config) whenever the Engine socket is reachable, with automatic CLI fallback when socket access is unavailable (e.g., Windows named pipes without `DOCKER_HOST`).
- **TTL + Singleflight Caches + Event Watcher**: `containersCache` (`5s`), `imagesCache`/`networksCache`/`volumesCache` (`15s`), and `versionsCache` (`5m`) prevent request stampedes. Mutations (`Start`, `Stop`, `Restart`, `Delete`, `Deploy`, `Update`, `Pull`) immediately invalidate affected caches, while `StartEventWatcher(s.bgCtx)` subscribes to Engine `/events` so external container state changes invalidate caches automatically without tightening poll intervals.

### 2.5 Project Supervision & Bounded Port Probing (`internal/projects`)
- **Bounded Port Prober ([`internal/projects/probe.go`](../../internal/projects/probe.go))**: `portProber` deduplicates TCP dials via an in-flight map, enforces a `16`-worker semaphore, applies a `200ms` dial timeout, caches `PortOpen`/`PortClosed` for `10s`, and uses generation-safe `Invalidate(port)` so stale in-flight probes never overwrite post-stop state.
- **Two-Mode Snapshots ([`internal/projects/projects.go`](../../internal/projects/projects.go))**: High-frequency summary paths use `SnapshotAllCached()` (pure memory read + background asynchronous refresh), whereas control/reconcile paths use `SnapshotAll()` with parallel bounded probing.
- **Per-Project Locking & State Machine ([`internal/projects/state.go`](../../internal/projects/state.go))**: `projectOpLock(projectID)` isolates start/stop/rebuild operations so a slow `npm`/`go` build on Project A never blocks Project B's lifecycle or list snapshot.

### 2.6 Terminal Backpressure & Bounded History (`internal/terminal`)
- **Decoupled Stream Writer ([`internal/terminal/writer.go`](../../internal/terminal/writer.go))**: Each WebSocket session allocates a [`StreamWriter`](../../internal/terminal/writer.go) (capacity `128` frames / `1 MiB` queued bytes, `32 KiB` frame coalescing cap). PTY `Manager.Deliver()` pushes non-blockingly into connected clients' writers:
  - Coalesces contiguous text chunks into single WebSocket frames under burst output (`cat`, builds).
  - Serializes control frames (`ready`, `pong`, `error`, `closed`, ping frames) alongside output chunks, replacing ad-hoc write mutex contention.
  - On slow/stalled clients exceeding queue limits, `StreamWriter` marks itself closed once (`failOnce`), drops queued backlog to reclaim RAM immediately, and invokes `Detach`/`Close` without blocking the PTY reader or healthy sibling tabs.
- **Zero-Realloc Bounded History ([`internal/terminal/terminal.go`](../../internal/terminal/terminal.go))**: Replay buffers (`outputBuf` capped at `256 KiB`, `historyBuf` capped at `512 KiB`) use 2x amortized compaction ([`appendBounded`](../../internal/terminal/terminal.go)) so sustained high-throughput terminal streaming does not thrash GC allocating a fresh 256 KiB slice per chunk.

### 2.7 Startup Sequence & Graceful Shutdown (`cmd/panel-agent/main.go`, `internal/httpserver/server.go`)
1. `net.Listen("tcp", cfg.BindAddr)` binds immediately before heavy recovery.
2. `http.Server` (`ReadHeaderTimeout: 10s`, `IdleTimeout: 120s`) starts serving `/healthz` and static frontend routes right away.
3. [`Server.RestoreAsync`](../../internal/httpserver/server.go) runs 4 parallel background workers tracked by `recoveryWG`: Demo account check, project restore (pre-warming port cache + cancellable via `bgCtx`), DB recovery + firewall restore + context-cancellable `WatchDatabaseAccess`, and tunnel + public proxy restore.
4. On `SIGINT`/`SIGTERM`, `httpServer.Shutdown(10s)` drains active HTTP requests first, then [`Server.Close`](../../internal/httpserver/server.go) cancels `bgCtx`, closes `reconcileStop`, waits for `reconcileDone` + `recoveryWG` (including `runPlanExpiryLoop`, `retireOpenDbx`, `RestoreAsync`, and `WatchDatabaseAccess`), flushes metrics persistence (`metrics.Stop()`), terminates cloudflared/projects/terminals (`cfDaemon.StopAll()`, `projectManager.StopAll()`, `terminalManager.CloseAll()`), stops `system.ShutdownCollector()`, stops the public proxy, stops `notify`, and closes the PostgreSQL pool cleanly.

---

## 3. Frontend Efficiency Architecture (`src/`)

- **Single Shared System Push ([`ClockUptimeWidget.tsx`](../../src/components/widgets/ClockUptimeWidget.tsx))**: Removed the standalone 10s `GET /api/v1/system/summary` timer in `ClockUptimeWidget` in favor of [`useSystemSummary`](../../src/hooks/useSystemSampler.ts) populated by `liveSocket.ts`, and paused 1Hz clock state updates while `document.visibilityState === 'hidden'`.
- **Window Focus + Tab Visibility Gating ([`useWindowPollingActive.ts`](../../src/hooks/useWindowPollingActive.ts))**: Combines Zustand focused non-minimized window state with `useSyncExternalStore` on `document.visibilitychange` so background tabs and unfocused desktop windows pause polling immediately and refetch cleanly upon refocus.
- **Global & Scoped Query Discipline ([`queryClient.ts`](../../src/lib/queryClient.ts), `SettingsWindow`, `DockerWindow`, `SystemLogsWindow`, `HostingWindow`, `SystemWindow`)**:
  - `refetchIntervalInBackground: false` enforced globally and per polled query.
  - Docker tables (`useContainerTable`, `useDockerImages`, `useDockerNetworks`, `useDockerVolumes`) only poll when Docker is focused AND the matching tab is active.
  - Settings panels (`useHostSettings`, `ReneoDatabaseTab`, `ReneoRuntimeTab`, `NotificationsTab`, `KvmSettingsCard`, `GeneralTab`) only poll `/api/v1/database/status` when the Database tab is active, `/api/v1/system/logs` on the Runtime tab, `/api/v1/kvm/status` only when `kvm_enabled` is true on General, and notifications status only when focused on the Notifications tab.

