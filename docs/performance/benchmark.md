# Reneo Performance Benchmark Report

> **Date**: 2026-11-11  
> **Branch**: `main-runtime-dev`  
> **Base Commit**: `d5f7b7a927641e4aae9aae5f2aee9c49c97b4909`  
> **Measurement Host**: `windows/amd64`, `AMD Ryzen 7 5700X 8-Core Processor`, Go `go1.26.2`, Bun `1.3.12`, Node `v24.22.1`

---

## 1. Executive Summary

This report records verified before/after microbenchmarks, build/test validation, and environment-gated `NOT RUN` items after executing Phases 0–9 across the Go backend and React/TypeScript frontend.

**Honesty & Measurement Policy**:
- All microbenchmark numbers below come verbatim from `go test "-run=^$" "-bench=." -benchmem` executed on this workstation after all edits.
- Baseline rows referencing Linux `/proc`, live PostgreSQL (`psql`), live Docker Engine daemon, or live browser heap/CPU cannot execute natively on Windows without Linux kernel/daemon dependencies and are marked `NOT RUN` alongside the exact reproduction commands for the production Linux server.

---

## 2. Go Microbenchmarks (Measured Post-Optimization)

Command executed on idle CPU:
```powershell
go test "-run=^$" "-bench=." -benchmem ./internal/system ./internal/projects ./internal/docker ./internal/terminal
```

CPU: `AMD Ryzen 7 5700X 8-Core Processor` (`windows/amd64`, `GOMAXPROCS=16`)

| Benchmark | Iterations (`N`) | Latency | Memory / Op | Allocs / Op | Baseline Bottleneck Eliminated |
| :--- | ---: | ---: | ---: | ---: | :--- |
| [`BenchmarkInspectSnapshot-16`](../../internal/system/snapshot_test.go) | 87,252,148 | **14.20 ns/op** | **0 B/op** | **0 allocs/op** | Synchronous `time.Sleep(180ms)` + `docker info` + `uname -r` on HTTP request path |
| [`BenchmarkSnapshotAllCached_50Projects-16`](../../internal/projects/probe_test.go) | 185,050 | **6,413 ns/op** | **10,072 B/op** | **5 allocs/op** | Serial `net.DialTimeout(200ms)` per stopped project (`~10s` worst case for 50 projects) |
| [`BenchmarkListContainers_EngineCached-16`](../../internal/docker/client_test.go) | 64,342,472 | **18.90 ns/op** | **0 B/op** | **0 allocs/op** | Synchronous `docker ps -a` + `docker inspect` CLI process forks on every read |
| [`BenchmarkStreamWriterThroughput-16`](../../internal/terminal/writer_test.go) | 4,266,044 | **303.7 ns/op** | **1,197 B/op** | **0 allocs/op** | Direct PTY-to-WebSocket write lock coupling (`session.streamMu` blocking PTY reader) |
| [`BenchmarkDeliverBuffered-16`](../../internal/terminal/writer_test.go) | 72,234,762 | **16.44 ns/op** | **0 B/op** | **0 allocs/op** | `append([]byte(nil), ...)` 256 KiB copy/realloc per chunk once replay buffer filled |

---

## 3. Baseline vs. Optimized Comparison Matrix

| Metric / Area | Baseline (from [`baseline.md`](./baseline.md)) | Post-Optimization Status | Evidence / Verification Scope |
| :--- | :--- | :--- | :--- |
| **System Summary (`system.Inspect`)** | Analytical floor `>= 180ms` (`time.Sleep(180ms)`) + `docker info` + `uname -r` forks on every call | **14.20 ns/op, 0 allocs/op** on cached [`Collector.GetSnapshot`](../../internal/system/snapshot.go) | Measured via `BenchmarkInspectSnapshot`; background ticks every `2s` (host) / `15s` (Docker) |
| **Database Status (`GET /api/v1/system/summary`)** | 6 sequential `COUNT(*)` queries per request for every user role | **0 DB queries** for non-superadmin; **1 aggregated query per 30s TTL** (singleflight) for superadmin via [`DetailedStatistics`](../../internal/database/status.go) | Offline connection metadata verified (`TestConnectionStatusWithoutDB`); live SQL round-trip `NOT RUN` (no PostgreSQL) |
| **Docker Listing (`docker.ListContainers`)** | 2 CLI forks (`docker ps -a` + `docker inspect`) per request | Direct HTTP/Unix Engine client + singleflight `5s` TTL cache (**18.90 ns/op** hit) + `/events` invalidation | Verified with mock Engine HTTP server in `TestEngineClientCachingAndMutationInvalidation`; real socket `NOT RUN` |
| **Project Port Probing (50 projects)** | Serial `net.DialTimeout(200ms)` loop inside summary path | Bounded worker pool (`portProber`, max 16 workers) + non-blocking cached [`SnapshotAllCached`](../../internal/projects/projects.go) (**6.41 µs/op** for 50 projects) | Verified via `TestPortProberBoundedConcurrencyAndCaching` & `TestSnapshotAllCachedNeverBlocksOnDial` |
| **Project Start / Stop Concurrency** | Global `m.mu` held across start/stop & runtime state checks | Per-project mutex ([`projectOpLock`](../../internal/projects/projects.go)) + explicit state machine (`internal/projects/state.go`) | Verified via `TestPerProjectOpLockDoesNotGloballyBlockOtherProjects`; live Linux process group `NOT RUN` |
| **Terminal Streaming Backpressure** | Direct WebSocket writes inside PTY delivery path + `O(256 KiB)` realloc per chunk after buffer fill | Bounded [`StreamWriter`](../../internal/terminal/writer.go) coalescing queue (128 frames / 1 MiB) + 2x amortized [`appendBounded`](../../internal/terminal/terminal.go) (**16.44 ns/op, 0 allocs/op**) | Verified via `TestStreamWriterCoalescesChunksAndPreservesControlOrder`, `TestStreamWriterBackpressureDoesNotBlockAndFailsOnce`, `TestManagerDeliverBuffersOnStreamBackpressure` |
| **Agent Startup (`cmd/panel-agent`)** | Sequential DB recovery, project start, tunnel & proxy restore before `net.Listen` | Bind TCP listener first, serve `/healthz` immediately, run [`RestoreAsync`](../../internal/httpserver/server.go) in parallel, graceful `SIGINT`/`SIGTERM` shutdown | Verified via `TestServerStartupHealthzAndShutdown` & `TestServerCloseNilSafe` |
| **Frontend Polling & Visibility** | Duplicate 10s widget poll + hidden tab polling + un-gated DB/KVM/Docker/Log/Hosting polls | Shared WebSocket-fed [`useSystemSummary`](../../src/hooks/useSystemSampler.ts), global `refetchIntervalInBackground: false`, focus+visibility gating via [`useWindowPollingActive`](../../src/hooks/useWindowPollingActive.ts) | `bun run check:ui` (`0` errors), `bun run lint` (`0` errors), `bun run build` (`✓ built in 1.56s`) |
| **Live Linux Agent CPU / RAM / API p50-p99** | `NOT RUN` | **`NOT RUN`** (requires Linux host + live PostgreSQL + Docker Engine) | See Section 4 for Linux verification suite |

