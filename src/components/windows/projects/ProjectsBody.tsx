import { alertLib } from '@/lib/alert'
import {
  Code,
  FileText,
  FolderCode,
  FolderOpen,
  Globe2,
  Hammer,
  LoaderCircle,
  Pencil,
  Play,
  RefreshCw,
  Square,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ProjectRow } from './ProjectRow'
import {
  LIST_LIMIT,
  STATE_PILL,
  TYPE_ICON,
  isRunnableProject,
  projectState,
  shouldShowProjectStop,
} from './projectsConfig'
import type { ProjectsWindowState } from './useProjectsWindow'

export function ProjectsBody({ pw }: { pw: ProjectsWindowState }) {
  const {
    t,
    list,
    narrowed,
    facets,
    isLoading,
    isError,
    refetch,
    isFetching,
    total,
    visibleProjects,
    highlightedProjectId,
    incidentMessage,
    incidentMetadata,
    incidentAt,
    startMut,
    stopMut,
    rebuildMut,
    deleteMut,
    uploadStaticMut,
    highlightedProject,
    openProjectFiles,
    openHighlightedProjectFiles,
    copyHighlightedProjectPath,
    openHighlightedProjectLogs,
    copyHighlightedInspectCommand,
    openTunnelForProject,
    openStaticUpload,
    openEditProject,
    setLogProject,
  } = pw

  const emptyTitle = narrowed ? t('docker.noResults') : t('projects.empty')
  const starting = highlightedProject && startMut.isPending && startMut.variables === highlightedProject.id
  const stopping = highlightedProject && stopMut.isPending && stopMut.variables === highlightedProject.id

  return (
    <div className="projects-body">
      {highlightedProject ? (
        <section className="projects-focus" aria-label={t('projects.focusedTarget')}>
          <div className="projects-focus__head">
            <div className="min-w-0">
              <p className="panel-section-label">{t('projects.focusedTarget')}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--win-text)]">{highlightedProject.name}</span>
                <Badge tone={projectState(highlightedProject) === 'running' ? 'success' : projectState(highlightedProject) === 'error' ? 'danger' : 'warning'}>
                  {t(`projects.state.${projectState(highlightedProject)}`)}
                </Badge>
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-[var(--text-secondary)]">
                {highlightedProject.runtime?.driftReason
                  ? t('projects.driftReason', { reason: highlightedProject.runtime.driftReason.split('_').join(' ') })
                  : highlightedProject.description || t('projects.incidentFallback')}
              </p>
            </div>
            <div className="projects-focus__actions">
              <Button size="sm" variant="ghost" icon={<RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />} disabled={isFetching} onClick={() => void refetch()}>
                {t('projects.refreshReconcile')}
              </Button>
              <Button size="sm" variant="ghost" icon={<FolderCode className="h-3.5 w-3.5" />} disabled={!highlightedProject.workingDir} onClick={() => void openHighlightedProjectFiles()}>
                {t('projects.openFiles')}
              </Button>
              <Button size="sm" variant="ghost" icon={<Terminal className="h-3.5 w-3.5" />} onClick={() => openHighlightedProjectLogs()}>
                {t('projects.openLogs')}
              </Button>
              <Button size="sm" variant="ghost" icon={<Code className="h-3.5 w-3.5" />} onClick={() => void copyHighlightedInspectCommand()}>
                {t('projects.copyInspectCmd')}
              </Button>
              <Button size="sm" variant="ghost" icon={<Code className="h-3.5 w-3.5" />} disabled={!highlightedProject.workingDir} onClick={() => void copyHighlightedProjectPath()}>
                {t('projects.copyPath')}
              </Button>
              {shouldShowProjectStop(highlightedProject) ? (
                <Button size="sm" variant="ghost" icon={<Square className="h-3.5 w-3.5" />} loading={!!stopping} onClick={() => stopMut.mutate(highlightedProject.id)}>
                  {t('projects.stopProject')}
                </Button>
              ) : isRunnableProject(highlightedProject) ? (
                <Button size="sm" variant="primary-soft" icon={<Play className="h-3.5 w-3.5" />} loading={!!starting} onClick={() => startMut.mutate(highlightedProject.id)}>
                  {t('projects.startProject')}
                </Button>
              ) : null}
            </div>
          </div>
          {incidentMessage ? (
            <div className="projects-focus__incident">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">{t('projects.openedFromIncident')}</Badge>
                {incidentAt ? <span className="text-[11.5px] text-[var(--text-secondary)]">{new Date(incidentAt).toLocaleString()}</span> : null}
              </div>
              <p className="mt-1 text-[12px] font-semibold text-[var(--win-text)]">{incidentMessage}</p>
              {incidentMetadata && incidentMetadata !== '{}' ? (
                <code className="panel-mono mt-1 block max-h-16 overflow-y-auto break-all text-[11.5px] leading-5 text-[var(--text-secondary)]">{incidentMetadata}</code>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {pw.viewMode === 'grid' ? (
        <div className="app-catalog-cards-scroll">
          <ListState
            loading={isLoading}
            error={isError}
            errorTitle={t('projects.loadFailed')}
            errorHint={t('projects.loadFailedHint')}
            loadingText={t('projects.loading')}
            empty={visibleProjects.length === 0}
            emptyIcon={<FolderCode />}
            emptyTitle={emptyTitle}
          >
            <div className="app-catalog-card-grid">
              {visibleProjects.map((p) => {
                const state = projectState(p)
                const drift = p.runtime?.drift ? (p.runtime.driftReason ? p.runtime.driftReason.split('_').join(' ') : t('projects.runtimeMismatch')) : ''
                const where = [p.projectType, p.spaFallback ? 'SPA' : '', p.workingDir].filter(Boolean).join(' · ')
                const busy =
                  (startMut.isPending && startMut.variables === p.id) ||
                  (stopMut.isPending && stopMut.variables === p.id) ||
                  (rebuildMut.isPending && rebuildMut.variables === p.id) ||
                  (uploadStaticMut.isPending && uploadStaticMut.variables?.project.id === p.id)
                const deleting = deleteMut.isPending && deleteMut.variables === p.id

                return (
                  <article key={p.id} className={`app-catalog-card${highlightedProjectId === p.id ? ' border-[var(--color-primary)]' : ''}`}>
                    <div className="space-y-2.5 min-w-0">
                      <div className="app-catalog-card__head">
                        <div className="app-catalog-card__identity">
                          <ListRowIcon>{TYPE_ICON[p.projectType] ?? <FolderCode className="h-3.5 w-3.5" />}</ListRowIcon>
                          <div className="app-catalog-card__titles">
                            <span className="docker-app-name truncate" title={p.name}>{p.name}</span>
                            <span className="docker-row__sub panel-mono truncate" title={where}>
                              {drift ? <span className="docker-row__warn">{t('projects.driftPrefix')}: {drift}</span> : where}
                            </span>
                          </div>
                        </div>
                        <span className={`docker-status-pill docker-status-pill--${STATE_PILL[state]}`} title={drift || undefined}>
                          <span className="docker-status-dot" />
                          <span>{t(`projects.state.${state}`)}</span>
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        {p.assignedPort > 0 ? (
                          <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                            <span className="opacity-70 shrink-0">{t('projects.col.port')}:</span>
                            <span className="panel-mono text-[var(--win-text)]">:{p.assignedPort}</span>
                          </div>
                        ) : null}
                        {p.description ? (
                          <p className="app-catalog-card__desc" title={p.description}>{p.description}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="app-catalog-card__footer">
                      <div className="docker-action-btns">
                        <button
                          type="button"
                          className="docker-act-btn"
                          title={p.workingDir ? t('projects.openFilesAt', { path: p.workingDir }) : t('projects.openFilesUnavailable')}
                          aria-label={t('projects.openFiles')}
                          disabled={!p.workingDir}
                          onClick={() => openProjectFiles(p)}
                        >
                          <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                        {p.projectType === 'static' ? (
                          <button type="button" className="docker-act-btn" title={t('projects.uploadBuild')} aria-label={t('projects.uploadBuild')} disabled={busy} onClick={() => openStaticUpload(p)}>
                            <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="docker-act-btn"
                          title={p.assignedPort ? t('projects.connectTunnel') : t('projects.tunnelNeedsPort')}
                          aria-label={t('projects.connectTunnel')}
                          disabled={!p.assignedPort}
                          onClick={() => openTunnelForProject(p)}
                        >
                          <Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                        {p.projectType === 'stack' || p.run?.startCommand ? (
                          <button
                            type="button"
                            className="docker-act-btn"
                            title={t('projects.rebuild')}
                            aria-label={t('projects.rebuild')}
                            disabled={busy}
                            onClick={async () => {
                              const confirmed = await alertLib.confirm(
                                t('projects.rebuildConfirmTitle'),
                                t('projects.rebuildConfirmMessage', { name: p.name }),
                                t('projects.rebuildConfirmAction'),
                                t('common.cancel'),
                                'warning',
                                'projects',
                              )
                              if (confirmed) rebuildMut.mutate(p.id)
                            }}
                          >
                            <Hammer className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        ) : null}
                        {isRunnableProject(p) ? (
                          <button type="button" className="docker-act-btn" title={t('projects.logs')} aria-label={t('projects.logs')} onClick={() => setLogProject(p)}>
                            <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        ) : null}
                        <button type="button" className="docker-act-btn" title={t('projects.editTitle')} aria-label={t('projects.editTitle')} onClick={() => openEditProject(p)}>
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                        {busy ? (
                          <button type="button" className="docker-act-btn" disabled aria-busy="true" title={t('projects.working')} aria-label={t('projects.working')}>
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                          </button>
                        ) : shouldShowProjectStop(p) ? (
                          <button type="button" className="docker-act-btn docker-act-btn--stop" title={t('projects.stopProject')} aria-label={t('projects.stopProject')} onClick={() => stopMut.mutate(p.id)}>
                            <Square className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} />
                          </button>
                        ) : isRunnableProject(p) ? (
                          <button type="button" className="docker-act-btn docker-act-btn--start" title={t('projects.startProject')} aria-label={t('projects.startProject')} onClick={() => startMut.mutate(p.id)}>
                            <Play className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="docker-act-btn docker-act-btn--danger"
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                          disabled={deleting}
                          onClick={async () => {
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
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            {total > LIST_LIMIT ? <p className="docker-list-note">{t('projects.truncated', { shown: LIST_LIMIT, total })}</p> : null}
          </ListState>
        </div>
      ) : (
      <ListTable
        variant="projects"
        empty={isLoading || isError || visibleProjects.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          list.column('name', t('projects.col.project'), facets?.name),
          list.column('state', t('projects.col.status'), facets?.state, { labelOf: (v) => t(`projects.state.${v}`) }),
          list.column('port', t('projects.col.port'), facets?.port),
          { label: t('projects.col.actions'), actions: true },
        ]}
      >
        <ListState
          loading={isLoading}
          error={isError}
          errorTitle={t('projects.loadFailed')}
          errorHint={t('projects.loadFailedHint')}
          loadingText={t('projects.loading')}
          empty={visibleProjects.length === 0}
          emptyIcon={<FolderCode />}
          emptyTitle={emptyTitle}
        >
          {visibleProjects.map((p, index) => (
            <ProjectRow
              key={p.id}
              project={p}
              index={index}
              highlighted={highlightedProjectId === p.id}
              onStart={() => startMut.mutate(p.id)}
              onStop={() => stopMut.mutate(p.id)}
              onTunnel={() => openTunnelForProject(p)}
              onUpload={() => openStaticUpload(p)}
              onLogs={() => setLogProject(p)}
              onRebuild={async () => {
                const confirmed = await alertLib.confirm(
                  t('projects.rebuildConfirmTitle'),
                  t('projects.rebuildConfirmMessage', { name: p.name }),
                  t('projects.rebuildConfirmAction'),
                  t('common.cancel'),
                  'warning',
                  'projects',
                )
                if (confirmed) rebuildMut.mutate(p.id)
              }}
              onFiles={() => openProjectFiles(p)}
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
              busy={
                (startMut.isPending && startMut.variables === p.id) ||
                (stopMut.isPending && stopMut.variables === p.id) ||
                (rebuildMut.isPending && rebuildMut.variables === p.id) ||
                (uploadStaticMut.isPending && uploadStaticMut.variables?.project.id === p.id)
              }
              deleting={deleteMut.isPending && deleteMut.variables === p.id}
            />
          ))}
          {total > LIST_LIMIT ? <p className="docker-list-note">{t('projects.truncated', { shown: LIST_LIMIT, total })}</p> : null}
        </ListState>
      </ListTable>
      )}
    </div>
  )
}
