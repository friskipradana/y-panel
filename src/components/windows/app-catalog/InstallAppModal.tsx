import { Box, Globe, Layers } from 'lucide-react'
import type { CatalogApp, InstalledApp } from '@/api/appCatalog'
import { InstalledAppBadge } from '@/components/common/AppIcon'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import type { InstallMode } from '@/components/windows/app-catalog/installFormHelpers'
import { InstallIdentityFields } from '@/components/windows/app-catalog/InstallIdentityFields'
import { InstallRuntimeFields } from '@/components/windows/app-catalog/InstallRuntimeFields'
import { InstallVersionSection } from '@/components/windows/app-catalog/InstallVersionSection'
import { useInstallAppForm } from '@/components/windows/app-catalog/useInstallAppForm'
import { useI18n } from '@/lib/i18n'

interface InstallAppModalProps {
  open: boolean
  onClose: () => void
  catalogApp?: CatalogApp | null
  editingApp?: InstalledApp | null
  onSuccessApp?: (app: InstalledApp, isNew: boolean) => void
}

export function InstallAppModal({
  open,
  onClose,
  catalogApp,
  editingApp,
  onSuccessApp,
}: InstallAppModalProps) {
  const { t } = useI18n()
  const form = useInstallAppForm({ open, onClose, catalogApp, editingApp, onSuccessApp })

  const modeTabs: TabItem<InstallMode>[] = [
    { key: 'existing-container', label: t('appCatalog.modeExistingContainer'), icon: <Box className="h-3.5 w-3.5" /> },
    { key: 'custom-url', label: t('appCatalog.modeCustomUrl'), icon: <Globe className="h-3.5 w-3.5" /> },
    ...(form.isSuperadmin
      ? [{ key: 'custom-catalog' as const, label: t('appCatalog.modeCustomCatalog'), icon: <Layers className="h-3.5 w-3.5" /> }]
      : []),
  ]

  const title = editingApp
    ? t('appCatalog.editModalTitle')
    : catalogApp
      ? `${t('appCatalog.installTitlePrefix')} ${catalogApp.name}`
      : t('appCatalog.customModalTitle')

  const subtitle = editingApp
    ? editingApp.image || editingApp.targetUrl
    : catalogApp
      ? form.versionState.resolvedImage
      : undefined

  const notes = catalogApp ? (form.language === 'id' ? catalogApp.notesId : catalogApp.notesEn) || '' : ''
  const targetPortHint = catalogApp
    ? t('appCatalog.containerPortHint', { port: String(catalogApp.containerPort) })
    : form.selectedContainer && !form.selectedContainer.Ports?.some((p) => p.PublicPort)
      ? t('appCatalog.containerNoPublishedPort')
      : undefined

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={<InstalledAppBadge iconKey={form.iconKey} iconColor={form.iconColor} size="lg" />}
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={form.isBusy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="app-catalog-install-form" variant="primary" loading={form.isBusy}>
            {editingApp
              ? t('common.save')
              : form.isCustomCatalogMode
                ? t('appCatalog.catalogCreateAction')
                : t('appCatalog.installAction')}
          </Button>
        </>
      }
    >
      <form id="app-catalog-install-form" onSubmit={form.handleSubmit} className="space-y-4">
        {!editingApp && !catalogApp ? (
          <Tabs
            items={modeTabs}
            value={form.mode}
            onChange={(next) => {
              form.setMode(next)
              if (next === 'custom-url' && form.iconKey === 'box') form.setIconKey('globe')
              if (next === 'existing-container' && form.iconKey === 'globe') form.setIconKey('box')
            }}
            label={t('appCatalog.installModeLabel')}
          />
        ) : null}

        {!editingApp && !catalogApp && form.mode === 'existing-container' ? (
          <Field label={t('appCatalog.selectContainerLabel')}>
            <Select
              value={form.containerId}
              onChange={form.handlePickContainer}
              options={form.containerOptions}
              searchable
              placeholder={t('appCatalog.selectContainerPlaceholder')}
              emptyText={t('appCatalog.noContainerOption')}
            />
          </Field>
        ) : null}

        <InstallIdentityFields
          language={form.language}
          catalogApp={catalogApp}
          editingApp={editingApp}
          editingCatalogApp={form.editingCatalogApp}
          isCatalogApp={form.isCatalogApp}
          isCustomCatalogMode={form.isCustomCatalogMode}
          name={form.name}
          onNameChange={form.setName}
          isPathCustomized={form.isPathCustomized}
          onAutoOpenPath={form.setOpenPath}
          tagline={form.tagline}
          onTaglineChange={form.setTagline}
          catalogImage={form.catalogImage}
          onCatalogImageChange={form.setCatalogImage}
          catalogContainerPort={form.catalogContainerPort}
          onCatalogContainerPortChange={form.setCatalogContainerPort}
          catalogCategory={form.catalogCategory}
          onCatalogCategoryChange={form.setCatalogCategory}
          catalogDescription={form.catalogDescription}
          onCatalogDescriptionChange={form.setCatalogDescription}
          iconKey={form.iconKey}
          onIconKeyChange={form.setIconKey}
          iconSourceMode={form.iconSourceMode}
          onIconSourceModeChange={form.setIconSourceMode}
          iconColor={form.iconColor}
          onIconColorChange={form.setIconColor}
        />

        <InstallVersionSection
          catalogApp={catalogApp}
          editingApp={editingApp}
          showEditDockerVersion={form.showEditDockerVersion}
          versionChangedInEdit={form.versionChangedInEdit}
          versionState={form.versionState}
          selectedVersion={form.selectedVersion}
          onSelectedVersionChange={form.setSelectedVersion}
          customVersion={form.customVersion}
          onCustomVersionChange={form.setCustomVersion}
          isUpgradePending={form.isUpgradePending}
          isBusy={form.isBusy}
          onDirectUpgrade={form.handleDirectUpgrade}
        />

        <InstallRuntimeFields
          language={form.language}
          catalogApp={catalogApp}
          editingApp={editingApp}
          isSuperadmin={form.isSuperadmin}
          isCustomUrlMode={form.isCustomUrlMode}
          showPortControls={form.showPortControls}
          targetUrl={form.targetUrl}
          onTargetUrlChange={form.setTargetUrl}
          hostPort={form.hostPort}
          onHostPortChange={form.setHostPort}
          targetPortHint={targetPortHint}
          openPath={form.openPath}
          onOpenPathChange={(value) => {
            form.setOpenPath(value)
            form.setIsPathCustomized(true)
          }}
          visibleEnvSpecs={form.visibleEnvSpecs}
          envValues={form.envValues}
          onEnvValuesChange={form.setEnvValues}
          customEnvs={form.customEnvs}
          onCustomEnvsChange={form.setCustomEnvs}
          useProxy={form.useProxy}
          onUseProxyChange={form.setUseProxy}
          notes={notes}
        />
      </form>
    </Modal>
  )
}
