import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import {
  databaseExportUrl,
  getDatabaseImportStatus,
  startDatabaseImport,
  uploadDatabaseImportChunk,
} from '@/api/databases'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'

const CHUNK_SIZE = 16 * 1024 * 1024 // 16 MB per chunk (safe behind Cloudflare Tunnel 100 MB cap)

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function createUploadId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function BackupPanel({ databaseId, supported }: { databaseId: number; supported: boolean }) {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'importing'>('idle')
  const [uploadPct, setUploadPct] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!supported) {
    return (
      <div className="panel-empty">
        <p>{t('databases.backup.sqlOnly')}</p>
      </div>
    )
  }

  const busy = phase !== 'idle'

  const handleExport = () => {
    window.open(databaseExportUrl(databaseId), '_blank', 'noopener')
  }

  const handleImport = async () => {
    if (!selectedFile || busy) return
    setErrorMsg(null)
    setSuccessMsg(null)
    setUploadPct(0)
    setPhase('uploading')

    try {
      const uploadId = createUploadId()
      const totalChunks = Math.max(1, Math.ceil(selectedFile.size / CHUNK_SIZE))
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(selectedFile.size, start + CHUNK_SIZE)
        const chunk = selectedFile.slice(start, end)
        await uploadDatabaseImportChunk(databaseId, uploadId, i, selectedFile.name, chunk)
        setUploadPct(Math.round(((i + 1) / totalChunks) * 100))
      }

      setPhase('importing')
      const job = await startDatabaseImport(databaseId, uploadId, selectedFile.name)

      for (;;) {
        await sleep(2000)
        const status = await getDatabaseImportStatus(databaseId, job.jobId)
        if (status.status === 'done') {
          setSuccessMsg(status.message || t('databases.backup.importDone'))
          setSelectedFile(null)
          if (fileRef.current) fileRef.current.value = ''
          break
        }
        if (status.status === 'error') {
          setErrorMsg(status.error || t('databases.backup.importFailed'))
          break
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('databases.backup.importFailed'))
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section className="flex flex-col justify-between rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
        <div className="space-y-1.5">
          <h3 className="text-[0.875rem] font-semibold text-[var(--win-text)]">
            {t('databases.backup.exportTitle')}
          </h3>
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {t('databases.backup.exportDesc')}
          </p>
        </div>
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('databases.backup.exportBtn')}</span>
          </Button>
        </div>
      </section>

      <section className="flex flex-col justify-between rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
        <div className="space-y-2.5">
          <h3 className="text-[0.875rem] font-semibold text-[var(--win-text)]">
            {t('databases.backup.importTitle')}
          </h3>
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {t('databases.backup.importDesc')}
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".sql,.gz,.sql.gz,.zip"
            aria-label={t('databases.backup.chooseFile')}
            disabled={busy}
            onChange={(e) => {
              setSuccessMsg(null)
              setErrorMsg(null)
              setSelectedFile(e.target.files?.[0] ?? null)
            }}
            className="block w-full text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-md file:border file:border-[var(--win-border)] file:bg-[var(--panel-surface-strong)] file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-[var(--win-text)] hover:file:bg-[var(--panel-surface-hover)]"
          />

          {selectedFile ? (
            <p className="panel-mono truncate text-[0.75rem] text-[var(--text-secondary)]" title={selectedFile.name}>
              {selectedFile.name} ({formatFileSize(selectedFile.size)})
            </p>
          ) : null}

          {phase === 'uploading' ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span>{t('databases.backup.uploading')}</span>
                <span className="panel-mono">{uploadPct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-surface-strong)]">
                <div
                  className="h-full rounded-full bg-[var(--panel-primary-solid)] transition-all duration-200"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
            </div>
          ) : null}

          {phase === 'importing' ? (
            <p className="rounded-md border border-[var(--win-border)] bg-[var(--panel-surface-strong)] px-2.5 py-2 text-xs text-[var(--win-text)]">
              {t('databases.backup.importingBg')}
            </p>
          ) : null}

          {errorMsg ? (
            <p className="rounded-md border border-[var(--panel-danger-border)] bg-[var(--panel-danger-bg)] px-2.5 py-2 text-xs text-[var(--panel-danger-text)]">
              {errorMsg}
            </p>
          ) : null}

          {successMsg ? (
            <p className="rounded-md border border-[var(--panel-success-border)] bg-[var(--panel-success-bg)] px-2.5 py-2 text-xs text-[var(--panel-success-text)]">
              {successMsg}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedFile || busy}
            loading={busy}
            onClick={() => void handleImport()}
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>
              {phase === 'uploading'
                ? `${t('databases.backup.uploading')} ${uploadPct}%`
                : phase === 'importing'
                  ? t('databases.backup.importing')
                  : t('databases.backup.importBtn')}
            </span>
          </Button>
        </div>
      </section>
    </div>
  )
}
