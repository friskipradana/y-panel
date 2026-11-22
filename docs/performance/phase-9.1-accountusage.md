# Phase 9.1 — Account Usage Linux & Container Accounting Optimization

> **Branch**: `main-runtime-dev`  
> **Scope**: `internal/accountusage`, `internal/docker/stats.go`, `internal/httpserver/account_resources.go`, `internal/httpserver/server.go`  
> **Rust Status**: Deferred (pure Go implementation completed; re-evaluate only after Linux `pprof` profiling)

---

## 1. Objective & Problem Statement

Before Phase 9.1, per-account resource reporting (`accountusage.Sample`) blocked HTTP and live WebSocket callers on two synchronous bottlenecks:
1. A synchronous `time.Sleep(200 * time.Millisecond)` between two full `/proc/[pid]/stat` scans per caller in `proc_linux.go`.
2. Repeated `docker stats --no-stream` CLI subprocess forks in `accountusage.go`.

Phase 9.1 eliminates request-path blocking and subprocess forks in pure Go while preserving full compatibility with [`accountusage.Usage`](../../internal/accountusage/accountusage.go) and [`httpserver.accountResources`](../../internal/httpserver/account_resources.go).

---

## 2. Asynchronous `/proc` Delta Collector & Formula Validation (`Task 1`)

Implemented in [`internal/accountusage/proc.go`](../../internal/accountusage/proc.go), [`proc_linux.go`](../../internal/accountusage/proc_linux.go), and [`proc_other.go`](../../internal/accountusage/proc_other.go):

- **Bounded Worker Pool**: [`procCollector`](../../internal/accountusage/proc.go) runs asynchronously at a configurable interval (default `2s`, overridden via `WithSampleInterval`) using at most `maxProcWorkers = 4` workers (clamped to `runtime.NumCPU()`).
- **Non-Sleeping Baseline**: On `Start()`, the initial pass captures baseline counters immediately without sleeping, preventing startup or request-path stalls.
- **Linux Clock-Tick CPU Formula Preserved**:
  - `utime + stime` are parsed from fields `[14]` and `[15]` of `/proc/[pid]/stat` (`fields[11]` + `fields[12]` after the last `')'`, handling process names containing spaces/parentheses such as `(sshd (v2))`).
  - `clockTicks = 100` (`USER_HZ`) converts tick deltas into core-fractions identically to the prior synchronous loop:
    ```
    cpuCores = float64(currTicks - prevTicks) / 100.0 / elapsedSeconds
    ```
    where `1.0` equals 1 full CPU core.
- **PID Reuse & Fault Tolerance**:
  - Tracks processes by composite key `procKey{PID, StartTime}` (field `[22]` of `/proc/[pid]/stat`). A reused PID with a different `starttime` resets its delta safely to `0`.
  - Guards counter wraps/resets (`curr < prev` yields `0` CPU instead of unsigned underflow).
  - Gracefully skips disappearing PIDs (`os.IsNotExist` / `fs.ErrNotExist`), `EPERM` (`os.IsPermission`), and malformed `/proc/[pid]/stat` lines without aborting sibling PIDs.
- **Multi-UID Aggregation**: Aggregates RSS memory (`rssPages * pageSize`) and delta CPU per OS UID (`byUID`) with container PIDs excluded.

---

## 3. Cgroup v2 Hierarchy Inspection & Anti-Double-Counting (`Task 2`)

Implemented in [`internal/accountusage/cgroup.go`](../../internal/accountusage/cgroup.go) and [`resolveAccountCompute`](../../internal/accountusage/proc.go):

- **Hierarchy Detection (`DetectCgroupHierarchy`)**:
  - Inspects `/proc/self/mountinfo` (decoding `\040` mount-path escapes) and verifies `/sys/fs/cgroup` (`cgroup.controllers`) to classify hosts accurately into:
    - `CgroupModeV2` (unified cgroup v2)
    - `CgroupModeHybrid` (cgroup v1 + `/sys/fs/cgroup/unified`)
    - `CgroupModeV1` (legacy v1 only)
    - `CgroupModeUnknown` (non-Linux / unavailable)
