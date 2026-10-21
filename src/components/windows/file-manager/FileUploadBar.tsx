import { LoaderCircle, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { useI18n } from '@/lib/i18n'
import type { FileUpload } from './useFileUpload'

// The upload in progress: how many files, where to, and how far (one marker for one process)
export function FileUploadBar({ upload }: { upload: FileUpload }) {
  const { t } = useI18n()
  const state = upload.upload
  if (!state) return null
  return (
    <div className="flex items-center gap-3 border-t border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2" role="status" aria-live="polite">
      <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--panel-primary-text)]" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-[var(--win-text)]">{t('fileManager.uploading', { count: state.count, name: state.folder })}</div>
        <div className="panel-progress mt-1">
          <div className="panel-progress__bar transition-[width] duration-200" style={{ width: `${state.percent}%` }} />
        </div>
      </div>
      <span className="panel-mono text-[12px] font-semibold text-[var(--win-text)]">{state.percent}%</span>
      <IconButton label={t('fileManager.uploadCancel')} onClick={upload.cancel}>
        <X className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  )
}
