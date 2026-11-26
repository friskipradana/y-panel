import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { AppUpdateStatus, CatalogApp, InstalledApp } from '@/api/appCatalog'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import {
  extractTagFromImageRef,
  formatSingleVersionTag,
  formatVersionDisplay,
  isFloatingTag,
  orderCatalogVersionChoices,
} from '@/components/windows/app-catalog/versionHelpers'
import { useI18n } from '@/lib/i18n'

export interface UpgradeTargetModalState {
  app: InstalledApp
  currentVersion: string
  resolvedVersion: string
  isFloating: boolean
  latestVersion: string
  targetVersion: string
  availableVersions: string[]
  localDigest?: string
  remoteDigest?: string
}

export function buildUpgradeTargetState(
  app: InstalledApp,
  catalog: CatalogApp[],
  updateStatus?: AppUpdateStatus,
): UpgradeTargetModalState {
  const currentVersion =
    updateStatus?.currentVersion || app.versionTag || extractTagFromImageRef(app.image) || 'latest'
  const resolvedVersion = updateStatus?.resolvedVersion || app.resolvedVersion || ''
  const isFloating = updateStatus?.isFloatingTag ?? app.isFloatingTag ?? isFloatingTag(currentVersion)

  const spec = catalog.find((c) => c.id === app.catalogId)
  const versionsFromSpec = spec?.versions ?? []
  const versionsFromUpdate = updateStatus?.availableVersions ?? []
  const { ordered, latestConcrete } = orderCatalogVersionChoices(
    [...versionsFromUpdate, ...versionsFromSpec, ...(updateStatus?.latestVersion ? [updateStatus.latestVersion] : [])],
    currentVersion,
  )
  const latestVersion = updateStatus?.latestVersion || latestConcrete
  const defaultTarget =
    latestVersion ||
    ordered.find((v) => !isFloatingTag(v) && v !== currentVersion) ||
    ordered[0] ||
    'latest'

  return {
    app,
    currentVersion,
    resolvedVersion,
    isFloating,
    latestVersion,
    targetVersion: defaultTarget,
    availableVersions: ordered.length > 0 ? ordered : [defaultTarget],
    localDigest: updateStatus?.localDigest || app.currentDigest,
    remoteDigest: updateStatus?.remoteDigest,
  }
}

interface UpgradeAppModalProps {
  target: UpgradeTargetModalState | null
  isPending: boolean
  onClose: () => void
  onTargetVersionChange: (version: string) => void
  onConfirm: () => void
}

export function UpgradeAppModal({
  target,
  isPending,
  onClose,
  onTargetVersionChange,
  onConfirm,
}: UpgradeAppModalProps) {
  const { t } = useI18n()

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={t('appCatalog.upgradeModalTitle')}
      subtitle={target?.app.name}
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
            variant="primary"
            loading={isPending}
            onClick={onConfirm}
          >
            {t('appCatalog.upgradeSubmitBtn')}
          </Button>
        </>
      }
    >
      {target && (
        <div className="space-y-4 text-[13px]">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-[var(--panel-surface-subtle)] border border-[var(--win-border)]">
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                {t('appCatalog.currentVersionLabel')}
              </span>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)]">
                  {formatVersionDisplay(target.currentVersion, target.resolvedVersion)}
                </span>
                {target.isFloating ? (
                  <Badge tone="warning" size="sm">
                    {t('appCatalog.floatingTagBadge')}
                  </Badge>
                ) : null}
              </div>
              {target.localDigest ? (
                <span className="panel-mono text-[11px] text-[var(--text-secondary)] block mt-1 truncate">
                  {target.localDigest}
                </span>
              ) : null}
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                {t('appCatalog.targetVersionLabel')}
              </span>
              <span className="panel-mono text-[13px] font-semibold text-[var(--panel-primary)] block truncate">
                {formatSingleVersionTag(target.targetVersion)}
              </span>
              {target.remoteDigest &&
              target.targetVersion === target.latestVersion ? (
                <span className="panel-mono text-[11px] text-[var(--text-secondary)] block mt-1 truncate">
                  {target.remoteDigest}
                </span>
              ) : null}
            </div>
          </div>

          {target.isFloating ? (
            <div className="panel-alert text-[12px]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} />
              <span>
                {target.resolvedVersion
                  ? t('appCatalog.upgradeFloatingResolvedNotice', {
                      tag: target.currentVersion,
                      resolved: formatSingleVersionTag(target.resolvedVersion),
                      target: formatSingleVersionTag(
                        target.latestVersion || target.targetVersion,
                      ),
                    })
                  : t('appCatalog.upgradeFloatingUnverifiedNotice', {
                      tag: target.currentVersion,
                      target: formatSingleVersionTag(
                        target.latestVersion || target.targetVersion,
                      ),
                    })}
              </span>
            </div>
          ) : null}

          <Field label={t('appCatalog.targetVersionLabel')}>
            <Select
              value={target.targetVersion}
              onChange={onTargetVersionChange}
              options={target.availableVersions.map((v) => {
                if (isFloatingTag(v)) {
                  return {
                    value: v,
                    label: `${v} ${t('appCatalog.versionRollingSuffix')}`,
                  }
                }
                if (target.latestVersion && v === target.latestVersion) {
                  return {
                    value: v,
                    label: `${formatSingleVersionTag(v)} ${t('appCatalog.versionRecommendedSuffix')}`,
                  }
                }
                return {
                  value: v,
                  label: formatSingleVersionTag(v),
                }
              })}
            />
          </Field>

          <div className="p-2.5 rounded text-[12px] text-[var(--text-secondary)] bg-[var(--panel-surface-subtle)] border border-[var(--win-border)] flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--panel-success-text)] shrink-0 mt-0.5" />
            <span>{t('appCatalog.upgradeDataSafeNotice')}</span>
          </div>
        </div>
      )}
    </Modal>
  )
}