- **Collected Cgroup v2 Metrics (`ReadCgroupV2Stats`)**:
  - `cpu.stat`: `usage_usec`, `user_usec`, `system_usec`, `nr_throttled`, `throttled_usec`
  - `cpu.max`: quota & period (`max` -> `CPUUnlimited: true`)
  - `memory.current` & `memory.max` (`max` -> `MemoryUnlimited: true`)
  - `memory.stat`: parses `anon`, `file`, `inactive_file`, deriving working-set memory `MemoryWorkingBytes = memory.current - inactive_file` (clamped at `0`)
  - `pids.current` & `pids.max` (`max` -> `PIDsUnlimited: true`)
  - Missing or unreadable controllers are recorded per controller in `MissingControllers` / `Errors` without failing readable controllers.
- **Systemd Multi-Hyphen Slice Resolution**:
  - `internal/osuser/osuser.go` prepends `panel-` (`MappedUsername`) and `limits_linux.go` launches user jobs under `reneo-panel-<user>.slice`, which systemd nests under `/reneo.slice/reneo-panel.slice/reneo-panel-<user>.slice`.
  - [`CandidateAccountSliceRelPaths`](../../internal/accountusage/cgroup.go) checks nested dashed hierarchies first, falling back to top-level `/reneo-<user>.slice` and `/user.slice/user-<uid>.slice`.
  - Active `.slice` discovery in `proc.go` walks `/proc/[pid]/cgroup` deepest-to-shallowest so parent slices like `reneo-panel.slice` are never mistakenly aggregated as one account.
- **Anti-Double-Counting Rules**:
  1. **Container PIDs vs. `/proc` UID**: [`IsContainerCgroupPath`](../../internal/accountusage/cgroup.go) excludes `/docker/`, `/docker-`, `/containerd/`, `cri-containerd-`, `/libpod-`, `/crio-`, and `/kubepods` from `/proc` UID scans so Docker Engine `/stats` owns all container compute.
  2. **Account Slice vs. `/proc` UID (`resolveAccountCompute`)**: Non-container processes running inside an active covered account slice are excluded per controller (`HasCPU` / `HasMemory`) from `/proc` summation; if a host disables a controller on a slice (e.g., `HasCPU == false`), only the missing resource falls back to `/proc` UID deltas while the active controller remains slice-accounted.
  3. **Host Memory Distinction**: `/proc/meminfo` (`MemTotal`) is stored separately in `AccountSnapshot.HostMemoryTotalBytes` so account and container working memory remain distinct from host physical RAM capacity.

---

## 4. Docker Engine `/stats` API Migration (`Task 3`)

Implemented in [`internal/docker/stats.go`](../../internal/docker/stats.go), [`internal/docker/client.go`](../../internal/docker/client.go), and [`internal/httpserver/account_resources.go`](../../internal/httpserver/account_resources.go):

- **Direct Engine HTTP Endpoint**: Replaced repeated `docker stats --no-stream` CLI forks with `GET /containers/{id}/stats?stream=false` over the shared `defaultEngine` Unix socket / HTTP client (`statsWorkerMax = 4`, `4s` per-container timeout, `5s` TTL cache + singleflight deduplication in `statsStore`).
- **Mutation & Event Invalidation**: `InvalidateContainers()` and `InvalidateAll()` flush `statsStore` automatically on container lifecycle changes and Docker `/events`.
- **Formula Parity with `docker stats`**:
  - `CPUCores = (cpuDelta / sysDelta) * float64(onlineCPUs)` (using `online_cpus`, fallback `len(percpu_usage)`, fallback `runtime.NumCPU()`), matching `docker stats` where `100% = 1.0` core.
  - `MemBytes = dockerWorkingSetBytes(...)`, subtracting `inactive_file` (cgroup v2), `total_inactive_file` (cgroup v1), or `cache` to match Docker CLI `calculateMemUsageUnixNoCache`.
- **Failure Isolation**:
  - `404 Not Found` -> marked `Removed: true` and evicted cleanly without cancelling sibling container stats.
  - `409 Conflict` / zeroed counters -> marked `Running: false` (`0` usage, not an Engine error).
  - Unreachable daemon returns `ErrEngineUnavailable`.
- **`account_resources.go` Filter**: Only running containers (`strings.EqualFold(c.State, "running")`) owned by the user are submitted for stats collection.

---

## 5. Timestamped Snapshot Cache & Graceful Shutdown (`Task 4`)

