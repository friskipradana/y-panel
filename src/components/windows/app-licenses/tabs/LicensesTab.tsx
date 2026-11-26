import { type AppLicense } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { Tabs } from '@/components/ui/Tabs'
import { ViewModeToggle, type ViewMode } from '@/components/ui/ViewModeToggle'
import { useI18n } from '@/lib/i18n'
import { type LicenseStatusFilter } from './licenseFormatters'
import { LicensesGridView } from './LicensesGridView'
import { LicensesListView } from './LicensesListView'

interface LicensesTabProps {
  totalLicensesCount: number
  filteredLicenses: AppLicense[]
  activeCount: number
  suspendedCount: number
  expiredCount: number
  loading: boolean
  error: boolean
  search: string
  onSearchChange: (value: string) => void
  statusFilter: LicenseStatusFilter
  onStatusFilterChange: (value: LicenseStatusFilter) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  isMobile: boolean
  copiedKey: string | null
  onCreateLicense: () => void
  onCopyKey: (key: string) => void
  onRenew: (lic: AppLicense) => void
  onOpenApp: (lic: AppLicense) => void
  onOpenIntegration: (lic: AppLicense) => void
  onToggleSuspend: (lic: AppLicense) => void
  onEdit: (lic: AppLicense) => void
  onDelete: (lic: AppLicense) => void
}

export function LicensesTab({
  totalLicensesCount,
  filteredLicenses,
  activeCount,
  suspendedCount,
  expiredCount,
  loading,
  error,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  isMobile,
  copiedKey,
  onCreateLicense,
  onCopyKey,
  onRenew,
  onOpenApp,
  onOpenIntegration,
  onToggleSuspend,
  onEdit,
  onDelete,
}: LicensesTabProps) {
  const { t } = useI18n()

  return (
    <div className="flex-1 flex flex-col min-h-0 p-3 sm:p-4 space-y-3 overflow-hidden">
      {/* Subheader Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5 shrink-0">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder={t('appLicenses.searchPlaceholder')}
          className="w-full sm:w-64"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 w-full sm:w-auto min-w-0">
          <Tabs
            variant="segmented"
            label="Filter Status Lisensi"
            value={statusFilter}
            onChange={onStatusFilterChange}
            items={[
              { key: 'ALL', label: `Semua (${totalLicensesCount})` },
              { key: 'ACTIVE', label: `Aktif (${activeCount})` },
              { key: 'SUSPENDED', label: `Disuspend (${suspendedCount})` },
              { key: 'EXPIRED', label: `Kedaluwarsa (${expiredCount})` },
            ]}
          />

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <ViewModeToggle mode={viewMode} onChange={onViewModeChange} isMobile={isMobile} />

            <Button variant="primary" onClick={onCreateLicense}>
              Buat Lisensi
            </Button>
          </div>
        </div>
      </div>

      {/* Licenses Content (Card vs List) */}
      {viewMode === 'grid' ? (
        <LicensesGridView
          licenses={filteredLicenses}
          loading={loading}
          error={error}
          copiedKey={copiedKey}
          onCopyKey={onCopyKey}
          onRenew={onRenew}
          onOpenApp={onOpenApp}
          onOpenIntegration={onOpenIntegration}
          onToggleSuspend={onToggleSuspend}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : (
        <LicensesListView
          licenses={filteredLicenses}
          loading={loading}
          error={error}
          copiedKey={copiedKey}
          onCopyKey={onCopyKey}
          onRenew={onRenew}
          onOpenApp={onOpenApp}
          onOpenIntegration={onOpenIntegration}
          onToggleSuspend={onToggleSuspend}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}
