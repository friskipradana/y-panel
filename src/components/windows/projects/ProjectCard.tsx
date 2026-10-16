import { type Project } from '@/api/agent'
import { useI18n } from '@/lib/i18n'
import { FolderCode, Play, Square, Trash2, RefreshCw, Globe, Upload, Pencil } from 'lucide-react'
import { TYPE_ICON, STATUS_PILL, shouldShowProjectStop } from './projectsConfig'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EntityRow } from '@/components/ui/EntityRow'

export function ProjectCard({
  project: p,
  highlighted = false,
  onStart,
  onStop,
  onTunnel,
  onUpload,
  onEdit,
  onDelete,
  isStarting,
  isStopping,
  isUploading,
}: {
  project: Project
  highlighted?: boolean
  onStart: () => void
  onStop: () => void
  onTunnel: () => void
  onUpload: () => void
  onEdit: () => void
  onDelete: () => void
  isStarting: boolean
  isStopping: boolean
  isUploading: boolean
}) {
  const { t } = useI18n()
  const runtimeLabel = p.runtime?.drift ? t('projects.runtimeDrift') : p.runtime?.known ? (p.runtime.running ? t('projects.runtimeActive') : t('projects.runtimeStopped')) : t('projects.runtimeUnknown')
  const runtimeTone = p.runtime?.drift ? 'warning' : p.runtime?.running ? 'success' : 'neutral'
  return (
    <div
      id={`project-card-${p.id}`}
      tabIndex={highlighted ? -1 : undefined}
      className={
        highlighted
          ? 'rounded-[16px] bg-[var(--projects-card-highlight-bg)] ring-1 ring-[var(--projects-card-highlight-ring)] transition outline-none'
          : 'transition outline-none'
      }
    >
      <EntityRow
        centered
        className="group p-4"
        leading={<div className="panel-avatar">{TYPE_ICON[p.projectType] ?? <FolderCode className="h-4 w-4" />}</div>}
        title={p.name}
        badges={
          <>
        <Badge tone={STATUS_PILL[p.status] ?? 'neutral'}>{p.status}</Badge>
        {p.spaFallback ? <Badge tone="info">SPA</Badge> : null}
        <Badge tone={runtimeTone}>{runtimeLabel}</Badge>
          </>
        }
        meta={
          <>
        <span className="capitalize">{p.projectType}</span>
        {p.assignedPort > 0 && <span className="panel-mono">:{p.assignedPort}</span>}
        {p.workingDir && <span className="panel-mono max-w-[180px] truncate">{p.workingDir}</span>}
          </>
        }
        actions={
          <div className="flex flex-shrink-0 items-center gap-1">
            {p.projectType === 'static' && (
              <Button onClick={onUpload} disabled={isUploading} variant="ghost" className="px-2.5 py-1.5 text-xs">
        {isUploading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Upload
              </Button>
            )}
            <Button onClick={onTunnel} disabled={!p.assignedPort} variant="ghost" className="px-2.5 py-1.5 text-xs">
              <Globe className="h-3 w-3" /> Tunnel
            </Button>
            <IconButton onClick={onEdit} label={t('projects.editTitle')}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            {shouldShowProjectStop(p) ? (
              <Button onClick={onStop} disabled={isStopping} variant="ghost" className="px-3 py-2 text-[12px]">
        <Square className="h-3 w-3" /> {t('projects.stopShort')}
              </Button>
            ) : (
              <Button onClick={onStart} disabled={isStarting} variant="primary-soft" className="px-3 py-2 text-[12px]">
        <Play className="h-3 w-3" /> {t('projects.startShort')}
              </Button>
            )}
            <IconButton onClick={onDelete} tone="danger" label={t('common.delete')} className="opacity-0 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        }
        description={
          p.description || p.runtime?.drift ? (
            <div className="mt-0.5 space-y-1">
              {p.description && <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">{p.description}</p>}
              {p.runtime?.drift && (
                <p className="text-[12px] font-medium text-[var(--warning)]">
                  {t('projects.driftPrefix')}: {p.runtime?.driftReason ? p.runtime.driftReason.split('_').join(' ') : t('projects.runtimeMismatch')}
                </p>
              )}
            </div>
          ) : null
        }
      />
    </div>
  )
}
