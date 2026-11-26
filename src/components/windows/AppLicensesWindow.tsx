import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  type AppLicense,
  type AppLicensePlan,
  type AppLicenseOrder,
} from '@/api/appLicenses'
import { installedAppWindowParams } from '@/api/appCatalog'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { Tabs } from '@/components/ui/Tabs'
import { type ViewMode } from '@/components/ui/ViewModeToggle'
import { useAppCatalog } from '@/hooks/useAppCatalog'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { useWindowStore } from '@/store/windowStore'
import { CreateLicenseModal } from './app-licenses/CreateLicenseModal'
import { EditLicenseModal } from './app-licenses/EditLicenseModal'
import { CreatePlanModal } from './app-licenses/CreatePlanModal'
import { EditPlanModal } from './app-licenses/EditPlanModal'
import { LicenseIntegrationModal } from './app-licenses/LicenseIntegrationModal'
import {
  type LicenseStatusFilter,
  type LicenseTab,
} from './app-licenses/tabs/licenseFormatters'
import { useAppLicensesData } from './app-licenses/tabs/useAppLicensesData'
import { useAppLicenseMutations } from './app-licenses/tabs/useAppLicenseMutations'
import { LicensesTab } from './app-licenses/tabs/LicensesTab'
import { PlansTab } from './app-licenses/tabs/PlansTab'
import { InvoicesTab } from './app-licenses/tabs/InvoicesTab'
import { InvoiceDetailModal } from './app-licenses/tabs/InvoiceDetailModal'
import { RenewLicenseModal } from './app-licenses/tabs/RenewLicenseModal'