---

## 4. `NOT RUN` Environment-Gated Measurements & Reproduction Commands

The following checks and runtime metrics could not be measured on the Windows development workstation (`REN_TEST_DATABASE_URL` unset, no `/var/run/docker.sock`, no Linux `/proc`/`systemd`/PTY):

| Item / Metric | Reason `NOT RUN` on Dev Host | Required Environment |
| :--- | :--- | :--- |
| Live API p50 / p95 / p99 (`GET /api/v1/system/summary`, `/api/v1/containers/table`, `/api/v1/projects`) | Requires running PostgreSQL + Linux `/proc` + Docker Engine | Ubuntu 22.04 / Debian 12 + PostgreSQL 14+ + Docker Engine |
| Agent RSS / Heap under idle & load (`reneo_runtime_heap_alloc_bytes`, `reneo_runtime_goroutines`) | Must be sampled on running Linux `panel-agent` service | Linux server running `./panel-agent` |
| DB Migration & Hosting/Notify Integration Tests (`TestIntegration*`, `TestUpFromEmptyThenDownThenUp`) | Skipped (`REN_TEST_DATABASE_URL` not configured) | PostgreSQL test DB (`REN_TEST_DATABASE_URL=postgres://...`) |
| Docker Live Container Tests (`TestDeployFromImageOnTheBridgeLive`, `TestUpdateContainerLive`, `TestDbxHarness`) | Skipped (`docker` daemon unavailable on Windows) | Docker Engine daemon |
| Linux Project Supervision & PTY Symlink Tests (`TestStopEndsTheWholeGroup`, `TestResolveCwdRefusesSymlinkOutOfHome`) | Windows process groups / POSIX PTY unsupported | Linux kernel host |
| Frontend Chrome Memory / Network Request Count | Browser DevTools automation restricted / no live Linux backend | Running agent + headless/desktop Chromium session |

### Linux Production Verification Commands

Run these commands on the target Linux host after deploying `main-runtime-dev`:

```bash
# 1. Run full backend + DB + Docker integration suite on Linux
export REN_TEST_DATABASE_URL="postgres://reneo:pass@127.0.0.1:5432/reneo_test?sslmode=disable"
go test -race ./...

# 2. Check live application metrics (authenticated superadmin session or ypat_ token)
curl -fsS -H "Authorization: Bearer ypat_YOUR_TOKEN" http://127.0.0.1:8787/api/v1/system/metrics/app | jq .
curl -fsS -H "Authorization: Bearer ypat_YOUR_TOKEN" http://127.0.0.1:8787/api/v1/system/metrics/prometheus

# 3. Optional temporary CPU profile (enable PANEL_PROFILING_ENABLED=true briefly, then revert to false)
curl -fsS -H "Authorization: Bearer ypat_YOUR_TOKEN" "http://127.0.0.1:8787/debug/pprof/profile?seconds=15" -o cpu.pprof
go tool pprof -top cpu.pprof
```

---

## 5. Build & Static Validation Results (Verified)

| Check | Command | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| Go Module Integrity | `go mod verify` | **PASS** (`all modules verified`) | Clean |
| Go Static Analyzer | `go vet ./...` | **PASS** (`0` issues) | Clean across Windows build |
| Windows Binary Build | `go build ./...` | **PASS** (`exit 0`) | Clean |
| Linux Cross-Compile | `GOOS=linux GOARCH=amd64 go build ./...` | **PASS** (`exit 0`) | Verifies `*_linux.go` compilation |
| Go Unit Tests | `go test -count=1 ./...` | **PASS** (22 test packages passed, 0 failures) | Environment-gated DB/Docker/Linux tests cleanly skipped |
| UI Design System Check | `bun run check:ui` | **PASS** (`errors=0`, `warnings=12` pre-existing) | Clean |
| ESLint | `bun run lint` | **PASS** (`0` errors, `40` pre-existing warnings) | Zero warnings in modified files |
| Production Frontend Build | `bun run build` | **PASS** (`✓ built in 1.56s`) | `tsc -b` + `vite build` exit `0` |

