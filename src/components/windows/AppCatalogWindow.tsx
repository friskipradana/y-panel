import { useMemo, useState } from 'react'
import {
  ExternalLink,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Square,
  Store,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { CatalogApp, InstalledApp } from '@/api/appCatalog'
import { InstalledAppGlyph } from '@/components/common/AppIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { ListTable } from '@/components/ui/ListTable'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { InstallAppModal } from '@/components/windows/app-catalog/InstallAppModal'
import { openInstalledAppWindow, useAppCatalog, useAppCatalogMutations } from '@/hooks/useAppCatalog'
import { useI18n } from '@/lib/i18n'

type CatalogTab = 'catalog' | 'installed'

function appStatusTone(app: InstalledApp): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (app.kind === 'custom-url') return app.useProxy ? 'info' : 'neutral'
  if (app.containerState === 'running') return 'success'
  if (app.containerState === 'missing') return 'danger'
  return 'warning'
}

export function AppCatalogWindow() {
  const { t, lang } = useI18n()
  const { data, isLoading, isError, error, refetch, isFetching } = useAppCatalog()
  const { actionMutation, uninstallMutation } = useAppCatalogMutations()

  const [tab, setTab] = useState<CatalogTab>('catalog')
  const [category, setCategory] = useState<string>('all')
  const [search, setSearch] = useState('')

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
    try {
      await actionMutation.mutateAsync({ id: app.id, action })
      toast.success(t('appCatalog.containerActionSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('appCatalog.actionFailed'))
    }
  }

  const openUninstallConfirm = (app: InstalledApp) => {
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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="docker-topbar">
        <div className="docker-topbar__left">
          <FilterMenu
            label={t('appCatalog.viewFilterLabel')}
            value={tab}
            onChange={(v) => setTab(v as CatalogTab)}
            items={[
              { key: 'catalog', label: t('appCatalog.tabCatalog'), count: catalog.length },
              { key: 'installed', label: t('appCatalog.tabInstalled'), count: installed.length },
            ]}
          />
          {tab === 'catalog' ? (
            <FilterMenu
              label={t('appCatalog.categoryFilterLabel')}
              value={category}
              onChange={setCategory}
              items={categories}
            />
          ) : null}
        </div>

        <div className="docker-topbar__right">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('appCatalog.searchPlaceholder')}
          />
          <Button variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={handleOpenAddCustom}>
            {t('appCatalog.addCustomButton')}
          </Button>
          <IconButton
            label={t('common.refresh')}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <LoadingState label={t('appCatalog.loading')} />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : t('appCatalog.loadFailed')}
            onRetry={() => refetch()}
          />
        ) : tab === 'catalog' ? (
          filteredCatalog.length === 0 ? (
            <EmptyState
              icon={<Store className="h-5 w-5" />}
              title={t('appCatalog.emptyCatalogTitle')}
              description={t('appCatalog.emptyCatalogDesc')}
            />
          ) : (
            <div className="app-catalog-grid">
              {filteredCatalog.map((app) => {
                const existing = installedByCatalogId.get(app.id)
                const tagline = lang === 'id' ? app.taglineId : app.taglineEn
                return (
                  <div key={app.id} className="app-catalog-card">
                    <div className="app-catalog-card__header">
                      <div className="app-catalog-card__meta">
                        <InstalledAppGlyph
                          iconKey={app.iconKey}
                          iconColor={app.iconColor}
                          size={36}
                        />
                        <div className="min-w-0">
                          <h3 className="app-catalog-card__title truncate">{app.name}</h3>
                          <span className="panel-mono text-[11px] text-[var(--text-secondary)] block truncate">
                            {app.image}
                          </span>
                        </div>
                      </div>
                      <Badge tone={existing ? 'success' : 'neutral'} size="sm" dot={Boolean(existing)}>
                        {existing ? t('appCatalog.installedBadge') : t(`appCatalog.cat.${app.category}`)}
                      </Badge>
                    </div>

                    <p className="app-catalog-card__tagline">{tagline}</p>

                    <div className="app-catalog-card__footer">
                      <span className="panel-mono text-[11px] text-[var(--text-secondary)]">
                        {existing
                          ? `:${existing.hostPort || app.defaultHostPort}`
                          : `:${app.defaultHostPort}`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {existing ? (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={<ExternalLink className="h-3.5 w-3.5" />}
                            onClick={() => openInstalledAppWindow(existing)}
                          >
                            {t('appCatalog.openWindow')}
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleOpenInstallCatalog(app)}
                          >
                            {t('appCatalog.installAction')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : filteredInstalled.length === 0 ? (
          <EmptyState
            icon={<Store className="h-5 w-5" />}
            title={t('appCatalog.emptyInstalledTitle')}
            description={t('appCatalog.emptyInstalledDesc')}
            action={
              <Button variant="primary" onClick={() => setTab('catalog')}>
                {t('appCatalog.browseCatalog')}
              </Button>
            }
          />
        ) : (
          <ListTable
            variant="app-catalog-installed"
            columns={[
              { label: t('appCatalog.colApp') },
              { label: t('appCatalog.colKind') },
              { label: t('appCatalog.colStatus') },
              { label: t('appCatalog.colEndpoint') },
              { label: t('appCatalog.colActions'), actions: true },
            ]}
          >
            {filteredInstalled.map((app) => (
              <div key={app.id} className="docker-row">
                <div className="flex items-center gap-2.5 min-w-0">
                  <InstalledAppGlyph iconKey={app.iconKey} iconColor={app.iconColor} size={30} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-[var(--win-text)] truncate">
                      {app.name}
                    </div>
                    <div className="text-[11.5px] text-[var(--text-secondary)] truncate">
                      {app.tagline || app.image || app.targetUrl}
                    </div>
                  </div>
                </div>

                <div>
                  <Badge tone="neutral" size="sm">
                    {kindLabel(app.kind)}
                  </Badge>
                </div>

                <div>
                  <Badge tone={appStatusTone(app)} size="sm" dot>
                    {statusLabel(app)}
                  </Badge>
                </div>

                <div className="panel-mono text-[12px] text-[var(--text-secondary)] truncate">
                  {app.kind === 'custom-url' ? app.targetUrl : `127.0.0.1:${app.hostPort}`}
                </div>

                <div className="flex items-center justify-end gap-1">
                  <IconButton
                    label={t('appCatalog.openWindow')}
                    tone="primary"
                    onClick={() => openInstalledAppWindow(app)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </IconButton>

                  {app.kind !== 'custom-url' ? (
                    app.containerState === 'running' ? (
                      <>
                        <IconButton
                          label={t('appCatalog.restartContainer')}
                          onClick={() => handleContainerAction(app, 'restart')}
                          disabled={actionMutation.isPending}
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label={t('appCatalog.stopContainer')}
                          tone="warning"
                          onClick={() => handleContainerAction(app, 'stop')}
                          disabled={actionMutation.isPending}
                        >
                          <Square className="h-3.5 w-3.5" />
                        </IconButton>
                      </>
                    ) : (
                      <IconButton
                        label={t('appCatalog.startContainer')}
                        tone="success"
                        onClick={() => handleContainerAction(app, 'start')}
                        disabled={actionMutation.isPending || app.containerState === 'missing'}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </IconButton>
                    )
                  ) : null}

                  <IconButton label={t('common.edit')} onClick={() => handleOpenEdit(app)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>

                  <IconButton
                    label={t('appCatalog.uninstallAction')}
                    tone="danger"
                    onClick={() => openUninstallConfirm(app)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>
            ))}
          </ListTable>
        )}
      </div>

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
          <p className="text-[var(--text-secondary)]">
            {t('appCatalog.uninstallConfirmBody')}
          </p>
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

