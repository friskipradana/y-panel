import { AlertTriangle, ArrowUpCircle } from 'lucide-react'
import type { CatalogApp, InstalledApp } from '@/api/appCatalog'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import {
  CUSTOM_VERSION_SENTINEL,
  type VersionSelectionState,
} from '@/components/windows/app-catalog/installFormHelpers'
import {
  formatSingleVersionTag,
  formatVersionDisplay,
  isFloatingTag,
} from '@/components/windows/app-catalog/versionHelpers'
import { useI18n } from '@/lib/i18n'

interface InstallVersionSectionProps {
  catalogApp?: CatalogApp | null
  editingApp?: InstalledApp | null
  showEditDockerVersion: boolean
  versionChangedInEdit: boolean
  versionState: VersionSelectionState
  selectedVersion: string
  onSelectedVersionChange: (value: string) => void
  customVersion: string
  onCustomVersionChange: (value: string) => void
  isUpgradePending: boolean
  isBusy: boolean
  onDirectUpgrade: () => void
}

export function InstallVersionSection({
  catalogApp,
  editingApp,
  showEditDockerVersion,
  versionChangedInEdit,
  versionState,
  selectedVersion,
  onSelectedVersionChange,
  customVersion,
  onCustomVersionChange,
  isUpgradePending,
  isBusy,
  onDirectUpgrade,
}: InstallVersionSectionProps) {
  const { t } = useI18n()
  const { imageRepo, defaultTag, versionOptions, effectiveVersion, resolvedImage, latestConcreteVersion } =
    versionState

  if (catalogApp && !editingApp) {
    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label={t('appCatalog.versionLabel')}
            hint={t('appCatalog.versionImageHint', { image: `${imageRepo}:${effectiveVersion}` })}
          >
            <Select
              value={selectedVersion || defaultTag}
              onChange={onSelectedVersionChange}
              options={versionOptions}
            />
          </Field>
          {selectedVersion === CUSTOM_VERSION_SENTINEL ? (
            <Field label={t('appCatalog.versionCustomOption')}>
              <TextInput
                mono
                value={customVersion}
                onChange={(e) => onCustomVersionChange(e.target.value)}
                placeholder={t('appCatalog.versionCustomPlaceholder')}
                required
              />
            </Field>
          ) : null}
        </div>
        {latestConcreteVersion && isFloatingTag(effectiveVersion) ? (
          <div className="panel-alert text-[12px]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} />
            <span>
              {t('appCatalog.floatingTagInstallHint', {
                tag: effectiveVersion,
                version: formatSingleVersionTag(latestConcreteVersion),
              })}
            </span>
          </div>
        ) : null}
      </div>
    )
  }

  if (!showEditDockerVersion) return null

  return (
    <div className="app-catalog-volume-list space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="panel-mono text-[11.5px] text-[var(--win-text)] truncate">
          {t('appCatalog.versionCurrentLabel', {
            image:
              editingApp?.resolvedVersion && isFloatingTag(editingApp?.versionTag)
                ? `${editingApp?.image || ''} (${formatVersionDisplay(editingApp?.versionTag, editingApp?.resolvedVersion)})`
                : editingApp?.image || '',
          })}
        </span>
        <Button
          type="button"
          size="sm"
          variant="primary-soft"
          icon={<ArrowUpCircle className="h-3.5 w-3.5" />}
          loading={isUpgradePending}
          disabled={isBusy}
          onClick={onDirectUpgrade}
        >
          {versionChangedInEdit ? t('appCatalog.upgradeApplyVersion') : t('appCatalog.upgradeButton')}
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label={t('appCatalog.versionLabel')}
          hint={t('appCatalog.versionImageHint', { image: resolvedImage })}
        >
          <Select
            value={selectedVersion || defaultTag}
            onChange={onSelectedVersionChange}
            options={versionOptions}
          />
        </Field>
        {selectedVersion === CUSTOM_VERSION_SENTINEL ? (
          <Field label={t('appCatalog.versionCustomOption')}>
            <TextInput
              mono
              value={customVersion}
              onChange={(e) => onCustomVersionChange(e.target.value)}
              placeholder={t('appCatalog.versionCustomPlaceholder')}
              required
            />
          </Field>
        ) : null}
      </div>
      {latestConcreteVersion && isFloatingTag(effectiveVersion) ? (
        <div className="panel-alert text-[12px]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} />
          <span>
            {t('appCatalog.floatingTagInstallHint', {
              tag: effectiveVersion,
              version: formatSingleVersionTag(latestConcreteVersion),
            })}
          </span>
        </div>
      ) : null}
      <p className="text-[11.5px] text-[var(--text-secondary)] m-0">
        {t('appCatalog.versionKeepDataHint')}
      </p>
    </div>
  )
}
