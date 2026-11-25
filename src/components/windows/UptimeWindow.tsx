import { Activity, Clock, Globe2, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { WindowState } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { KpiCard } from '@/components/ui/KpiCard'
import { ListRowIcon } from '@/components/ui/ListTable'
import { SearchInput } from '@/components/ui/SearchInput'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
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

  const actions = (
    <>
      <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => setAddOpen(true)}>
        {t('uptime.addBtn')}
      </Button>
      <IconButton variant="outline" label={t('common.refresh')} onClick={refresh}>
        <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
      </IconButton>
    </>
  )

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__row flex-wrap">
            <FilterMenu label={t('uptime.filterLabel')} value={filter} onChange={(v) => setFilter(v as 'all' | 'up' | 'down')} items={filterItems} />
            {actions}
          </div>
          <div className="docker-topbar__row">
            <SearchInput className="flex-1" value={search} onChange={setSearch} placeholder={t('uptime.searchPlaceholder')} />
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            <FilterMenu label={t('uptime.filterLabel')} value={filter} onChange={(v) => setFilter(v as 'all' | 'up' | 'down')} items={filterItems} />
          </div>
          <div className="docker-topbar__right">
            <SearchInput value={search} onChange={setSearch} placeholder={t('uptime.searchPlaceholder')} />
            {actions}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
        {all.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <KpiCard title={t('uptime.kpiTotal')} value={String(all.length)} />
            <KpiCard title={t('uptime.kpiUp')} value={String(upCount)} />
            <KpiCard title={t('uptime.kpiDown')} value={String(downCount)} />
            <KpiCard title={t('uptime.kpiSslWarn')} value={String(sslWarnCount)} subtitle={t('uptime.kpiSslWarnSub')} />
          </div>
        ) : null}

        {monitorsQ.isLoading ? (
          <div className="p-6"><LoadingState>{t('uptime.loading')}</LoadingState></div>
        ) : monitorsQ.isError ? (
          <div className="p-6">
            <ErrorState
              title={t('uptime.loadFailed')}
              hint={(monitorsQ.error as Error)?.message}
              action={<Button size="sm" variant="ghost" onClick={() => void monitorsQ.refetch()}>{t('common.refresh')}</Button>}
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <EmptyState icon={<Activity />}>{t('uptime.empty')}</EmptyState>
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              {t('uptime.addBtn')}
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {visible.map((m) => (
              <EntityRow
                key={m.id}
                centered
                leading={<ListRowIcon><Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
                title={m.name}
                badges={
                  <>
                    <Badge tone={m.lastStatus === 'up' ? 'success' : m.lastStatus === 'down' ? 'danger' : 'neutral'} dot>
                      {m.lastStatus.toUpperCase()}
                    </Badge>
                    <Badge tone="neutral">{m.uptime24hPct.toFixed(1)}% · {m.lastLatencyMs}ms</Badge>
                    {typeof m.sslDaysLeft === 'number' ? (
                      <Badge tone={m.sslDaysLeft <= 14 ? 'warning' : 'info'}>
                        <Lock className="mr-0.5 inline h-3 w-3" strokeWidth={1.75} />
                        SSL {m.sslDaysLeft}d
                      </Badge>
                    ) : null}
                  </>
                }
                subtitle={<span className="panel-mono">{m.target}</span>}
                meta={
                  m.recentBars.length > 0 ? (
                    <div className="mt-1 flex items-center gap-1" aria-hidden="true">
                      {m.recentBars.map((st, idx) => (
                        <span
                          key={idx}
                          className={`h-2.5 w-1.5 rounded-[2px] ${
                            st === 'up' ? 'bg-[var(--status-online)]' : 'bg-[var(--status-error)]'
                          }`}
                        />
                      ))}
                    </div>
                  ) : undefined
                }
                description={
                  m.lastError ? (
                    <p className="mt-1 text-[0.75rem] text-[var(--panel-danger-text)]">{m.lastError}</p>
                  ) : undefined
                }
                actions={
                  <>
                    <ToggleSwitch checked={m.enabled} onChange={() => toggleMut.mutate(m)} label={t('uptime.toggleEnabled')} />
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
                    <IconButton size="sm" variant="ghost" tone="danger" label={t('common.delete')} onClick={() => void confirmDelete(m)}>
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconButton>
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      <UptimeModals uw={uw} />
    </div>
  )
}
