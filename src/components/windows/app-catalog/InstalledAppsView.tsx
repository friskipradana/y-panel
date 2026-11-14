import { ArrowUpCircle, ExternalLink, Pencil, Play, RotateCw, Square, Store, Trash2 } from 'lucide-react'
import type { InstalledApp } from '@/api/appCatalog'
import { InstalledAppBadge } from '@/components/common/AppIcon'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { ListState, ListTable } from '@/components/ui/ListTable'
import type { CatalogViewMode } from '@/components/windows/app-catalog/CatalogAppsView'
import { openInstalledAppWindow } from '@/hooks/useAppCatalog'
import { useI18n } from '@/lib/i18n'

export type CatalogRowAction = 'start' | 'stop' | 'restart' | 'upgrade' | 'uninstall'

export interface BusyCatalogAction {
  id: number
  action: CatalogRowAction
}

interface InstalledAppsViewProps {
  items: InstalledApp[]
  viewMode: CatalogViewMode
  isLoading: boolean
  isError: boolean
  busyAppId?: number | null
  busyAction?: BusyCatalogAction | null
  onContainerAction: (app: InstalledApp, action: 'start' | 'stop' | 'restart') => void
  onUpgrade: (app: InstalledApp) => void
  onEdit: (app: InstalledApp) => void
  onUninstall: (app: InstalledApp) => void
}

function appStatusTone(app: InstalledApp): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (app.kind === 'custom-url') return app.useProxy ? 'info' : 'neutral'
  if (app.containerState === 'running') return 'success'
  if (app.containerState === 'missing') return 'danger'
  return 'warning'
}

export function InstalledAppsView({
  items,
  viewMode,
  isLoading,
  isError,
  busyAppId,
  busyAction,
  onContainerAction,
  onUpgrade,
  onEdit,
  onUninstall,
}: InstalledAppsViewProps) {
  const { t } = useI18n()

  const isActionBusy = (appId: number, action: CatalogRowAction) =>
    busyAction ? busyAction.id === appId && busyAction.action === action : busyAppId === appId

  const isRowBusy = (appId: number) =>
    busyAction ? busyAction.id === appId : busyAppId === appId

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

  const renderActions = (app: InstalledApp, rowBusy: boolean) => (
    <>
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
              loading={isActionBusy(app.id, 'restart')}
              onClick={() => onContainerAction(app, 'restart')}
            >
              <RotateCw className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              label={t('appCatalog.stopContainer')}
              tone="warning"
              disabled={rowBusy}
              loading={isActionBusy(app.id, 'stop')}
              onClick={() => onContainerAction(app, 'stop')}
            >
              <Square className="h-3.5 w-3.5" />
            </IconButton>
          </>
        ) : (
          <IconButton
            label={t('appCatalog.startContainer')}
            tone="success"
            disabled={rowBusy || app.containerState === 'missing'}
            loading={isActionBusy(app.id, 'start')}
            onClick={() => onContainerAction(app, 'start')}
          >
            <Play className="h-3.5 w-3.5" />
          </IconButton>
        )
      ) : null}

      <IconButton label={t('common.edit')} disabled={rowBusy} onClick={() => onEdit(app)}>
        <Pencil className="h-3.5 w-3.5" />
      </IconButton>

      {app.kind !== 'custom-url' ? (
        <IconButton
          label={t('appCatalog.upgradeAction')}
          disabled={rowBusy}
          loading={isActionBusy(app.id, 'upgrade')}
          onClick={() => onUpgrade(app)}
        >
          <ArrowUpCircle className="h-3.5 w-3.5" />
        </IconButton>
      ) : null}

      <IconButton
        label={t('appCatalog.uninstallAction')}
        tone="danger"
        disabled={rowBusy}
        loading={isActionBusy(app.id, 'uninstall')}
        onClick={() => onUninstall(app)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </IconButton>
    </>
  )

  const stateProps = {
    loading: isLoading,
    error: isError,
    errorTitle: t('appCatalog.loadFailed'),
    loadingText: t('appCatalog.loading'),
    empty: items.length === 0,
    emptyIcon: <Store />,
    emptyTitle: t('appCatalog.emptyInstalledTitle'),
    emptyHint: t('appCatalog.emptyInstalledDesc'),
  }

  if (viewMode === 'grid') {
    return (
      <div className="app-catalog-cards-scroll">
        <ListState {...stateProps}>
          <div className="app-catalog-card-grid">
            {items.map((app) => {
              const rowBusy = isRowBusy(app.id)
              const endpoint =
                app.kind === 'custom-url'
                  ? app.targetUrl
                  : `127.0.0.1:${app.hostPort}${app.openPath}`
              return (
                <article key={app.id} className="app-catalog-card">
                  <div className="space-y-2.5 min-w-0">
                    <div className="app-catalog-card__head">
                      <div className="app-catalog-card__identity">
                        <InstalledAppBadge iconKey={app.iconKey} iconColor={app.iconColor} size="md" />
                        <div className="app-catalog-card__titles">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="docker-app-name" title={app.name}>{app.name}</span>
                            {app.catalogId === 'reneo-crm' ? (
                              <Badge tone="primary" size="sm" title={t('appCatalog.officialTooltip')}>
                                {t('appCatalog.officialBadge')}
                              </Badge>
                            ) : null}
                          </div>
                          <span
                            className="docker-row__sub truncate"
                            title={app.tagline || app.image || app.targetUrl}
                          >
                            {app.tagline || app.image || app.targetUrl}
                          </span>
                        </div>
                      </div>
                      <Badge tone={appStatusTone(app)} size="sm" dot>{statusLabel(app)}</Badge>
                    </div>

                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <Badge tone="neutral" size="sm">{kindLabel(app.kind)}</Badge>
                      <span className="panel-mono app-catalog-card__meta" title={endpoint}>
                        {endpoint}
                      </span>
                    </div>
                  </div>

                  <div className="app-catalog-card__footer">
                    <div className="docker-action-btns">{renderActions(app, rowBusy)}</div>
                  </div>
                </article>
              )
            })}
          </div>
        </ListState>
      </div>
    )
  }

  return (
    <ListTable
      variant="app-catalog-installed"
      empty={isLoading || isError || items.length === 0}
      columns={[
        { label: '#' },
        { label: t('appCatalog.colApp') },
        { label: t('appCatalog.colKind') },
        { label: t('appCatalog.colStatus') },
        { label: t('appCatalog.colEndpoint') },
        { label: t('appCatalog.colActions'), actions: true },
      ]}
    >
      <ListState {...stateProps}>
        {items.map((app, idx) => {
          const rowBusy = isRowBusy(app.id)
          const endpoint =
            app.kind === 'custom-url'
              ? app.targetUrl
              : `127.0.0.1:${app.hostPort}${app.openPath}`
          return (
            <div key={app.id} className="docker-row">
              <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <InstalledAppBadge iconKey={app.iconKey} iconColor={app.iconColor} size="md" />
                <div className="docker-row__text">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="docker-app-name" title={app.name}>{app.name}</span>
                    {app.catalogId === 'reneo-crm' ? (
                      <Badge tone="primary" size="sm" title={t('appCatalog.officialTooltip')}>
                        {t('appCatalog.officialBadge')}
                      </Badge>
                    ) : null}
                  </div>
                  <span
                    className="docker-row__sub truncate"
                    title={app.tagline || app.image || app.targetUrl}
                  >
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
                  {endpoint}
                </span>
              </div>
              <div className="docker-action-btns">{renderActions(app, rowBusy)}</div>
            </div>
          )
        })}
      </ListState>
    </ListTable>
  )
}

