import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { AppUpdateStatus, CatalogApp, InstalledApp } from '@/api/appCatalog'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { ViewModeToggle } from '@/components/ui/ViewModeToggle'
import { CatalogAppsView, type CatalogViewMode } from '@/components/windows/app-catalog/CatalogAppsView'
import { InstallAppModal } from '@/components/windows/app-catalog/InstallAppModal'
import {
  InstalledAppsView,
  type BusyCatalogAction,
} from '@/components/windows/app-catalog/InstalledAppsView'
import {
  extractTagFromImageRef,
  formatSingleVersionTag,
  formatVersionDisplay,
  isFloatingTag,
  orderCatalogVersionChoices,
} from '@/components/windows/app-catalog/versionHelpers'
import {
  forceRefreshAppCatalog,
  forceRefreshAppUpdates,
  openInstalledAppWindow,
  useAppCatalog,
  useAppCatalogMutations,
  useInstalledAppUpdates,
} from '@/hooks/useAppCatalog'
import { useAuthStore } from '@/store/authStore'
import { useWindowStore } from '@/store/windowStore'
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

interface UpgradeTargetModalState {
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

export function AppCatalogWindow() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const isMobile = useIsMobileLayout()
  const isSuperadmin = useAuthStore((s) => s.user?.role === 'superadmin')
  const { data, isLoading, isError, isFetching } = useAppCatalog()
  const { actionMutation, upgradeMutation, rollbackMutation, uninstallMutation } = useAppCatalogMutations()

  const [tab, setTab] = useState<CatalogTab>('catalog')
  const {
    data: updatesById,
    isFetching: isCheckingUpdates,
  } = useInstalledAppUpdates(tab === 'installed')
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const upgradeTargetEditedRef = useRef(false)
  const [viewMode, setViewMode] = useState<CatalogViewMode>(readStoredViewMode)
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [busyAction, setBusyAction] = useState<BusyCatalogAction | null>(null)

  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [selectedCatalogApp, setSelectedCatalogApp] = useState<CatalogApp | null>(null)
  const [editingApp, setEditingApp] = useState<InstalledApp | null>(null)

  const [uninstallTarget, setUninstallTarget] = useState<InstalledApp | null>(null)
  const [removeVolumes, setRemoveVolumes] = useState(false)
  const [upgradeTarget, setUpgradeTarget] = useState<UpgradeTargetModalState | null>(null)
  const [progressModal, setProgressModal] = useState<{
    kind: 'upgrade' | 'rollback'
    phase: 'running' | 'success' | 'error'
    app: InstalledApp
    image: string
    errorMessage?: string
  } | null>(null)

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

