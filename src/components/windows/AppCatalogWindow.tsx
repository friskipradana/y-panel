import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CatalogApp, InstalledApp } from '@/api/appCatalog'
import { AppCatalogTopbar, type CatalogTab } from '@/components/windows/app-catalog/AppCatalogTopbar'
import { AppProgressModal, UninstallAppModal } from '@/components/windows/app-catalog/AppLifecycleModals'
import { CatalogAppsView, type CatalogViewMode } from '@/components/windows/app-catalog/CatalogAppsView'
import { InstallAppModal } from '@/components/windows/app-catalog/InstallAppModal'
import { InstalledAppsView } from '@/components/windows/app-catalog/InstalledAppsView'
import { UpgradeAppModal } from '@/components/windows/app-catalog/UpgradeAppModal'
import { useAppCatalogActions } from '@/components/windows/app-catalog/useAppCatalogActions'
import {
  forceRefreshAppCatalog,
  openInstalledAppWindow,
  useAppCatalog,
  useInstalledAppUpdates,
} from '@/hooks/useAppCatalog'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'
import { useWindowStore } from '@/store/windowStore'

const VIEW_MODE_KEY = 'reneo.appCatalog.viewMode'

function readStoredViewMode(): CatalogViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

export function AppCatalogWindow() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const isMobile = useIsMobileLayout()
  const pollingActive = useWindowPollingActive()
  const isSuperadmin = useAuthStore((s) => s.user?.role === 'superadmin')
  const { data, isLoading, isError, isFetching } = useAppCatalog(true, pollingActive ? 30_000 : false)

  const [tab, setTab] = useState<CatalogTab>('catalog')
  const {
    data: updatesById,
    isFetching: isCheckingUpdates,
  } = useInstalledAppUpdates(tab === 'installed')
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<CatalogViewMode>(readStoredViewMode)
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')

  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [selectedCatalogApp, setSelectedCatalogApp] = useState<CatalogApp | null>(null)
  const [editingApp, setEditingApp] = useState<InstalledApp | null>(null)

  const catalog = useMemo(() => data?.catalog ?? [], [data?.catalog])
  const installed = useMemo(() => data?.installed ?? [], [data?.installed])

  const {
    busyAction,
    uninstallTarget,
    removeVolumes,
    setRemoveVolumes,
    closeUninstallModal,
    isUninstallPending,
    upgradeTarget,
    closeUpgradeModal,
    isUpgradePending,
    progressModal,
    closeProgressModal,
    handleContainerAction,
    handleUpgradeApp,
    handleTargetVersionChange,
    handleConfirmUpgrade,
    handleRollbackApp,
    openUninstallConfirm,
    handleConfirmUninstall,
  } = useAppCatalogActions({ catalog, updatesById })

  const updateViewMode = (mode: CatalogViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      // Abaikan jika penyimpanan lokal dibatasi
    }
  }

  const installedByCatalogId = useMemo(() => {
    const map = new Map<string, InstalledApp>()
    for (const item of installed) {
      if (item.catalogId && !map.has(item.catalogId)) {
        map.set(item.catalogId, item)
      }
    }
    return map
  }, [installed])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of catalog) {
      counts.set(item.category, (counts.get(item.category) || 0) + 1)
    }
    return [
      { key: 'all', label: t('appCatalog.categoryAll'), count: catalog.length },
      ...Array.from(counts.entries()).map(([key, count]) => ({
        key,
        label: t(`appCatalog.cat.${key}`),
        count,
      })),
    ]
  }, [catalog, t])

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase()
    return catalog.filter((item) => {
      if (category !== 'all' && item.category !== category) return false
      if (!q) return true
      const hay = `${item.name} ${item.taglineId} ${item.taglineEn} ${item.image} ${item.category}`.toLowerCase()
      return hay.includes(q)
    })
  }, [catalog, category, search])

  const filteredInstalled = useMemo(() => {
    const q = search.trim().toLowerCase()
    return installed.filter((item) => {
      if (!q) return true
      const hay = `${item.name} ${item.tagline} ${item.containerName} ${item.image} ${item.targetUrl}`.toLowerCase()
      return hay.includes(q)
    })
  }, [installed, search])

  const handleOpenInstallCatalog = (app: CatalogApp) => {
    setEditingApp(null)
    setSelectedCatalogApp(app)
    setInstallModalOpen(true)
  }

  const handleOpenAddCustom = () => {
    setEditingApp(null)
    setSelectedCatalogApp(null)
    setInstallModalOpen(true)
  }

  const handleOpenEdit = (app: InstalledApp) => {
    setSelectedCatalogApp(null)
    setEditingApp(app)
    setInstallModalOpen(true)
  }

  const isRefreshing = isManualRefreshing || (isFetching && !isLoading) || isCheckingUpdates

  const handleRefresh = () => {
    if (isRefreshing) return
    setIsManualRefreshing(true)
    void forceRefreshAppCatalog(qc, tab === 'installed').finally(() => {
      setIsManualRefreshing(false)
    })
  }

  return (
    <div className="panel-window docker-window-root flex flex-col h-full min-h-0 overflow-hidden">
      <AppCatalogTopbar
        isMobile={isMobile}
        tab={tab}
        onTabChange={setTab}
        catalogCount={catalog.length}
        installedCount={installed.length}
        viewMode={viewMode}
        onViewModeChange={updateViewMode}
        category={category}
        categories={categories}
        onCategoryChange={setCategory}
        search={search}
        onSearchChange={setSearch}
        isSuperadmin={isSuperadmin}
        onOpenAddCustom={handleOpenAddCustom}
        onOpenLicenses={() => useWindowStore.getState().openWindow('app-licenses')}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      {tab === 'catalog' ? (
        <CatalogAppsView
          items={filteredCatalog}
          installedByCatalogId={installedByCatalogId}
          viewMode={viewMode}
          isLoading={isLoading}
          isError={isError}
          categories={categories}
          selectedCategory={category}
          onSelectCategory={setCategory}
          onInstallCatalog={handleOpenInstallCatalog}
        />
      ) : (
        <InstalledAppsView
          items={filteredInstalled}
          viewMode={viewMode}
          isLoading={isLoading}
          isError={isError}
          busyAction={busyAction}
          updatesById={updatesById}
          onContainerAction={handleContainerAction}
          onUpgrade={handleUpgradeApp}
          onRollback={handleRollbackApp}
          onEdit={handleOpenEdit}
          onUninstall={openUninstallConfirm}
        />
      )}

      <InstallAppModal
        open={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
        catalogApp={selectedCatalogApp}
        editingApp={editingApp}
        onSuccessApp={(app, isNew) => {
          if (isNew) {
            setTab('installed')
            openInstalledAppWindow(app)
          }
        }}
      />

      <UninstallAppModal
        target={uninstallTarget}
        removeVolumes={removeVolumes}
        isPending={isUninstallPending}
        onRemoveVolumesChange={setRemoveVolumes}
        onClose={closeUninstallModal}
        onConfirm={handleConfirmUninstall}
      />

      <AppProgressModal
        modal={progressModal}
        onClose={closeProgressModal}
        onOpenApp={openInstalledAppWindow}
      />

      <UpgradeAppModal
        target={upgradeTarget}
        isPending={isUpgradePending}
        onClose={closeUpgradeModal}
        onTargetVersionChange={handleTargetVersionChange}
        onConfirm={handleConfirmUpgrade}
      />
    </div>
  )
}
