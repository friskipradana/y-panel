package performance

import (
	"fmt"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// MetricSnapshot contains point-in-time performance metrics for Reneo.
type MetricSnapshot struct {
	Timestamp          time.Time          `json:"timestamp"`
	Goroutines         int                `json:"goroutines"`
	HeapAllocBytes     uint64             `json:"heapAllocBytes"`
	HeapSysBytes       uint64             `json:"heapSysBytes"`
	NumGC              uint32             `json:"numGC"`
	APIRequestsTotal   uint64             `json:"apiRequestsTotal"`
	APIErrorsTotal     uint64             `json:"apiErrorsTotal"`
	APILatencyP50Ms    float64            `json:"apiLatencyP50Ms"`
	APILatencyP95Ms    float64            `json:"apiLatencyP95Ms"`
	APILatencyP99Ms    float64            `json:"apiLatencyP99Ms"`
	SummaryLatencyMs   float64            `json:"summaryLatencyMs"`
	SummaryCount       uint64             `json:"summaryCount"`
	DBQueriesTotal     uint64             `json:"dbQueriesTotal"`
	DBQueryErrorsTotal uint64             `json:"dbQueryErrorsTotal"`
	DockerOpsTotal     uint64             `json:"dockerOpsTotal"`
	DockerErrorsTotal  uint64             `json:"dockerErrorsTotal"`
	ProjectStartsTotal uint64             `json:"projectStartsTotal"`
	ProjectStopsTotal  uint64             `json:"projectStopsTotal"`
	ProjectStartAvgMs  float64            `json:"projectStartAvgMs"`
	ProjectStopAvgMs   float64            `json:"projectStopAvgMs"`
	TerminalSessions   int64              `json:"terminalSessions"`
	TerminalBytesTotal uint64             `json:"terminalBytesTotal"`
}

// Registry manages and aggregates performance metrics.
type Registry struct {
	mu                 sync.RWMutex
	apiRequestsTotal   atomic.Uint64
	apiErrorsTotal     atomic.Uint64
	summaryCount       atomic.Uint64
	summaryTotalMs     atomic.Uint64 // store sum of ms for average
	lastSummaryMs      atomic.Uint64
	dbQueriesTotal     atomic.Uint64
	dbQueryErrorsTotal atomic.Uint64
	dockerOpsTotal     atomic.Uint64
	dockerErrorsTotal  atomic.Uint64
	projectStartsTotal atomic.Uint64
	projectStartSumMs  atomic.Uint64
	projectStopsTotal  atomic.Uint64
	projectStopSumMs   atomic.Uint64
	workerRunsTotal    atomic.Uint64
	workerErrorsTotal  atomic.Uint64
	workerLastMs       atomic.Uint64
	terminalSessions   atomic.Int64
	terminalBytesTotal atomic.Uint64

	// latency samples for quantile calculation (rolling buffer)
	latencyMu      sync.Mutex
	latencySamples []float64 // in milliseconds
	maxSamples     int
}

var DefaultRegistry = NewRegistry(500)

func NewRegistry(maxSamples int) *Registry {
	if maxSamples <= 0 {
		maxSamples = 500
	}
	return &Registry{
		maxSamples:     maxSamples,
		latencySamples: make([]float64, 0, maxSamples),
	}
}

// RecordAPIRequest records latency and status of an HTTP request.
func (r *Registry) RecordAPIRequest(duration time.Duration, status int) {
	r.apiRequestsTotal.Add(1)
	if status >= 400 {
		r.apiErrorsTotal.Add(1)
	}

	ms := float64(duration.Microseconds()) / 1000.0
	r.latencyMu.Lock()
	if len(r.latencySamples) >= r.maxSamples {
		// Evict oldest quarter
		copy(r.latencySamples, r.latencySamples[r.maxSamples/4:])
		r.latencySamples = r.latencySamples[:r.maxSamples-r.maxSamples/4]
	}
	r.latencySamples = append(r.latencySamples, ms)
	r.latencyMu.Unlock()
}

// RecordSystemSummary records the duration of a system summary computation.
func (r *Registry) RecordSystemSummary(duration time.Duration) {
	ms := uint64(duration.Milliseconds())
	r.summaryCount.Add(1)
	r.summaryTotalMs.Add(ms)
	r.lastSummaryMs.Store(ms)
}

// RecordDBQuery records a database query execution.
func (r *Registry) RecordDBQuery(_ string, _ time.Duration, err error) {
	r.dbQueriesTotal.Add(1)
	if err != nil {
		r.dbQueryErrorsTotal.Add(1)
	}
}

// RecordDockerOp records a Docker operation execution.
func (r *Registry) RecordDockerOp(_ string, _ time.Duration, err error) {
	r.dockerOpsTotal.Add(1)
	if err != nil {
		r.dockerErrorsTotal.Add(1)
	}
}

// RecordProjectStart records the duration of starting a project.
func (r *Registry) RecordProjectStart(duration time.Duration, _ error) {
	r.projectStartsTotal.Add(1)
	r.projectStartSumMs.Add(uint64(duration.Milliseconds()))
}

// RecordProjectStop records the duration of stopping a project.
func (r *Registry) RecordProjectStop(duration time.Duration, _ error) {
	r.projectStopsTotal.Add(1)
	r.projectStopSumMs.Add(uint64(duration.Milliseconds()))
}

// RecordBackgroundWorker records execution duration and error status of a background worker run.
func (r *Registry) RecordBackgroundWorker(duration time.Duration, err error) {
	r.workerRunsTotal.Add(1)
	r.workerLastMs.Store(uint64(duration.Milliseconds()))
	if err != nil {
		r.workerErrorsTotal.Add(1)
	}
}

// TrackTerminalSession updates the count of active terminal sessions.
func (r *Registry) TrackTerminalSession(delta int64) {
	r.terminalSessions.Add(delta)
}

// RecordTerminalOutput tracks output bytes sent to clients.
func (r *Registry) RecordTerminalOutput(bytes int) {
	if bytes > 0 {
		r.terminalBytesTotal.Add(uint64(bytes))
	}
}

// Snapshot generates a snapshot of current system and application metrics.
func (r *Registry) Snapshot() MetricSnapshot {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	p50, p95, p99 := r.calculateQuantiles()
	startsTotal := r.projectStartsTotal.Load()
	var startAvg float64
	if startsTotal > 0 {
		startAvg = float64(r.projectStartSumMs.Load()) / float64(startsTotal)
	}
	stopsTotal := r.projectStopsTotal.Load()
	var stopAvg float64
	if stopsTotal > 0 {
		stopAvg = float64(r.projectStopSumMs.Load()) / float64(stopsTotal)
	}

	return MetricSnapshot{
		Timestamp:          time.Now(),
		Goroutines:         runtime.NumGoroutine(),
		HeapAllocBytes:     m.Alloc,
		HeapSysBytes:       m.Sys,
		NumGC:              m.NumGC,
		APIRequestsTotal:   r.apiRequestsTotal.Load(),
		APIErrorsTotal:     r.apiErrorsTotal.Load(),
		APILatencyP50Ms:    p50,
		APILatencyP95Ms:    p95,
		APILatencyP99Ms:    p99,
		SummaryLatencyMs:   float64(r.lastSummaryMs.Load()),
		SummaryCount:       r.summaryCount.Load(),
		DBQueriesTotal:     r.dbQueriesTotal.Load(),
		DBQueryErrorsTotal: r.dbQueryErrorsTotal.Load(),
		DockerOpsTotal:     r.dockerOpsTotal.Load(),
		DockerErrorsTotal:  r.dockerErrorsTotal.Load(),
		ProjectStartsTotal: startsTotal,
		ProjectStopsTotal:  stopsTotal,
		ProjectStartAvgMs:  startAvg,
		ProjectStopAvgMs:   stopAvg,
		TerminalSessions:   r.terminalSessions.Load(),
		TerminalBytesTotal: r.terminalBytesTotal.Load(),
	}
}

func (r *Registry) calculateQuantiles() (p50, p95, p99 float64) {
	r.latencyMu.Lock()
	n := len(r.latencySamples)
	if n == 0 {
		r.latencyMu.Unlock()
		return 0, 0, 0
	}
	sorted := make([]float64, n)
	copy(sorted, r.latencySamples)
	r.latencyMu.Unlock()

	// Simple insertion sort for bounded array
	for i := 1; i < n; i++ {
		key := sorted[i]
		j := i - 1
		for j >= 0 && sorted[j] > key {
			sorted[j+1] = sorted[j]
			j--
		}
		sorted[j+1] = key
	}

	p50 = sorted[int(float64(n)*0.50)]
	p95 = sorted[int(float64(n)*0.95)]
	p99 = sorted[int(float64(n)*0.99)]
	return
}

// PrometheusFormat exports metrics in standard Prometheus text format.
func (r *Registry) PrometheusFormat() string {
	snap := r.Snapshot()
	var b strings.Builder

	fmt.Fprintf(&b, "# HELP reneo_runtime_goroutines Number of running goroutines\n")
	fmt.Fprintf(&b, "# TYPE reneo_runtime_goroutines gauge\n")
	fmt.Fprintf(&b, "reneo_runtime_goroutines %d\n", snap.Goroutines)

	fmt.Fprintf(&b, "# HELP reneo_runtime_heap_alloc_bytes Current heap allocation in bytes\n")
	fmt.Fprintf(&b, "# TYPE reneo_runtime_heap_alloc_bytes gauge\n")
	fmt.Fprintf(&b, "reneo_runtime_heap_alloc_bytes %d\n", snap.HeapAllocBytes)

	fmt.Fprintf(&b, "# HELP reneo_api_requests_total Total HTTP API requests handled\n")
	fmt.Fprintf(&b, "# TYPE reneo_api_requests_total counter\n")
	fmt.Fprintf(&b, "reneo_api_requests_total %d\n", snap.APIRequestsTotal)

	fmt.Fprintf(&b, "# HELP reneo_api_errors_total Total HTTP API errors (4xx/5xx)\n")
	fmt.Fprintf(&b, "# TYPE reneo_api_errors_total counter\n")
	fmt.Fprintf(&b, "reneo_api_errors_total %d\n", snap.APIErrorsTotal)

	fmt.Fprintf(&b, "# HELP reneo_database_queries_total Total database queries performed\n")
	fmt.Fprintf(&b, "# TYPE reneo_database_queries_total counter\n")
	fmt.Fprintf(&b, "reneo_database_queries_total %d\n", snap.DBQueriesTotal)

	fmt.Fprintf(&b, "# HELP reneo_database_query_errors_total Total database query errors\n")
	fmt.Fprintf(&b, "# TYPE reneo_database_query_errors_total counter\n")
	fmt.Fprintf(&b, "reneo_database_query_errors_total %d\n", snap.DBQueryErrorsTotal)

	fmt.Fprintf(&b, "# HELP reneo_docker_operations_total Total docker operations performed\n")
	fmt.Fprintf(&b, "# TYPE reneo_docker_operations_total counter\n")
	fmt.Fprintf(&b, "reneo_docker_operations_total %d\n", snap.DockerOpsTotal)

	fmt.Fprintf(&b, "# HELP reneo_docker_operation_errors_total Total docker operation errors\n")
	fmt.Fprintf(&b, "# TYPE reneo_docker_operation_errors_total counter\n")
	fmt.Fprintf(&b, "reneo_docker_operation_errors_total %d\n", snap.DockerErrorsTotal)

	fmt.Fprintf(&b, "# HELP reneo_terminal_active_sessions Number of active terminal sessions\n")
	fmt.Fprintf(&b, "# TYPE reneo_terminal_active_sessions gauge\n")
	fmt.Fprintf(&b, "reneo_terminal_active_sessions %d\n", snap.TerminalSessions)

	fmt.Fprintf(&b, "# HELP reneo_terminal_output_bytes_total Total terminal output bytes streamed\n")
	fmt.Fprintf(&b, "# TYPE reneo_terminal_output_bytes_total counter\n")
	fmt.Fprintf(&b, "reneo_terminal_output_bytes_total %d\n", snap.TerminalBytesTotal)

	fmt.Fprintf(&b, "# HELP reneo_api_request_duration_p50_seconds 50th percentile HTTP API latency in seconds\n")
	fmt.Fprintf(&b, "# TYPE reneo_api_request_duration_p50_seconds gauge\n")
	fmt.Fprintf(&b, "reneo_api_request_duration_p50_seconds %.6f\n", snap.APILatencyP50Ms/1000.0)

	fmt.Fprintf(&b, "# HELP reneo_api_request_duration_p95_seconds 95th percentile HTTP API latency in seconds\n")
	fmt.Fprintf(&b, "# TYPE reneo_api_request_duration_p95_seconds gauge\n")
	fmt.Fprintf(&b, "reneo_api_request_duration_p95_seconds %.6f\n", snap.APILatencyP95Ms/1000.0)

	fmt.Fprintf(&b, "# HELP reneo_system_summary_duration_seconds Latest system summary duration in seconds\n")
	fmt.Fprintf(&b, "# TYPE reneo_system_summary_duration_seconds gauge\n")
	fmt.Fprintf(&b, "reneo_system_summary_duration_seconds %.6f\n", snap.SummaryLatencyMs/1000.0)

	fmt.Fprintf(&b, "# HELP reneo_project_start_duration_seconds Average project start duration in seconds\n")
	fmt.Fprintf(&b, "# TYPE reneo_project_start_duration_seconds gauge\n")
	fmt.Fprintf(&b, "reneo_project_start_duration_seconds %.6f\n", snap.ProjectStartAvgMs/1000.0)

	fmt.Fprintf(&b, "# HELP reneo_project_stop_duration_seconds Average project stop duration in seconds\n")
	fmt.Fprintf(&b, "# TYPE reneo_project_stop_duration_seconds gauge\n")
	fmt.Fprintf(&b, "reneo_project_stop_duration_seconds %.6f\n", snap.ProjectStopAvgMs/1000.0)

	fmt.Fprintf(&b, "# HELP reneo_background_worker_duration_seconds Latest background worker execution duration in seconds\n")
	fmt.Fprintf(&b, "# TYPE reneo_background_worker_duration_seconds gauge\n")
	fmt.Fprintf(&b, "reneo_background_worker_duration_seconds %.6f\n", float64(r.workerLastMs.Load())/1000.0)

	fmt.Fprintf(&b, "# HELP reneo_background_worker_errors_total Total background worker errors\n")
	fmt.Fprintf(&b, "# TYPE reneo_background_worker_errors_total counter\n")
	fmt.Fprintf(&b, "reneo_background_worker_errors_total %d\n", r.workerErrorsTotal.Load())

	return b.String()
}
