import { FileText, FolderCode, LoaderCircle, Play, Square } from 'lucide-react'
import { type Project } from '@/api/agent'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
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
  onWebhook: () => void
  onDeployK8s?: () => void
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
export function ProjectRow({ project: p, index, highlighted, onStart, onStop, onTunnel, onWebhook, onDeployK8s, onUpload, onLogs, onRebuild, onFiles, onEdit, onDelete, busy, deleting }: ProjectRowProps) {
  const { t } = useI18n()
  const state = projectState(p)
  const drift = p.runtime?.drift ? (p.runtime.driftReason ? p.runtime.driftReason.split('_').join(' ') : t('projects.runtimeMismatch')) : ''
  const where = [p.projectType, p.spaFallback ? 'SPA' : '', p.workingDir].filter(Boolean).join(' · ')

  const moreItems: ActionMenuItem[] = [
    {
      key: 'files',
      label: t('projects.openFiles'),
      disabled: !p.workingDir,
      onSelect: onFiles,
    },
    ...(p.projectType === 'static'
      ? [{
          key: 'upload',
          label: t('projects.uploadBuild'),
          disabled: busy,
          onSelect: onUpload,
        }]
      : []),
    {
      key: 'tunnel',
      label: t('projects.connectTunnel'),
      disabled: !p.assignedPort,
      onSelect: onTunnel,
    },
    {
      key: 'webhook',
      label: t('projects.gitWebhook'),
      disabled: !p.workingDir,
      onSelect: onWebhook,
    },
    ...(onDeployK8s
      ? [{
          key: 'deploy-k8s',
          label: t('projects.deployK8s'),
          onSelect: onDeployK8s,
        }]
      : []),
    ...(p.projectType === 'stack' || p.run?.startCommand
      ? [{
          key: 'rebuild',
          label: t('projects.rebuild'),
          disabled: busy,
          onSelect: onRebuild,
        }]
      : []),
    {
      key: 'edit',
      label: t('projects.editTitle'),
      dividerBefore: true,
      onSelect: onEdit,
    },
    {
      key: 'delete',
      label: t('common.delete'),
      tone: 'danger',
      disabled: deleting,
      onSelect: onDelete,
    },
  ]

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
        {isRunnableProject(p) ? (
          <button type="button" className="docker-act-btn" title={t('projects.logs')} aria-label={t('projects.logs')} onClick={onLogs}>
            <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
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
        <ActionMenu label={t('common.moreActions')} items={moreItems} compact />
      </div>
    </div>
  )
}
