import { alertLib } from '@/lib/alert'
import { Code, FolderCode, Play, RefreshCw, Square, Terminal } from 'lucide-react'
import { ListState, ListTable } from '@/components/ui/ListTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ProjectRow } from './ProjectRow'
import { LIST_LIMIT, isRunnableProject, projectState, shouldShowProjectStop } from './projectsConfig'
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
                (uploadStaticMut.isPending && uploadStaticMut.variables?.project.id === p.id)
              }
              deleting={deleteMut.isPending && deleteMut.variables === p.id}
            />
          ))}
          {total > LIST_LIMIT ? <p className="docker-list-note">{t('projects.truncated', { shown: LIST_LIMIT, total })}</p> : null}
        </ListState>
      </ListTable>
    </div>
  )
}
