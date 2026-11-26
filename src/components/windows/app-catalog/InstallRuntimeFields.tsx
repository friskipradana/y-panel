import type { Dispatch, SetStateAction } from 'react'
import { HardDrive, Layers, Plus, Trash2 } from 'lucide-react'
import type { CatalogApp, CatalogEnvSpec, InstalledApp } from '@/api/appCatalog'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { PasswordInput } from '@/components/ui/PasswordInput'
import type { CustomEnvEntry } from '@/components/windows/app-catalog/installFormHelpers'
import { useI18n } from '@/lib/i18n'

interface InstallRuntimeFieldsProps {
  language: string
  catalogApp?: CatalogApp | null
  editingApp?: InstalledApp | null
  isSuperadmin: boolean
  isCustomUrlMode: boolean
  showPortControls: boolean
  targetUrl: string
  onTargetUrlChange: (value: string) => void
  hostPort: string
  onHostPortChange: (value: string) => void
  targetPortHint?: string
  openPath: string
  onOpenPathChange: (value: string) => void
  visibleEnvSpecs: CatalogEnvSpec[]
  envValues: Record<string, string>
  onEnvValuesChange: Dispatch<SetStateAction<Record<string, string>>>
  customEnvs: CustomEnvEntry[]
  onCustomEnvsChange: Dispatch<SetStateAction<CustomEnvEntry[]>>
  useProxy: boolean
  onUseProxyChange: (checked: boolean) => void
  notes: string
}

export function InstallRuntimeFields({
  language,
  catalogApp,
  editingApp,
  isSuperadmin,
  isCustomUrlMode,
  showPortControls,
  targetUrl,
  onTargetUrlChange,
  hostPort,
  onHostPortChange,
  targetPortHint,
  openPath,
  onOpenPathChange,
  visibleEnvSpecs,
  envValues,
  onEnvValuesChange,
  customEnvs,
  onCustomEnvsChange,
  useProxy,
  onUseProxyChange,
  notes,
}: InstallRuntimeFieldsProps) {
  const { t } = useI18n()

  return (
    <>
      {isCustomUrlMode ? (
        <Field label={t('appCatalog.targetUrlLabel')}>
          <TextInput
            mono
            value={targetUrl}
            onChange={(e) => onTargetUrlChange(e.target.value)}
            placeholder={t('appCatalog.targetUrlPlaceholder')}
            required
          />
        </Field>
      ) : showPortControls ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('appCatalog.portLabel')} hint={targetPortHint}>
            <TextInput
              mono
              type="number"
              min={1}
              max={65535}
              value={hostPort}
              onChange={(e) => onHostPortChange(e.target.value)}
              placeholder="18001"
              disabled={Boolean(editingApp)}
            />
          </Field>
          <Field label={t('appCatalog.openPathLabel')} hint={t('appCatalog.openPathHint')}>
            <TextInput
              mono
              value={openPath}
              onChange={(e) => onOpenPathChange(e.target.value)}
              placeholder="/app/my-app"
            />
          </Field>
        </div>
      ) : null}

      {catalogApp && (catalogApp.volumes?.length || 0) > 0 && !editingApp ? (
        <div className="space-y-1.5">
          <div className="app-catalog-section-title">
            <HardDrive className="h-3.5 w-3.5" />
            <span>{t('appCatalog.volumesSectionTitle')}</span>
          </div>
          <div className="app-catalog-volume-list">
            {catalogApp.volumes.map((v) => (
              <div key={v.containerPath} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-[var(--text-secondary)] truncate">{v.label}</span>
                <span className="panel-mono text-[11px] text-[var(--win-text)] shrink-0">
                  ~/docker/.../{v.hostSubdir} → {v.containerPath}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {catalogApp && !editingApp ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="app-catalog-section-title mb-0">
              <Layers className="h-3.5 w-3.5" />
              <span>{t('appCatalog.envSectionTitle')}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => onCustomEnvsChange((prev) => [...prev, { key: '', value: '' }])}
            >
              {t('appCatalog.addEnvButton')}
            </Button>
          </div>

          {visibleEnvSpecs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleEnvSpecs.map((spec) => (
                <Field key={spec.key} label={language === 'id' ? spec.labelId : spec.labelEn}>
                  {spec.secret ? (
                    <PasswordInput
                      mono
                      value={envValues[spec.key] ?? ''}
                      onChange={(e) => onEnvValuesChange((p) => ({ ...p, [spec.key]: e.target.value }))}
                      placeholder={spec.placeholder || spec.defaultValue}
                      required={spec.required}
                    />
                  ) : (
                    <TextInput
                      mono
                      value={envValues[spec.key] ?? ''}
                      onChange={(e) => onEnvValuesChange((p) => ({ ...p, [spec.key]: e.target.value }))}
                      placeholder={spec.placeholder || spec.defaultValue}
                      required={spec.required}
                    />
                  )}
                </Field>
              ))}
            </div>
          ) : null}

          {customEnvs.map((entry, idx) => (
            <div key={idx} className="docker-env-row">
              <TextInput
                mono
                value={entry.key}
                onChange={(e) =>
                  onCustomEnvsChange((prev) =>
                    prev.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item)),
                  )
                }
                placeholder={t('appCatalog.envKeyPlaceholder')}
                aria-label={t('appCatalog.envKeyPlaceholder')}
              />
              <TextInput
                mono
                value={entry.value}
                onChange={(e) =>
                  onCustomEnvsChange((prev) =>
                    prev.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item)),
                  )
                }
                placeholder={t('appCatalog.envValuePlaceholder')}
                aria-label={t('appCatalog.envValuePlaceholder')}
              />
              <IconButton
                label={t('common.delete')}
                tone="danger"
                onClick={() => onCustomEnvsChange((prev) => prev.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          ))}
        </div>
      ) : null}

      {(isCustomUrlMode || catalogApp) && !editingApp ? (
        <Checkbox
          checked={useProxy}
          onChange={onUseProxyChange}
          label={t('appCatalog.useProxyLabel')}
          description={
            isCustomUrlMode
              ? isSuperadmin
                ? t('appCatalog.useProxyDescSuperadmin')
                : t('appCatalog.useProxyDescUser')
              : t('appCatalog.useProxyDescCatalog')
          }
        />
      ) : editingApp?.kind === 'custom-url' ? (
        <Checkbox
          checked={useProxy}
          onChange={onUseProxyChange}
          label={t('appCatalog.useProxyLabel')}
          description={
            isSuperadmin ? t('appCatalog.useProxyDescSuperadmin') : t('appCatalog.useProxyDescUser')
          }
        />
      ) : null}

      {notes ? (
        <p className="text-[12px] text-[var(--panel-info-text)] bg-[var(--panel-info-bg)] px-3 py-2 rounded-md">
          {notes}
        </p>
      ) : null}
    </>
  )
}
