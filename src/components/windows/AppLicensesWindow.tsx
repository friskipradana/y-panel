import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  AlertTriangle,
  CreditCard,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  Lock,
  ReceiptText,
  Boxes,
  FileText,
  Printer,
  Plus,
  Code2,
  Trash2,
  Pencil,
  XCircle,
  Ban,
  PlayCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchAppLicenses,
  renewAppLicense,
  fetchAppLicensePlans,
  fetchAppLicenseOrders,
  createAppLicenseOrder,
  payAppLicenseOrder,
  cancelAppLicenseOrder,
  fetchAvailableApps,
  updateAppLicense,
  deleteAppLicense,
  deleteAppLicensePlan,
  type AppLicense,
  type AppLicensePlan,
  type AppLicenseOrder,
} from '@/api/appLicenses'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconBadge } from '@/components/ui/IconBadge'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { Tabs } from '@/components/ui/Tabs'
import { ListTable, ListRowIcon, ListState } from '@/components/ui/ListTable'
import { ViewModeToggle, type ViewMode } from '@/components/ui/ViewModeToggle'
import { useAppCatalog } from '@/hooks/useAppCatalog'
import { useWindowStore } from '@/store/windowStore'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { CreateLicenseModal } from './app-licenses/CreateLicenseModal'
import { EditLicenseModal } from './app-licenses/EditLicenseModal'
import { CreatePlanModal } from './app-licenses/CreatePlanModal'
import { EditPlanModal } from './app-licenses/EditPlanModal'
import { LicenseIntegrationModal } from './app-licenses/LicenseIntegrationModal'

type LicenseTab = 'licenses' | 'plans' | 'invoices'

function indexLabel(index: number): string {
  return String(index + 1).padStart(2, '0')
}

function formatFeatureBadge(key: string, value: unknown): string | null {
  if (value === false || value === null || value === undefined) return null
  const k = key.toLowerCase()
  if (k === 'wahasync') return 'Integrasi WAHA'
  if (k === 'birthdaybot' || k === 'botbirthday') return 'Bot Ulang Tahun'
  if (k === 'livechat' || k === 'livechatcrm') return 'Live Chat CRM'
  if (k === 'multisession') return 'Multi-Sesi WA'
  if (k === 'maxsessions') return `${Number(value).toLocaleString('id-ID')} Sesi WA`
  if (k === 'broadcast' || k === 'unlimitedbroadcast') {
    return value === true ? 'Broadcast WA Tanpa Batas' : 'Broadcast WA Terjadwal'
  }
  if (k === 'maxbroadcastpermonth') {
    const n = Number(value)
    return n > 0 ? `${n.toLocaleString('id-ID')} Broadcast/bln` : null
  }
  if (k === 'maxtemplates') {
    const n = Number(value)
    return n > 0 ? `${n.toLocaleString('id-ID')} Template` : null
  }
  if (k === 'maxusers') {
    const n = Number(value)
    return n > 0 ? `${n.toLocaleString('id-ID')} User/Agent` : null
  }
  if (k === 'apiaccess') return 'Akses API'
  if (k === 'multiuser') return 'Multi-User'
  if (k === 'fullmodules') return 'Semua Modul'
  if (k === 'maxcontacts') {
    const n = Number(value)
    return n === 0 ? 'Kontak Tanpa Batas' : `${n.toLocaleString('id-ID')} Kontak`
  }
  if (k === 'supportpriority') return `Support: ${String(value).toUpperCase()}`
  if (typeof value === 'boolean') {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim()
  }
  return `${key}: ${String(value)}`
}

