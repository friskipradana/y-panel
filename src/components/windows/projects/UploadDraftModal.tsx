import { Upload } from 'lucide-react'
import type { ProjectsWindowState } from './useProjectsWindow'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Checkbox } from '@/components/ui/Checkbox'
import { FilePicker } from '@/components/ui/FilePicker'
import { ARCHIVE_ACCEPT } from './projectsConfig'
import { UploadLog } from './StaticUploadOverlay'

export function UploadDraftModal({ pw }: { pw: ProjectsWindowState }) {
  const {
    t,
    uploadDraft,
    setUploadDraft,
    uploadStaticMut,
    staticUpload,
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
          <Button type="button" onClick={submitStaticUpload} loading={uploadStaticMut.isPending} disabled={!uploadDraft.file} variant="primary">
            {uploadStaticMut.isPending ? t(`projects.upload.${staticUpload?.phase ?? 'uploading'}`) + (staticUpload?.phase === 'uploading' ? ` ${staticUpload.percent}%` : '') : t('projects.uploadAndExtract')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[12px] text-[var(--text-secondary)]">
        {uploadDraft.project.name} • {t('projects.uploadTarget')} {uploadDraft.project.workingDir || t('projects.uploadTargetFallback')}
      </p>
      <div className="space-y-4">
        <div>
          <label className="panel-section-label" htmlFor="project-archive">{t('projects.zipFile')}</label>
          <FilePicker
            id="project-archive"
            accept={ARCHIVE_ACCEPT}
            file={uploadDraft.file}
            disabled={uploadStaticMut.isPending}
            onChange={(file) => setUploadDraft((current) => current ? { ...current, file } : current)}
          />
        </div>
        <div>
          <label className="panel-section-label">{t('projects.zipRoot')}</label>
          <TextInput
            value={uploadDraft.rootDir}
            onChange={(event) => setUploadDraft((current) => current ? { ...current, rootDir: event.target.value } : current)} mono
            placeholder={t('projects.zipRootPlaceholder')}
          />
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{t('projects.zipRootHint')}</p>
        </div>
        <Checkbox
          checked={uploadDraft.clean}
          onChange={(checked) => setUploadDraft((current) => current ? { ...current, clean: checked } : current)}
          label={t('projects.cleanBeforeExtract')}
        />
        <p className="mt-[-10px] text-[11px] leading-5 text-[var(--text-secondary)]">{t('projects.zipRootNote')}</p>
        <p className="text-[11px] leading-5 text-[var(--text-secondary)]">{t('projects.sourceNote')}</p>
        {uploadStaticMut.isPending && staticUpload ? <UploadLog upload={staticUpload} /> : null}
      </div>
    </Modal>
  )
}
