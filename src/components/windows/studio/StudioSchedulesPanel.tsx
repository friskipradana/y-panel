import { ArrowLeft, CalendarClock, LoaderCircle, Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { StudioSchedule } from '@/api/studio'
import { Badge } from '@/components/ui/Badge'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import type { DocsSchedulesState } from '@/components/windows/docs/useDocsSchedules'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { formatDateID } from '@/lib/datetime'

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function statusPillOf(sc: StudioSchedule): 'running' | 'paused' | 'dead' {
  if (sc.lastStatus === 'error') return 'dead'
  if (sc.enabled) return 'running'
  return 'paused'
}

// Automated scheduled Reneo documentation & article enricher list inside Docs Window
export function StudioSchedulesPanel({ st, onBack }: { st: DocsSchedulesState; onBack: () => void }) {
  const isMobile = useIsMobileLayout()
  const {
    t,
    schedulesQ,
    schedules,
    refresh,
    setEditingSchedule,
    runningScheduleId,
    toggleScheduleMut,
    runScheduleMut,
    confirmDeleteSchedule,
  } = st

  const isSpinning = schedulesQ.isFetching && !schedulesQ.isLoading

  const cadenceSummary = (sc: StudioSchedule) => {
    const hh = `${String(sc.runHour).padStart(2, '0')}:00`
    if (sc.cadence === 'hourly') return t('studio.schedule.cadence.hourly')
    if (sc.cadence === 'weekly') {
      const day = t(`studio.schedule.weekday.${WEEKDAYS[sc.runWeekday] ?? 'mon'}`)
      return `${t('studio.schedule.cadence.weekly')} · ${day} ${hh}`
    }
    if (sc.cadence === 'monthly') return `${t('studio.schedule.cadence.monthly')} · ${hh}`
    return `${t('studio.schedule.cadence.daily')} · ${hh}`
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={`docker-topbar ${isMobile ? 'docker-topbar--mobile' : ''}`}>
        <div className={isMobile ? 'docker-topbar__mobile-row' : 'docker-topbar__left'}>
          <button
            type="button"
            className="docker-icon-btn shrink-0"
            title={t('docs.back')}
            aria-label={t('docs.back')}
            onClick={onBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button type="button" className="docker-primary-btn" onClick={() => setEditingSchedule('new')}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('studio.schedule.newBtn')}</span>
          </button>
        </div>
        <div className={isMobile ? 'docker-topbar__mobile-row' : 'docker-topbar__right'}>
          <button
            type="button"
            className={`docker-icon-btn ${isMobile ? 'docker-icon-btn--mobile ml-auto' : ''}`}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
            onClick={refresh}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <ListTable
        variant="devdesk-docs"
        empty={schedulesQ.isLoading || schedulesQ.isError || schedules.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('studio.schedule.colJob') },
          { label: t('studio.schedule.colMode') },
          { label: t('studio.schedule.colCadence') },
          { label: t('docker.colStatus') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={schedulesQ.isLoading}
          error={schedulesQ.isError}
          errorTitle={t('studio.schedule.loadFailed')}
          errorHint={(schedulesQ.error as Error)?.message}
          loadingText={t('common.loading')}
          empty={schedules.length === 0}
          emptyIcon={<CalendarClock />}
          emptyTitle={t('studio.schedule.emptyTitle')}
        >
          {schedules.map((sc, idx) => {
            const isRunning = runningScheduleId === sc.id || sc.lastStatus === 'running'
            return (
              <div key={sc.id} className="docker-row">
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <ListRowIcon>
                    <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name" title={sc.name}>{sc.name}</span>
                    <span className="docker-row__sub">
                      {sc.lastTitle
                        ? t('studio.schedule.lastGenerated', { count: sc.runCount, title: sc.lastTitle })
                        : sc.theme || t('studio.schedule.neverRun')}
                    </span>
                    {sc.lastStatus === 'error' && sc.lastError ? (
                      <span className="docker-row__meta text-[var(--panel-danger-text)]">{sc.lastError}</span>
                    ) : sc.nextRunAt && sc.enabled ? (
                      <span className="docker-row__meta panel-mono">
                        {t('studio.schedule.nextRunLabel', { time: formatDateID(sc.nextRunAt) })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="docker-cell">
                  <Badge tone={sc.mode === 'enrich_docs' ? 'info' : 'primary'} size="sm">
                    {sc.mode === 'enrich_docs' ? t('studio.schedule.modeEnrichShort') : t('studio.schedule.modeTopicShort')}
                  </Badge>
                </div>
                <div className="docker-cell docker-cell--mono">{cadenceSummary(sc)}</div>
                <div className="docker-cell--keep">
                  <span className={`docker-status-pill docker-status-pill--${statusPillOf(sc)}`}>
                    <span className="docker-status-dot" />
                    <span>
                      {isRunning
                        ? t('studio.schedule.statusRunning')
                        : sc.lastStatus === 'error'
                          ? t('studio.schedule.statusError')
                          : sc.enabled
                            ? t('common.active')
                            : t('studio.schedule.statusPaused')}
                    </span>
                  </span>
                </div>
                <div className="docker-action-btns">
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--start"
                    title={t('studio.schedule.runNow')}
                    aria-label={t('studio.schedule.runNow')}
                    disabled={isRunning}
                    onClick={() => runScheduleMut.mutate(sc.id)}
                  >
                    {isRunning ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                    ) : (
                      <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                    )}
                  </button>
                  <ToggleSwitch
                    checked={sc.enabled}
                    label={sc.name}
                    disabled={toggleScheduleMut.isPending}
                    onChange={() => toggleScheduleMut.mutate({ id: sc.id, enabled: !sc.enabled })}
                  />
                  <button
                    type="button"
                    className="docker-act-btn"
                    title={t('common.edit')}
                    aria-label={t('common.edit')}
                    onClick={() => setEditingSchedule(sc)}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--danger"
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    onClick={() => void confirmDeleteSchedule(sc)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>
    </div>
  )
}
