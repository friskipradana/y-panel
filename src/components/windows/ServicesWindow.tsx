import { Clock, Cpu, FileText, Pencil, Play, Plus, RefreshCw, RotateCcw, Square, Trash2 } from 'lucide-react'
import type { WindowState } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { ListRowIcon } from '@/components/ui/ListTable'
import { SearchInput } from '@/components/ui/SearchInput'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { ServicesModals } from './services/ServicesModals'
import { useServicesWindow, type ServicesSection } from './services/useServicesWindow'

interface ServicesWindowProps {
  win: WindowState
  authenticated: boolean
}

export function ServicesWindow({ win, authenticated }: ServicesWindowProps) {
  const isMobile = useIsMobileLayout()
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
  const filterItems = [
    { key: 'systemd', label: t('services.tab.systemd'), count: data?.services.length },
    { key: 'cron', label: t('services.tab.cron'), count: data?.cronJobs.length },
  ]

  const actions = (
    <>
      {section === 'cron' && data?.cronAvailable ? (
        <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={() => setEditCron('new')}>
          {t('services.addCron')}
        </Button>
      ) : null}
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
            <FilterMenu label={t('services.sections')} value={section} onChange={(v) => setSection(v as ServicesSection)} items={filterItems} />
            {actions}
          </div>
          <div className="docker-topbar__row">
            <SearchInput className="flex-1" value={search} onChange={setSearch} placeholder={t('services.searchPlaceholder')} />
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            <FilterMenu label={t('services.sections')} value={section} onChange={(v) => setSection(v as ServicesSection)} items={filterItems} />
          </div>
          <div className="docker-topbar__right">
            <SearchInput value={search} onChange={setSearch} placeholder={t('services.searchPlaceholder')} />
            {actions}
          </div>
        </div>
      )}

      {overviewQ.isLoading ? (
        <div className="p-6 flex-1">
          <LoadingState>{t('services.loading')}</LoadingState>
        </div>
      ) : overviewQ.isError ? (
        <div className="p-6 flex-1">
          <ErrorState
            title={t('services.loadFailed')}
            hint={(overviewQ.error as Error)?.message}
            action={<Button size="sm" variant="ghost" onClick={() => void overviewQ.refetch()}>{t('common.refresh')}</Button>}
          />
        </div>
      ) : section === 'systemd' ? (
        !data?.systemdAvailable ? (
          <div className="p-6 flex-1">
            <EmptyState icon={<Cpu />}>{t('services.linuxOnlySystemd')}</EmptyState>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
            {(data.services ?? [])
              .filter((s) => !q || s.unit.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.activeState.toLowerCase().includes(q))
              .map((svc) => (
                <EntityRow
                  key={svc.unit}
                  centered
                  leading={<ListRowIcon><Cpu className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
                  title={<span className="panel-mono">{svc.unit}</span>}
                  badges={
                    <Badge tone={svc.activeState === 'active' ? 'success' : svc.activeState === 'failed' ? 'danger' : 'neutral'} dot>
                      {svc.activeState} ({svc.subState})
                    </Badge>
                  }
                  subtitle={svc.description || svc.loadState}
                  actions={
                    <>
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
                            tone="danger"
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
                          tone="success"
                          label={t('services.start')}
                          loading={busyUnit === svc.unit}
                          onClick={() => serviceActionMut.mutate({ unit: svc.unit, action: 'start' })}
                        >
                          <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </IconButton>
                      )}
                    </>
                  }
                />
              ))}
          </div>
        )
      ) : !data?.cronAvailable ? (
        <div className="p-6 flex-1">
          <EmptyState icon={<Clock />}>{t('services.linuxOnlyCron')}</EmptyState>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {(data.cronJobs ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.command.toLowerCase().includes(q) || c.schedule.includes(q)).length === 0 ? (
            <EmptyState icon={<Clock />}>{t('services.emptyCron')}</EmptyState>
          ) : (
            (data.cronJobs ?? [])
              .filter((c) => !q || c.name.toLowerCase().includes(q) || c.command.toLowerCase().includes(q) || c.schedule.includes(q))
              .map((job) => (
                <EntityRow
                  key={job.id}
                  centered
                  leading={<ListRowIcon><Clock className="h-3.5 w-3.5" strokeWidth={1.75} /></ListRowIcon>}
                  title={job.name}
                  badges={
                    <>
                      <Badge tone="primary">{job.schedule}</Badge>
                      {!job.managed ? <Badge tone="neutral">{t('services.systemEntry')}</Badge> : null}
                    </>
                  }
                  subtitle={<span className="panel-mono">{job.command}</span>}
                  actions={
                    <>
                      {job.managed ? (
                        <ToggleSwitch
                          checked={job.enabled}
                          onChange={() => saveCronMut.mutate({ ...job, enabled: !job.enabled })}
                          label={t('services.cronEnabledLabel')}
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
                          <IconButton size="sm" variant="ghost" tone="danger" label={t('common.delete')} onClick={() => void confirmDeleteCron(job)}>
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </IconButton>
                        </>
                      ) : null}
                    </>
                  }
                />
              ))
          )}
        </div>
      )}

      <ServicesModals sw={sw} />
    </div>
  )
}