Implemented in [`internal/accountusage/accountusage.go`](../../internal/accountusage/accountusage.go) and wired into [`internal/httpserver/server.go`](../../internal/httpserver/server.go):

- **Decomposed Snapshot (`AccountSnapshot`)**: Exposes `Usage` (compatibility aggregate), `ProcessUsage`, `CgroupSliceUsage`, `ContainerUsage`, `CgroupMode`, `SliceCgroup`, `ContainerCgroups`, `HostMemoryTotalBytes`, `ProcessesScanned`, `ContainersPolled`, `UpdatedAt`, `LastSuccessAt`, `Stale`, and `LastError`.
- **Non-Blocking Singleflight & Last-Good Retention**:
  - `Sample` / `SampleSnapshot` read cached memory immediately; expired or cold container keys schedule an asynchronous singleflight refresh gated by `maxRefreshWorkers = 4`.
  - If an upstream container refresh fails or times out, previously captured container readings are retained with `Stale = true` and `LastError` populated.
  - Background `refreshLoop` proactively refreshes active recently-accessed accounts and evicts stale idle entries (`activeAccountTTL = 2m`).
  - Instrumentation records refresh runs/errors in `performance.DefaultRegistry.RecordBackgroundWorker` and `RecordDockerOp("container_stats", ...)`.
- **Graceful Teardown**: `Server.Close()` invokes `accountusage.Shutdown()` after `system.ShutdownCollector()` to stop worker goroutines cleanly.

---

## 6. Test Results, Dev Benchmarks & Explicit `NOT RUN` Linux Matrix (`Task 5`)

### 6.1 Dev-Workstation Verification & Synthetic/Mock Benchmarks

Executed on `windows/amd64` (`AMD Ryzen 7 5700X 8-Core Processor`, `GOMAXPROCS=16`, `go1.26.2`):

- `go vet ./...`: **PASS**
- `go build ./...` (Windows) and `GOOS=linux GOARCH=amd64 go build ./...` + `go test -c ./internal/accountusage`: **PASS**
- `go test -count=1 ./...`: **PASS** across all Go packages (live Docker container tests `TestDeployFromImageOnTheBridgeLive` and `TestUpdateContainerLive` skipped because no Docker daemon is running on Windows).

**Synthetic `/proc` & Mock Docker Engine Benchmarks** (run with `go test "-run=^$" "-bench=." -benchmem -count=3 ./internal/accountusage ./internal/docker`):

| Benchmark | Workload Model | Latency (range across 3 runs) | Bytes / Op | Allocs / Op | Scope / Caveat |
| :--- | :--- | ---: | ---: | ---: | :--- |
| `BenchmarkAccountUsageSnapshotCached-16` | Cached `SampleSnapshot` (process + container) | **1,616 – 1,698 ns/op** | **912 B/op** | **25 allocs/op** | Eliminates `>= 200ms` request-path wait & CLI fork |
| `BenchmarkProcCollectorScan_10-16` | 10 fake `/proc/[pid]/stat` + `/cgroup` entries on NTFS temp dir | **386,226 – 417,954 ns/op** | **~33.9 KB/op** | **205 allocs/op** | Dev host NTFS I/O, not kernel `/proc` tmpfs |
| `BenchmarkProcCollectorScan_100-16` | 100 fake `/proc/[pid]/stat` + `/cgroup` entries | **2,111,956 – 2,146,470 ns/op** | **~268 KB/op** | **1,579 allocs/op** | Dev host NTFS I/O |
| `BenchmarkProcCollectorScan_500-16` | 500 fake `/proc/[pid]/stat` + `/cgroup` entries | **10,249,003 – 10,503,310 ns/op** | **~1.24 MB/op** | **7,595 allocs/op** | Dev host NTFS I/O |
| `BenchmarkProcCollectorScan_1000-16` | 1,000 fake `/proc/[pid]/stat` + `/cgroup` entries | **20,112,382 – 21,156,154 ns/op** | **~2.44 MB/op** | **15,108 allocs/op** | Dev host NTFS I/O |
| `BenchmarkCollectContainerStats_MockEngine_10-16` | 10 containers over `httptest` mock loopback (`statsWorkerMax=4`, uncached) | **560,541 – 595,125 ns/op** | **~109 KB/op** | **~1,060 allocs/op** | Mock JSON HTTP server; no real cgroup reads |
| `BenchmarkCollectContainerStats_MockEngine_50-16` | 50 containers over `httptest` mock loopback (`statsWorkerMax=4`, uncached) | **2,667,689 – 2,712,944 ns/op** | **~540 KB/op** | **~5,219 allocs/op** | Mock JSON HTTP server |
| `BenchmarkCollectContainerStats_MockEngine_100-16` | 100 containers over `httptest` mock loopback (`statsWorkerMax=4`, uncached) | **5,136,879 – 5,291,445 ns/op** | **~1.08 MB/op** | **~10,408 allocs/op** | Mock JSON HTTP server |

