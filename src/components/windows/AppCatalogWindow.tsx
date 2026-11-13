import { useMemo, useState } from 'react'
import { LayoutGrid, List as ListIcon, Plus, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { CatalogApp, InstalledApp } from '@/api/appCatalog'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { Modal } from '@/components/ui/Modal'
import { CatalogAppsView, type CatalogViewMode } from '@/components/windows/app-catalog/CatalogAppsView'
import { InstallAppModal } from '@/components/windows/app-catalog/InstallAppModal'
import {
  InstalledAppsView,
  type BusyCatalogAction,
} from '@/components/windows/app-catalog/InstalledAppsView'
import { openInstalledAppWindow, useAppCatalog, useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

type CatalogTab = 'catalog' | 'installed'

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
  const isMobile = useIsMobileLayout()
  const { data, isLoading, isError, refetch, isFetching } = useAppCatalog()
  const { actionMutation, upgradeMutation, uninstallMutation } = useAppCatalogMutations()

  const [tab, setTab] = useState<CatalogTab>('catalog')
  const [viewMode, setViewMode] = useState<CatalogViewMode>(readStoredViewMode)
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [busyAction, setBusyAction] = useState<BusyCatalogAction | null>(null)

  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [selectedCatalogApp, setSelectedCatalogApp] = useState<CatalogApp | null>(null)
  const [editingApp, setEditingApp] = useState<InstalledApp | null>(null)

  const [uninstallTarget, setUninstallTarget] = useState<InstalledApp | null>(null)
  const [removeContainer, setRemoveContainer] = useState(false)
  const [removeVolumes, setRemoveVolumes] = useState(false)

  const catalog = useMemo(() => data?.catalog ?? [], [data?.catalog])
  const installed = useMemo(() => data?.installed ?? [], [data?.installed])

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

  const handleContainerAction = async (app: InstalledApp, action: 'start' | 'stop' | 'restart') => {
    setBusyAction({ id: app.id, action })
    try {
      await actionMutation.mutateAsync({ id: app.id, action })
      toast.success(t('appCatalog.containerActionSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    } finally {
      setBusyAction(null)
    }
  }

  const handleUpgradeApp = async (app: InstalledApp) => {
    const ok = await alertLib.confirm(
      t('appCatalog.upgradeConfirmTitle'),
      t('appCatalog.upgradeConfirmBody', { image: app.image }),
      t('appCatalog.upgradeButton'),
      t('common.cancel'),
      'question',
      'app-catalog',
    )
    if (!ok) return
    setBusyAction({ id: app.id, action: 'upgrade' })
    try {
      const updated = await upgradeMutation.mutateAsync({ id: app.id })
      toast.success(t('appCatalog.upgradeSuccess', { image: updated.image }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    } finally {
      setBusyAction(null)
    }
  }

  const openUninstallConfirm = async (app: InstalledApp) => {
    if (app.kind === 'custom-url') {
      const ok = await alertLib.confirm(
        t('appCatalog.uninstallModalTitle'),
        `${app.name} — ${t('appCatalog.uninstallConfirmBody')}`,
        t('appCatalog.uninstallAction'),
        t('common.cancel'),
        'warning',
        'app-catalog',
      )
      if (!ok) return
      setBusyAction({ id: app.id, action: 'uninstall' })
      try {
        await uninstallMutation.mutateAsync({ id: app.id })
        toast.success(t('appCatalog.uninstallSuccess'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
      } finally {
        setBusyAction(null)
      }
      return
    }
    setUninstallTarget(app)
    setRemoveContainer(app.kind === 'docker')
    setRemoveVolumes(false)
  }

  const handleConfirmUninstall = async () => {
    if (!uninstallTarget) return
    const id = uninstallTarget.id
    setBusyAction({ id, action: 'uninstall' })
    try {
      await uninstallMutation.mutateAsync({
        id,
        removeContainer,
        removeVolumes: removeContainer && removeVolumes,
      })
      toast.success(t('appCatalog.uninstallSuccess'))
      setUninstallTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    } finally {
      setBusyAction(null)
    }
  }

  const viewFilter = (
    <FilterMenu
      label={t('appCatalog.viewFilterLabel')}
      value={tab}
      onChange={(v) => setTab(v as CatalogTab)}
      items={[
        { key: 'catalog', label: t('appCatalog.tabCatalog'), count: catalog.length },
        { key: 'installed', label: t('appCatalog.tabInstalled'), count: installed.length },
      ]}
    />
  )

  const categoryFilter = tab === 'catalog' ? (
    <FilterMenu
      label={t('appCatalog.categoryFilterLabel')}
      value={category}
      onChange={setCategory}
      items={categories}
    />
  ) : null

  const addButton = (
    <button type="button" onClick={handleOpenAddCustom} className="docker-primary-btn">
      <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
      <span>{t('appCatalog.addCustomButton')}</span>
    </button>
  )

  const viewModeSwitch = (mobile = false) => (
    <div
      className={`app-catalog-view-toggle ${mobile ? 'app-catalog-view-toggle--mobile' : ''}`}
      role="group"
      aria-label={t('appCatalog.viewFilterLabel')}
    >
      <button
        type="button"
        onClick={() => updateViewMode('list')}
        className={`app-catalog-view-toggle__btn ${viewMode === 'list' ? 'app-catalog-view-toggle__btn--active' : ''}`}
        title={t('appCatalog.viewList')}
        aria-label={t('appCatalog.viewList')}
        aria-pressed={viewMode === 'list'}
      >
        <ListIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={() => updateViewMode('grid')}
        className={`app-catalog-view-toggle__btn ${viewMode === 'grid' ? 'app-catalog-view-toggle__btn--active' : ''}`}
        title={t('appCatalog.viewCard')}
        aria-label={t('appCatalog.viewCard')}
        aria-pressed={viewMode === 'grid'}
      >
        <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  )

  const refreshButton = (cls = 'docker-icon-btn') => (
    <button
      type="button"
      className={cls}
      title={t('common.refresh')}
      aria-label={t('common.refresh')}
      onClick={() => refetch()}
      disabled={isFetching && !isLoading}
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${isFetching && !isLoading ? 'animate-spin' : ''}`}
        strokeWidth={1.75}
      />
    </button>
  )

  return (
    <div className="panel-window docker-window-root flex flex-col h-full min-h-0 overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">
            {viewFilter}
            {addButton}
            {categoryFilter}
          </div>
          <div className="docker-topbar__mobile-search">
            <div className="docker-search-wrap docker-search-wrap--mobile">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="text"
                className="docker-search-input docker-search-input--mobile"
                aria-label={t('appCatalog.searchPlaceholder')}
                placeholder={t('appCatalog.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {viewModeSwitch(true)}
            {refreshButton('docker-icon-btn docker-icon-btn--mobile')}
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            {viewFilter}
            {categoryFilter}
            {addButton}
          </div>
          <div className="docker-topbar__right">
            <div className="docker-search-wrap">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="text"
                className="docker-search-input"
                aria-label={t('appCatalog.searchPlaceholder')}
                placeholder={t('appCatalog.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {viewModeSwitch()}
            {refreshButton()}
          </div>
        </div>
      )}

      {tab === 'catalog' ? (
        <CatalogAppsView
          items={filteredCatalog}
          installedByCatalogId={installedByCatalogId}
          viewMode={viewMode}
          isLoading={isLoading}
          isError={isError}
          onInstallCatalog={handleOpenInstallCatalog}
        />
      ) : (
        <InstalledAppsView
          items={filteredInstalled}
          viewMode={viewMode}
          isLoading={isLoading}
          isError={isError}
          busyAction={busyAction}
          onContainerAction={handleContainerAction}
          onUpgrade={handleUpgradeApp}
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

      <Modal
        open={Boolean(uninstallTarget)}
        onClose={() => setUninstallTarget(null)}
        title={t('appCatalog.uninstallModalTitle')}
        subtitle={uninstallTarget?.name}
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setUninstallTarget(null)}
              disabled={uninstallMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={uninstallMutation.isPending}
              onClick={handleConfirmUninstall}
            >
              {t('appCatalog.uninstallAction')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px]">
          <p className="text-[var(--text-secondary)]">{t('appCatalog.uninstallConfirmBody')}</p>
          {uninstallTarget && uninstallTarget.kind !== 'custom-url' ? (
            <div className="space-y-2 pt-1">
              <Checkbox
                checked={removeContainer}
                onChange={setRemoveContainer}
                tone="warning"
                label={t('appCatalog.removeContainerLabel')}
                description={uninstallTarget.containerName}
              />
              {removeContainer ? (
                <Checkbox
                  checked={removeVolumes}
                  onChange={setRemoveVolumes}
                  tone="warning"
                  label={t('appCatalog.removeVolumesLabel')}
                  description={t('appCatalog.removeVolumesDesc')}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
