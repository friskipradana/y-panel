import { RefreshCw, Search } from 'lucide-react'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { ViewModeToggle } from '@/components/ui/ViewModeToggle'
import type { CatalogViewMode } from '@/components/windows/app-catalog/CatalogAppsView'
import { useI18n } from '@/lib/i18n'

export type CatalogTab = 'catalog' | 'installed'

export interface CatalogCategoryOption {
  key: string
  label: string
  count: number
}

interface AppCatalogTopbarProps {
  isMobile: boolean
  tab: CatalogTab
  onTabChange: (tab: CatalogTab) => void
  catalogCount: number
  installedCount: number
  viewMode: CatalogViewMode
  onViewModeChange: (mode: CatalogViewMode) => void
  category: string
  categories: CatalogCategoryOption[]
  onCategoryChange: (category: string) => void
  search: string
  onSearchChange: (value: string) => void
  isSuperadmin: boolean
  onOpenAddCustom: () => void
  onOpenLicenses: () => void
  isRefreshing: boolean
  onRefresh: () => void
}

export function AppCatalogTopbar({
  isMobile,
  tab,
  onTabChange,
  catalogCount,
  installedCount,
  viewMode,
  onViewModeChange,
  category,
  categories,
  onCategoryChange,
  search,
  onSearchChange,
  isSuperadmin,
  onOpenAddCustom,
  onOpenLicenses,
  isRefreshing,
  onRefresh,
}: AppCatalogTopbarProps) {
  const { t } = useI18n()

  const viewFilter = (
    <FilterMenu
      label={t('appCatalog.viewFilterLabel')}
      value={tab}
      onChange={(v) => onTabChange(v as CatalogTab)}
      items={[
        { key: 'catalog', label: t('appCatalog.tabCatalog'), count: catalogCount },
        { key: 'installed', label: t('appCatalog.tabInstalled'), count: installedCount },
      ]}
    />
  )

  const categoryFilter = tab === 'catalog' && viewMode === 'list' ? (
    <FilterMenu
      label={t('appCatalog.categoryFilterLabel')}
      value={category}
      onChange={onCategoryChange}
      items={categories}
    />
  ) : null

  const addButton = isSuperadmin ? (
    <button type="button" onClick={onOpenAddCustom} className="docker-primary-btn">
      <span>{t('appCatalog.addCustomButton')}</span>
    </button>
  ) : null

  const licenseButton = isSuperadmin ? (
    <button
      type="button"
      onClick={onOpenLicenses}
      className="docker-secondary-btn"
      title={t('appCatalog.manageLicenses') || 'Lisensi'}
    >
      <span>{t('appCatalog.manageLicenses') || 'Lisensi'}</span>
    </button>
  ) : null

  const refreshButton = (cls = 'docker-icon-btn') => (
    <button
      type="button"
      className={cls}
      title={t('common.refresh')}
      aria-label={t('common.refresh')}
      onClick={onRefresh}
      disabled={isRefreshing}
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
        strokeWidth={1.75}
      />
    </button>
  )

  if (isMobile) {
    return (
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
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <ViewModeToggle mode={viewMode} onChange={onViewModeChange} isMobile />
          {refreshButton('docker-icon-btn docker-icon-btn--mobile')}
        </div>
      </div>
    )
  }

  return (
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
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <ViewModeToggle mode={viewMode} onChange={onViewModeChange} isMobile={false} />
        {refreshButton()}
      </div>
    </div>
  )
}