### 6.2 `NOT RUN` Live Linux Host Measurements & Verification Commands

The following measurements require a real Linux host kernel (`/proc`, `/sys/fs/cgroup`, systemd slices), a live Docker Engine daemon, or `gcc`/CGO for `-race` and are explicitly **NOT RUN** on Windows:

| Scenario / Metric | Status on Dev Host | Required Environment |
| :--- | :--- | :--- |
| Live `/proc` collector with 10 / 100 / 500 / 1,000 active Linux processes & real multiple OS UIDs | `NOT RUN` | Linux kernel host (Ubuntu 22.04+ / Debian 12+) |
| Real cgroup v2 vs hybrid vs v1 verification (`systemd-run --slice=reneo-panel-<user>.slice`, `cpu.stat`, `memory.current`, `pids.current`) | `NOT RUN` | Linux systemd + cgroup v2 host |
| Live Docker Engine `/containers/{id}/stats?stream=false` with 10 / 50 / 100 real running containers (`docker stats` cross-check) | `NOT RUN` | Running Docker Engine + `/var/run/docker.sock` |
| Account usage API `p50`/`p95`/`p99`, collector CPU %, RAM allocation rate, goroutine count under load | `NOT RUN` | Running `panel-agent` on Linux with `PANEL_PROFILING_ENABLED=true` |
| Go Race Detector (`go test -race ./...`) | `NOT RUN` (`CGO_ENABLED=0`, no `gcc` on Windows) | Linux host or CGO toolchain with `gcc` |

#### Linux Server Reproduction & Validation Commands

Run these commands directly on the target Linux server after deploying `main-runtime-dev`:

```bash
# 1. Run full race-enabled Go test suite and benchmarks on Linux
go test -race -count=1 ./internal/accountusage ./internal/docker ./internal/httpserver
go test -run=^$ -bench=. -benchmem ./internal/accountusage ./internal/docker

# 2. Verify cgroup hierarchy & slice layout on the server
mount | grep cgroup
ls -la /sys/fs/cgroup /sys/fs/cgroup/reneo.slice 2>/dev/null || true

# 3. Cross-check container CPU/Memory against `docker stats --no-stream`
docker stats --no-stream --format "table {{.ID}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# 4. Measure live account-scoped API latency (p50/p95/p99) & goroutine/CPU profile
curl -fsS -H "Authorization: Bearer ypat_SUPERADMIN_TOKEN" \
  "http://127.0.0.1:8787/api/v1/system/metrics/app" | jq .

# With PANEL_PROFILING_ENABLED=true (superadmin only):
go tool pprof -top "http://127.0.0.1:8787/debug/pprof/profile?seconds=30"
go tool pprof -top "http://127.0.0.1:8787/debug/pprof/heap"
```

---

## 7. Acceptance Criteria Check

- Synchronous `200ms` sleep removed from account usage request paths (`TestManagerNonBlockingSnapshotSingleflightRetentionAndBoundedWorkers`).
- Bounded worker pools enforced (`maxProcWorkers = 4`, `maxRefreshWorkers = 4`, `statsWorkerMax = 4`).
- Docker stats migrated from `docker stats --no-stream` subprocesses to Docker Engine API `/containers/{id}/stats?stream=false`.
- Cgroup v2 detection, metrics parsing, failure tolerance, and anti-double-counting validated via unit tests and documented above; live Linux validation commands prepared for server execution.
- Rust remains **not implemented** in Phase 9.1 and is re-evaluated only if Linux `go tool pprof` profiles reveal >5% sustained vCPU or >15% GC overhead from `/proc`/cgroup scanning after these Go optimizations.

