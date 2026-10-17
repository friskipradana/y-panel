import { Plus, RefreshCw, Search } from 'lucide-react'
import type { ProjectsWindowState } from './useProjectsWindow'

// The bar of the Docker window: what is shown, the main action, search, refresh, and a count
export function ProjectsToolbar({ pw }: { pw: ProjectsWindowState }) {
  const { t, list, refetch, isFetching, openCreate, stats } = pw

  return (
    <div className="docker-topbar">
      <div className="docker-topbar__left">
        <button type="button" onClick={openCreate} className="docker-primary-btn">
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>{t('projects.createButton')}</span>
        </button>
      </div>

      <div className="docker-topbar__right">
        <div className="docker-search-wrap">
          <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
          <input
            id="projects-search-input"
            type="search"
            className="docker-search-input"
            aria-label={t('projects.searchShort')}
            placeholder={t('projects.searchShort')}
            value={list.text}
            onChange={(e) => list.setText(e.target.value)}
          />
        </div>

        <button type="button" className="docker-icon-btn" title={t('projects.refresh')} aria-label={t('projects.refresh')} onClick={() => void refetch()}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
        </button>

        <div className="docker-badge-running">{t('projects.activeBadge', { active: stats.running, total: stats.all })}</div>
      </div>
    </div>
  )
}
