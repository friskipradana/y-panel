import { alertLib } from '@/lib/alert'
import {
  FolderCode,
  Play,
  Square,
  RefreshCw,
  Code,
  Search,
  ChevronLeft,
  ChevronRight,
  Terminal,
} from 'lucide-react'
import { STATUS_PILL, PAGE_SIZE, shouldShowProjectStop } from './projectsConfig'
import { ProjectCard } from './ProjectCard'
import type { ProjectsWindowState } from './useProjectsWindow'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'

export function ProjectsBody({ pw }: { pw: ProjectsWindowState }) {
  const {
    t,
    query,
    setQuery,
    setSearch,
    offset,
    setOffset,
    attentionOnly,
    attentionFilter,
    isLoading,
    isError,
    refetch,
    isFetching,
    total,
    visibleProjects,
    totalPages,
    currentPage,
    highlightedProjectId,
    incidentMessage,
    incidentMetadata,
    incidentAt,
    startMut,
    stopMut,
    deleteMut,
    uploadStaticMut,
    highlightedProject,
    openHighlightedProjectFiles,
    copyHighlightedProjectPath,
    openHighlightedProjectLogs,
    copyHighlightedInspectCommand,
    openTunnelForProject,
    openStaticUpload,
    openEditProject,
  } = pw

  return (
    <div className="panel-window__body">
      <div className="panel-window__stack">
        {highlightedProject ? (
          <section className="panel-muted-block rounded-[22px] border border-[var(--win-border)] bg-[var(--projects-highlight-bg)] px-4 py-4 shadow-[var(--projects-highlight-shadow)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="panel-section-label">{t('projects.focusedTarget')}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--win-text)]">{highlightedProject.name}</span>
                  <span className={`panel-badge ${STATUS_PILL[highlightedProject.status] ?? 'panel-badge--neutral'}`}>{highlightedProject.status}</span>
                  {highlightedProject.spaFallback ? <Badge tone="info">SPA</Badge> : null}
                  {highlightedProject.runtime?.drift ? <Badge tone="warning">drift</Badge> : null}
                </div>
                <p className="mt-2 text-[12px] leading-6 text-[var(--text-secondary)]">
                  {highlightedProject.runtime?.driftReason
                    ? t('projects.driftReason', { reason: highlightedProject.runtime.driftReason.split('_').join(' ') })
                    : highlightedProject.description || t('projects.incidentFallback')}
                </p>
                {incidentMessage ? (
                  <div className="mt-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-warning-bg)] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="warning">{t('projects.openedFromIncident')}</Badge>
                      {incidentAt ? (
                        <span className="text-[12px] text-[var(--text-secondary)]">{new Date(incidentAt).toLocaleString('id-ID')}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[12px] font-semibold text-[var(--win-text)]">{incidentMessage}</p>
                    {incidentMetadata && incidentMetadata !== '{}' ? (
                      <code className="panel-mono mt-1 block max-h-16 overflow-y-auto break-all text-[12px] leading-5 text-[var(--text-secondary)]">{incidentMetadata}</code>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => refetch()} variant="ghost" disabled={isFetching}>
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                  {t('projects.refreshReconcile')}
                </Button>
                <Button
                  type="button"
                  onClick={() => void openHighlightedProjectFiles()}
                  disabled={!highlightedProject.workingDir} variant="ghost"
                >
                  <FolderCode className="h-3.5 w-3.5" />
                  {t('projects.openFiles')}
                </Button>
                <Button
                  type="button"
                  onClick={() => openHighlightedProjectLogs()} variant="ghost"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  {t('projects.openLogs')}
                </Button>
                <Button
                  type="button"
                  onClick={() => void copyHighlightedInspectCommand()} variant="ghost"
                >
                  <Code className="h-3.5 w-3.5" />
                  {t('projects.copyInspectCmd')}
                </Button>
                <Button
                  type="button"
                  onClick={() => void copyHighlightedProjectPath()}
                  disabled={!highlightedProject.workingDir} variant="ghost"
                >
                  <Code className="h-3.5 w-3.5" />
                  {t('projects.copyPath')}
                </Button>
                {shouldShowProjectStop(highlightedProject) ? (
                  <Button
                    type="button"
                    onClick={() => stopMut.mutate(highlightedProject.id)}
                    disabled={stopMut.isPending && stopMut.variables === highlightedProject.id} variant="ghost"
                  >
                    <Square className="h-3.5 w-3.5" />
                    {stopMut.isPending && stopMut.variables === highlightedProject.id ? t('projects.stopping') : t('projects.stopProject')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => startMut.mutate(highlightedProject.id)}
                    disabled={startMut.isPending && startMut.variables === highlightedProject.id} variant="primary-soft"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {startMut.isPending && startMut.variables === highlightedProject.id ? t('projects.starting') : t('projects.startProject')}
                  </Button>
                )}
              </div>
            </div>
          </section>
        ) : null}
        <div className="panel-table-container">
          <div className="panel-toolbar panel-toolbar--search">
            <form
              className="panel-search"
              onSubmit={(e) => {
                e.preventDefault()
                setOffset(0)
                setSearch(query.trim())
              }}
            >
              <Search className="h-4 w-4" />
              <input
                id="projects-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="panel-search__input"
                placeholder={t('projects.searchPlaceholder')}
              />
              <Button type="submit" variant="primary-soft">{t('common.search')}</Button>
            </form>
            <div className="panel-pagination-summary">{t('common.pageSummary', { page: currentPage, totalPages })}</div>
          </div>

          {isLoading ? (
            <LoadingState>{t('projects.loading')}</LoadingState>
          ) : isError ? (
            <ErrorState
              title={t('projects.loadFailed')}
              hint={t('projects.loadFailedHint')}
              action={
                <Button variant="ghost" loading={isFetching} onClick={() => void refetch()}>
                  {t('common.retry')}
                </Button>
              }
            />
          ) : visibleProjects.length === 0 ? (
            <EmptyState icon={<FolderCode />}>
                  {attentionOnly
                    ? attentionFilter === 'drift'
                      ? t('projects.emptyDrift')
                      : attentionFilter === 'degraded'
                        ? t('projects.emptyDegraded')
                        : t('projects.emptyAttention')
                    : t('projects.empty')}
              </EmptyState>
          ) : (
            <>
              {visibleProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  highlighted={highlightedProjectId === p.id}
                  onStart={() => startMut.mutate(p.id)}
                  onStop={() => stopMut.mutate(p.id)}
                  onTunnel={() => openTunnelForProject(p)}
                  onUpload={() => openStaticUpload(p)}
                  onEdit={() => openEditProject(p)}
                  onDelete={async () => {
                    const confirmed = await alertLib.confirm(
                      t('projects.deleteConfirmTitle'),
                      t('projects.deleteConfirmMessage', { name: p.name }),
                      t('projects.deleteConfirmAction'),
                      t('common.cancel'),
                      'warning',
                      'projects',
                    )
                    if (confirmed) deleteMut.mutate(p.id)
                  }}
                  isStarting={startMut.isPending && startMut.variables === p.id}
                  isStopping={stopMut.isPending && stopMut.variables === p.id}
                  isUploading={uploadStaticMut.isPending && uploadStaticMut.variables?.project.id === p.id}
                />
              ))}
            </>
          )}

          <div className="panel-pagination">
            <Button id="projects-prev-page" variant="ghost" disabled={offset <= 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>
              <ChevronLeft className="h-3.5 w-3.5" />
              {t('common.previous')}
            </Button>
            <Button id="projects-next-page" variant="ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((value) => value + PAGE_SIZE)}>
              {t('common.next')}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
