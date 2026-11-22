package performance

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRegistryMetricsAndQuantiles(t *testing.T) {
	r := NewRegistry(4)
	for _, d := range []time.Duration{
		10 * time.Millisecond,
		20 * time.Millisecond,
		30 * time.Millisecond,
		40 * time.Millisecond,
		50 * time.Millisecond, // triggers eviction of oldest quarter
	} {
		r.RecordAPIRequest(d, http.StatusOK)
	}
	r.RecordAPIRequest(100*time.Millisecond, http.StatusInternalServerError)

	r.RecordSystemSummary(12 * time.Millisecond)
	r.RecordDBQuery("status", 5*time.Millisecond, nil)
	r.RecordDBQuery("fail", 8*time.Millisecond, http.ErrHandlerTimeout)
	r.RecordDockerOp("ps", 4*time.Millisecond, nil)
	r.RecordDockerOp("inspect", 9*time.Millisecond, http.ErrBodyReadAfterClose)
	r.RecordProjectStart(150*time.Millisecond, nil)
	r.RecordProjectStop(50*time.Millisecond, nil)
	r.RecordBackgroundWorker(25*time.Millisecond, nil)
	r.TrackTerminalSession(2)
	r.TrackTerminalSession(-1)
	r.RecordTerminalOutput(4096)

	snap := r.Snapshot()
	if snap.APIRequestsTotal != 6 {
		t.Fatalf("APIRequestsTotal = %d, want 6", snap.APIRequestsTotal)
	}
	if snap.APIErrorsTotal != 1 {
		t.Fatalf("APIErrorsTotal = %d, want 1", snap.APIErrorsTotal)
	}
	if snap.APILatencyP50Ms <= 0 || snap.APILatencyP95Ms < snap.APILatencyP50Ms || snap.APILatencyP99Ms < snap.APILatencyP95Ms {
		t.Fatalf("unexpected latency quantiles: p50=%v p95=%v p99=%v", snap.APILatencyP50Ms, snap.APILatencyP95Ms, snap.APILatencyP99Ms)
	}
	if snap.SummaryCount != 1 || snap.SummaryLatencyMs != 12 {
		t.Fatalf("unexpected summary metrics: count=%d ms=%v", snap.SummaryCount, snap.SummaryLatencyMs)
	}
	if snap.DBQueriesTotal != 2 || snap.DBQueryErrorsTotal != 1 {
		t.Fatalf("unexpected DB metrics: total=%d err=%d", snap.DBQueriesTotal, snap.DBQueryErrorsTotal)
	}
	if snap.DockerOpsTotal != 2 || snap.DockerErrorsTotal != 1 {
		t.Fatalf("unexpected Docker metrics: total=%d err=%d", snap.DockerOpsTotal, snap.DockerErrorsTotal)
	}
	if snap.ProjectStartAvgMs != 150 || snap.ProjectStopAvgMs != 50 {
		t.Fatalf("unexpected project metrics: start=%v stop=%v", snap.ProjectStartAvgMs, snap.ProjectStopAvgMs)
	}
	if snap.TerminalSessions != 1 || snap.TerminalBytesTotal != 4096 {
		t.Fatalf("unexpected terminal metrics: sessions=%d bytes=%d", snap.TerminalSessions, snap.TerminalBytesTotal)
	}

	prom := r.PrometheusFormat()
	for _, want := range []string{
		"reneo_runtime_goroutines ",
		"reneo_runtime_heap_alloc_bytes ",
		"reneo_api_requests_total 6",
		"reneo_api_errors_total 1",
		"reneo_database_queries_total 2",
		"reneo_docker_operations_total 2",
		"reneo_terminal_active_sessions 1",
		"reneo_terminal_output_bytes_total 4096",
		"reneo_background_worker_duration_seconds ",
	} {
		if !strings.Contains(prom, want) {
			t.Fatalf("prometheus export missing %q\n%s", want, prom)
		}
	}
}

func TestRegisterPprofRoutesUsesAuthWrapper(t *testing.T) {
	mux := http.NewServeMux()
	RegisterPprofRoutes(mux, func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Admin") != "1" {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	req := httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected wrapped pprof to return 403, got %d", rec.Code)
	}

	reqOK := httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil)
	reqOK.Header.Set("X-Admin", "1")
	recOK := httptest.NewRecorder()
	mux.ServeHTTP(recOK, reqOK)
	if recOK.Code != http.StatusOK {
		t.Fatalf("expected authorized pprof to return 200, got %d", recOK.Code)
	}
}

