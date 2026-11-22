# Reneo Performance Optimization Summary (Phases 0–10)

> **Status**: Implemented & Verified (Local Dev Matrix Complete; Linux Live-Host Profiling Ready for Deployment Verification)  
> **Active Branch**: `main-runtime-dev`

This document indexes all performance optimization engineering reports, runtime configuration controls, and rollback steps for Reneo.

---

## 1. Documentation Index

| Document | Contents |
| :--- | :--- |
| [Baseline Report](./performance/baseline.md) | Pre-optimization bottleneck call graphs, analytical latency floors, and environment baseline |
| [Architecture Guide](./performance/architecture.md) | Non-blocking Go Control Plane design, worker pools, Engine API caching, terminal backpressure, startup/shutdown lifecycle, frontend polling gating |
| [Benchmark Report](./performance/benchmark.md) | Measured post-optimization Go microbenchmarks, baseline comparison matrix, and explicit `NOT RUN` Linux integration checklist |
| [Phase 9.1 Account Usage Optimization](./performance/phase-9.1-accountusage.md) | Non-blocking `/proc` delta collector, cgroup v2 hierarchy & anti-double-counting design, Docker Engine `/stats` migration, synthetic/mock benchmarks, and Linux verification plan |
| [Rust Evaluation](./performance/rust-evaluation.md) | Benchmark-based decision deferring a Rust host telemetry sidecar (`NOT NEEDED NOW`) + quantitative trigger criteria |

---

## 2. Summary of Changes by Priority

| Priority | Phase | Scope & Outcome |
| :--- | :--- | :--- |
| **P0** | Observability & Profiling | Added thread-safe metric registry (`internal/performance/metrics.go`), superadmin-only JSON & Prometheus endpoints, and default-disabled `/debug/pprof/` (`PANEL_PROFILING_ENABLED=false`) |
| **P1** | System Summary & Metrics | Replaced synchronous `time.Sleep(180ms)` & CLI forks (`docker info`, `uname -r`) with cached non-blocking `system.Collector` (`14.20 ns/op, 0 allocs/op`) |
| **P1** | Database Status | Decoupled `ConnectionStatus()` from `DetailedStatistics()`; singleflight 30s cache executing 6 table counts in 1 SQL query; skipped counts for non-superadmin viewers |
| **P1** | Docker Integration | Added persistent `/var/run/docker.sock` Engine HTTP client with CLI fallback, singleflight TTL caches (`18.90 ns/op` hit), mutation invalidation, and `/events` stream watcher |
| **P2** | Project Manager & Probes | Added `portProber` (16-worker cap, 10s TTL, generation-safe invalidation), non-blocking `SnapshotAllCached()` (`6.41 µs/op` for 50 projects), explicit project state machine, and per-project locks |
| **P2** | Terminal Streaming | Added bounded coalescing `StreamWriter` (128 frames / 1 MiB) decoupling slow WebSocket clients from PTY reader, plus 2x amortized `appendBounded` buffer (`16.44 ns/op, 0 allocs/op`) |
| **P2** | Frontend Polling | Eliminated duplicate widget summary timer, added `visibilitychange` + focus gating via `useWindowPollingActive`, enforced global `refetchIntervalInBackground: false`, and scoped Settings/Docker/Logs polls to active tabs |
| **P2** | Startup & Shutdown | Bound TCP socket immediately (`main.go`), moved recovery to parallel `RestoreAsync()` (`internal/httpserver/server.go`), added `SIGINT`/`SIGTERM` HTTP drain and orderly subsystem teardown in `Server.Close()` |
| **P1/P2** | Phase 9.1 Account Usage | Eliminated `200ms` synchronous `/proc` sleep & `docker stats --no-stream` CLI forks; added background `(pid, starttime)` `/proc` collector, cgroup v2 accounting (`cpu.stat`, `memory.*`, `pids.*`), slice/container anti-double-counting, Docker Engine `/stats`, and stale-retaining snapshots |
| **P3** | Rust Telemetry Evaluation | Evaluated optimized Go telemetry vs. Rust sidecar maintenance/IPC overhead; deferred Rust until Linux `pprof` demonstrates workload demand |

---

## 3. Runtime Flags & Rollback Guidance

- **Profiling Gate**: `PANEL_PROFILING_ENABLED` defaults to `false` in [`internal/config/config.go`](../internal/config/config.go). Keep disabled in normal production; set to `true` temporarily only during superadmin diagnostics and restart/reload afterward.
- **Metrics Inspection (Superadmin only)**:
  - JSON summary: `GET /api/v1/system/metrics/app`
  - Prometheus format: `GET /api/v1/system/metrics/prometheus`
- **Safe Rollback by Subsystem**:
  - Changes stay within modular packages (`internal/performance`, `internal/system`, `internal/database`, `internal/docker`, `internal/projects`, `internal/terminal`, `internal/httpserver`, and frontend hooks/components) with 100% REST/WebSocket API contract compatibility.
  - Any individual phase can be reverted cleanly via `git revert` per logical file group without requiring database schema rollbacks (`internal/database/migrations` was intentionally left untouched).

