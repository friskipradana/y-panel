import { FileText, FolderCode, FolderOpen, Globe2, Hammer, LoaderCircle, Pencil, Play, Square, Trash2, Upload } from 'lucide-react'
import { type Project } from '@/api/agent'
import { ListRowIcon } from '@/components/ui/ListTable'
import { useI18n } from '@/lib/i18n'
import { STATE_PILL, TYPE_ICON, isRunnableProject, projectState, shouldShowProjectStop } from './projectsConfig'

interface ProjectRowProps {
  project: Project
  index: number
  highlighted: boolean
  onStart: () => void
  onStop: () => void
  onTunnel: () => void
  onUpload: () => void
  onLogs: () => void
  onRebuild: () => void
  onFiles: () => void
  onEdit: () => void
  onDelete: () => void
  /** A start, stop or upload of this project is under way */
  busy: boolean
  deleting: boolean
}

// One project, in the same row as a container: icon and name, state, port, and its actions
export function ProjectRow({ project: p, index, highlighted, onStart, onStop, onTunnel, onUpload, onLogs, onRebuild, onFiles, onEdit, onDelete, busy, deleting }: ProjectRowProps) {
  const { t } = useI18n()
  const state = projectState(p)
  const drift = p.runtime?.drift ? (p.runtime.driftReason ? p.runtime.driftReason.split('_').join(' ') : t('projects.runtimeMismatch')) : ''
  const where = [p.projectType, p.spaFallback ? 'SPA' : '', p.workingDir].filter(Boolean).join(' · ')

  return (
    <div id={`project-row-${p.id}`} tabIndex={highlighted ? -1 : undefined} className={`docker-row${highlighted ? ' docker-row--highlight' : ''}`}>
      <div className="docker-row__num">{String(index + 1).padStart(2, '0')}</div>
      <div className="docker-row__app">
        <ListRowIcon>{TYPE_ICON[p.projectType] ?? <FolderCode className="h-3.5 w-3.5" />}</ListRowIcon>
        <div className="docker-row__text">
          <span className="docker-app-name" title={p.name}>{p.name}</span>
          <span className="docker-row__sub" title={where}>
            {drift ? <span className="docker-row__warn">{t('projects.driftPrefix')}: {drift}</span> : where}
          </span>
          <span className="docker-row__meta">{[p.assignedPort > 0 ? `:${p.assignedPort}` : '', where].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <div className="docker-cell--keep">
        <span className={`docker-status-pill docker-status-pill--${STATE_PILL[state]}`} title={drift || undefined}>
          <span className="docker-status-dot" />
          <span>{t(`projects.state.${state}`)}</span>
        </span>
      </div>
      <div className="docker-cell docker-cell--mono">{p.assignedPort > 0 ? `:${p.assignedPort}` : '-'}</div>
      <div className="docker-action-btns">
        <button
          type="button"
          className="docker-act-btn"
          title={p.workingDir ? t('projects.openFilesAt', { path: p.workingDir }) : t('projects.openFilesUnavailable')}
          aria-label={t('projects.openFiles')}
          disabled={!p.workingDir}
          onClick={onFiles}
        >
          <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        {p.projectType === 'static' ? (
          <button type="button" className="docker-act-btn" title={t('projects.uploadBuild')} aria-label={t('projects.uploadBuild')} disabled={busy} onClick={onUpload}>
            <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
        <button
          type="button"
          className="docker-act-btn"
          title={p.assignedPort ? t('projects.connectTunnel') : t('projects.tunnelNeedsPort')}
          aria-label={t('projects.connectTunnel')}
          disabled={!p.assignedPort}
          onClick={onTunnel}
        >
          <Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        {p.projectType === 'stack' || p.run?.startCommand ? (
          <button type="button" className="docker-act-btn" title={t('projects.rebuild')} aria-label={t('projects.rebuild')} disabled={busy} onClick={onRebuild}>
            <Hammer className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
        {isRunnableProject(p) ? (
          <button type="button" className="docker-act-btn" title={t('projects.logs')} aria-label={t('projects.logs')} onClick={onLogs}>
            <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
        <button type="button" className="docker-act-btn" title={t('projects.editTitle')} aria-label={t('projects.editTitle')} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
        {busy ? (
          <button type="button" className="docker-act-btn" disabled aria-busy="true" title={t('projects.working')} aria-label={t('projects.working')}>
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
          </button>
        ) : shouldShowProjectStop(p) ? (
          <button type="button" className="docker-act-btn docker-act-btn--stop" title={t('projects.stopProject')} aria-label={t('projects.stopProject')} onClick={onStop}>
            <Square className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} />
          </button>
        ) : isRunnableProject(p) ? (
          <button type="button" className="docker-act-btn docker-act-btn--start" title={t('projects.startProject')} aria-label={t('projects.startProject')} onClick={onStart}>
            <Play className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} />
          </button>
        ) : null}
        <button type="button" className="docker-act-btn docker-act-btn--danger" title={t('common.delete')} aria-label={t('common.delete')} disabled={deleting} onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
