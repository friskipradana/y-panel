import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'
import { databaseExportUrl, importDatabaseSQL } from '@/api/databases'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'

export function BackupPanel({ databaseId, supported }: { databaseId: number; supported: boolean }) {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const importMut = useMutation({
    mutationFn: (file: File) => importDatabaseSQL(databaseId, file),
    onSuccess: (res) => {
      setSuccessMsg(res.message || t('databases.backup.importDone'))
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ''
    },
  })

  if (!supported) {
    return (
      <div className="panel-empty">
        <p>{t('databases.backup.sqlOnly')}</p>
      </div>
    )
  }

  const handleExport = () => {
    window.open(databaseExportUrl(databaseId), '_blank', 'noopener')
  }

  const handleImport = () => {
    if (!selectedFile) return
    setSuccessMsg(null)
    importMut.mutate(selectedFile)
  }

  const errorMessage =
    importMut.isError && importMut.error instanceof Error
      ? importMut.error.message
      : importMut.isError
        ? t('databases.backup.importFailed')
        : null

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
        <div className="space-y-2">
          <h3 className="text-[0.875rem] font-semibold text-[var(--win-text)]">
            {t('databases.backup.importTitle')}
          </h3>
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {t('databases.backup.importDesc')}
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".sql,.gz,.sql.gz"
            aria-label={t('databases.backup.chooseFile')}
            disabled={importMut.isPending}
            onChange={(e) => {
              setSuccessMsg(null)
              importMut.reset()
              setSelectedFile(e.target.files?.[0] ?? null)
            }}
            className="block w-full text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-md file:border file:border-[var(--win-border)] file:bg-[var(--panel-surface-strong)] file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-[var(--win-text)] hover:file:bg-[var(--panel-surface-hover)]"
          />

          {selectedFile ? (
            <p className="panel-mono truncate text-[0.75rem] text-[var(--text-secondary)]">
              {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
            </p>
          ) : null}

          {errorMessage ? (
            <p className="rounded-md border border-[var(--panel-danger-border)] bg-[var(--panel-danger-bg)] px-2.5 py-2 text-xs text-[var(--panel-danger-text)]">
              {errorMessage}
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
            disabled={!selectedFile || importMut.isPending}
            loading={importMut.isPending}
            onClick={handleImport}
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{importMut.isPending ? t('databases.backup.importing') : t('databases.backup.importBtn')}</span>
          </Button>
        </div>
      </section>
    </div>
  )
}
