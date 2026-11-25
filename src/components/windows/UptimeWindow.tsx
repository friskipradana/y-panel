import { Activity, Clock, Globe2, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { WindowState } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { KpiCard } from '@/components/ui/KpiCard'
import { ListRowIcon } from '@/components/ui/ListTable'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { UptimeModals } from './uptime/UptimeModals'
import { useUptimeWindow } from './uptime/useUptimeWindow'

interface UptimeWindowProps {
  win: WindowState
  authenticated: boolean
}

export function UptimeWindow({ win, authenticated }: UptimeWindowProps) {
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

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      <div className="docker-topbar">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <FilterMenu
            label={t('uptime.filterLabel')}
            value={filter}
            onChange={(v) => setFilter(v as 'all' | 'up' | 'down')}
            items={[
              { key: 'all', label: t('uptime.filterAll'), count: all.length },
              { key: 'up', label: t('uptime.filterUp'), count: upCount },
              { key: 'down', label: t('uptime.filterDown'), count: downCount },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder={t('uptime.searchPlaceholder')} />
          <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('uptime.addBtn')}</span>
          </Button>
          <IconButton size="sm" variant="outline" label={t('common.refresh')} onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      <div className="p-3.5 space-y-3 overflow-y-auto flex-1">
        {all.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <KpiCard title={t('uptime.kpiTotal')} value={String(all.length)} />
            <KpiCard title={t('uptime.kpiUp')} value={String(upCount)} />
            <KpiCard title={t('uptime.kpiDown')} value={String(downCount)} />
            <KpiCard title={t('uptime.kpiSslWarn')} value={String(sslWarnCount)} subtitle={t('uptime.kpiSslWarnSub')} />
          </div>
        ) : null}

        {monitorsQ.isLoading ? (
          <LoadingState>{t('uptime.loading')}</LoadingState>
        ) : monitorsQ.isError ? (
          <ErrorState
            title={t('uptime.loadFailed')}
            hint={(monitorsQ.error as Error)?.message}
            action={
              <Button size="sm" variant="ghost" onClick={() => void monitorsQ.refetch()}>
                {t('common.refresh')}
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <EmptyState icon={<Activity />}>{t('uptime.empty')}</EmptyState>
            <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
              {t('uptime.addBtn')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <ListRowIcon>
                    <Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </ListRowIcon>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-[var(--win-text)] truncate">{m.name}</span>
                      <Badge tone={m.lastStatus === 'up' ? 'success' : m.lastStatus === 'down' ? 'danger' : 'neutral'}>
                        {m.lastStatus.toUpperCase()}
                      </Badge>
                      <span className="panel-mono text-[11.5px] text-[var(--text-secondary)]">
                        {m.uptime24hPct.toFixed(1)}% · {m.lastLatencyMs}ms
                      </span>
                      {typeof m.sslDaysLeft === 'number' ? (
                        <Badge tone={m.sslDaysLeft <= 14 ? 'warning' : 'info'}>
                          <Lock className="h-3 w-3 mr-0.5 inline" strokeWidth={1.75} />
                          SSL {m.sslDaysLeft}d
                        </Badge>
                      ) : null}
                    </div>
                    <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">{m.target}</p>
                    {m.lastError ? <p className="text-[11.5px] text-[var(--panel-danger-text)] truncate">{m.lastError}</p> : null}
                    {m.recentBars.length > 0 ? (
                      <div className="mt-1.5 flex items-center gap-0.5" aria-hidden="true">
                        {m.recentBars.map((st, idx) => (
                          <span
                            key={idx}
                            className={`h-2 w-2 rounded-[2px] ${
                              st === 'up' ? 'bg-[var(--panel-success-solid)]' : 'bg-[var(--panel-danger-solid)]'
                            }`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Checkbox checked={m.enabled} onChange={() => toggleMut.mutate(m)} aria-label={t('uptime.toggleEnabled')} />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={t('uptime.checkNow')}
                    loading={checkingId === m.id}
                    onClick={() => checkNowMut.mutate(m)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" label={t('uptime.historyTitle')} onClick={() => setHistoryMonitor(m)}>
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => void confirmDelete(m)}>
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <UptimeModals uw={uw} />
    </div>
  )
}
