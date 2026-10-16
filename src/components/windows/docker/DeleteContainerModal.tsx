import { Trash2 } from 'lucide-react'
import type { DockerWindowState } from './useDockerWindow'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Checkbox } from '@/components/ui/Checkbox'

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
        <Checkbox
          checked={deleteOpts.removeVolumes}
          onChange={(checked) => setDeleteOpts((v) => ({ ...v, removeVolumes: checked }))}
          label={<>{t('docker.deleteVolumesData')} <span className="panel-mono text-[var(--panel-danger-text)]">(-v)</span></>}
        />
        <Checkbox
          checked={deleteOpts.removeImage}
          onChange={(checked) => setDeleteOpts((v) => ({ ...v, removeImage: checked }))}
          label={<>{t('docker.removeImage')} <span className="panel-mono">{deleteConfirm.image}</span></>}
        />
        {deleteOpts.removeImage && (
          <p className="text-[12px] text-[var(--panel-warning-text)] pl-5 leading-relaxed">
            {t('docker.removeImageWarning')}
          </p>
        )}
      </div>
    </Modal>
  )
}
