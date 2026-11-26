import { useMemo } from 'react'
import type { CatalogApp, InstalledApp } from '@/api/appCatalog'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import {
  CATALOG_CATEGORY_OPTIONS,
  ICON_COLOR_OPTIONS,
  ICON_KEY_OPTIONS,
  slugify,
  type IconSourceMode,
} from '@/components/windows/app-catalog/installFormHelpers'
import { useI18n } from '@/lib/i18n'

interface InstallIdentityFieldsProps {
  language: string
  catalogApp?: CatalogApp | null
  editingApp?: InstalledApp | null
  editingCatalogApp?: CatalogApp
  isCatalogApp: boolean
  isCustomCatalogMode: boolean
  name: string
  onNameChange: (value: string) => void
  isPathCustomized: boolean
  onAutoOpenPath: (path: string) => void
  tagline: string
  onTaglineChange: (value: string) => void
  catalogImage: string
  onCatalogImageChange: (value: string) => void
  catalogContainerPort: string
  onCatalogContainerPortChange: (value: string) => void
  catalogCategory: string
  onCatalogCategoryChange: (value: string) => void
  catalogDescription: string
  onCatalogDescriptionChange: (value: string) => void
  iconKey: string
  onIconKeyChange: (value: string) => void
  iconSourceMode: IconSourceMode
  onIconSourceModeChange: (mode: IconSourceMode) => void
  iconColor: string
  onIconColorChange: (value: string) => void
}

export function InstallIdentityFields({
  language,
  catalogApp,
  editingApp,
  editingCatalogApp,
  isCatalogApp,
  isCustomCatalogMode,
  name,
  onNameChange,
  isPathCustomized,
  onAutoOpenPath,
  tagline,
  onTaglineChange,
  catalogImage,
  onCatalogImageChange,
  catalogContainerPort,
  onCatalogContainerPortChange,
  catalogCategory,
  onCatalogCategoryChange,
  catalogDescription,
  onCatalogDescriptionChange,
  iconKey,
  onIconKeyChange,
  iconSourceMode,
  onIconSourceModeChange,
  iconColor,
  onIconColorChange,
}: InstallIdentityFieldsProps) {
  const { t } = useI18n()
  const iconKeySelectOptions = useMemo(() => ICON_KEY_OPTIONS.map((k) => ({ value: k, label: k })), [])
  const iconColorSelectOptions = useMemo(() => ICON_COLOR_OPTIONS.map((c) => ({ value: c, label: c })), [])

  return (
    <>
      {isCatalogApp ? (
        <div className="rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 space-y-1.5">
          <div className="text-[13px] font-semibold text-[var(--win-text)]">
            {catalogApp?.name || editingCatalogApp?.name || name}
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed m-0 whitespace-normal">
            {language === 'id'
              ? catalogApp?.descriptionId || editingCatalogApp?.descriptionId || tagline
              : catalogApp?.descriptionEn || editingCatalogApp?.descriptionEn || tagline}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('appCatalog.nameLabel')}>
            <TextInput
              value={name}
              onChange={(e) => {
                const val = e.target.value
                onNameChange(val)
                if (!isPathCustomized && !catalogApp && !editingApp) {
                  const s = slugify(val)
                  onAutoOpenPath(s ? `/app/${s}` : '/app/my-app')
                }
              }}
              placeholder={t('appCatalog.namePlaceholder')}
              required
            />
          </Field>
          <Field label={t('appCatalog.taglineLabel')}>
            <TextInput
              value={tagline}
              onChange={(e) => onTaglineChange(e.target.value)}
              placeholder={t('appCatalog.taglinePlaceholder')}
            />
          </Field>
        </div>
      )}

      {isCustomCatalogMode ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t('appCatalog.catalogImageLabel')}>
            <TextInput
              mono
              value={catalogImage}
              onChange={(e) => onCatalogImageChange(e.target.value)}
              placeholder={t('appCatalog.catalogImagePlaceholder')}
              required
            />
          </Field>
          <Field label={t('appCatalog.catalogContainerPortLabel')}>
            <TextInput
              mono
              type="number"
              min={1}
              max={65535}
              value={catalogContainerPort}
              onChange={(e) => onCatalogContainerPortChange(e.target.value)}
              required
            />
          </Field>
          <Field label={t('appCatalog.catalogCategoryLabel')}>
            <Select
              value={catalogCategory}
              onChange={onCatalogCategoryChange}
              options={CATALOG_CATEGORY_OPTIONS}
            />
          </Field>
          <div className="sm:col-span-3">
            <Field label={t('appCatalog.catalogDescriptionLabel')}>
              <TextInput
                value={catalogDescription}
                onChange={(e) => onCatalogDescriptionChange(e.target.value)}
                placeholder={t('appCatalog.taglinePlaceholder')}
              />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('appCatalog.iconLabel')}>
          {!isCatalogApp ? (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={iconSourceMode === 'preset' ? 'default' : 'ghost'}
                  onClick={() => {
                    onIconSourceModeChange('preset')
                    if (/^https?:\/\//i.test(iconKey)) onIconKeyChange('box')
                  }}
                >
                  {t('appCatalog.iconPresetOption')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={iconSourceMode === 'url' ? 'default' : 'ghost'}
                  onClick={() => {
                    onIconSourceModeChange('url')
                    if (!/^https?:\/\//i.test(iconKey)) onIconKeyChange('')
                  }}
                >
                  {t('appCatalog.iconUrlOption')}
                </Button>
              </div>
              {iconSourceMode === 'url' ? (
                <TextInput
                  mono
                  value={iconKey}
                  onChange={(e) => onIconKeyChange(e.target.value)}
                  placeholder={t('appCatalog.iconUrlPlaceholder')}
                />
              ) : (
                <Select
                  value={iconKey}
                  onChange={onIconKeyChange}
                  options={iconKeySelectOptions}
                  searchable
                />
              )}
            </div>
          ) : (
            <Select
              value={iconKey}
              onChange={onIconKeyChange}
              options={iconKeySelectOptions}
              searchable
              disabled
            />
          )}
        </Field>
        <Field label={t('appCatalog.colorLabel')}>
          <Select
            value={iconColor}
            onChange={onIconColorChange}
            options={iconColorSelectOptions}
            disabled={isCatalogApp || iconSourceMode === 'url'}
          />
        </Field>
      </div>
    </>
  )
}
