import { Trash2 } from 'lucide-react'
import type { DockerWindowState } from './useDockerWindow'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export function DeleteContainerModal({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    deleteConfirm,
    setDeleteConfirm,
    deleteOpts,
    setDeleteOpts,
    deleteMutation,
  } = docker
  if (!deleteConfirm) return null

  return (
    <Modal
      open
      onClose={() => setDeleteConfirm(null)}
      title={t('docker.deleteContainerTitle')}
      icon={<Trash2 className="text-[var(--panel-danger-text)]" />}
      width={440}
      footer={
        <>
          <Button onClick={() => setDeleteConfirm(null)} variant="ghost">{t('common.cancel')}</Button>
          <Button
            onClick={() => {
              deleteMutation.mutate({ id: deleteConfirm.id, opts: deleteOpts })
              setDeleteConfirm(null)
            }}
            disabled={deleteMutation.isPending} variant="danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteMutation.isPending ? t('docker.deleting') : t('common.delete')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[12px] text-[var(--text-secondary)] leading-relaxed">
        {t('docker.deleteContainerDescription', { name: deleteConfirm.name })}
      </p>
      <div className="space-y-3 mb-5">
        <label className="docker-save-tpl-check">
          <input type="checkbox" checked={deleteOpts.removeVolumes} onChange={(e) => setDeleteOpts((v) => ({ ...v, removeVolumes: e.target.checked }))} />
          <span>{t('docker.deleteVolumesData')}</span>
          <span className="docker-save-tpl-check__name text-[var(--panel-danger-text)]">(-v)</span>
        </label>
        <label className="docker-save-tpl-check">
          <input type="checkbox" checked={deleteOpts.removeImage} onChange={(e) => setDeleteOpts((v) => ({ ...v, removeImage: e.target.checked }))} />
          <span>{t('docker.removeImage')}</span>
          <span className="docker-save-tpl-check__name font-mono text-[12px]">{deleteConfirm.image}</span>
        </label>
        {deleteOpts.removeImage && (
          <p className="text-[12px] text-[var(--panel-warning-text)] pl-5 leading-relaxed">
            {t('docker.removeImageWarning')}
          </p>
        )}
      </div>
    </Modal>
  )
}
