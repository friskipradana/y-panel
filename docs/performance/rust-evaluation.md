# Phase 9 Evaluation: Should Reneo Add a Rust Host Telemetry Agent?

> **Decision**: **NOT NEEDED NOW (Defer Rust Implementation)**  
> **Date**: 2026-11-11  
> **Principle Enforced**: *"Jangan menambahkan Rust sebelum ada hasil profiling yang membenarkan kebutuhan tersebut."*

---

## 1. Evaluation Context & Criteria

Under Reneo's hybrid roadmap, Go owns the entire Control Plane (`cmd/panel-agent`), while a small out-of-process Rust host telemetry binary (e.g., communicating over a local Unix domain socket) should ONLY be introduced if production profiling shows that Go's collector introduces unacceptable CPU usage, GC pressure, latency, or Linux sysfs/cgroup v2 bottlenecks under high container/process counts.

Evaluation factors:
1. Measured CPU, latency, and heap allocation cost of the optimized Go collector (`internal/system`, `internal/docker`, `internal/terminal`).
2. Existing interface extensibility (`SnapshotService` in [`internal/system/snapshot.go`](../../internal/system/snapshot.go)).
3. Remaining Linux-host hotspots (`internal/accountusage/proc_linux.go`) and whether Go can eliminate them first.
4. Build, cross-compilation, installer (`install.sh`), packaging, and operational complexity of maintaining a dual Go + Rust release pipeline.

---

## 2. Empirical Evidence from Optimized Go Collectors

Post-optimization Go microbenchmarks measured on `AMD Ryzen 7 5700X 8-Core Processor` (`windows/amd64`):

| Subsystem | Measured Result | Memory / Alloc Cost | Architectural Takeaway |
| :--- | ---: | ---: | :--- |
| Host summary snapshot read (`BenchmarkInspectSnapshot`) | **14.20 ns/op** | **0 B/op, 0 allocs/op** | HTTP & WebSocket consumers never block or allocate on read |
| 50-project cached snapshot (`BenchmarkSnapshotAllCached_50Projects`) | **6,413 ns/op** | **10,072 B/op, 5 allocs/op** | Sub-millisecond even at 50 projects |
| Cached Docker container list (`BenchmarkListContainers_EngineCached`) | **18.90 ns/op** | **0 B/op, 0 allocs/op** | Direct Unix Engine API + singleflight TTL cache eliminates CLI forks |
| PTY buffer delivery (`BenchmarkDeliverBuffered`) | **16.44 ns/op** | **0 B/op, 0 allocs/op** | Zero GC churn during sustained terminal output |

Furthermore, Rust toolchain binaries (`rustc`, `cargo`) are neither present in this development environment nor required by current build/install scripts (`go build ./cmd/panel-agent` produces a single self-contained static binary for Linux servers).

---

## 3. Audit Finding: Next Real Linux Bottleneck Is Not Go Runtime Speed

During codebase inspection (`internal/accountusage`), we identified one remaining Linux monitoring pattern relevant to multi-tenant hosting scale:
- [`internal/accountusage/proc_linux.go`](../../internal/accountusage/proc_linux.go) scans `/proc/[0-9]*/stat` twice with a synchronous `time.Sleep(200 * time.Millisecond)` per UID in `processUsage(osUsername)`.
- [`internal/accountusage/accountusage.go`](../../internal/accountusage/accountusage.go) executes `docker stats --no-stream` CLI subprocesses (cached for `5s` per account).

**Why this does NOT justify Rust right now**:
1. The bottleneck above is **algorithmic** (synchronous `200ms` sleep + subprocess CLI fork), not Go's language overhead.
2. Fixing it natively in Go (background delta tracker over `/proc` + cgroup v2 memory/CPU accounting + Docker Engine `/containers/{id}/stats?stream=false` over `/var/run/docker.sock`) eliminates the `200ms` wait and subprocess fork completely inside the existing single binary — at ~10% of the engineering cost of building, securing, installing, supervising, and versioning a second Rust daemon.
3. Because `/proc` and cgroups cannot be executed natively on Windows here, optimizing `internal/accountusage/proc_linux.go` is intentionally deferred until live Linux `go tool pprof` testing can validate accuracy directly against real UID/cgroup trees.

---

## 4. Cost-Benefit Comparison: Current Go Snapshot Architecture vs. Rust Sidecar

| Dimension | Optimized Go Control Plane (Current) | Hybrid Go + Rust Telemetry Daemon |
| :--- | :--- | :--- |
| **Deployment Footprint** | Single `panel-agent` binary + frontend bundle | Two binaries (`panel-agent` + `reneo-telemetryd`), extra `systemd` unit, Unix socket permissions/lifecycle |
| **IPC & Serialization Overhead** | Zero-copy in-process memory read (`14.20 ns/op, 0 allocs/op`) | Unix socket framing + JSON/Protobuf/Cap'n Proto decode (~microseconds + allocations per poll) |
| **Build & CI Toolchain** | Go + Bun only | Requires Cargo + Rust target toolchains (`x86_64-unknown-linux-musl` / `aarch64`) alongside Go |
| **Failure Surface** | Single supervision lifecycle (`SIGINT`/`SIGTERM`) | Cross-process stale socket recovery, version mismatch handling, orphan sidecar risks |
| **Security Boundary** | Single process RBAC + capability checks | Extra privileged root telemetry daemon socket requiring strict peer credential validation |

---

## 5. Final Decision & Quantitative Re-Evaluation Triggers

**Decision**: Keep telemetry inside Go (`internal/system.SnapshotService`). Do **not** introduce a Rust binary at this time.

[`SnapshotService`](../../internal/system/snapshot.go) already abstracts `GetSnapshot() SystemSnapshot`, `Refresh(ctx)`, and `Close()`, so a future Rust daemon can be plugged in behind that Go interface without touching any HTTP handler or frontend code **if and only if** Linux production profiling proves one or more of the following thresholds after Go-level fixes:

1. **Sustained collector CPU > 5% of 1 vCPU** (measured via `/debug/pprof/profile` with `PANEL_PROFILING_ENABLED=true`) attributable specifically to `/proc` or cgroup parsing on high-core hosts with >100 active containers/tenants.
2. **GC pause / allocation pressure > 15% of total CPU** specifically from telemetry string scanning at sub-second sampling intervals.
3. **Sub-100ms eBPF / netlink / cgroup v2 streaming requirements** where Go runtime scheduling jitter is demonstrated in production profiles to degrade SLOs.

