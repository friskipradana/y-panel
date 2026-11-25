import { Activity, Clock, Globe2, LoaderCircle, Lock, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { WindowState } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { KpiCard } from '@/components/ui/KpiCard'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { UptimeModals } from './uptime/UptimeModals'
import { useUptimeWindow } from './uptime/useUptimeWindow'

interface UptimeWindowProps {
  win: WindowState
  authenticated: boolean
}

export function UptimeWindow({ win, authenticated }: UptimeWindowProps) {
  const isMobile = useIsMobileLayout()
  const uw = useUptimeWindow(win, authenticated)
  const {
    t,
    search,
    setSearch,
    filter,
    setFilter,
    monitorsQ,
    refresh,
    setAddOpen,
    setHistoryMonitor,
    checkingId,
    checkNowMut,
    toggleMut,
    confirmDelete,
  } = uw

  const all = monitorsQ.data ?? []
  const upCount = all.filter((m) => m.lastStatus === 'up').length
  const downCount = all.filter((m) => m.lastStatus === 'down').length
  const sslWarnCount = all.filter((m) => typeof m.sslDaysLeft === 'number' && m.sslDaysLeft <= 14).length
  const q = search.trim().toLowerCase()
  const visible = all.filter((m) => {
    if (filter !== 'all' && m.lastStatus !== filter) return false
    return !q || m.name.toLowerCase().includes(q) || m.target.toLowerCase().includes(q)
  })

  const filterItems = [
    { key: 'all', label: t('uptime.filterAll'), count: all.length },
    { key: 'up', label: t('uptime.filterUp'), count: upCount },
    { key: 'down', label: t('uptime.filterDown'), count: downCount },
  ]
  const isSpinning = monitorsQ.isFetching && !monitorsQ.isLoading

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">
            <FilterMenu label={t('uptime.filterLabel')} value={filter} onChange={(v) => setFilter(v as 'all' | 'up' | 'down')} items={filterItems} />
            <button type="button" className="docker-primary-btn" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('uptime.addBtn')}</span>
            </button>
            <div className="docker-badge-running docker-badge-running--mobile">
              {upCount > 0 ? <span className="docker-badge-running__dot" aria-hidden="true" /> : null}
              <span>{t('uptime.summaryBadge', { up: upCount, total: all.length })}</span>
            </div>
          </div>
          <div className="docker-topbar__mobile-search">
            <div className="docker-search-wrap docker-search-wrap--mobile">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input docker-search-input--mobile"
                aria-label={t('uptime.searchPlaceholder')}
                placeholder={t('uptime.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="docker-icon-btn docker-icon-btn--mobile" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={refresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            <FilterMenu label={t('uptime.filterLabel')} value={filter} onChange={(v) => setFilter(v as 'all' | 'up' | 'down')} items={filterItems} />
            <button type="button" className="docker-primary-btn" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('uptime.addBtn')}</span>
            </button>
          </div>
          <div className="docker-topbar__right">
            <div className="docker-search-wrap">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input"
                aria-label={t('uptime.searchPlaceholder')}
                placeholder={t('uptime.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="docker-icon-btn" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={refresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
            <div className="docker-badge-running">
              {upCount > 0 ? <span className="docker-badge-running__dot" aria-hidden="true" /> : null}
              <span>{t('uptime.summaryBadge', { up: upCount, total: all.length })}</span>
            </div>
          </div>
        </div>
      )}

      {all.length > 0 ? (
        <div className="grid shrink-0 grid-cols-2 gap-2.5 border-b border-[var(--win-border)] px-4 py-3 sm:grid-cols-4">
          <KpiCard title={t('uptime.kpiTotal')} value={String(all.length)} />
          <KpiCard title={t('uptime.kpiUp')} value={String(upCount)} />
          <KpiCard title={t('uptime.kpiDown')} value={String(downCount)} />
          <KpiCard title={t('uptime.kpiSslWarn')} value={String(sslWarnCount)} subtitle={t('uptime.kpiSslWarnSub')} />
        </div>
      ) : null}

      <ListTable
        variant="uptime-monitors"
        empty={monitorsQ.isLoading || monitorsQ.isError || visible.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('uptime.col.monitor') },
          { label: t('docker.colStatus') },
          { label: t('uptime.col.metrics') },
          { label: t('uptime.col.history') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={monitorsQ.isLoading}
          error={monitorsQ.isError}
          errorTitle={t('uptime.loadFailed')}
          errorHint={(monitorsQ.error as Error)?.message}
          loadingText={t('uptime.loading')}
          empty={visible.length === 0}
          emptyIcon={<Activity />}
          emptyTitle={t('uptime.empty')}
        >
          {visible.map((m, idx) => {
            const checking = checkingId === m.id
            const pill = m.lastStatus === 'up' ? 'running' : m.lastStatus === 'down' ? 'dead' : 'exited'
            return (
              <div key={m.id} className="docker-row">
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <ListRowIcon>
                    <Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name" title={m.name}>
                      {m.name}
                    </span>
                    <span className="docker-row__sub panel-mono" title={m.lastError || m.target}>
                      {m.target}
                      {m.lastError ? ` · ${m.lastError}` : ''}
                    </span>
                    <span className="docker-row__meta panel-mono">
                      {`${m.uptime24hPct.toFixed(1)}% · ${m.lastLatencyMs}ms · ${m.target}`}
                    </span>
                  </div>
                </div>
                <div className="docker-cell--keep">
                  <span className={`docker-status-pill docker-status-pill--${pill}`}>
                    <span className="docker-status-dot" />
                    <span>{m.lastStatus.toUpperCase()}</span>
                  </span>
                </div>
                <div className="docker-cell docker-cell--mono">
                  <span>{m.uptime24hPct.toFixed(1)}% · {m.lastLatencyMs}ms</span>
                </div>
                <div className="docker-cell">
                  <div className="flex items-center gap-2">
                    {m.recentBars.length > 0 ? (
                      <div className="flex items-center gap-0.5" aria-hidden="true">
                        {m.recentBars.slice(-16).map((st, barIdx) => (
                          <span
                            key={barIdx}
                            className={`h-3 w-1 rounded-[1.5px] ${st === 'up' ? 'bg-[var(--status-online)]' : 'bg-[var(--status-error)]'}`}
                          />
                        ))}
                      </div>
                    ) : (
                      <span>-</span>
                    )}
                    {typeof m.sslDaysLeft === 'number' ? (
                      <Badge tone={m.sslDaysLeft <= 14 ? 'warning' : 'info'}>
                        <Lock className="mr-0.5 inline h-2.5 w-2.5" strokeWidth={1.75} />
                        {m.sslDaysLeft}d
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="docker-action-btns">
                  <ToggleSwitch checked={m.enabled} onChange={() => toggleMut.mutate(m)} label={t('uptime.toggleEnabled')} />
                  <button
                    type="button"
                    className="docker-act-btn"
                    title={t('uptime.checkNow')}
                    aria-label={t('uptime.checkNow')}
                    disabled={checking}
                    aria-busy={checking}
                    onClick={() => checkNowMut.mutate(m)}
                  >
                    {checking ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  </button>
                  <button type="button" className="docker-act-btn" title={t('uptime.historyTitle')} aria-label={t('uptime.historyTitle')} onClick={() => setHistoryMonitor(m)}>
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--danger"
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    onClick={() => void confirmDelete(m)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>

      <UptimeModals uw={uw} />
    </div>
  )
}