  const buildUpgradeState = (
    app: InstalledApp,
    updateStatus?: AppUpdateStatus,
  ): UpgradeTargetModalState => {
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

  const handleUpgradeApp = (app: InstalledApp) => {
    upgradeTargetEditedRef.current = false
    const initialState = buildUpgradeState(app, updatesById?.[app.id])
    setUpgradeTarget(initialState)
    void forceRefreshAppUpdates(qc)
      .then((freshMap) => {
        const fresh = freshMap?.[app.id]
        if (!fresh) return
        setUpgradeTarget((prev) => {
          if (!prev || prev.app.id !== app.id) return prev
          const updated = buildUpgradeState(app, fresh)
          return {
            ...updated,
            targetVersion: upgradeTargetEditedRef.current ? prev.targetVersion : updated.targetVersion,
          }
        })
      })
      .catch(() => {
        // Pertahankan data modal yang sudah tersedia bila refresh latar gagal
      })
  }

  const handleConfirmUpgrade = async () => {
    if (!upgradeTarget) return
    const { app, targetVersion } = upgradeTarget
    setUpgradeTarget(null)
    setBusyAction({ id: app.id, action: 'upgrade' })
    const targetDesc = `${app.name} (${targetVersion})`
    setProgressModal({ kind: 'upgrade', phase: 'running', app, image: targetDesc })
    try {
      const updated = await upgradeMutation.mutateAsync({ id: app.id, version: targetVersion })
      setProgressModal({ kind: 'upgrade', phase: 'success', app: updated, image: updated.image })
      toast.success(t('appCatalog.upgradeSuccess', { image: updated.image }))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('appCatalog.actionFailed')
      setProgressModal({ kind: 'upgrade', phase: 'error', app, image: app.image, errorMessage: message })
      toast.error(message)
    } finally {
      setBusyAction(null)
    }
  }

  const handleRollbackApp = async (app: InstalledApp) => {
    const target = app.previousImage || app.previousDigest || app.image
    const ok = await alertLib.confirm(
      t('appCatalog.rollbackConfirmTitle'),
      t('appCatalog.rollbackConfirmBody', { name: app.name, target }),
      t('appCatalog.rollbackAction'),
      t('common.cancel'),
      'question',
      'app-catalog',
    )
    if (!ok) return
    setBusyAction({ id: app.id, action: 'rollback' })
    setProgressModal({ kind: 'rollback', phase: 'running', app, image: target })
    try {
      const updated = await rollbackMutation.mutateAsync(app.id)
      setProgressModal({ kind: 'rollback', phase: 'success', app: updated, image: updated.image })
      toast.success(t('appCatalog.rollbackSuccess', { image: updated.image }))
    } catch (err) {
      const message = err instanceof Error ? err.message : t('appCatalog.actionFailed')
      setProgressModal({ kind: 'rollback', phase: 'error', app, image: target, errorMessage: message })
      toast.error(message)
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
    setRemoveVolumes(false)
  }

  const handleConfirmUninstall = async () => {
    if (!uninstallTarget) return
    const id = uninstallTarget.id
    const targetImg = uninstallTarget.image
    const removeContainer = uninstallTarget.kind !== 'custom-url'
    setBusyAction({ id, action: 'uninstall' })
    try {
      const res = await uninstallMutation.mutateAsync({
        id,
        removeContainer,
        removeVolumes,
        removeImage: Boolean(targetImg),
      })
      if (res?.imageInUse) {
        toast.warning(
          t('appCatalog.uninstallImageInUseNotice', {
            image: res.targetImage || targetImg || '',
          }),
        )
      } else if (res?.imageDeleted) {
        toast.success(
          t('appCatalog.uninstallSuccessWithImage', {
            image: res.targetImage || targetImg || '',
          }),
        )
      } else {
        toast.success(t('appCatalog.uninstallSuccess'))
      }
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

  const categoryFilter = tab === 'catalog' && viewMode === 'list' ? (
    <FilterMenu
      label={t('appCatalog.categoryFilterLabel')}
      value={category}
      onChange={setCategory}
      items={categories}
    />
  ) : null

  const addButton = isSuperadmin ? (
    <button type="button" onClick={handleOpenAddCustom} className="docker-primary-btn">
      <span>{t('appCatalog.addCustomButton')}</span>
    </button>
  ) : null

  const licenseButton = isSuperadmin ? (
    <button
      type="button"
      onClick={() => useWindowStore.getState().openWindow('app-licenses')}
      className="docker-secondary-btn"
      title={t('appCatalog.manageLicenses') || 'Lisensi'}
    >
      <span>{t('appCatalog.manageLicenses') || 'Lisensi'}</span>
    </button>
  ) : null

  const viewModeSwitch = (mobile = false) => (
    <ViewModeToggle mode={viewMode} onChange={updateViewMode} isMobile={mobile} />
  )

  const refreshButton = (cls = 'docker-icon-btn') => {
    const refreshing = isManualRefreshing || (isFetching && !isLoading) || isCheckingUpdates
    return (
      <button
        type="button"
        className={cls}
        title={t('common.refresh')}
        aria-label={t('common.refresh')}
        onClick={() => {
          if (refreshing) return
          setIsManualRefreshing(true)
          void forceRefreshAppCatalog(qc, tab === 'installed').finally(() => {
            setIsManualRefreshing(false)
          })
        }}
        disabled={refreshing}
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
          strokeWidth={1.75}
        />
      </button>
    )
  }

  return (
    <div className="panel-window docker-window-root flex flex-col h-full min-h-0 overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">
            {viewFilter}
            {categoryFilter}
            {addButton}
            {licenseButton}
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
            {licenseButton}
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
            <div className="space-y-2.5 pt-1">
              <Checkbox
                checked={removeVolumes}
                onChange={setRemoveVolumes}
                tone="warning"
                label={t('appCatalog.removeVolumesLabel')}
                description={t('appCatalog.removeVolumesDesc')}
              />
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(progressModal)}
        onClose={() => {
          if (progressModal?.phase !== 'running') {
            setProgressModal(null)
          }
        }}
        title={
          progressModal?.kind === 'rollback'
            ? t('appCatalog.progressRollbackTitle')
            : t('appCatalog.progressUpgradeTitle')
        }
        subtitle={progressModal?.app.name}
        size="sm"
        footer={
          progressModal?.phase === 'running' ? null : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setProgressModal(null)}
              >
                {t('common.close')}
              </Button>
              {progressModal?.phase === 'success' && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    const targetApp = progressModal.app
                    setProgressModal(null)
                    openInstalledAppWindow(targetApp)
                  }}
                >
                  {t('appCatalog.openAppAfterUpdate')}
                </Button>
              )}
            </>
          )
        }
      >
        {progressModal && (
          <div className="space-y-3 text-[13px]">
            <div className="flex items-start gap-3">
              {progressModal.phase === 'running' ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--panel-primary)] mt-0.5" />
              ) : progressModal.phase === 'success' ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--panel-success)] mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0 text-[var(--panel-danger)] mt-0.5" />
              )}
              <div className="min-w-0 space-y-1">
                <p className="text-[var(--win-text)] leading-relaxed">
                  {progressModal.phase === 'running'
                    ? t('appCatalog.progressRunning')
                    : progressModal.phase === 'success'
                    ? progressModal.kind === 'rollback'
                      ? t('appCatalog.progressRollbackDone')
                      : t('appCatalog.progressDone')
                    : progressModal.errorMessage || t('appCatalog.progressFailed')}
                </p>
                <p className="panel-mono text-[11px] text-[var(--text-secondary)] break-all">
                  {progressModal.image}
                </p>
              </div>
            </div>
            {progressModal.phase === 'running' && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-surface-subtle)]">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--panel-primary)]" />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(upgradeTarget)}
        onClose={() => setUpgradeTarget(null)}
        title={t('appCatalog.upgradeModalTitle')}
        subtitle={upgradeTarget?.app.name}
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setUpgradeTarget(null)}
              disabled={upgradeMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={upgradeMutation.isPending}
              onClick={handleConfirmUpgrade}
            >
              {t('appCatalog.upgradeSubmitBtn')}
            </Button>
          </>
        }
      >
        {upgradeTarget && (
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-[var(--panel-surface-subtle)] border border-[var(--panel-border)]">
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                  {t('appCatalog.currentVersionLabel')}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="panel-mono text-[13px] font-semibold text-[var(--win-text)]">
                    {formatVersionDisplay(upgradeTarget.currentVersion, upgradeTarget.resolvedVersion)}
                  </span>
                  {upgradeTarget.isFloating ? (
                    <Badge tone="warning" size="sm">
                      {t('appCatalog.floatingTagBadge')}
                    </Badge>
                  ) : null}
                </div>
                {upgradeTarget.localDigest ? (
                  <span className="panel-mono text-[11px] text-[var(--text-secondary)] block mt-1 truncate">
                    {upgradeTarget.localDigest}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                  {t('appCatalog.targetVersionLabel')}
                </span>
                <span className="panel-mono text-[13px] font-semibold text-[var(--panel-primary)] block truncate">
                  {formatSingleVersionTag(upgradeTarget.targetVersion)}
                </span>
                {upgradeTarget.remoteDigest &&
                upgradeTarget.targetVersion === upgradeTarget.latestVersion ? (
                  <span className="panel-mono text-[11px] text-[var(--text-secondary)] block mt-1 truncate">
                    {upgradeTarget.remoteDigest}
                  </span>
                ) : null}
              </div>
            </div>

            {upgradeTarget.isFloating ? (
              <div className="panel-alert text-[12px]">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                <span>
                  {upgradeTarget.resolvedVersion
                    ? t('appCatalog.upgradeFloatingResolvedNotice', {
                        tag: upgradeTarget.currentVersion,
                        resolved: formatSingleVersionTag(upgradeTarget.resolvedVersion),
                        target: formatSingleVersionTag(
                          upgradeTarget.latestVersion || upgradeTarget.targetVersion,
                        ),
                      })
                    : t('appCatalog.upgradeFloatingUnverifiedNotice', {
                        tag: upgradeTarget.currentVersion,
                        target: formatSingleVersionTag(
                          upgradeTarget.latestVersion || upgradeTarget.targetVersion,
                        ),
                      })}
                </span>
              </div>
            ) : null}

            <Field label={t('appCatalog.targetVersionLabel')}>
              <Select
                value={upgradeTarget.targetVersion}
                onChange={(val) => {
                  upgradeTargetEditedRef.current = true
                  setUpgradeTarget((prev) => (prev ? { ...prev, targetVersion: val } : null))
                }}
                options={upgradeTarget.availableVersions.map((v) => {
                  if (isFloatingTag(v)) {
                    return {
                      value: v,
                      label: `${v} ${t('appCatalog.versionRollingSuffix')}`,
                    }
                  }
                  if (upgradeTarget.latestVersion && v === upgradeTarget.latestVersion) {
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

            <div className="p-2.5 rounded text-[12px] text-[var(--text-secondary)] bg-[var(--panel-surface-subtle)] border border-[var(--panel-border)] flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--panel-success)] shrink-0 mt-0.5" />
              <span>{t('appCatalog.upgradeDataSafeNotice')}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
