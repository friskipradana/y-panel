import { Clock, Cpu, FileText, Pencil, Play, Plus, RefreshCw, RotateCcw, Square, Trash2 } from 'lucide-react'
import type { WindowState } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { ListRowIcon } from '@/components/ui/ListTable'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { ServicesModals } from './services/ServicesModals'
import { useServicesWindow, type ServicesSection } from './services/useServicesWindow'

interface ServicesWindowProps {
  win: WindowState
  authenticated: boolean
}

export function ServicesWindow({ win, authenticated }: ServicesWindowProps) {
  const sw = useServicesWindow(win, authenticated)
  const {
    t,
    section,
    setSection,
    search,
    setSearch,
    overviewQ,
    refresh,
    busyUnit,
    setLogsUnit,
    setEditCron,
    runningCronId,
    serviceActionMut,
    saveCronMut,
    runCronMut,
    confirmServiceStop,
    confirmDeleteCron,
  } = sw

  const data = overviewQ.data
  const q = search.trim().toLowerCase()

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      <div className="docker-topbar">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <FilterMenu
            label={t('services.sections')}
            value={section}
            onChange={(v) => setSection(v as ServicesSection)}
            items={[
              { key: 'systemd', label: t('services.tab.systemd'), count: data?.services.length },
              { key: 'cron', label: t('services.tab.cron'), count: data?.cronJobs.length },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder={t('services.searchPlaceholder')} />
          {section === 'cron' && data?.cronAvailable ? (
            <Button size="sm" variant="primary" onClick={() => setEditCron('new')}>
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('services.addCron')}</span>
            </Button>
          ) : null}
          <IconButton size="sm" variant="outline" label={t('common.refresh')} onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      {overviewQ.isLoading ? (
        <div className="p-4 flex-1">
          <LoadingState>{t('services.loading')}</LoadingState>
        </div>
      ) : overviewQ.isError ? (
        <div className="p-4 flex-1">
          <ErrorState
            title={t('services.loadFailed')}
            hint={(overviewQ.error as Error)?.message}
            action={
              <Button size="sm" variant="ghost" onClick={() => void overviewQ.refetch()}>
                {t('common.refresh')}
              </Button>
            }
          />
        </div>
      ) : section === 'systemd' ? (
        !data?.systemdAvailable ? (
          <div className="p-4 flex-1">
            <EmptyState icon={<Cpu />}>{t('services.linuxOnlySystemd')}</EmptyState>
          </div>
        ) : (
          <div className="p-3 space-y-1.5 overflow-y-auto flex-1">
            {(data.services ?? [])
              .filter((s) => !q || s.unit.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.activeState.toLowerCase().includes(q))
              .map((svc) => (
                <div
                  key={svc.unit}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <ListRowIcon>
                      <Cpu className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </ListRowIcon>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="panel-mono text-[12.5px] font-semibold text-[var(--win-text)] truncate">{svc.unit}</span>
                        <Badge tone={svc.activeState === 'active' ? 'success' : svc.activeState === 'failed' ? 'danger' : 'neutral'}>
                          {svc.activeState} ({svc.subState})
                        </Badge>
                      </div>
                      <p className="text-[11.5px] text-[var(--text-secondary)] truncate">{svc.description || svc.loadState}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <IconButton size="sm" variant="ghost" label={t('services.logs')} onClick={() => setLogsUnit(svc.unit)}>
                      <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconButton>
                    {svc.activeState === 'active' ? (
                      <>
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label={t('services.restart')}
                          loading={busyUnit === svc.unit}
                          onClick={() => serviceActionMut.mutate({ unit: svc.unit, action: 'restart' })}
                        >
                          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          variant="ghost"
                          label={t('services.stop')}
                          loading={busyUnit === svc.unit}
                          onClick={() => void confirmServiceStop(svc)}
                        >
                          <Square className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={t('services.start')}
                        loading={busyUnit === svc.unit}
                        onClick={() => serviceActionMut.mutate({ unit: svc.unit, action: 'start' })}
                      >
                        <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </IconButton>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )
      ) : !data?.cronAvailable ? (
        <div className="p-4 flex-1">
          <EmptyState icon={<Clock />}>{t('services.linuxOnlyCron')}</EmptyState>
        </div>
      ) : (
        <div className="p-3 space-y-1.5 overflow-y-auto flex-1">
          {(data.cronJobs ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.command.toLowerCase().includes(q) || c.schedule.includes(q)).length === 0 ? (
            <EmptyState icon={<Clock />}>{t('services.emptyCron')}</EmptyState>
          ) : (
            (data.cronJobs ?? [])
              .filter((c) => !q || c.name.toLowerCase().includes(q) || c.command.toLowerCase().includes(q) || c.schedule.includes(q))
              .map((job) => (
                <div
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <ListRowIcon>
                      <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </ListRowIcon>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-[var(--win-text)] truncate">{job.name}</span>
                        <Badge tone="primary">{job.schedule}</Badge>
                        {!job.managed ? <Badge tone="neutral">{t('services.systemEntry')}</Badge> : null}
                      </div>
                      <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">{job.command}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {job.managed ? (
                      <Checkbox
                        checked={job.enabled}
                        onChange={(checked) => saveCronMut.mutate({ ...job, enabled: checked })}
                        aria-label={t('services.cronEnabledLabel')}
                      />
                    ) : null}
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={t('services.runNow')}
                      loading={runningCronId === job.id}
                      onClick={() => runCronMut.mutate(job)}
                    >
                      <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconButton>
                    {job.managed ? (
                      <>
                        <IconButton size="sm" variant="ghost" label={t('services.editCronTitle')} onClick={() => setEditCron(job)}>
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </IconButton>
                        <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => void confirmDeleteCron(job)}>
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </IconButton>
                      </>
                    ) : null}
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      <ServicesModals sw={sw} />
    </div>
  )
}
