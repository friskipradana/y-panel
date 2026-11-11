# Reneo Performance Baseline Report

> **Measurement Date**: 2026-11-11  
> **Repository Commit**: `f550955c119b1118049772ad98674ab0ad12daf6`  
> **Active Branch**: `main-runtime-dev`  
> **Evaluation Phase**: Phase 0 — Baseline & Observability  

---

## 1. Environment & Setup

| Component | Value / Specification |
| :--- | :--- |
| **Development OS** | Windows 11 / AMD64 |
| **Target Production OS** | Linux (Ubuntu 22.04 LTS / Debian 12 / Arch Linux) |
| **Go Version** | `go1.26.2 windows/amd64` |
| **Frontend Runtime** | Bun `1.3.12` / Node.js `v24.22.1` |
| **Frontend Framework** | React 19 + TypeScript + Vite |
| **Database** | PostgreSQL with Goose migrations |
| **Container Engine** | Docker Engine (via CLI + Socket) |

---

## 2. Baseline Measurements & Identified Bottlenecks

| Metric / Area | Baseline Status / Measurement | Root Cause / Technical Bottleneck |
| :--- | :--- | :--- |
| **System Summary Latency** | `185ms – 420ms+` (single client)<br>`1.8s – 5.0s+` (with 10 stopped projects) | `readCPUUsagePercent()` sleeps for **180ms** synchronously on request path (`time.Sleep(180ms)`). Serial `net.DialTimeout(200ms)` per stopped project in `SnapshotProject()`. |
| **System Stats WebSocket** | 60 process forks / min / client | `system.Inspect()` executes `docker info` and `uname -r` subprocesses on every 1-second tick. |
| **Database Status Query** | 6 sequential `COUNT(*)` queries per request | `database.Status()` scans `changelog_entries`, `runtime_logs`, `settings_audit`, `users`, `projects`, and `tunnels` synchronously on every summary request, even when user is non-superadmin. |
| **Docker Listing Latency** | 2 subprocess forks per query | `docker.ListContainers()` spawns `docker ps -a` followed by `docker inspect` with JSON unmarshaling; no caching or event-based invalidation. |
| **Project Manager Lock** | Global lock contention | `m.mu.Lock()` in `internal/projects/projects.go` is held during directory resolution, port verification, and process startup, preventing concurrent starts of independent projects. |
| **Terminal Streaming** | Synchronous write coupling | `session.streamMu` is locked while delivering chunks directly to the WebSocket writer, coupling slow client network latency to the PTY reader. |
| **Agent Startup Time** | Serial blocking initialization | `RestoreProjects()`, `RecoverDatabases()`, `RestoreTunnels()`, and `RestorePublicProxy()` run synchronously before `http.ListenAndServe`. |
| **Frontend Build Time** | `1.36s` (tsc + vite) | Clean build, verified 0 errors. |
| **Go Test Suite** | 28 packages passed | Clean suite, verified 0 failures. |

---

## 3. Bottleneck Call Graphs

### A. System Summary Call Graph (Before Optimization)
```
GET /api/v1/system/summary
 │
 ├── database.Status()
 │    ├── SELECT COUNT(*) FROM changelog_entries
 │    ├── SELECT COUNT(*) FROM runtime_logs
 │    ├── SELECT COUNT(*) FROM settings_audit
 │    ├── SELECT COUNT(*) FROM users
 │    ├── SELECT COUNT(*) FROM projects
 │    └── SELECT COUNT(*) FROM tunnels
 │
 ├── system.Inspect()
 │    ├── readCPUUsagePercent()  ──> [time.Sleep(180ms)]  <-- BLOCKING
 │    ├── exec.Command("docker", "info")                  <-- SUBPROCESS FORK
 │    └── exec.Command("uname", "-r")                     <-- SUBPROCESS FORK
 │
 └── projectsForSummary()
      └── for each project:
           └── isLocalPortOpen(port)  ──> [net.DialTimeout(200ms)] <-- SERIAL BLOCKING
```

---

## 4. Prioritized Optimization Roadmap

1. **P1 — Phase 1: System Summary & Metrics Optimization**:
   - Background non-blocking CPU sampler with atomic/RWMutex snapshot.
   - Background Docker daemon health probe (cached, 15s interval).
   - Eliminate all `time.Sleep` and subprocess calls from the HTTP request path.

2. **P1 — Phase 2: Database Status Optimization**:
   - Decouple `ConnectionStatus()` (fast ping/status) from `DetailedStatistics()`.
   - Implement singleflight-protected cached statistics (30s TTL).
   - Skip administrative table counts for non-superadmin viewers.

3. **P1 — Phase 3: Project Status and Network Probe Optimization**:
   - Asynchronous bounded port checker pool.
   - Decouple in-memory process state from active TCP port binding.
   - Fast summary aggregation without serial TCP connection timeouts.

4. **P1 — Phase 4: Docker Engine Integration Optimization**:
   - In-memory listing cache with event-driven invalidation.
   - Bounded timeouts on all Docker operations.

5. **P2 — Phase 5: Project Manager Concurrency**:
   - Explicit project state machine (`STOPPED`, `STARTING`, `RUNNING`, `FAILED`, `STOPPING`).
   - Per-project locks to eliminate global mutex contention during start/stop.

6. **P2 — Phase 6: Terminal Streaming Backpressure**:
   - Bounded output writer queue per WebSocket to isolate slow clients from the PTY reader.

7. **P2 — Phase 7 & 8: Frontend Polling, Startup & Graceful Lifecycle**:
   - Dedicated startup lifecycle (critical startup vs. asynchronous background recovery).
   - OS signal handling for graceful shutdown.

8. **P3 — Phase 9: Rust Evaluation**:
   - Benchmark and assess whether an out-of-process Rust host agent provides measurable memory/CPU advantage over optimized Go collectors.

