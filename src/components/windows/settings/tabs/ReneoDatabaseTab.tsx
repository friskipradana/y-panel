import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ActivitySquare, Database, HardDriveDownload, RefreshCcw, Search, ShieldCheck } from 'lucide-react'
import { getDatabaseStatus, truncateDatabaseData } from '@/api/agent'
import { Select } from '@/components/ui/Select'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { IconBadge } from '@/components/ui/IconBadge'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { KpiCard } from '@/components/ui/KpiCard'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { TextInput } from '@/components/ui/Field'

const LOG_ROW_OPTIONS = [10, 20, 40, 80]
const TRUNCATE_DAYS = [3, 7, 14, 30, 60]
const TRUNCATE_TARGETS = [
  { label: 'settings.db.all', value: 'all' },
  { label: 'settings.db.runtimeLogs', value: 'runtime_logs' },
  { label: 'settings.db.settingsAudit', value: 'settings_audit' },
]

function DetailRow({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warning' }) {
  return (
    <div className={`panel-muted-block rounded-[14px] px-4 py-3 ${tone === 'warning' ? 'border border-[color:var(--panel-warning-border)] bg-[color:var(--panel-warning-bg)]' : ''}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <span className="panel-section-label">{label}</span>
        <span className={`max-w-[70%] break-words text-right text-[12px] ${tone === 'warning' ? 'text-[var(--panel-warning-text)]' : 'text-[var(--win-text)]'}`}>{value}</span>
      </div>
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
      <div className="panel-window">
        <div className="panel-window__header">
          <div className="panel-window__title">
            <Database className="panel-window__icon h-4 w-4" />
            <div>
              <div className="panel-window__title-text">{t('database.title')}</div>
              <div className="panel-window__meta">{t('database.meta')}</div>
            </div>
          </div>
        </div>
        <div className="panel-window__body">
          <LoadingState>{t('database.loadingStatus')}</LoadingState>
        </div>
      </div>
    )
  }

  if (query.isError || !query.data || !status) {
    return (
      <div className="panel-window">
        <div className="panel-window__header">
          <div className="panel-window__title">
            <Database className="panel-window__icon h-4 w-4" />
            <div>
              <div className="panel-window__title-text">{t('database.title')}</div>
              <div className="panel-window__meta">{t('database.meta')}</div>
            </div>
          </div>
        </div>
        <div className="panel-window__body">
          <ErrorState
            title={t('database.statusLoadFailed')}
            hint={t('database.statusLoadFailedHint')}
            action={
              <Button variant="ghost" loading={query.isFetching} onClick={() => void query.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="panel-window">
      {/* ── Compact Toolbar ── */}
      <div className="flex items-center justify-between border-b border-[var(--win-border)] px-3 py-1 bg-[var(--win-bar)] shrink-0 min-h-[40px]">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--win-text)]">{status.database || 'Database'}</span>
          <span>•</span>
          <span className="text-[var(--panel-success-text)] font-medium">{status.host}:{status.port}</span>
          <span>•</span>
          <span>user: {status.user}</span>
        </div>

        <div className="flex items-center gap-2">
          <IconButton id="database-refresh" type="button" onClick={() => void query.refetch()} label={t('database.refreshStatus')}>
            <RefreshCcw size={14} className={(query.isFetching && !query.isLoading) ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      <div className="panel-window__body">
        <div className="panel-window__stack">
          <section className="panel-hero">
            <div className="panel-hero__eyebrow">
              <Database className="h-3 w-3" />
              {t('database.heroEyebrow')}
            </div>
            <div className="panel-hero__title">{t('database.heroTitle')}</div>
            <p className="panel-hero__description">
              {t('database.heroDescription')}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Select
                id="database-truncate-target"
                value={truncateTarget}
                onChange={setTruncateTarget}
                options={TRUNCATE_TARGETS.map((target) => ({ value: target.value, label: t(target.label) }))}
                className="max-w-[220px]"
                buttonClassName="rounded-full px-3 py-2 text-[12px]"
                dropdownClassName="min-w-[220px]"
                searchable
                searchPlaceholder={t('database.searchTargetPlaceholder')}
              />

              <Select
                id="database-truncate-day"
                value={String(truncateDay)}
                onChange={(value) => setTruncateDay(Number(value))}
                options={TRUNCATE_DAYS.map((day) => ({ value: String(day), label: t('database.olderThanDays', { days: day }) }))}
                className="max-w-[140px]"
                buttonClassName="rounded-full px-3 py-2 text-[12px]"
                dropdownClassName="min-w-[140px]"
                searchable
                searchPlaceholder={t('database.searchDayPlaceholder')}
              />

              <Button type="button" onClick={() => void handleTruncate()} disabled={truncating} variant="danger">
                {truncating ? t('database.truncatingShort') : t('database.truncateButton')}
              </Button>
            </div>
          </section>

          <div className="panel-kpi-grid panel-kpi-grid--4">
            <KpiCard
              icon={<ShieldCheck size={16} />}
              title={t('database.connectionLabel')}
              value={status.connected ? t('database.connected') : status.enabled ? t('database.unavailable') : t('database.disabled')}
              subtitle={
                status.connected ? (
                  <>
                    <span className="block">{status.user}@{status.host}:{status.port}</span>
                    <span className="block opacity-70">{status.database}</span>
                  </>
                ) : (
                  status.lastError || t('database.noActiveConnection')
                )
              }
            />
            <KpiCard icon={<HardDriveDownload size={16} />} title={t('database.runtimeLogsLabel')} value={String(status.runtimeLogCount ?? 0)} subtitle={t('database.runtimeLogsDescription')} />
            <KpiCard icon={<ActivitySquare size={16} />} title={t('database.changelogRowsLabel')} value={String(status.changelogCount ?? 0)} subtitle={t('database.changelogRowsDescription')} />
            <KpiCard icon={<Database size={16} />} title={t('database.settingsAuditLabel')} value={String(status.settingsAuditCount ?? 0)} subtitle={t('database.settingsAuditDescription')} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
            <section className="panel-shell-card settings-card">
              <div className="mb-4 flex items-start gap-3">
                <IconBadge size="lg">
                  <Database />
                </IconBadge>
                <div className="min-w-0 flex-1">
                  <div className="panel-shell-card__title">{t('database.connectionDetailsTitle')}</div>
                  <p className="panel-shell-card__meta">{t('database.connectionDetailsMeta')}</p>
                </div>
              </div>

              <div className="grid gap-3 text-[12px]">
                <DetailRow label={t('database.enabledLabel')} value={status.enabled ? t('common.yes') : t('common.no')} />
                <DetailRow label={t('database.hostLabel')} value={status.host || '-'} />
                <DetailRow label={t('database.portLabel')} value={status.port || '-'} />
                <DetailRow label={t('database.databaseLabel')} value={status.database || '-'} />
                <DetailRow label={t('database.userLabel')} value={status.user || '-'} />
                <DetailRow label={t('database.lastErrorLabel')} value={status.lastError || t('database.noRecentErrors')} tone={status.lastError ? 'warning' : 'normal'} />
              </div>
            </section>

            <section className="panel-shell-card flex min-h-[340px] max-h-[461px] flex-col overflow-hidden p-0">
              <div className="border-b border-[var(--win-border)] px-4 py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="panel-shell-card__title">{t('database.persistedLogsTitle')}</div>
                  <div className="panel-shell-card__meta !mt-0">{t('database.latestRows', { shown: filteredRuntimeLogs.length, total: runtimeLogs.length })}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                    <TextInput
                      id="database-log-search"
                      value={logQuery}
                      onChange={(e) => setLogQuery(e.target.value)}
                      placeholder={t('database.logSearchPlaceholder')} className="h-9 pl-9 pr-3 text-[12px]"
                    />
                  </div>

                  <Select
                    id="database-log-limit"
                    value={String(logLimit)}
                    onChange={(value) => setLogLimit(Number(value))}
                    options={LOG_ROW_OPTIONS.map((option) => ({ value: String(option), label: t('database.rowsOption', { count: option }) }))}
                    className="max-w-[120px]"
                    buttonClassName="h-9 px-3 text-[12px] panel-input--mono"
                    dropdownClassName="min-w-[120px]"
                    searchable
                    searchPlaceholder={t('database.limitSearchPlaceholder')}
                  />

                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {runtimeLogs.length === 0 ? (
                  <EmptyState icon={<HardDriveDownload />} className="min-h-[220px]">{t('database.emptyRuntimeLogs')}</EmptyState>
                ) : filteredRuntimeLogs.length === 0 ? (
                  <EmptyState icon={<Search />} className="min-h-[220px]">{t('database.noMatchingLogs')}</EmptyState>
                ) : (
                  <div className="flex flex-col gap-3">
                    {filteredRuntimeLogs.map((entry) => {
                      const isError = entry.level === 'error'
                      return (
                        <div
                          key={entry.id}
                          className={`panel-shell-card ${isError ? 'border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)]' : ''}`}
                        >
                          <div className="flex flex-wrap items-center gap-2 text-[12px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                            <span>{entry.service}</span>
                            <span>•</span>
                            <span>{entry.level}</span>
                            <span>•</span>
                            <span>{new Date(entry.createdAt).toLocaleString()}</span>
                          </div>
                          <div className={`mt-2 text-[13px] font-medium ${isError ? 'text-[var(--panel-danger-text)]' : 'text-[var(--win-text)]'}`}>{entry.message}</div>
                          {entry.metadata ? (
                            <pre className="panel-muted-block panel-mono mt-2 overflow-auto whitespace-pre-wrap break-words rounded-[14px] px-3 py-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                              {entry.metadata}
                            </pre>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="panel-shell-card settings-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="panel-shell-card__title">{t('database.recentAuditTitle')}</div>
                <p className="panel-shell-card__meta">{t('database.recentAuditMeta')}</p>
              </div>
              <Badge tone="warning">{t('database.rowsCount', { count: settingsAudit.length })}</Badge>
            </div>
            <div className="mt-4 flex max-h-[360px] flex-col gap-3 overflow-auto pr-1">
              {settingsAudit.length === 0 ? (
                <EmptyState icon={<ActivitySquare />} className="min-h-[140px]">{t('database.emptySettingsAudit')}</EmptyState>
              ) : (
                settingsAudit.map((entry) => (
                  <div key={entry.id} className="panel-muted-block rounded-[14px] px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2 text-[12px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                      <span>{entry.username || 'system'}</span>
                      <span>•</span>
                      <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-[12px] text-[var(--win-text)] sm:grid-cols-3">
                      <div><strong>{t('database.hostnameLabel')}:</strong> {entry.hostname || '-'}</div>
                      <div><strong>{t('database.timezoneLabel')}:</strong> {entry.timezone || '-'}</div>
                      <div><strong>{t('database.nameserverLabel')}:</strong> {entry.nameservers.length > 0 ? entry.nameservers.join(', ') : '—'}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {!status.connected && status.enabled ? (
            <ErrorState title={t('database.mariadbNotReady')} hint={t('database.mariadbNotReadyHint')} />
          ) : null}
        </div>
      </div>
    </div>
  )
}