export function AppLicensesWindow() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const openWindow = useWindowStore((s) => s.openWindow)
  const { data: catalogData } = useAppCatalog()

  const [activeTab, setActiveTab] = useState<LicenseTab>('licenses')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED'>('ALL')
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
  const [months, setMonths] = useState<number>(1)
  const [paymentMethod] = useState<'transfer'>('transfer')

  // Invoice & Order modal
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<AppLicenseOrder | null>(null)

  // Queries (reneo-crm)
  const {
    data: licenses = [],
    isLoading: licensesLoading,
    isError: licensesError,
    isRefetching: licensesRefetching,
    refetch: refetchLicenses,
  } = useQuery({
    queryKey: ['app-licenses'],
    queryFn: () => fetchAppLicenses(),
    staleTime: 30_000,
  })

  const {
    data: availableApps = [],
    refetch: refetchApps,
  } = useQuery({
    queryKey: ['app-licenses-available-apps'],
    queryFn: fetchAvailableApps,
    staleTime: 60_000,
  })

  const {
    data: plans = [],
    isLoading: plansLoading,
    isError: plansError,
    refetch: refetchPlans,
  } = useQuery({
    queryKey: ['app-license-plans', 'reneo-crm'],
    queryFn: () => fetchAppLicensePlans('reneo-crm'),
    staleTime: 60_000,
  })

  const {
    data: orders = [],
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ['app-license-orders'],
    queryFn: () => fetchAppLicenseOrders(),
    staleTime: 15_000,
  })

  // Mutations
  const deleteLicenseMutation = useMutation({
    mutationFn: deleteAppLicense,
    onSuccess: (_data, deletedId) => {
      toast.success('Lisensi berhasil dihapus.')
      queryClient.setQueryData<AppLicense[]>(['app-licenses'], (prev) =>
        (prev || []).filter((item) => item.id !== deletedId),
      )
      queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal menghapus lisensi.')
    },
  })

  const deletePlanMutation = useMutation({
    mutationFn: deleteAppLicensePlan,
    onSuccess: () => {
      toast.success('Paket tarif berhasil dihapus.')
      queryClient.invalidateQueries({ queryKey: ['app-license-plans'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal menghapus paket tarif.')
    },
  })

  const renewMutation = useMutation({
    mutationFn: renewAppLicense,
    onSuccess: (data) => {
      toast.success(
        t('appLicenses.renewSuccess') ||
          `Lisensi untuk ${data.appName || selectedLicense?.appName || 'aplikasi'} berhasil diperpanjang!`
      )
      queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
      queryClient.invalidateQueries({ queryKey: ['app-license-orders'] })
      setRenewModalOpen(false)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal memperpanjang lisensi.')
    },
  })

  const orderMutation = useMutation({
    mutationFn: createAppLicenseOrder,
    onSuccess: (data) => {
      toast.success('Invoice pesanan baru berhasil diterbitkan!')
      queryClient.invalidateQueries({ queryKey: ['app-license-orders'] })
      setSelectedOrder(data.order)
      setInvoiceModalOpen(true)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal menerbitkan invoice.')
    },
  })

  const payMutation = useMutation({
    mutationFn: ({ publicId, method }: { publicId: string; method: string }) =>
      payAppLicenseOrder(publicId, method),
    onSuccess: (data) => {
      toast.success(`Pembayaran invoice ${data.invoiceNumber} berhasil! Lisensi langsung aktif.`)
      queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
      queryClient.invalidateQueries({ queryKey: ['app-license-orders'] })
      setSelectedOrder(data)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal memproses pembayaran.')
    },
  })

  const cancelOrderMutation = useMutation({
    mutationFn: (publicId: string) => cancelAppLicenseOrder(publicId),
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoiceNumber} berhasil dibatalkan.`)
      queryClient.invalidateQueries({ queryKey: ['app-license-orders'] })
      if (selectedOrder?.publicId === data.publicId) {
        setSelectedOrder(data)
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal membatalkan invoice.')
    },
  })

  const handleCancelOrder = async (ord: AppLicenseOrder) => {
    const ok = await alertLib.confirm(
      'Batalkan Invoice?',
      `Invoice ${ord.invoiceNumber} untuk ${ord.appName} (${ord.planName}) akan dibatalkan.`,
      'Batalkan Invoice',
      'Kembali',
      'warning',
      'app-licenses'
    )
    if (ok) {
      cancelOrderMutation.mutate(ord.publicId)
    }
  }

  const suspendMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'SUSPENDED' | 'ACTIVE' }) =>
      updateAppLicense(id, { status }),
    onSuccess: (updated) => {
      toast.success(
        updated.status === 'SUSPENDED'
          ? `Lisensi ${updated.appName} berhasil disuspend. Aplikasi tidak dapat digunakan.`
          : `Lisensi ${updated.appName} berhasil diaktifkan kembali.`
      )
      queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal mengubah status lisensi.')
    },
  })

  const handleToggleSuspend = async (lic: AppLicense) => {
    if (lic.status === 'SUSPENDED') {
      suspendMutation.mutate({ id: lic.id, status: 'ACTIVE' })
      return
    }
    const ok = await alertLib.confirm(
      'Suspend Lisensi?',
      `Lisensi ${lic.appName} (${lic.licenseKey}) akan disuspend sehingga aplikasi tidak dapat digunakan sampai diaktifkan kembali.`,
      'Suspend',
      'Batal',
      'warning',
      'app-licenses'
    )
    if (ok) {
      suspendMutation.mutate({ id: lic.id, status: 'SUSPENDED' })
    }
  }

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    toast.success('License key berhasil disalin!')
    setTimeout(() => setCopiedKey(null), 2500)
  }

  const handleOpenRenew = (lic: AppLicense) => {
    setSelectedLicense(lic)
    setMonths(1)
    setRenewModalOpen(true)
  }

  const handleDeleteLicense = async (lic: AppLicense) => {
    const ok = await alertLib.confirm(
      'Hapus Lisensi?',
      `Lisensi ${lic.appName} (${lic.licenseKey}) akan dihapus permanen.`,
      'Hapus',
      'Batal',
      'warning',
      'app-licenses'
    )
    if (ok) {
      deleteLicenseMutation.mutate(lic.id)
    }
  }

  const handleDeletePlan = async (plan: AppLicensePlan) => {
    const ok = await alertLib.confirm(
      'Hapus Paket?',
      `Paket "${plan.name}" akan dihapus dari daftar paket lisensi.`,
      'Hapus',
      'Batal',
      'warning',
      'app-licenses'
    )
    if (ok) {
      deletePlanMutation.mutate(plan.id)
    }
  }

  const handleOpenApp = (lic: AppLicense) => {
    const installed = catalogData?.installed?.find((app) => app.catalogId === lic.catalogId)
    if (installed) {
      openWindow('installed-app', { appId: installed.id })
    } else {
      if (lic.catalogId === 'reneo-crm') {
        window.open('http://localhost:18011', '_blank')
      } else {
        openWindow('app-catalog')
      }
    }
  }

  const handleOrderPlan = (plan: AppLicensePlan) => {
    orderMutation.mutate({
      catalogId: plan.catalogId,
      planSlug: plan.slug,
      paymentMethod: 'saldo',
    })
  }

  const filteredLicenses = useMemo(() => {
    const q = search.trim().toLowerCase()
    return licenses.filter((lic) => {
      const isSuspended = lic.status === 'SUSPENDED'
      const isExpired = !isSuspended && (lic.isExpired || lic.status === 'EXPIRED')
      if (statusFilter === 'ACTIVE' && (isSuspended || isExpired)) return false
      if (statusFilter === 'SUSPENDED' && !isSuspended) return false
      if (statusFilter === 'EXPIRED' && !isExpired) return false
      if (!q) return true
      return (
        lic.appName.toLowerCase().includes(q) ||
        lic.catalogId.toLowerCase().includes(q) ||
        lic.licenseKey.toLowerCase().includes(q) ||
        lic.planName.toLowerCase().includes(q)
      )
    })
  }, [licenses, search, statusFilter])

  const activeCount = useMemo(
    () => licenses.filter((l) => !l.isExpired && l.status !== 'EXPIRED' && l.status !== 'SUSPENDED').length,
    [licenses]
  )
  const suspendedCount = useMemo(
    () => licenses.filter((l) => l.status === 'SUSPENDED').length,
    [licenses]
  )
  const expiredCount = useMemo(
    () => licenses.filter((l) => l.status !== 'SUSPENDED' && (l.isExpired || l.status === 'EXPIRED')).length,
    [licenses]
  )
  const pendingOrdersCount = useMemo(
    () => orders.filter((o) => o.status === 'pending').length,
    [orders]
  )

  const pricingOptions = useMemo(() => {
    const basePrice = selectedLicense?.priceAmount || 99000
    return [
      {
        months: 1,
        label: '1 Bulan',
        period: 'monthly',
        price: basePrice,
        desc: 'Paket Standar Bulanan',
        savings: null,
      },
      {
        months: 3,
        label: '3 Bulan',
        period: 'quarterly',
        price: Math.round(basePrice * 3 * 0.94),
        desc: 'Rp 93.000 / bln',
        savings: 'Hemat 6%',
      },
      {
        months: 12,
        label: '12 Bulan (1 Tahun)',
        period: 'annual',
        price: Math.round(basePrice * 10),
        desc: 'Rp 82.500 / bln',
        savings: 'Hemat 17% (Paling Populer)',
      },
    ]
  }, [selectedLicense])

  const selectedPricing = pricingOptions.find((p) => p.months === months) || pricingOptions[0]

  const calculatedNewExpiry = useMemo(() => {
    if (!selectedLicense) return ''
    const currentExp = new Date(selectedLicense.expiresAt)
    const now = new Date()
    const baseDate = currentExp > now ? currentExp : now
    const newExp = new Date(baseDate)
    newExp.setMonth(newExp.getMonth() + months)
    return newExp.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }, [selectedLicense, months])

  return (
    <div className="flex flex-col h-full w-full bg-[var(--win-bg)] text-[var(--win-text)] overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--win-border)] bg-[var(--panel-surface)] shrink-0">
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
          <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">
            Kelola lisensi, paket langganan, dan tagihan Reneo CRM Services.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <Tabs<LicenseTab>
            label="Navigasi Lisensi Aplikasi"
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { key: 'licenses', label: 'Lisensi', icon: <KeyRound />, count: licenses.length },
              { key: 'plans', label: 'Paket & Tarif', icon: <Boxes />, count: plans.length },
              { key: 'invoices', label: 'Invoice', icon: <ReceiptText />, count: orders.length },
            ]}
          />

          <IconButton
            label="Segarkan Status"
            loading={licensesRefetching}
            onClick={() => {
              refetchLicenses()
              refetchApps()
              refetchPlans()
              refetchOrders()
            }}
            className="border border-[var(--win-border)]"
          >
            <RefreshCw size={14} className={licensesRefetching ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {/* Tab 1: Licenses */}
      {activeTab === 'licenses' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-3 overflow-hidden">
          {/* Subheader Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari lisensi atau key..."
              className="w-52 sm:w-64"
            />

            <div className="flex items-center flex-wrap gap-2 shrink-0">
              <div className="flex items-center bg-[var(--panel-surface)] border border-[var(--win-border)] rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    statusFilter === 'ALL'
                      ? 'bg-[var(--panel-primary-bg)] font-semibold text-[var(--panel-primary-text)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                  }`}
                >
                  Semua ({licenses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    statusFilter === 'ACTIVE'
                      ? 'bg-[var(--panel-primary-bg)] font-semibold text-[var(--panel-primary-text)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                  }`}
                >
                  Aktif ({activeCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('SUSPENDED')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    statusFilter === 'SUSPENDED'
                      ? 'bg-[var(--panel-warning-bg)] font-semibold text-[var(--panel-warning-text)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                  }`}
                >
                  Disuspend ({suspendedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('EXPIRED')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    statusFilter === 'EXPIRED'
                      ? 'bg-[var(--panel-danger-bg)] font-semibold text-[var(--panel-danger-text)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                  }`}
                >
                  Kedaluwarsa ({expiredCount})
                </button>
              </div>

              <ViewModeToggle mode={viewMode} onChange={setViewMode} />

              <Button
                size="sm"
                variant="primary"
                onClick={() => setCreateLicenseModalOpen(true)}
                className="gap-1.5 shadow-sm"
              >
                <Plus size={14} />
                Buat Lisensi
              </Button>
            </div>
          </div>

          {/* Licenses Content (Card vs List) */}
          {viewMode === 'grid' ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ListState
                loading={licensesLoading}
                error={licensesError}
                errorTitle="Gagal memuat lisensi"
                errorHint="Periksa koneksi database atau coba segarkan kembali."
                loadingText="Memuat lisensi aplikasi..."
                empty={filteredLicenses.length === 0}
                emptyIcon={<KeyRound size={28} />}
                emptyTitle="Belum ada lisensi aplikasi"
                emptyHint="Pilih paket pada tab 'Paket & Tarif' untuk membuat lisensi Reneo CRM."
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pb-4">
                  {filteredLicenses.map((lic) => {
                    const isSuspended = lic.status === 'SUSPENDED'
                    const isExpired = !isSuspended && (lic.isExpired || lic.status === 'EXPIRED')
                    const isLocked = isSuspended || isExpired
                    const progressPct = Math.min(100, Math.max(0, (lic.daysLeft / 30) * 100))

                    return (
                      <div
                        key={lic.id}
                        className={`rounded-lg border p-4 flex flex-col justify-between transition-colors bg-[var(--panel-surface)] gap-3 ${
                          isLocked
                            ? 'border-[var(--panel-danger-text)]/35'
                            : 'border-[var(--win-border)] hover:border-[var(--panel-primary-text)]/40'
                        }`}
                      >
                        <div className="space-y-3">
                          {/* Header Identity */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <IconBadge size="lg" tone={isLocked ? 'danger' : 'primary'}>
                                {isLocked ? <AlertTriangle /> : <KeyRound />}
                              </IconBadge>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-sm font-bold text-[var(--win-text)] truncate">
                                    {lic.appName}
                                  </h3>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--win-bg)] border border-[var(--win-border)] text-[var(--text-secondary)] shrink-0">
                                    {lic.catalogId}
                                  </span>
                                </div>
                                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                                  Paket: <span className="font-medium text-[var(--win-text)]">{lic.planName}</span>
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {isSuspended ? (
                                <Badge tone="danger" dot size="sm">
                                  Disuspend
                                </Badge>
                              ) : isExpired ? (
                                <Badge tone="danger" dot size="sm">
                                  Kedaluwarsa
                                </Badge>
                              ) : lic.status === 'TRIAL' ? (
                                <Badge tone="warning" dot size="sm">
                                  Trial ({lic.daysLeft}h)
                                </Badge>
                              ) : (
                                <Badge tone="success" dot size="sm">
                                  Aktif ({lic.daysLeft}h)
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Key Bar */}
                          <div className="p-2.5 rounded-lg bg-[var(--win-bg)] border border-[var(--win-border)] flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Lock size={12} className="text-[var(--text-secondary)] shrink-0" />
                              <span className="text-[11px] text-[var(--text-secondary)] shrink-0">
                                License Key:
                              </span>
                              <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                                {lic.licenseKey}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyKey(lic.licenseKey)}
                              className="p-1 text-[var(--text-secondary)] hover:text-emerald-500 rounded transition shrink-0"
                              title="Salin Key"
                            >
                              {copiedKey === lic.licenseKey ? (
                                <Check size={13} className="text-emerald-500" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>

                          {/* Meta Details */}
                          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                            <div className="space-y-0.5">
                              <span className="text-[11px] text-[var(--text-secondary)]">Tarif Langganan:</span>
                              <div className="font-semibold text-sm text-[var(--win-text)]">
                                Rp {lic.priceAmount?.toLocaleString('id-ID')}
                                <span className="text-[11px] font-normal text-[var(--text-secondary)]">
                                  {' '}
                                  / {lic.period === 'annual' ? 'tahun' : 'bulan'}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[11px] text-[var(--text-secondary)]">Masa Berlaku:</span>
                              <div className="font-medium text-xs text-[var(--win-text)]">
                                Hingga{' '}
                                {new Date(lic.expiresAt).toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </div>
                              <div className="w-full bg-[var(--win-bg)] border border-[var(--win-border)] rounded-full h-1.5 mt-1 overflow-hidden">
                                <div
                                  className={`h-full ${
                                    isExpired
                                      ? 'bg-rose-500'
                                      : lic.daysLeft < 7
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Features */}
                          <div className="space-y-1 pt-1">
                            <span className="text-[11px] text-[var(--text-secondary)]">Fitur Terkoneksi:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {lic.features && Object.keys(lic.features).length > 0 ? (
                                Object.entries(lic.features).map(([k, v]) => {
                                  const label = formatFeatureBadge(k, v)
                                  if (!label) return null
                                  return (
                                    <span
                                      key={k}
                                      className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1 font-medium"
                                    >
                                      <Check size={9} strokeWidth={2.5} />
                                      {label}
                                    </span>
                                  )
                                })
                              ) : (
                                <span className="text-[11px] text-[var(--text-secondary)]">Fitur Standar</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Actions Footer */}
                        <div className="pt-2 border-t border-[var(--win-border)] flex items-center justify-between gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleOpenRenew(lic)}
                            className="text-xs h-7 px-2.5 gap-1.5 shadow-sm"
                          >
                            <CreditCard size={12} />
                            Perpanjang
                          </Button>

                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setIntegrationLicense(lic)
                                setIntegrationModalOpen(true)
                              }}
                              className="text-xs h-7 px-2.5 gap-1"
                            >
                              <Code2 size={12} />
                              API
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenApp(lic)}
                              className="text-xs h-7 px-2.5 gap-1"
                            >
                              <ExternalLink size={12} />
                              Buka
                            </Button>
                            <IconButton
                              label={isSuspended ? 'Aktifkan Lisensi' : 'Suspend Lisensi'}
                              onClick={() => void handleToggleSuspend(lic)}
                              className={`h-7 w-7 ${
                                isSuspended
                                  ? 'text-emerald-600 hover:bg-emerald-500/10'
                                  : 'text-amber-600 hover:bg-amber-500/10'
                              }`}
                            >
                              {isSuspended ? <PlayCircle size={12} /> : <Ban size={12} />}
                            </IconButton>
                            <IconButton
                              label="Edit Lisensi"
                              onClick={() => {
                                setEditingLicense(lic)
                                setEditModalOpen(true)
                              }}
                              className="h-7 w-7"
                            >
                              <Pencil size={12} />
                            </IconButton>
                            <IconButton
                              label="Hapus Lisensi"
                              onClick={() => void handleDeleteLicense(lic)}
                              className="text-rose-500 hover:bg-rose-500/10 h-7 w-7"
                            >
                              <Trash2 size={12} />
                            </IconButton>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ListState>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col">
              <ListTable
                variant="app-licenses"
                empty={licensesLoading || licensesError || filteredLicenses.length === 0}
                columns={[
                  { label: '#' },
                  { label: 'Aplikasi & Paket' },
                  { label: 'License Key' },
                  { label: 'Tarif' },
                  { label: 'Masa Berlaku' },
                  { label: 'Fitur Terkoneksi' },
                  { label: 'Aksi', actions: true },
                ]}
              >
                <ListState
                  loading={licensesLoading}
                  error={licensesError}
                  errorTitle="Gagal memuat lisensi"
                  errorHint="Periksa koneksi database atau coba segarkan kembali."
                  loadingText="Memuat lisensi aplikasi..."
                  empty={filteredLicenses.length === 0}
                  emptyIcon={<KeyRound size={28} />}
                  emptyTitle="Belum ada lisensi aplikasi"
                  emptyHint="Pilih paket pada tab 'Paket & Tarif' untuk membuat lisensi Reneo CRM."
                >
                  {filteredLicenses.map((lic, index) => {
                    const isExpired = lic.isExpired || lic.status === 'EXPIRED'
                    return (
                      <div className="docker-row" key={lic.id}>
                        <div className="docker-row__num">{indexLabel(index)}</div>

                        <div className="docker-row__app">
                          <ListRowIcon>
                            <KeyRound className="h-3.5 w-3.5 text-[var(--panel-primary-text)]" />
                          </ListRowIcon>
                          <div className="docker-row__text">
                            <span className="docker-app-name" title={lic.appName}>
                              {lic.appName}
                            </span>
                            <span className="docker-row__sub">
                              {lic.planName} · <span className="font-mono">{lic.catalogId}</span>
                            </span>
                          </div>
                        </div>

                        <div className="docker-cell docker-cell--mono">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {lic.licenseKey}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyKey(lic.licenseKey)}
                              className="p-1 text-[var(--text-secondary)] hover:text-emerald-500 rounded transition"
                              title="Salin License Key"
                            >
                              {copiedKey === lic.licenseKey ? (
                                <Check size={12} className="text-emerald-500" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="docker-cell docker-cell--mono font-semibold">
                          Rp {lic.priceAmount?.toLocaleString('id-ID')}
                          <span className="text-[10px] font-normal text-[var(--text-secondary)]">
                            {' '}
                            / {lic.period === 'annual' ? 'thn' : 'bln'}
                          </span>
                        </div>

                        <div className="docker-cell space-y-1">
                          <div className="text-[11px] font-medium text-[var(--win-text)]">
                            {new Date(lic.expiresAt).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                          <div>
                            {lic.status === 'SUSPENDED' ? (
                              <Badge tone="danger" dot size="sm">
                                Disuspend
                              </Badge>
                            ) : isExpired ? (
                              <Badge tone="danger" dot size="sm">
                                Kedaluwarsa
                              </Badge>
                            ) : lic.status === 'TRIAL' ? (
                              <Badge tone="warning" dot size="sm">
                                Trial ({lic.daysLeft}h)
                              </Badge>
                            ) : (
                              <Badge tone="success" dot size="sm">
                                Aktif ({lic.daysLeft}h)
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="docker-cell">
                          <div className="flex flex-wrap gap-1">
                            {lic.features && Object.keys(lic.features).length > 0 ? (
                              Object.entries(lic.features).map(([k, v]) => {
                                const label = formatFeatureBadge(k, v)
                                if (!label) return null
                                return (
                                  <span
                                    key={k}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-0.5"
                                  >
                                    <Check size={9} strokeWidth={2.5} />
                                    {label}
                                  </span>
                                )
                              })
                            ) : (
                              <span className="text-[11px] text-[var(--text-secondary)]">-</span>
                            )}
                          </div>
                        </div>

                        <div className="docker-action-btns">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleOpenRenew(lic)}
                            className="text-[11px] h-7 px-2 gap-1 shadow-sm"
                          >
                            <CreditCard size={12} />
                            Perpanjang
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setIntegrationLicense(lic)
                              setIntegrationModalOpen(true)
                            }}
                            className="text-[11px] h-7 px-2 gap-1"
                          >
                            <Code2 size={12} />
                            API
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenApp(lic)}
                            className="text-[11px] h-7 px-2 gap-1"
                          >
                            <ExternalLink size={12} />
                            Buka
                          </Button>

                          <IconButton
                            label={lic.status === 'SUSPENDED' ? 'Aktifkan Lisensi' : 'Suspend Lisensi'}
                            onClick={() => void handleToggleSuspend(lic)}
                            className={`h-7 w-7 border-transparent ${
                              lic.status === 'SUSPENDED'
                                ? 'text-emerald-600 hover:bg-emerald-500/10'
                                : 'text-amber-600 hover:bg-amber-500/10'
                            }`}
                          >
                            {lic.status === 'SUSPENDED' ? <PlayCircle size={12} /> : <Ban size={12} />}
                          </IconButton>

                          <IconButton
                            label="Edit Lisensi"
                            onClick={() => {
                              setEditingLicense(lic)
                              setEditModalOpen(true)
                            }}
                            className="h-7 w-7 border-transparent"
                          >
                            <Pencil size={12} />
                          </IconButton>

                          <IconButton
                            label="Hapus Lisensi"
                            onClick={() => void handleDeleteLicense(lic)}
                            className="text-rose-500 hover:bg-rose-500/10 h-7 w-7 border-transparent"
                          >
                            <Trash2 size={12} />
                          </IconButton>
                        </div>
                      </div>
                    )
                  })}
                </ListState>
              </ListTable>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Plans & Pricing (Reneo CRM Services) */}
      {activeTab === 'plans' && (
        <div className="flex-1 flex flex-col min-h-0 p-5 space-y-3 overflow-hidden">
          {/* Subheader bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--win-text)]">
                  Paket Langganan Reneo CRM Services
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--win-bg)] border border-[var(--win-border)] text-[var(--text-secondary)]">
                  reneo-crm
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Tarif resmi lisensi untuk integrasi WAHA, bot WhatsApp, dan kapasitas kontak CRM.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <ViewModeToggle mode={viewMode} onChange={setViewMode} />
              <Button
                size="sm"
                variant="primary"
                onClick={() => setCreatePlanModalOpen(true)}
                className="gap-1.5 shadow-sm"
              >
                <Plus size={14} />
                Tambah Paket Tarif
              </Button>
            </div>
          </div>

          {/* Plans Content (Card vs List) */}
          {viewMode === 'grid' ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ListState
                loading={plansLoading}
                error={plansError}
                errorTitle="Gagal memuat paket tarif"
                errorHint="Periksa koneksi database atau coba segarkan kembali."
                loadingText="Memuat paket langganan aplikasi..."
                empty={plans.length === 0}
                emptyIcon={<Boxes size={28} />}
                emptyTitle="Belum ada paket tarif"
                emptyHint="Klik tombol 'Tambah Paket Tarif' untuk mendaftarkan tier harga baru."
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
                  {plans.map((p) => (
                    <div
                      key={p.id}
                      className={`rounded-lg border p-4 flex flex-col justify-between transition-colors bg-[var(--panel-surface)] ${
                        p.highlighted
                          ? 'border-[var(--panel-primary-text)]/50 ring-1 ring-[var(--panel-primary-text)]/20'
                          : 'border-[var(--win-border)] hover:border-[var(--panel-primary-text)]/40'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] block mb-0.5">
                              {p.period === 'annual' ? 'Paket Tahunan' : 'Paket Bulanan'}
                            </span>
                            <h4 className="text-base font-bold text-[var(--win-text)]">{p.name}</h4>
                          </div>
                          {p.highlighted && (
                            <Badge tone="primary" size="sm">
                              Paling Populer
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed min-h-[36px]">
                          {p.tagline}
                        </p>

                        <div className="pt-1">
                          <div className="text-xl font-bold text-[var(--panel-primary-text)] tabular-nums">
                            Rp {p.priceAmount.toLocaleString('id-ID')}
                            <span className="text-xs font-normal text-[var(--text-secondary)]">
                              {' '}
                              / {p.period === 'annual' ? 'tahun' : 'bulan'}
                            </span>
                          </div>
                        </div>

                        {/* Feature check-list */}
                        <div className="border-t border-[var(--win-border)] pt-3 space-y-2 text-xs">
                          {p.features && Object.keys(p.features).length > 0 ? (
                            Object.entries(p.features).map(([k, v]) => {
                              const label = formatFeatureBadge(k, v)
                              if (!label) return null
                              return (
                                <div key={k} className="flex items-center gap-2 text-[var(--win-text)]">
                                  <Check size={13} className="text-[var(--panel-primary-text)] shrink-0" strokeWidth={2.5} />
                                  <span>{label}</span>
                                </div>
                              )
                            })
                          ) : (
                            <span className="text-[11px] text-[var(--text-secondary)]">Fitur Standar</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-4 mt-3 border-t border-[var(--win-border)] flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={p.highlighted ? 'primary' : 'outline'}
                          block
                          loading={orderMutation.isPending}
                          onClick={() => handleOrderPlan(p)}
                          className="text-xs h-8 gap-1.5 flex-1"
                        >
                          <ReceiptText size={13} />
                          Pesan & Invoice
                        </Button>
                        <IconButton
                          label="Edit Paket"
                          onClick={() => {
                            setEditingPlan(p)
                            setEditPlanModalOpen(true)
                          }}
                          className="h-8 w-8"
                        >
                          <Pencil size={13} />
                        </IconButton>
                        <IconButton
                          label="Hapus Paket"
                          onClick={() => void handleDeletePlan(p)}
                          className="text-rose-500 hover:bg-rose-500/10 h-8 w-8"
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              </ListState>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col">
              <ListTable
                variant="app-plans"
                empty={plansLoading || plansError || plans.length === 0}
                columns={[
                  { label: '#' },
                  { label: 'Nama Paket' },
                  { label: 'Tarif' },
                  { label: 'Durasi' },
                  { label: 'Fitur & Kuota' },
                  { label: 'Status' },
                  { label: 'Aksi', actions: true },
                ]}
              >
                <ListState
                  loading={plansLoading}
                  error={plansError}
                  errorTitle="Gagal memuat paket tarif"
                  errorHint="Periksa koneksi database atau coba segarkan kembali."
                  loadingText="Memuat paket langganan aplikasi..."
                  empty={plans.length === 0}
                  emptyIcon={<Boxes size={28} />}
                  emptyTitle="Belum ada paket tarif"
                  emptyHint="Klik tombol 'Tambah Paket Tarif' untuk mendaftarkan tier harga baru."
                >
                  {plans.map((p, index) => (
                    <div className="docker-row" key={p.id}>
                      <div className="docker-row__num">{indexLabel(index)}</div>

                      <div className="docker-row__app">
                        <ListRowIcon>
                          <Boxes className="h-3.5 w-3.5 text-emerald-500" />
                        </ListRowIcon>
                        <div className="docker-row__text">
                          <span className="docker-app-name" title={p.name}>
                            {p.name}
                            {p.highlighted && (
                              <span className="ml-1.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">
                                Paling Populer
                              </span>
                            )}
                          </span>
                          <span className="docker-row__sub" title={p.tagline}>
                            {p.tagline || p.slug}
                          </span>
                        </div>
                      </div>

                      <div className="docker-cell docker-cell--mono font-semibold">
                        Rp {p.priceAmount.toLocaleString('id-ID')}
                        <span className="text-[10px] font-normal text-[var(--text-secondary)]">
                          {' '}
                          / {p.period === 'annual' ? 'thn' : 'bln'}
                        </span>
                      </div>

                      <div className="docker-cell text-xs">
                        {p.period === 'annual' ? '12 Bulan (Tahunan)' : `${p.months || 1} Bulan`}
                      </div>

                      <div className="docker-cell">
                        <div className="flex flex-wrap gap-1">
                          {p.features && Object.keys(p.features).length > 0 ? (
                            Object.entries(p.features).map(([k, v]) => {
                              const label = formatFeatureBadge(k, v)
                              if (!label) return null
                              return (
                                <span
                                  key={k}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--win-bg)] border border-[var(--win-border)] text-[var(--win-text)] inline-flex items-center gap-0.5"
                                >
                                  <Check size={9} className="text-emerald-500" strokeWidth={2.5} />
                                  {label}
                                </span>
                              )
                            })
                          ) : (
                            <span className="text-[11px] text-[var(--text-secondary)]">Fitur Standar</span>
                          )}
                        </div>
                      </div>

                      <div className="docker-cell--keep">
                        <Badge tone="success" dot size="sm">
                          Tersedia
                        </Badge>
                      </div>

                      <div className="docker-action-btns">
                        <Button
                          size="sm"
                          variant={p.highlighted ? 'primary' : 'outline'}
                          loading={orderMutation.isPending}
                          onClick={() => handleOrderPlan(p)}
                          className="text-[11px] h-7 px-2.5 gap-1"
                        >
                          <ReceiptText size={12} />
                          Pesan & Invoice
                        </Button>
                        <IconButton
                          label="Edit Paket"
                          onClick={() => {
                            setEditingPlan(p)
                            setEditPlanModalOpen(true)
                          }}
                          className="h-7 w-7 border-transparent"
                        >
                          <Pencil size={12} />
                        </IconButton>
                        <IconButton
                          label="Hapus Paket"
                          onClick={() => void handleDeletePlan(p)}
                          className="text-rose-500 hover:bg-rose-500/10 h-7 w-7 border-transparent"
                        >
                          <Trash2 size={12} />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </ListState>
              </ListTable>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Riwayat Invoice */}
      {activeTab === 'invoices' && (
        <div className="flex-1 flex flex-col min-h-0 p-5 space-y-3 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div>
              <h3 className="text-sm font-semibold text-[var(--win-text)]">
                Daftar Tagihan & Invoice Lisensi
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Semua invoice pesanan lisensi aplikasi yang diterbitkan untuk akun ini.
              </p>
            </div>

            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          </div>

          {/* Invoices Content (Card vs List) */}
          {viewMode === 'grid' ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ListState
                loading={ordersLoading}
                error={ordersError}
                errorTitle="Gagal memuat invoice"
                errorHint="Periksa koneksi database atau coba segarkan kembali."
                loadingText="Memuat riwayat invoice..."
                empty={orders.length === 0}
                emptyIcon={<ReceiptText size={28} />}
                emptyTitle="Belum ada invoice yang diterbitkan"
                emptyHint="Pilih paket pada tab 'Paket & Tarif' untuk menerbitkan pesanan pertama."
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pb-4">
                  {orders.map((ord) => {
                    const isPaid = ord.status === 'paid'
                    const isCancelled = ord.status === 'cancelled'
                    const isPending = ord.status === 'pending'
                    return (
                      <div
                        key={ord.id}
                        className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] hover:border-[var(--panel-primary-text)]/40 transition p-4 flex flex-col justify-between gap-3 shadow-sm"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-mono text-xs font-bold text-[var(--win-text)] block">
                                {ord.invoiceNumber}
                              </span>
                              <span className="text-[11px] text-[var(--text-secondary)]">
                                {ord.buyerName || 'Pelanggan'} · {ord.paymentMethod?.toUpperCase()}
                              </span>
                            </div>
                            {isPaid ? (
                              <Badge tone="success" dot size="sm">
                                Lunas
                              </Badge>
                            ) : isCancelled ? (
                              <Badge tone="neutral" dot size="sm">
                                Dibatalkan
                              </Badge>
                            ) : (
                              <Badge tone="warning" dot size="sm">
                                Menunggu Bayar
                              </Badge>
                            )}
                          </div>

                          <div className="text-xs text-[var(--win-text)]">
                            <span className="font-semibold">{ord.appName}</span> - {ord.planName} ({ord.months} Bulan)
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] text-[var(--text-secondary)]">Total Tagihan:</span>
                            <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                              Rp {ord.amountTotal.toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[var(--win-border)] flex items-center justify-between gap-2">
                          <span className="text-[10px] text-[var(--text-secondary)]">
                            {new Date(ord.createdAt).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isPending && (
                              <>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => {
                                    setSelectedOrder(ord)
                                    setInvoiceModalOpen(true)
                                  }}
                                  className="text-xs h-7 px-2 gap-1"
                                >
                                  <CreditCard size={12} />
                                  Bayar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleCancelOrder(ord)}
                                  className="text-xs h-7 px-2 gap-1 text-rose-500 hover:bg-rose-500/10"
                                >
                                  <XCircle size={12} />
                                  Batalkan
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedOrder(ord)
                                setInvoiceModalOpen(true)
                              }}
                              className="text-xs h-7 px-2 gap-1"
                            >
                              <FileText size={12} />
                              Invoice
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ListState>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] flex flex-col">
              <ListTable
                variant="app-orders"
                empty={ordersLoading || ordersError || orders.length === 0}
                columns={[
                  { label: '#' },
                  { label: 'Nomor Invoice' },
                  { label: 'Paket Aplikasi' },
                  { label: 'Total Tagihan' },
                  { label: 'Status' },
                  { label: 'Waktu Terbit' },
                  { label: 'Aksi', actions: true },
                ]}
              >
                <ListState
                  loading={ordersLoading}
                  error={ordersError}
                  errorTitle="Gagal memuat invoice"
                  errorHint="Periksa koneksi database atau coba segarkan kembali."
                  loadingText="Memuat riwayat invoice..."
                  empty={orders.length === 0}
                  emptyIcon={<ReceiptText size={28} />}
                  emptyTitle="Belum ada invoice yang diterbitkan"
                  emptyHint="Pilih paket pada tab 'Paket & Tarif' untuk menerbitkan pesanan pertama."
                >
                  {orders.map((ord, index) => {
                    const isPaid = ord.status === 'paid'
                    const isCancelled = ord.status === 'cancelled'
                    const isPending = ord.status === 'pending'
                    return (
                      <div className="docker-row" key={ord.id}>
                        <div className="docker-row__num">{indexLabel(index)}</div>

                        <div className="docker-row__app">
                          <ListRowIcon>
                            <ReceiptText className="h-3.5 w-3.5 text-emerald-500" />
                          </ListRowIcon>
                          <div className="docker-row__text">
                            <span className="docker-app-name docker-app-name--mono">
                              {ord.invoiceNumber}
                            </span>
                            <span className="docker-row__sub">
                              {ord.buyerName || 'Pelanggan'} · {ord.paymentMethod?.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <div className="docker-cell text-xs">
                          <span className="font-medium text-[var(--win-text)]">{ord.planName}</span>
                          <span className="text-[11px] text-[var(--text-secondary)] block">
                            ({ord.months} Bulan)
                          </span>
                        </div>

                        <div className="docker-cell docker-cell--mono font-semibold text-emerald-600 dark:text-emerald-400">
                          Rp {ord.amountTotal.toLocaleString('id-ID')}
                        </div>

                        <div className="docker-cell--keep">
                          {isPaid ? (
                            <Badge tone="success" dot size="sm">
                              Lunas
                            </Badge>
                          ) : isCancelled ? (
                            <Badge tone="neutral" dot size="sm">
                              Dibatalkan
                            </Badge>
                          ) : (
                            <Badge tone="warning" dot size="sm">
                              Menunggu Bayar
                            </Badge>
                          )}
                        </div>

                        <div className="docker-cell text-[11px] text-[var(--text-secondary)]">
                          {new Date(ord.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>

                        <div className="docker-action-btns">
                          {isPending && (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => {
                                  setSelectedOrder(ord)
                                  setInvoiceModalOpen(true)
                                }}
                                className="text-[11px] h-7 px-2 gap-1"
                              >
                                <CreditCard size={12} />
                                Bayar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleCancelOrder(ord)}
                                className="text-[11px] h-7 px-2 gap-1 text-rose-500 hover:bg-rose-500/10"
                              >
                                <XCircle size={12} />
                                Batalkan
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedOrder(ord)
                              setInvoiceModalOpen(true)
                            }}
                            className="text-[11px] h-7 px-2 gap-1"
                          >
                            <FileText size={12} />
                            Invoice
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </ListState>
              </ListTable>
            </div>
          )}
        </div>
      )}

      {/* Invoice Details & Payment Modal */}
      {invoiceModalOpen && selectedOrder && (
        <Modal
          open={invoiceModalOpen}
          onClose={() => setInvoiceModalOpen(false)}
          title={`Invoice ${selectedOrder.invoiceNumber}`}
          subtitle={`${selectedOrder.appName} · ${selectedOrder.planName}`}
          icon={<ReceiptText className="text-emerald-500" size={20} />}
          size="md"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-xs">
                <span className="text-[var(--text-secondary)]">Total Tagihan:</span>
                <span className="block font-bold text-base text-emerald-600 dark:text-emerald-400">
                  Rp {selectedOrder.amountTotal.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1">
                  <Printer size={13} />
                  Cetak
                </Button>
                {selectedOrder.status === 'pending' ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      loading={cancelOrderMutation.isPending}
                      onClick={() => void handleCancelOrder(selectedOrder)}
                      className="gap-1 text-rose-500 hover:bg-rose-500/10"
                    >
                      <XCircle size={13} />
                      Batalkan
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={payMutation.isPending}
                      onClick={() => {
                        payMutation.mutate({
                          publicId: selectedOrder.publicId,
                          method: selectedOrder.paymentMethod || 'transfer',
                        })
                      }}
                      className="gap-1.5"
                    >
                      <CheckCircle2 size={14} />
                      Konfirmasi Lunas
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setInvoiceModalOpen(false)}>
                    Tutup
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            {/* Status Banner */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between ${
                selectedOrder.status === 'paid'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                  : selectedOrder.status === 'cancelled'
                    ? 'bg-[var(--win-bg)] border-[var(--win-border)] text-[var(--text-secondary)]'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {selectedOrder.status === 'paid' ? (
                  <CheckCircle2 size={18} />
                ) : selectedOrder.status === 'cancelled' ? (
                  <XCircle size={18} />
                ) : (
                  <AlertTriangle size={18} />
                )}
                <div>
                  <span className="font-bold block">
                    {selectedOrder.status === 'paid'
                      ? 'Lunas (Telah Dibayar)'
                      : selectedOrder.status === 'cancelled'
                        ? 'Invoice Dibatalkan'
                        : 'Menunggu Pembayaran'}
                  </span>
                  <span className="text-[11px] opacity-80">
                    {selectedOrder.status === 'paid'
                      ? `Lisensi telah aktif sejak ${new Date(
                          selectedOrder.paidAt || selectedOrder.createdAt
                        ).toLocaleDateString('id-ID')}`
                      : selectedOrder.status === 'cancelled'
                        ? 'Pesanan ini telah dibatalkan dan tidak perlu dibayar.'
                        : `Batas waktu pembayaran: ${new Date(
                            selectedOrder.expiresAt
                          ).toLocaleDateString('id-ID')}`}
                  </span>
                </div>
              </div>
              <span className="font-mono text-xs font-bold">{selectedOrder.invoiceNumber}</span>
            </div>

            {/* Rincian Tagihan */}
            <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)] space-y-2.5">
              <h5 className="font-bold text-[var(--win-text)]">Rincian Pembelian:</h5>
              <div className="flex items-center justify-between text-[var(--win-text)]">
                <span>
                  {selectedOrder.appName} - {selectedOrder.planName} ({selectedOrder.months} Bulan)
                </span>
                <span className="font-semibold">
                  Rp {selectedOrder.amountList.toLocaleString('id-ID')}
                </span>
              </div>
              {selectedOrder.uniqueCode > 0 && (
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Kode Unik Pembayaran:</span>
                  <span className="font-mono">Rp {selectedOrder.uniqueCode}</span>
                </div>
              )}
              <div className="h-px bg-[var(--win-border)]" />
              <div className="flex items-center justify-between font-bold text-sm text-[var(--win-text)]">
                <span>Total Jumlah Bayar:</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  Rp {selectedOrder.amountTotal.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Metode Pembayaran Bank / QRIS */}
            {selectedOrder.status === 'pending' && (
              <div className="p-3.5 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)] space-y-2">
                <h5 className="font-bold text-[var(--win-text)] flex items-center gap-1.5">
                  <CreditCard size={14} className="text-emerald-500" />
                  Tujuan Pembayaran (Otomatis Terverifikasi):
                </h5>
                <div className="space-y-1.5 text-[11px]">
                  <div className="p-2 rounded-lg bg-[var(--panel-surface)] border border-[var(--win-border)]">
                    <span className="font-bold text-[var(--win-text)] block">BCA (Bank Central Asia)</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      8831-2940-11
                    </span>{' '}
                    · a/n Reneo Payments
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--panel-surface)] border border-[var(--win-border)]">
                    <span className="font-bold text-[var(--win-text)] block">
                      QRIS Instan Semua Bank & E-Wallet
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      Scan QRIS melalui Reneo Panel Gateway
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Renew Modal */}
      {renewModalOpen && selectedLicense && (
        <Modal
          open={renewModalOpen}
          onClose={() => setRenewModalOpen(false)}
          title={`Perpanjang Lisensi ${selectedLicense.appName}`}
          subtitle="Pilih durasi paket langganan dan metode pembayaran untuk memperpanjang masa aktif."
          icon={<KeyRound className="text-[var(--panel-primary-text)]" size={20} />}
          size="md"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-xs">
                <span className="text-[var(--text-secondary)]">Total Pembayaran:</span>
                <span className="block font-bold text-base text-[var(--panel-primary-text)] tabular-nums">
                  Rp {selectedPricing.price.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRenewModalOpen(false)}
                  disabled={renewMutation.isPending}
                >
                  Batal
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={renewMutation.isPending}
                  onClick={() => {
                    renewMutation.mutate({
                      catalogId: selectedLicense.catalogId,
                      months: selectedPricing.months,
                      planName:
                        selectedPricing.months === 12
                          ? 'Tahunan (Enterprise)'
                          : 'Bulanan (Pro)',
                      period: selectedPricing.period,
                      priceAmount: selectedPricing.price,
                      paymentMethod,
                    })
                  }}
                  className="gap-1.5"
                >
                  <CheckCircle2 size={14} />
                  Konfirmasi & Bayar
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-[var(--win-text)] mb-2">
                Pilih Periode Langganan:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {pricingOptions.map((opt) => {
                  const isSelected = months === opt.months
                  return (
                    <button
                      key={opt.months}
                      type="button"
                      onClick={() => setMonths(opt.months)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500'
                          : 'border-[var(--win-border)] bg-[var(--win-bg)] hover:border-emerald-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[var(--win-text)]">{opt.label}</span>
                        {opt.savings && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500 text-white">
                            {opt.savings}
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-sm text-emerald-600 dark:text-emerald-400 mt-2">
                        Rp {opt.price.toLocaleString('id-ID')}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">{opt.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="p-3 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)] space-y-2">
              <div className="text-[11px] text-[var(--text-secondary)]">
                Invoice akan diterbitkan menggunakan metode pembayaran aktif dari Pengaturan Situs Reneo (sama seperti pesanan Hosting).
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Aplikasi:</span>
                <span className="font-semibold text-[var(--win-text)]">{selectedLicense.appName}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Masa Aktif Baru:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  s/d {calculatedNewExpiry}
                </span>
              </div>
            </div>
          </div>
        </Modal>
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