export function AppLicensesWindow() {
  const isMobile = useIsMobileLayout()
  const queryClient = useQueryClient()
  const openWindow = useWindowStore((s) => s.openWindow)
  const { data: catalogData } = useAppCatalog()

  const [activeTab, setActiveTab] = useState<LicenseTab>('licenses')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LicenseStatusFilter>('ALL')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Modals
  const [createLicenseModalOpen, setCreateLicenseModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingLicense, setEditingLicense] = useState<AppLicense | null>(null)
  const [createPlanModalOpen, setCreatePlanModalOpen] = useState(false)
  const [editPlanModalOpen, setEditPlanModalOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<AppLicensePlan | null>(null)
  const [integrationModalOpen, setIntegrationModalOpen] = useState(false)
  const [integrationLicense, setIntegrationLicense] = useState<AppLicense | null>(null)
  const [renewModalOpen, setRenewModalOpen] = useState(false)
  const [selectedLicense, setSelectedLicense] = useState<AppLicense | null>(null)
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<AppLicenseOrder | null>(null)

  const {
    licenses,
    licensesLoading,
    licensesError,
    licensesRefetching,
    refetchLicenses,
    availableApps,
    refetchApps,
    plans,
    plansLoading,
    plansError,
    refetchPlans,
    orders,
    ordersLoading,
    ordersError,
    filteredLicenses,
    activeCount,
    suspendedCount,
    expiredCount,
    pendingOrdersCount,
    refetchAll,
  } = useAppLicensesData(search, statusFilter)

  const {
    renewMutation,
    orderMutation,
    payMutation,
    cancelOrderMutation,
    handleCancelOrder,
    handleToggleSuspend,
    handleDeleteLicense,
    handleDeletePlan,
    handleOrderPlan,
  } = useAppLicenseMutations({
    selectedLicenseAppName: selectedLicense?.appName,
    onRenewSuccess: () => setRenewModalOpen(false),
    onOrderCreated: (order) => {
      setSelectedOrder(order)
      setInvoiceModalOpen(true)
    },
    onOrderPaid: (order) => setSelectedOrder(order),
    onOrderCancelled: (order) => {
      setSelectedOrder((prev) => (prev?.publicId === order.publicId ? order : prev))
    },
  })

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    toast.success('License key berhasil disalin!')
    setTimeout(() => setCopiedKey(null), 2500)
  }

  const handleOpenRenew = (lic: AppLicense) => {
    setSelectedLicense(lic)
    setRenewModalOpen(true)
  }

  const handleOpenApp = (lic: AppLicense) => {
    const installed = catalogData?.installed?.find((app) => app.catalogId === lic.catalogId)
    if (installed) {
      openWindow('installed-app', installedAppWindowParams(installed))
      return
    }
    openWindow('app-catalog')
  }

  return (
    <div className="flex flex-col h-full w-full bg-[var(--win-bg)] text-[var(--win-text)] overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--win-border)] bg-[var(--panel-surface)] shrink-0">
        <div className="min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <h2 className="text-sm font-semibold leading-none text-[var(--win-text)]">
              Pusat Lisensi & Tagihan Aplikasi
            </h2>
            <Badge tone="success" dot size="sm">
              {activeCount} Aktif
            </Badge>
            {pendingOrdersCount > 0 && (
              <Badge tone="warning" dot size="sm">
                {pendingOrdersCount} Menunggu Bayar
              </Badge>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-snug">
            Kelola lisensi, paket langganan, dan tagihan Reneo CRM Services.
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end flex-wrap gap-2 w-full sm:w-auto">
          <Tabs<LicenseTab>
            label="Navigasi Lisensi Aplikasi"
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { key: 'licenses', label: 'Lisensi', count: licenses.length },
              { key: 'plans', label: 'Paket & Tarif', count: plans.length },
              { key: 'invoices', label: 'Invoice', count: orders.length },
            ]}
          />

          <IconButton
            label="Segarkan Status"
            size="md"
            variant="outline"
            loading={licensesRefetching}
            onClick={refetchAll}
          >
            <RefreshCw size={14} className={licensesRefetching ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {/* Tab 1: Licenses */}
      {activeTab === 'licenses' && (
        <LicensesTab
          totalLicensesCount={licenses.length}
          filteredLicenses={filteredLicenses}
          activeCount={activeCount}
          suspendedCount={suspendedCount}
          expiredCount={expiredCount}
          loading={licensesLoading}
          error={licensesError}
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isMobile={isMobile}
          copiedKey={copiedKey}
          onCreateLicense={() => setCreateLicenseModalOpen(true)}
          onCopyKey={handleCopyKey}
          onRenew={handleOpenRenew}
          onOpenApp={handleOpenApp}
          onOpenIntegration={(lic) => {
            setIntegrationLicense(lic)
            setIntegrationModalOpen(true)
          }}
          onToggleSuspend={(lic) => void handleToggleSuspend(lic)}
          onEdit={(lic) => {
            setEditingLicense(lic)
            setEditModalOpen(true)
          }}
          onDelete={(lic) => void handleDeleteLicense(lic)}
        />
      )}

      {/* Tab 2: Plans & Pricing (Reneo CRM Services) */}
      {activeTab === 'plans' && (
        <PlansTab
          plans={plans}
          loading={plansLoading}
          error={plansError}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isMobile={isMobile}
          orderPending={orderMutation.isPending}
          onCreatePlan={() => setCreatePlanModalOpen(true)}
          onOrderPlan={handleOrderPlan}
          onEditPlan={(plan) => {
            setEditingPlan(plan)
            setEditPlanModalOpen(true)
          }}
          onDeletePlan={(plan) => void handleDeletePlan(plan)}
        />
      )}

      {/* Tab 3: Riwayat Invoice */}
      {activeTab === 'invoices' && (
        <InvoicesTab
          orders={orders}
          loading={ordersLoading}
          error={ordersError}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isMobile={isMobile}
          onSelectOrder={(ord) => {
            setSelectedOrder(ord)
            setInvoiceModalOpen(true)
          }}
          onCancelOrder={(ord) => void handleCancelOrder(ord)}
        />
      )}

      {/* Invoice Details & Payment Modal */}
      {invoiceModalOpen && selectedOrder && (
        <InvoiceDetailModal
          open={invoiceModalOpen}
          order={selectedOrder}
          onClose={() => setInvoiceModalOpen(false)}
          onCancelOrder={(ord) => void handleCancelOrder(ord)}
          onPayOrder={(payload) => payMutation.mutate(payload)}
          cancelPending={cancelOrderMutation.isPending}
          payPending={payMutation.isPending}
        />
      )}

      {/* Renew Modal */}
      {renewModalOpen && selectedLicense && (
        <RenewLicenseModal
          key={selectedLicense.id}
          open={renewModalOpen}
          license={selectedLicense}
          onClose={() => setRenewModalOpen(false)}
          pending={renewMutation.isPending}
          onConfirm={(payload) => renewMutation.mutate(payload)}
        />
      )}

      {/* Create License Modal */}
      <CreateLicenseModal
        open={createLicenseModalOpen}
        onClose={() => setCreateLicenseModalOpen(false)}
        availableApps={availableApps}
        onSuccess={() => {
          refetchLicenses()
          refetchApps()
          queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
          queryClient.invalidateQueries({ queryKey: ['app-licenses-available-apps'] })
        }}
      />

      {/* Edit License Modal */}
      <EditLicenseModal
        open={editModalOpen}
        license={editingLicense}
        onClose={() => {
          setEditModalOpen(false)
          setEditingLicense(null)
        }}
        onSuccess={() => {
          refetchLicenses()
          queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
        }}
      />

      {/* Create Plan Modal */}
      <CreatePlanModal
        open={createPlanModalOpen}
        onClose={() => setCreatePlanModalOpen(false)}
        availableApps={availableApps}
        defaultCatalogId="reneo-crm"
        onSuccess={() => {
          refetchPlans()
          refetchApps()
          queryClient.invalidateQueries({ queryKey: ['app-license-plans'] })
          queryClient.invalidateQueries({ queryKey: ['app-licenses-available-apps'] })
        }}
      />

      {/* Edit Plan Modal */}
      <EditPlanModal
        open={editPlanModalOpen}
        plan={editingPlan}
        allPlans={plans}
        onClose={() => {
          setEditPlanModalOpen(false)
          setEditingPlan(null)
        }}
        onSuccess={() => {
          refetchPlans()
          queryClient.invalidateQueries({ queryKey: ['app-license-plans'] })
        }}
      />

      {/* Integration Guide Modal */}
      <LicenseIntegrationModal
        open={integrationModalOpen}
        onClose={() => {
          setIntegrationModalOpen(false)
          setIntegrationLicense(null)
        }}
        license={integrationLicense}
      />
    </div>
  )
}

export default AppLicensesWindow
