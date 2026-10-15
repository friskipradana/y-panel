import { FolderCode, Upload } from 'lucide-react'
import type { ProjectsWindowState } from './useProjectsWindow'
import { IconBadge } from '@/components/ui/IconBadge'

export function StaticUploadOverlay({ pw }: { pw: ProjectsWindowState }) {
  const {
    staticUpload,
  } = pw
  if (!(staticUpload)) return null

  return (
    <div className="absolute inset-0 z-[80] mobile:fixed flex items-center justify-center bg-[var(--win-bg)]/82 px-6 backdrop-blur-md">
      <div className="w-full max-w-[420px] rounded-[18px] border border-[var(--win-border)] bg-[var(--card-bg)]/95 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
        <div className="mb-4 flex items-center gap-3">
          <IconBadge size="lg" tone="primary">
            {staticUpload.phase === 'done' ? <FolderCode /> : <Upload className={`${staticUpload.phase === 'uploading' || staticUpload.phase === 'extracting' ? 'animate-pulse' : ''}`} />}
          </IconBadge>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--win-text)]">
              {staticUpload.phase === 'uploading'
                ? 'Mengupload build static'
                : staticUpload.phase === 'extracting'
                  ? 'Mengekstrak file build'
                  : staticUpload.phase === 'done'
                    ? 'Upload selesai'
                    : 'Upload gagal'}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
              {staticUpload.projectName} • {staticUpload.fileName}
            </div>
          </div>
          <div className="ml-auto panel-mono text-sm font-semibold text-[var(--win-text)]">{staticUpload.percent}%</div>
        </div>
        <div className="panel-progress">
          <div className="panel-progress__bar transition-[width] duration-300" style={{ width: `${staticUpload.percent}%` }} />
        </div>
        <div className="mt-3 text-[11px] leading-5 text-[var(--text-secondary)]">
          {staticUpload.phase === 'extracting'
            ? 'Upload sudah diterima. Backend sedang membersihkan folder project dan mengekstrak ZIP.'
            : staticUpload.phase === 'done'
              ? 'File sudah siap dipakai oleh static server.'
              : staticUpload.phase === 'error'
                ? 'Cek pesan error untuk detail kegagalan.'
                : 'Jangan tutup window sampai proses selesai.'}
        </div>
      </div>
    </div>
  )
}
