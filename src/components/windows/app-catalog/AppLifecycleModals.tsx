import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import type { InstalledApp } from '@/api/appCatalog'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'

export interface AppProgressModalState {
  kind: 'upgrade' | 'rollback'
  phase: 'running' | 'success' | 'error'
  app: InstalledApp
  image: string
  errorMessage?: string
}

interface UninstallAppModalProps {
  target: InstalledApp | null
  removeVolumes: boolean
  isPending: boolean
  onRemoveVolumesChange: (checked: boolean) => void
  onClose: () => void
  onConfirm: () => void
}

export function UninstallAppModal({
  target,
  removeVolumes,
  isPending,
  onRemoveVolumesChange,
  onClose,
  onConfirm,
}: UninstallAppModalProps) {
  const { t } = useI18n()

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={t('appCatalog.uninstallModalTitle')}
      subtitle={target?.name}
      size="sm"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={isPending}
            onClick={onConfirm}
          >
            {t('appCatalog.uninstallAction')}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p className="text-[var(--text-secondary)]">{t('appCatalog.uninstallConfirmBody')}</p>
        {target && target.kind !== 'custom-url' ? (
          <div className="space-y-2.5 pt-1">
            <Checkbox
              checked={removeVolumes}
              onChange={onRemoveVolumesChange}
              tone="warning"
              label={t('appCatalog.removeVolumesLabel')}
              description={t('appCatalog.removeVolumesDesc')}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

interface AppProgressModalProps {
  modal: AppProgressModalState | null
  onClose: () => void
  onOpenApp: (app: InstalledApp) => void
}

export function AppProgressModal({ modal, onClose, onOpenApp }: AppProgressModalProps) {
  const { t } = useI18n()

  return (
    <Modal
      open={Boolean(modal)}
      onClose={() => {
        if (modal?.phase !== 'running') {
          onClose()
        }
      }}
      title={
        modal?.kind === 'rollback'
          ? t('appCatalog.progressRollbackTitle')
          : t('appCatalog.progressUpgradeTitle')
      }
      subtitle={modal?.app.name}
      size="sm"
      footer={
        modal?.phase === 'running' ? null : (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              {t('common.close')}
            </Button>
            {modal?.phase === 'success' && (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  const targetApp = modal.app
                  onClose()
                  onOpenApp(targetApp)
                }}
              >
                {t('appCatalog.openAppAfterUpdate')}
              </Button>
            )}
          </>
        )
      }
    >
      {modal && (
        <div className="space-y-3 text-[13px]">
          <div className="flex items-start gap-3">
            {modal.phase === 'running' ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--panel-primary)] mt-0.5" />
            ) : modal.phase === 'success' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--panel-success-text)] mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-[var(--panel-danger-text)] mt-0.5" />
            )}
            <div className="min-w-0 space-y-1">
              <p className="text-[var(--win-text)] leading-relaxed">
                {modal.phase === 'running'
                  ? t('appCatalog.progressRunning')
                  : modal.phase === 'success'
                    ? modal.kind === 'rollback'
                      ? t('appCatalog.progressRollbackDone')
                      : t('appCatalog.progressDone')
                    : modal.errorMessage || t('appCatalog.progressFailed')}
              </p>
              <p className="panel-mono text-[11px] text-[var(--text-secondary)] break-all">
                {modal.image}
              </p>
            </div>
          </div>
          {modal.phase === 'running' && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-surface-subtle)]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--panel-primary)]" />
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
