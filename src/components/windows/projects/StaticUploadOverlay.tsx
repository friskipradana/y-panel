import { useEffect, useRef } from 'react'
import { FolderCode, Hammer, Upload } from 'lucide-react'
import type { ProjectsWindowState } from './useProjectsWindow'
import { IconBadge } from '@/components/ui/IconBadge'
import { useI18n } from '@/lib/i18n'
import type { StaticUploadState } from './projectsConfig'

// What the install and the build print, as it comes. A terminal surface is dark in both themes (the look of the Docker progress).
export function UploadLog({ upload }: { upload: StaticUploadState }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [upload.log.length])
  if (upload.log.length === 0) return null
  return (
    <div className="docker-progress-terminal docker-update__log" ref={ref} role="log" aria-live="polite" aria-label={t('projects.buildLog')}>
      {upload.log.map((line, i) => (
        <div key={i} className="docker-progress-line docker-progress-line--info">{line}</div>
      ))}
    </div>
  )
}

export function StaticUploadOverlay({ pw }: { pw: ProjectsWindowState }) {
  const { t, staticUpload, uploadDraft } = pw
  // while the upload dialog is open it shows the progress itself: two loaders for one upload would be one too many
  if (!staticUpload || uploadDraft) return null

  return (
    <div className="absolute inset-0 z-[80] mobile:fixed flex items-center justify-center bg-[var(--win-bg)]/82 px-6 backdrop-blur-md">
      <div className="w-full max-w-[420px] rounded-[18px] border border-[var(--win-border)] bg-[var(--card-bg)]/95 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
        <div className="mb-4 flex items-center gap-3">
          <IconBadge size="lg" tone="primary">
            {staticUpload.phase === 'done' ? <FolderCode /> : staticUpload.phase === 'installing' || staticUpload.phase === 'building' ? <Hammer className="animate-pulse" /> : <Upload className={`${staticUpload.phase === 'uploading' || staticUpload.phase === 'extracting' ? 'animate-pulse' : ''}`} />}
          </IconBadge>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--win-text)]">
              {t(`projects.upload.${staticUpload.phase}`)}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
              {staticUpload.projectName} • {staticUpload.fileName}
            </div>
          </div>
          {staticUpload.phase === 'uploading' ? <div className="ml-auto panel-mono text-sm font-semibold text-[var(--win-text)]">{staticUpload.percent}%</div> : null}
        </div>
        <div className="panel-progress">
          <div className="panel-progress__bar transition-[width] duration-300" style={{ width: `${staticUpload.percent}%` }} />
        </div>
        <div className="mt-3 text-[11px] leading-5 text-[var(--text-secondary)]">
          {t(`projects.uploadNote.${staticUpload.phase}`)}
        </div>
        <div className="mt-3">
          <UploadLog upload={staticUpload} />
        </div>
      </div>
    </div>
  )
}
