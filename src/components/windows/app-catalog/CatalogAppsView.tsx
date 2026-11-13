import {
  Activity,
  ExternalLink,
  Folder,
  Layers,
  Plus,
  Shield,
  Store,
  Workflow,
  Wrench,
} from 'lucide-react'
import type { CatalogApp, InstalledApp } from '@/api/appCatalog'
import { InstalledAppBadge } from '@/components/common/AppIcon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { FilterMenuItem } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { ListState, ListTable } from '@/components/ui/ListTable'
import { openInstalledAppWindow } from '@/hooks/useAppCatalog'
import { useI18n } from '@/lib/i18n'

export type CatalogViewMode = 'list' | 'grid'

interface CatalogAppsViewProps {
  items: CatalogApp[]
  installedByCatalogId: Map<string, InstalledApp>
  viewMode: CatalogViewMode
  isLoading: boolean
  isError: boolean
  categories?: FilterMenuItem[]
  selectedCategory?: string
  onSelectCategory?: (categoryKey: string) => void
  onInstallCatalog: (app: CatalogApp) => void
}

function renderCategoryIcon(categoryKey: string) {
  switch (categoryKey) {
    case 'monitoring':
      return <Activity className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
    case 'files':
      return <Folder className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
    case 'security':
      return <Shield className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
    case 'dev':
      return <Wrench className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
    case 'automation':
      return <Workflow className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
    case 'all':
    default:
      return <Layers className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
  }
}

export function CatalogAppsView({
  items,
  installedByCatalogId,
  viewMode,
  isLoading,
  isError,
  categories,
  selectedCategory = 'all',
  onSelectCategory,
  onInstallCatalog,
}: CatalogAppsViewProps) {
  const { t, language } = useI18n()
  const stateProps = {
    loading: isLoading,
    error: isError,
    errorTitle: t('appCatalog.loadFailed'),
    loadingText: t('appCatalog.loading'),
    empty: items.length === 0,
    emptyIcon: <Store />,
    emptyTitle: t('appCatalog.emptyCatalogTitle'),
    emptyHint: t('appCatalog.emptyCatalogDesc'),
  }

  if (viewMode === 'grid') {
    return (
      <div className="app-catalog-cards-scroll">
        {categories && categories.length > 0 && onSelectCategory ? (
          <div className="app-catalog-category-bar" role="tablist" aria-label={t('appCatalog.categoryFilterLabel')}>
            {categories.map((cat) => {
              const active = (selectedCategory || 'all') === cat.key
              return (
                <button
                  key={cat.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelectCategory(cat.key)}
                  className={`app-catalog-category-chip ${active ? 'app-catalog-category-chip--active' : ''}`}
                >
                  <span className="app-catalog-category-chip__icon" aria-hidden="true">
                    {renderCategoryIcon(cat.key)}
                  </span>
                  <span className="app-catalog-category-chip__label">{cat.label}</span>
                  {typeof cat.count === 'number' ? (
                    <span className="app-catalog-category-chip__count">{cat.count}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ) : null}

        <ListState {...stateProps}>
          <div className="app-catalog-card-grid">
            {items.map((app) => {
              const existing = installedByCatalogId.get(app.id)
              const tagline = language === 'id' ? app.taglineId : app.taglineEn
              return (
                <article key={app.id} className="app-catalog-card">
                  <div className="space-y-2.5 min-w-0">
                    <div className="app-catalog-card__head">
                      <div className="app-catalog-card__identity">
                        <InstalledAppBadge iconKey={app.iconKey} iconColor={app.iconColor} size="md" />
                        <div className="app-catalog-card__titles">
                          <span className="docker-app-name" title={app.name}>{app.name}</span>
                          <span className="docker-row__sub panel-mono" title={app.image}>{app.image}</span>
                        </div>
                      </div>
                      <Badge tone={existing ? 'success' : 'neutral'} size="sm" dot={Boolean(existing)}>
                        {existing ? t('appCatalog.installedBadge') : t(`appCatalog.cat.${app.category}`)}
                      </Badge>
                    </div>
                    <p className="app-catalog-card__desc" title={tagline}>{tagline}</p>
                  </div>

                  <div className="app-catalog-card__footer">
                    {existing ? (
                      <>
                        <IconButton
                          label={t('appCatalog.installAnother')}
                          onClick={() => onInstallCatalog(app)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </IconButton>
                        <Button
                          variant="primary-soft"
                          size="sm"
                          icon={<ExternalLink className="h-3.5 w-3.5" />}
                          onClick={() => openInstalledAppWindow(existing)}
                        >
                          {t('appCatalog.openWindow')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onInstallCatalog(app)}
                      >
                        {t('appCatalog.installAction')}
                      </Button>
                    )}
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
      variant="app-catalog"
      empty={isLoading || isError || items.length === 0}
      columns={[
        { label: '#' },
        { label: t('appCatalog.colApp') },
        { label: t('appCatalog.colDescription') },
        { label: t('appCatalog.colCategory') },
        { label: t('appCatalog.colActions'), actions: true },
      ]}
    >
      <ListState {...stateProps}>
        {items.map((app, idx) => {
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
                      onClick={() => onInstallCatalog(app)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </IconButton>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onInstallCatalog(app)}
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
  )
}

