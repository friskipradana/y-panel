import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ActivitySquare, Database, RefreshCcw, ScrollText, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { getDatabaseStatus, truncateDatabaseData } from '@/api/agent'
import { Select } from '@/components/ui/Select'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'

const LOG_ROW_OPTIONS = [10, 20, 40, 80]
const TRUNCATE_DAYS = [3, 7, 14, 30, 60]
const TRUNCATE_TARGETS = [
  { label: 'settings.db.all', value: 'all' },
  { label: 'settings.db.runtimeLogs', value: 'runtime_logs' },
  { label: 'settings.db.settingsAudit', value: 'settings_audit' },
]

function DetailRow({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warning' }) {
  return (
    <div className={`flex items-center justify-between px-2.5 py-1.5 rounded border border-[var(--win-border)] bg-[var(--panel-surface)] text-[12px] ${tone === 'warning' ? 'border-[color:var(--panel-warning-border)] bg-[color:var(--panel-warning-bg)]' : ''}`}>
      <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{label}</span>
      <span className={`text-right font-mono truncate max-w-[65%] ${tone === 'warning' ? 'text-[var(--panel-warning-text)]' : 'text-[var(--win-text)]'}`}>{value}</span>
    </div>
  )
}

export function ReneoDatabaseTab({ authenticated }: { authenticated?: boolean }) {
  const { t } = useI18n()
  const query = useQuery({
    queryKey: ['database-status'],
    queryFn: getDatabaseStatus,
    refetchInterval: 8000,
    retry: 1,
  })

  useEffect(() => {
    if (authenticated) {
      void query.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const [logQuery, setLogQuery] = useState('')
  const [logLimit, setLogLimit] = useState(10)
  const [truncateTarget, setTruncateTarget] = useState('all')
  const [truncateDay, setTruncateDay] = useState(7)
  const [truncating, setTruncating] = useState(false)

  const handleTruncate = async () => {
    const isConfirmed = await alertLib.confirm(
      t('database.truncateConfirmTitle'),
      t('database.truncateConfirmMessage', { target: truncateTarget, days: truncateDay }),
      t('database.truncateConfirmAction'),
      t('common.cancel'),
      'warning',
      'settings'
    )

    if (!isConfirmed) return

    setTruncating(true)
    alertLib.showLoading(t('database.truncatingTitle'), t('database.truncatingMessage'), 'database')

    try {
      const res = await truncateDatabaseData(truncateTarget, truncateDay)
      alertLib.close()
      setTimeout(() => {
        alertLib.fire(t('database.truncateSuccessTitle'), t('database.truncateSuccessMessage', { affected: res.affected }), 'success', 'settings')
      }, 300)
      void query.refetch()
    } catch (e: any) {
      alertLib.close()
      setTimeout(() => {
        alertLib.fire(t('database.truncateFailedTitle'), t('database.truncateFailedMessage', { error: e.response?.data?.error || e.message }), 'error', 'settings')
      }, 300)
    } finally {
      setTruncating(false)
    }
  }

  const status = query.data?.status
  const runtimeLogs = query.data?.runtimeLogs ?? []
  const settingsAudit = query.data?.settingsAudit ?? []

  const filteredRuntimeLogs = useMemo(() => {
    const keyword = logQuery.trim().toLowerCase()
    const source = keyword
      ? runtimeLogs.filter((entry) => {
        const haystack = [entry.service, entry.level, entry.message, entry.metadata ?? '']
          .join(' ')
          .toLowerCase()
        return haystack.includes(keyword)
      })
      : runtimeLogs
    return source.slice(0, logLimit)
  }, [runtimeLogs, logQuery, logLimit])

  if (query.isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[260px] my-auto">
        <LoadingState>{t('database.loadingStatus')}</LoadingState>
      </div>
    )
  }

  if (query.isError || !query.data || !status) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[260px] my-auto">
        <ErrorState
          className="max-w-sm w-full"
          title={t('database.statusLoadFailed')}
          hint={t('database.statusLoadFailedHint')}
          action={
            <Button variant="primary" size="sm" loading={query.isFetching} onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── Single Unified Database Card ── */}
      <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
        {/* Section 1: Database Status & Metrics Overview */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{status.database || 'Database'}</h2>
              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                {status.user}@{status.host}:{status.port}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={status.connected ? 'success' : status.enabled ? 'danger' : 'neutral'} dot>
                {status.connected ? t('database.connected') : status.enabled ? t('database.unavailable') : t('database.disabled')}
              </Badge>
              <IconButton id="database-refresh" type="button" onClick={() => void query.refetch()} label={t('database.refreshStatus')} className="!h-7 !w-7">
                <RefreshCcw size={13} className={(query.isFetching && !query.isLoading) ? 'animate-spin' : ''} />
              </IconButton>
            </div>
          </div>

          {/* Compact 4-Metric Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-[var(--panel-primary-text)]" />
                {t('database.connectionLabel')}
              </span>
              <div className="mt-1">
                <span className="text-[12px] font-semibold font-mono text-[var(--win-text)] truncate block">
                  {status.connected ? t('database.connected') : status.enabled ? t('database.unavailable') : t('database.disabled')}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] font-mono truncate block">
                  {status.host}:{status.port}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                <ScrollText size={12} className="text-[var(--panel-primary-text)]" />
                {t('database.runtimeLogsLabel')}
              </span>
              <div className="mt-1">
                <span className="text-[13px] font-bold font-mono text-[var(--win-text)] block">
                  {status.runtimeLogCount?.toLocaleString() ?? 0}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] truncate block">
                  {t('database.runtimeLogsDescription')}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                <ActivitySquare size={12} className="text-[var(--panel-primary-text)]" />
                {t('database.changelogRowsLabel')}
              </span>
              <div className="mt-1">
                <span className="text-[13px] font-bold font-mono text-[var(--win-text)] block">
                  {status.changelogCount?.toLocaleString() ?? 0}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] truncate block">
                  {t('database.changelogRowsDescription')}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                <Database size={12} className="text-[var(--panel-primary-text)]" />
                {t('database.settingsAuditLabel')}
              </span>
              <div className="mt-1">
                <span className="text-[13px] font-bold font-mono text-[var(--win-text)] block">
                  {status.settingsAuditCount?.toLocaleString() ?? 0}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)] truncate block">
                  {t('database.settingsAuditDescription')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* Section 2: Pembersihan Data */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t('settings.db.cleanupTitle')}</h2>
            </div>
            <span className="text-[11px] text-[var(--text-secondary)]">{t('settings.db.cleanupSubtitle')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              id="database-truncate-target"
              value={truncateTarget}
              onChange={setTruncateTarget}
              options={TRUNCATE_TARGETS.map((target) => ({ value: target.value, label: t(target.label) }))}
              className="min-w-[180px]"
              buttonClassName="!h-8 px-2.5 text-[12px]"
              dropdownClassName="min-w-[200px]"
            />
            <Select
              id="database-truncate-day"
              value={String(truncateDay)}
              onChange={(value) => setTruncateDay(Number(value))}
              options={TRUNCATE_DAYS.map((day) => ({ value: String(day), label: t('database.olderThanDays', { days: day }) }))}
              className="min-w-[130px]"
              buttonClassName="!h-8 px-2.5 text-[12px]"
              dropdownClassName="min-w-[130px]"
            />
            <Button type="button" size="sm" onClick={() => void handleTruncate()} loading={truncating} variant="danger">
              {t('database.truncateButton')}
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* Section 3: Detail Koneksi & Runtime Logs */}
        <div className="grid gap-3.5 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          {/* Left: Detail Koneksi */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
                <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t('database.connectionDetailsTitle')}</h2>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)]">{t('database.connectionDetailsMeta')}</span>
            </div>

            <div className="grid gap-1.5 text-[12px]">
              <DetailRow label={t('database.enabledLabel')} value={status.enabled ? t('common.yes') : t('common.no')} />
              <DetailRow label={t('database.hostLabel')} value={status.host || '-'} />
              <DetailRow label={t('database.portLabel')} value={status.port || '-'} />
              <DetailRow label={t('database.databaseLabel')} value={status.database || '-'} />
              <DetailRow label={t('database.userLabel')} value={status.user || '-'} />
              <DetailRow label={t('database.lastErrorLabel')} value={status.lastError || t('database.noRecentErrors')} tone={status.lastError ? 'warning' : 'normal'} />
            </div>
          </div>

          {/* Right: Runtime Logs */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
                <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t('database.persistedLogsTitle')}</h2>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)]">
                {t('database.latestRows', { shown: filteredRuntimeLogs.length, total: runtimeLogs.length })}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="docker-search-wrap flex-1 min-w-[180px]">
                <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
                <input
                  id="database-log-search"
                  type="text"
                  value={logQuery}
                  onChange={(e) => setLogQuery(e.target.value)}
                  placeholder={t('database.logSearchPlaceholder')}
                  className="docker-search-input !w-full !h-8 text-[12px]"
                />
              </div>
              <Select
                id="database-log-limit"
                value={String(logLimit)}
                onChange={(value) => setLogLimit(Number(value))}
                options={LOG_ROW_OPTIONS.map((option) => ({ value: String(option), label: t('database.rowsOption', { count: option }) }))}
                className="max-w-[110px]"
                buttonClassName="!h-8 px-2.5 text-[12px] panel-input--mono"
                dropdownClassName="min-w-[110px]"
                searchable
                searchPlaceholder={t('database.limitSearchPlaceholder')}
              />
            </div>

            <div className="max-h-[240px] overflow-y-auto pr-1 flex flex-col gap-1.5">
              {runtimeLogs.length === 0 ? (
                <EmptyState icon={<ScrollText />}>{t('database.emptyRuntimeLogs')}</EmptyState>
              ) : filteredRuntimeLogs.length === 0 ? (
                <EmptyState icon={<Search />}>{t('database.noMatchingLogs')}</EmptyState>
              ) : (
                filteredRuntimeLogs.map((entry) => {
                  const isError = entry.level === 'error';
                  return (
                    <div
                      key={entry.id}
                      className={`p-2 rounded border border-[var(--win-border)] bg-[var(--panel-surface)] text-[11.5px] ${isError ? 'border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)]' : ''}`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--panel-primary-text)]">{entry.service}</span>
                        <span>•</span>
                        <span className={isError ? 'text-[var(--panel-danger-text)] font-semibold' : ''}>{entry.level}</span>
                        <span>•</span>
                        <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <div className={`mt-1 font-medium ${isError ? 'text-[var(--panel-danger-text)]' : 'text-[var(--win-text)]'}`}>
                        {entry.message}
                      </div>
                      {entry.metadata && entry.metadata !== '{}' ? (
                        <pre className="mt-1 p-1.5 rounded bg-[var(--panel-surface-hover)] font-mono text-[10.5px] text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap break-words">
                          {entry.metadata}
                        </pre>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--win-border)]" />

        {/* Section 4: Audit Settings Terbaru */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <ActivitySquare className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
              <h2 className="text-[13px] font-semibold text-[var(--win-text)]">{t('database.recentAuditTitle')}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-secondary)]">{t('database.recentAuditMeta')}</span>
              <Badge tone="warning">{t('database.rowsCount', { count: settingsAudit.length })}</Badge>
            </div>
          </div>

          <div className="max-h-[180px] overflow-y-auto pr-1 flex flex-col gap-1.5">
            {settingsAudit.length === 0 ? (
              <EmptyState icon={<ActivitySquare />}>{t('database.emptySettingsAudit')}</EmptyState>
            ) : (
              settingsAudit.map((entry) => (
                <div key={entry.id} className="p-2 rounded border border-[var(--win-border)] bg-[var(--panel-surface)] text-[11.5px]">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--win-text)]">{entry.username || 'system'}</span>
                    <span>•</span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1.5 grid gap-2 text-[11.5px] text-[var(--win-text)] sm:grid-cols-3 font-mono">
                    <div><strong className="text-[var(--text-secondary)]">{t('database.hostnameLabel')}:</strong> {entry.hostname || '-'}</div>
                    <div><strong className="text-[var(--text-secondary)]">{t('database.timezoneLabel')}:</strong> {entry.timezone || '-'}</div>
                    <div className="truncate"><strong className="text-[var(--text-secondary)]">{t('database.nameserverLabel')}:</strong> {entry.nameservers.length > 0 ? entry.nameservers.join(', ') : '—'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {!status.connected && status.enabled ? (
          <>
            <div className="border-t border-[var(--win-border)]" />
            <ErrorState title={t('database.mariadbNotReady')} hint={t('database.mariadbNotReadyHint')} />
          </>
        ) : null}
      </div>
    </div>
  )
}
