import { Clock, Cpu, FileText, LoaderCircle, Pencil, Play, Plus, RefreshCw, RotateCcw, Search, Square, Trash2 } from 'lucide-react'
import type { WindowState } from '@/types'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { ServicesModals } from './services/ServicesModals'
import { useServicesWindow, type ServicesSection } from './services/useServicesWindow'

interface ServicesWindowProps {
  win: WindowState
  authenticated: boolean
}

function servicePill(state: string): 'running' | 'dead' | 'exited' {
  if (state === 'active') return 'running'
  if (state === 'failed') return 'dead'
  return 'exited'
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
  const allServices = data?.services ?? []
  const allCrons = data?.cronJobs ?? []
  const activeServices = allServices.filter((s) => s.activeState === 'active').length
  const enabledCrons = allCrons.filter((c) => c.enabled).length

  const services = allServices.filter(
    (s) => !q || s.unit.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.activeState.toLowerCase().includes(q),
  )
  const crons = allCrons.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.command.toLowerCase().includes(q) || c.schedule.includes(q),
  )

  const filterItems = [
    { key: 'systemd', label: t('services.tab.systemd'), count: allServices.length },
    { key: 'cron', label: t('services.tab.cron'), count: allCrons.length },
  ]

  const isSpinning = overviewQ.isFetching && !overviewQ.isLoading
  const showAddCron = section === 'cron' && Boolean(data?.cronAvailable)
  const activeCount = section === 'systemd' ? activeServices : enabledCrons
  const totalCount = section === 'systemd' ? allServices.length : allCrons.length

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">
            <FilterMenu label={t('services.sections')} value={section} onChange={(v) => setSection(v as ServicesSection)} items={filterItems} />
            {showAddCron ? (
              <button type="button" className="docker-primary-btn" onClick={() => setEditCron('new')}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('services.addCron')}</span>
              </button>
            ) : null}
            <div className="docker-badge-running docker-badge-running--mobile">
              {activeCount > 0 ? <span className="docker-badge-running__dot" aria-hidden="true" /> : null}
              <span>{t('services.activeBadge', { active: activeCount, total: totalCount })}</span>
            </div>
          </div>
          <div className="docker-topbar__mobile-search">
            <div className="docker-search-wrap docker-search-wrap--mobile">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input docker-search-input--mobile"
                aria-label={t('services.searchPlaceholder')}
                placeholder={t('services.searchPlaceholder')}
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
            <FilterMenu label={t('services.sections')} value={section} onChange={(v) => setSection(v as ServicesSection)} items={filterItems} />
            {showAddCron ? (
              <button type="button" className="docker-primary-btn" onClick={() => setEditCron('new')}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('services.addCron')}</span>
              </button>
            ) : null}
          </div>
          <div className="docker-topbar__right">
            <div className="docker-search-wrap">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input"
                aria-label={t('services.searchPlaceholder')}
                placeholder={t('services.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="docker-icon-btn" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={refresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
            <div className="docker-badge-running">
              {activeCount > 0 ? <span className="docker-badge-running__dot" aria-hidden="true" /> : null}
              <span>{t('services.activeBadge', { active: activeCount, total: totalCount })}</span>
            </div>
          </div>
        </div>
      )}

      {section === 'systemd' ? (
        <ListTable
          variant="services-systemd"
          empty={overviewQ.isLoading || overviewQ.isError || !data?.systemdAvailable || services.length === 0}
          columns={[
            { label: t('docker.colIndex') },
            { label: t('services.col.service') },
            { label: t('docker.colStatus') },
            { label: t('services.col.description') },
            { label: t('docker.colActions'), actions: true },
          ]}
        >
          <ListState
            loading={overviewQ.isLoading}
            error={overviewQ.isError}
            errorTitle={t('services.loadFailed')}
            errorHint={(overviewQ.error as Error)?.message}
            loadingText={t('services.loading')}
            empty={!data?.systemdAvailable || services.length === 0}
            emptyIcon={<Cpu />}
            emptyTitle={!data?.systemdAvailable ? t('services.linuxOnlySystemd') : t('services.searchPlaceholder')}
          >
            {services.map((svc, idx) => {
              const busy = busyUnit === svc.unit
              const statusText = `${svc.activeState} (${svc.subState})`
              return (
                <div key={svc.unit} className="docker-row">
                  <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                  <div className="docker-row__app">
                    <ListRowIcon>
                      <Cpu className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </ListRowIcon>
                    <div className="docker-row__text">
                      <span className="docker-app-name docker-app-name--mono" title={svc.unit}>
                        {svc.unit}
                      </span>
                      <span className="docker-row__meta">{svc.description || svc.loadState}</span>
                    </div>
                  </div>
                  <div className="docker-cell--keep">
                    <span className={`docker-status-pill docker-status-pill--${servicePill(svc.activeState)}`}>
                      <span className="docker-status-dot" />
                      <span>{statusText}</span>
                    </span>
                  </div>
                  <div className="docker-cell" title={svc.description || svc.loadState}>
                    {svc.description || svc.loadState}
                  </div>
                  <div className="docker-action-btns">
                    <button type="button" className="docker-act-btn" title={t('services.logs')} aria-label={t('services.logs')} onClick={() => setLogsUnit(svc.unit)}>
                      <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    {svc.activeState === 'active' ? (
                      <>
                        <button
                          type="button"
                          className="docker-act-btn docker-act-btn--restart"
                          title={t('services.restart')}
                          aria-label={t('services.restart')}
                          disabled={busy}
                          aria-busy={busy}
                          onClick={() => serviceActionMut.mutate({ unit: svc.unit, action: 'restart' })}
                        >
                          {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />}
                        </button>
                        <button
                          type="button"
                          className="docker-act-btn docker-act-btn--stop"
                          title={t('services.stop')}
                          aria-label={t('services.stop')}
                          disabled={busy}
                          onClick={() => void confirmServiceStop(svc)}
                        >
                          <Square className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="docker-act-btn docker-act-btn--start"
                        title={t('services.start')}
                        aria-label={t('services.start')}
                        disabled={busy}
                        aria-busy={busy}
                        onClick={() => serviceActionMut.mutate({ unit: svc.unit, action: 'start' })}
                      >
                        {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Play className="h-3.5 w-3.5" strokeWidth={1.75} />}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </ListState>
        </ListTable>
      ) : (
        <ListTable
          variant="services-cron"
          empty={overviewQ.isLoading || overviewQ.isError || !data?.cronAvailable || crons.length === 0}
          columns={[
            { label: t('docker.colIndex') },
            { label: t('services.col.job') },
            { label: t('services.col.schedule') },
            { label: t('docker.colStatus') },
            { label: t('docker.colActions'), actions: true },
          ]}
        >
          <ListState
            loading={overviewQ.isLoading}
            error={overviewQ.isError}
            errorTitle={t('services.loadFailed')}
            errorHint={(overviewQ.error as Error)?.message}
            loadingText={t('services.loading')}
            empty={!data?.cronAvailable || crons.length === 0}
            emptyIcon={<Clock />}
            emptyTitle={!data?.cronAvailable ? t('services.linuxOnlyCron') : t('services.emptyCron')}
          >
            {crons.map((job, idx) => {
              const running = runningCronId === job.id
              return (
                <div key={job.id} className="docker-row">
                  <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                  <div className="docker-row__app">
                    <ListRowIcon>
                      <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </ListRowIcon>
                    <div className="docker-row__text">
                      <span className="docker-app-name" title={job.name}>
                        {job.name}
                      </span>
                      <span className="docker-row__sub panel-mono" title={job.command}>
                        {job.command}
                      </span>
                      <span className="docker-row__meta panel-mono">{`${job.schedule} · ${job.command}`}</span>
                    </div>
                  </div>
                  <div className="docker-cell docker-cell--mono" title={job.schedule}>
                    {job.schedule}
                  </div>
                  <div className="docker-cell--keep">
                    <span className={`docker-status-pill docker-status-pill--${job.enabled ? 'running' : 'exited'}`}>
                      <span className="docker-status-dot" />
                      <span>{!job.managed ? t('services.systemEntry') : job.enabled ? t('common.active') : t('common.inactive')}</span>
                    </span>
                  </div>
                  <div className="docker-action-btns">
                    {job.managed ? (
                      <ToggleSwitch
                        checked={job.enabled}
                        onChange={() => saveCronMut.mutate({ ...job, enabled: !job.enabled })}
                        label={t('services.cronEnabledLabel')}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="docker-act-btn docker-act-btn--start"
                      title={t('services.runNow')}
                      aria-label={t('services.runNow')}
                      disabled={running}
                      aria-busy={running}
                      onClick={() => runCronMut.mutate(job)}
                    >
                      {running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Play className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    </button>
                    {job.managed ? (
                      <>
                        <button type="button" className="docker-act-btn" title={t('services.editCronTitle')} aria-label={t('services.editCronTitle')} onClick={() => setEditCron(job)}>
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          className="docker-act-btn docker-act-btn--danger"
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                          onClick={() => void confirmDeleteCron(job)}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </ListState>
        </ListTable>
      )}

      <ServicesModals sw={sw} />
    </div>
  )
}
