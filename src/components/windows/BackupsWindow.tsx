import { Cloud, Plus, RefreshCw, Search } from 'lucide-react'
import type { WindowState } from '@/types'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { BackupsModals } from './backups/BackupsModals'
import { BackupsSections } from './backups/BackupsSections'
import { useBackupsWindow, type BackupSection } from './backups/useBackupsWindow'

interface BackupsWindowProps {
  win: WindowState
  authenticated: boolean
}

export function BackupsWindow({ win, authenticated }: BackupsWindowProps) {
  const isMobile = useIsMobileLayout()
  const bw = useBackupsWindow(win, authenticated)
  const { t, section, setSection, search, setSearch, overviewQ, refresh, setAddJobOpen, setAddTargetOpen } = bw

  const data = overviewQ.data
  const counts: Record<BackupSection, number> = {
    jobs: data?.jobs.length ?? 0,
    runs: data?.runs.length ?? 0,
    targets: data?.targets.length ?? 0,
  }
  const filterItems = [
    { key: 'jobs', label: t('backups.tab.jobs'), count: counts.jobs },
    { key: 'runs', label: t('backups.tab.runs'), count: counts.runs },
    { key: 'targets', label: t('backups.tab.targets'), count: counts.targets },
  ]

  const hasTargets = counts.targets > 0
  const isSpinning = overviewQ.isFetching && !overviewQ.isLoading

  const primaryAction =
    section === 'targets' || !hasTargets
      ? { label: t('backups.addTarget'), icon: <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />, run: () => setAddTargetOpen(true) }
      : { label: t('backups.addJob'), icon: <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />, run: () => setAddJobOpen(true) }

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">
            <FilterMenu label={t('backups.sections')} value={section} onChange={(v) => setSection(v as BackupSection)} items={filterItems} />
            <button type="button" className="docker-primary-btn" onClick={primaryAction.run}>
              {primaryAction.icon}
              <span>{primaryAction.label}</span>
            </button>
            <div className="docker-badge-running docker-badge-running--mobile">
              <span>{t('docker.itemsBadge', { count: counts[section] })}</span>
            </div>
          </div>
          <div className="docker-topbar__mobile-search">
            <div className="docker-search-wrap docker-search-wrap--mobile">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input docker-search-input--mobile"
                aria-label={t('backups.searchPlaceholder')}
                placeholder={t('backups.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {hasTargets && section !== 'targets' ? (
              <button type="button" className="docker-icon-btn docker-icon-btn--mobile" title={t('backups.addTarget')} aria-label={t('backups.addTarget')} onClick={() => setAddTargetOpen(true)}>
                <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            ) : null}
            <button type="button" className="docker-icon-btn docker-icon-btn--mobile" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={refresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            <FilterMenu label={t('backups.sections')} value={section} onChange={(v) => setSection(v as BackupSection)} items={filterItems} />
            <button type="button" className="docker-primary-btn" onClick={primaryAction.run}>
              {primaryAction.icon}
              <span>{primaryAction.label}</span>
            </button>
            {hasTargets && section !== 'targets' ? (
              <button type="button" className="docker-secondary-btn" onClick={() => setAddTargetOpen(true)}>
                <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="docker-secondary-btn__text">{t('backups.addTarget')}</span>
              </button>
            ) : null}
          </div>
          <div className="docker-topbar__right">
            <div className="docker-search-wrap">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input"
                aria-label={t('backups.searchPlaceholder')}
                placeholder={t('backups.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="docker-icon-btn" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={refresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
            <div className="docker-badge-running">
              <span>{t('docker.itemsBadge', { count: counts[section] })}</span>
            </div>
          </div>
        </div>
      )}

      <BackupsSections bw={bw} />
      <BackupsModals bw={bw} />
    </div>
  )
}
