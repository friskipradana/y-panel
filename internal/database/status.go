package database

import (
	"context"
	"database/sql"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/performance"
)

const (
	defaultStatsCacheTTL = 30 * time.Second
	defaultStatsStaleMax = 5 * time.Minute
	statsQueryTimeout    = 3 * time.Second
)

type detailedStats struct {
	ChangelogCount     int64
	RuntimeLogCount    int64
	SettingsAuditCount int64
	UserCount          int64
	ProjectCount       int64
	TunnelCount        int64
}

type statsCache struct {
	mu         sync.RWMutex
	inFlightMu sync.Mutex
	inflight   chan struct{}

	data      detailedStats
	updatedAt time.Time
}

// ConnectionStatus returns the current PostgreSQL reachability and DSN metadata without executing any queries.
func (m *Manager) ConnectionStatus() Status {
	m.mu.RLock()
	status := Status{
		Enabled:   m.cfg.Enabled,
		Connected: m.connected,
		LastError: m.lastError,
	}
	m.mu.RUnlock()

	if m.cfg.DSN != "" {
		status.Host, status.Port, status.Database, status.User = parseDSNFields(m.cfg.DSN)
	}
	return status
}

// PoolStats returns Go sql.DB connection pool metrics for observability.
func (m *Manager) PoolStats() (sql.DBStats, bool) {
	if m == nil || m.db == nil {
		return sql.DBStats{}, false
	}
	return m.db.Stats(), true
}

// InvalidateStatsCache forces the next DetailedStatistics call to refresh from PostgreSQL.
func (m *Manager) InvalidateStatsCache() {
	if m == nil {
		return
	}
	m.stats.mu.Lock()
	m.stats.updatedAt = time.Time{}
	m.stats.mu.Unlock()
}

// DetailedStatistics returns table counts, backed by a 30s TTL cache and singleflight deduplication.
func (m *Manager) DetailedStatistics(ctx context.Context) detailedStats {
	if m == nil || m.db == nil || !m.IsConnected() {
		return detailedStats{}
	}

	now := time.Now()
	m.stats.mu.RLock()
	cached := m.stats.data
	updatedAt := m.stats.updatedAt
	m.stats.mu.RUnlock()

	if !updatedAt.IsZero() && now.Sub(updatedAt) < defaultStatsCacheTTL {
		return cached
	}

	// Singleflight guard so concurrent dashboard polls do not stampede the DB
	m.stats.inFlightMu.Lock()
	if ch := m.stats.inflight; ch != nil {
		m.stats.inFlightMu.Unlock()
		select {
		case <-ch:
		case <-ctx.Done():
			return cached
		}
		m.stats.mu.RLock()
		res := m.stats.data
		m.stats.mu.RUnlock()
		return res
	}

	// Re-check cache after acquiring singleflight lock
	m.stats.mu.RLock()
	if !m.stats.updatedAt.IsZero() && time.Since(m.stats.updatedAt) < defaultStatsCacheTTL {
		res := m.stats.data
		m.stats.mu.RUnlock()
		m.stats.inFlightMu.Unlock()
		return res
	}
	m.stats.mu.RUnlock()

	done := make(chan struct{})
	m.stats.inflight = done
	m.stats.inFlightMu.Unlock()

	defer func() {
		m.stats.inFlightMu.Lock()
		m.stats.inflight = nil
		close(done)
		m.stats.inFlightMu.Unlock()
	}()

	fresh, err := m.queryAggregatedCounts(ctx)
	if err != nil {
		// Retain last valid cache within max stale window on transient failure
		if !updatedAt.IsZero() && time.Since(updatedAt) < defaultStatsStaleMax {
			return cached
		}
		return cached
	}

	m.stats.mu.Lock()
	m.stats.data = fresh
	m.stats.updatedAt = time.Now()
	m.stats.mu.Unlock()

	return fresh
}

// queryAggregatedCounts fetches all six table counts in a single database round-trip with a bounded timeout.
func (m *Manager) queryAggregatedCounts(parent context.Context) (detailedStats, error) {
	ctx, cancel := context.WithTimeout(parent, statsQueryTimeout)
	defer cancel()

	started := time.Now()
	var s detailedStats
	err := m.db.QueryRowContext(ctx, `
		SELECT
			(SELECT COUNT(*) FROM changelog_entries),
			(SELECT COUNT(*) FROM runtime_logs),
			(SELECT COUNT(*) FROM settings_audit),
			(SELECT COUNT(*) FROM users),
			(SELECT COUNT(*) FROM projects),
			(SELECT COUNT(*) FROM tunnels)
	`).Scan(
		&s.ChangelogCount,
		&s.RuntimeLogCount,
		&s.SettingsAuditCount,
		&s.UserCount,
		&s.ProjectCount,
		&s.TunnelCount,
	)
	performance.DefaultRegistry.RecordDBQuery("aggregated_counts", time.Since(started), err)
	return s, err
}

// Status combines ConnectionStatus with cached DetailedStatistics for backward compatibility.
func (m *Manager) Status() Status {
	status := m.ConnectionStatus()
	if !status.Connected || m.db == nil {
		return status
	}

	counts := m.DetailedStatistics(context.Background())
	status.ChangelogCount = counts.ChangelogCount
	status.RuntimeLogCount = counts.RuntimeLogCount
	status.SettingsAuditCount = counts.SettingsAuditCount
	status.UserCount = counts.UserCount
	status.ProjectCount = counts.ProjectCount
	status.TunnelCount = counts.TunnelCount
	return status
}

