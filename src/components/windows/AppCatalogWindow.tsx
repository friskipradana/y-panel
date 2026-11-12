import { useMemo, useState } from 'react'
import {
  ExternalLink,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Square,
  Store,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { CatalogApp, InstalledApp } from '@/api/appCatalog'
import { InstalledAppBadge } from '@/components/common/AppIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { ListState, ListTable } from '@/components/ui/ListTable'
import { Modal } from '@/components/ui/Modal'
import { InstallAppModal } from '@/components/windows/app-catalog/InstallAppModal'
import { openInstalledAppWindow, useAppCatalog, useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

type CatalogTab = 'catalog' | 'installed'

function appStatusTone(app: InstalledApp): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (app.kind === 'custom-url') return app.useProxy ? 'info' : 'neutral'
  if (app.containerState === 'running') return 'success'
  if (app.containerState === 'missing') return 'danger'
  return 'warning'
}

export function AppCatalogWindow() {
  const { t, language } = useI18n()
  const isMobile = useIsMobileLayout()
  const { data, isLoading, isError, refetch, isFetching } = useAppCatalog()
  const { actionMutation, uninstallMutation } = useAppCatalogMutations()

  const [tab, setTab] = useState<CatalogTab>('catalog')
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [busyAppId, setBusyAppId] = useState<number | null>(null)

  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [selectedCatalogApp, setSelectedCatalogApp] = useState<CatalogApp | null>(null)
  const [editingApp, setEditingApp] = useState<InstalledApp | null>(null)

  const [uninstallTarget, setUninstallTarget] = useState<InstalledApp | null>(null)
  const [removeContainer, setRemoveContainer] = useState(false)
  const [removeVolumes, setRemoveVolumes] = useState(false)

  const catalog = useMemo(() => data?.catalog ?? [], [data?.catalog])
  const installed = useMemo(() => data?.installed ?? [], [data?.installed])

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
    setBusyAppId(app.id)
    try {
      await actionMutation.mutateAsync({ id: app.id, action })
      toast.success(t('appCatalog.containerActionSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    } finally {
      setBusyAppId(null)
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
      setBusyAppId(app.id)
      try {
        await uninstallMutation.mutateAsync({ id: app.id })
        toast.success(t('appCatalog.uninstallSuccess'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
      } finally {
        setBusyAppId(null)
      }
      return
    }
    setUninstallTarget(app)
    setRemoveContainer(app.kind === 'docker')
    setRemoveVolumes(false)
  }

  const handleConfirmUninstall = async () => {
    if (!uninstallTarget) return
    try {
      await uninstallMutation.mutateAsync({
        id: uninstallTarget.id,
        removeContainer,
        removeVolumes: removeContainer && removeVolumes,
      })
      toast.success(t('appCatalog.uninstallSuccess'))
      setUninstallTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    }
  }

  const statusLabel = (app: InstalledApp) => {
    if (app.kind === 'custom-url') {
      return app.useProxy ? t('appCatalog.statusProxy') : t('appCatalog.statusDirect')
    }
    if (app.containerState === 'running') return t('appCatalog.statusRunning')
    if (app.containerState === 'missing') return t('appCatalog.statusMissing')
    return t('appCatalog.statusStopped')
  }

  const kindLabel = (kind: InstalledApp['kind']) => {
    if (kind === 'docker') return t('appCatalog.kindDocker')
    if (kind === 'existing-container') return t('appCatalog.kindExisting')
    return t('appCatalog.kindCustomUrl')
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
            {refreshButton()}
          </div>
        </div>
      )}

      {tab === 'catalog' ? (
        <ListTable
          variant="app-catalog"
          empty={isLoading || isError || filteredCatalog.length === 0}
          columns={[
            { label: '#' },
            { label: t('appCatalog.colApp') },
            { label: t('appCatalog.colDescription') },
            { label: t('appCatalog.colCategory') },
            { label: t('appCatalog.colActions'), actions: true },
          ]}
        >
          <ListState
            loading={isLoading}
            error={isError}
            errorTitle={t('appCatalog.loadFailed')}
            loadingText={t('appCatalog.loading')}
            empty={filteredCatalog.length === 0}
            emptyIcon={<Store />}
            emptyTitle={t('appCatalog.emptyCatalogTitle')}
            emptyHint={t('appCatalog.emptyCatalogDesc')}
          >
            {filteredCatalog.map((app, idx) => {
              const existing = installedByCatalogId.get(app.id)
              const tagline = language === 'id' ? app.taglineId : app.taglineEn
              return (
                <div key={app.id} className="docker-row">
                  <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                  <div className="docker-row__app">
                    <InstalledAppBadge iconKey={app.iconKey} iconColor={app.iconColor} size="md" />
                    <div className="docker-row__text">
                      <span className="docker-app-name" title={app.name}>{app.name}</span>
                      <span className="docker-row__sub panel-mono" title={app.image}>{app.image}</span>
                    </div>
                  </div>
                  <div className="docker-cell min-w-0">
                    <span className="text-[12px] text-[var(--text-secondary)] truncate" title={tagline}>
                      {tagline}
                    </span>
                  </div>
                  <div className="docker-cell docker-cell--keep">
                    <Badge tone={existing ? 'success' : 'neutral'} size="sm" dot={Boolean(existing)}>
                      {existing ? t('appCatalog.installedBadge') : t(`appCatalog.cat.${app.category}`)}
                    </Badge>
                  </div>
                  <div className="docker-action-btns">
                    {existing ? (
                      <>
                        <Button
                          variant="primary-soft"
                          size="sm"
                          icon={<ExternalLink className="h-3.5 w-3.5" />}
                          onClick={() => openInstalledAppWindow(existing)}
                        >
                          {t('appCatalog.openWindow')}
                        </Button>
                        <IconButton
                          label={t('appCatalog.installAnother')}
                          onClick={() => handleOpenInstallCatalog(app)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </IconButton>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenInstallCatalog(app)}
                      >
                        {t('appCatalog.installAction')}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </ListState>
        </ListTable>
      ) : (
        <ListTable
          variant="app-catalog-installed"
          empty={isLoading || isError || filteredInstalled.length === 0}
          columns={[
            { label: '#' },
            { label: t('appCatalog.colApp') },
            { label: t('appCatalog.colKind') },
            { label: t('appCatalog.colStatus') },
            { label: t('appCatalog.colEndpoint') },
            { label: t('appCatalog.colActions'), actions: true },
          ]}
        >
          <ListState
            loading={isLoading}
            error={isError}
            errorTitle={t('appCatalog.loadFailed')}
            loadingText={t('appCatalog.loading')}
            empty={filteredInstalled.length === 0}
            emptyIcon={<Store />}
            emptyTitle={t('appCatalog.emptyInstalledTitle')}
            emptyHint={t('appCatalog.emptyInstalledDesc')}
          >
            {filteredInstalled.map((app, idx) => {
              const rowBusy = busyAppId === app.id
              return (
                <div key={app.id} className="docker-row">
                  <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                  <div className="docker-row__app">
                    <InstalledAppBadge iconKey={app.iconKey} iconColor={app.iconColor} size="md" />
                    <div className="docker-row__text">
                      <span className="docker-app-name" title={app.name}>{app.name}</span>
                      <span className="docker-row__sub truncate" title={app.tagline || app.image || app.targetUrl}>
                        {app.tagline || app.image || app.targetUrl}
                      </span>
                    </div>
                  </div>
                  <div className="docker-cell">
                    <Badge tone="neutral" size="sm">{kindLabel(app.kind)}</Badge>
                  </div>
                  <div className="docker-cell docker-cell--keep">
                    <Badge tone={appStatusTone(app)} size="sm" dot>{statusLabel(app)}</Badge>
                  </div>
                  <div className="docker-cell min-w-0">
                    <span className="panel-mono text-[12px] text-[var(--text-secondary)] truncate">
                      {app.kind === 'custom-url' ? app.targetUrl : `127.0.0.1:${app.hostPort}${app.openPath}`}
                    </span>
                  </div>
                  <div className="docker-action-btns">
                    <IconButton
                      label={t('appCatalog.openWindow')}
                      tone="primary"
                      disabled={rowBusy}
                      onClick={() => openInstalledAppWindow(app)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </IconButton>

                    {app.kind !== 'custom-url' ? (
                      app.containerState === 'running' ? (
                        <>
                          <IconButton
                            label={t('appCatalog.restartContainer')}
                            disabled={rowBusy}
                            onClick={() => handleContainerAction(app, 'restart')}
                          >
                            <RotateCw className={`h-3.5 w-3.5 ${rowBusy ? 'animate-spin' : ''}`} />
                          </IconButton>
                          <IconButton
                            label={t('appCatalog.stopContainer')}
                            tone="warning"
                            disabled={rowBusy}
                            onClick={() => handleContainerAction(app, 'stop')}
                          >
                            <Square className="h-3.5 w-3.5" />
                          </IconButton>
                        </>
                      ) : (
                        <IconButton
                          label={t('appCatalog.startContainer')}
                          tone="success"
                          disabled={rowBusy || app.containerState === 'missing'}
                          onClick={() => handleContainerAction(app, 'start')}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </IconButton>
                      )
                    ) : null}

                    <IconButton label={t('common.edit')} disabled={rowBusy} onClick={() => handleOpenEdit(app)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>

                    <IconButton
                      label={t('appCatalog.uninstallAction')}
                      tone="danger"
                      disabled={rowBusy}
                      onClick={() => openUninstallConfirm(app)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>
              )
            })}
          </ListState>
        </ListTable>
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
