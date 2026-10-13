import { Key } from 'lucide-react'
import type { FileManagerState } from './useFileManager'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TextInput } from '@/components/ui/Field'

export function RootAccessModal({ fm }: { fm: FileManagerState }) {
  const {
    t,
    showRootAccessModal,
    setShowRootAccessModal,
    rootPassword,
    setRootPassword,
    rootAccessLoading,
    submitRootAccess,
  } = fm

  const close = () => {
    setShowRootAccessModal(false)
    setRootPassword('')
  }

  return (
    <Modal
      open={showRootAccessModal}
      onClose={close}
      title={t('fileManager.rootAccessTitle')}
      icon={<Key />}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary-soft"
            loading={rootAccessLoading}
            icon={<Key className="h-3.5 w-3.5" />}
            onClick={() => void submitRootAccess()}
          >
            {t('fileManager.openRoot')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
        {t('fileManager.rootAccessDescriptionStart')} <code className="rounded bg-[var(--panel-surface)] px-1.5 py-0.5">/</code> {t('fileManager.rootAccessDescriptionEnd')}
      </p>
      <label className="panel-section-label">{t('fileManager.superadminPassword')}</label>
      <TextInput
        type="password"
        value={rootPassword}
        autoFocus
        onChange={(e) => setRootPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submitRootAccess()
        }}
        placeholder={t('fileManager.passwordPlaceholder')}
      />
    </Modal>
  )
}
