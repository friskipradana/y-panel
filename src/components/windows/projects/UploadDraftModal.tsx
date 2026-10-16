import { Upload } from 'lucide-react'
import type { ProjectsWindowState } from './useProjectsWindow'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Checkbox } from '@/components/ui/Checkbox'

export function UploadDraftModal({ pw }: { pw: ProjectsWindowState }) {
  const {
    t,
    uploadDraft,
    setUploadDraft,
    uploadStaticMut,
    submitStaticUpload,
  } = pw
  if (!(uploadDraft)) return null

  return (
    <Modal
      open
      onClose={() => setUploadDraft(null)}
      title={t('projects.uploadStaticTitle')}
      icon={<Upload />}
      width={520}
      footer={
        <>
          <Button type="button" onClick={() => setUploadDraft(null)} variant="ghost">{t('common.cancel')}</Button>
          <Button type="button" onClick={submitStaticUpload} disabled={uploadStaticMut.isPending || !uploadDraft.file} variant="primary">
            {uploadStaticMut.isPending ? 'Mengupload...' : 'Upload & Extract'}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[12px] text-[var(--text-secondary)]">
        {uploadDraft.project.name} • target {uploadDraft.project.workingDir || 'working directory project'}
      </p>
      <div className="space-y-4">
        <div>
          <label className="panel-section-label">{t('projects.zipFile')}</label>
          <input
            type="file"
            accept=".zip,application/zip"
            className="panel-input"
            onChange={(event) => setUploadDraft((current) => current ? { ...current, file: event.target.files?.[0] ?? null } : current)}
          />
        </div>
        <div>
          <label className="panel-section-label">{t('projects.zipRoot')}</label>
          <TextInput
            value={uploadDraft.rootDir}
            onChange={(event) => setUploadDraft((current) => current ? { ...current, rootDir: event.target.value } : current)} mono
            placeholder={t('projects.zipRootPlaceholder')}
          />
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Kosongkan untuk auto-detect. Isi manual seperti `dist`, `build`, `out`, atau `public` jika perlu.</p>
        </div>
        <Checkbox
          checked={uploadDraft.clean}
          onChange={(checked) => setUploadDraft((current) => current ? { ...current, clean: checked } : current)}
          label={t('projects.cleanBeforeExtract')}
        />
        <p className="mt-[-10px] text-[11px] leading-5 text-[var(--text-secondary)]">
          Jika folder root diisi, struktur ZIP tetap dipertahankan dan project akan diarahkan ke folder itu.
        </p>
      </div>
    </Modal>
  )
}
