import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Calendar,
  CreditCard,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Search,
  CheckCircle2,
  Lock,
  Wallet,
  Building,
  ReceiptText,
  Boxes,
  FileText,
  Printer,
  Plus,
  Code2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchAppLicenses,
  renewAppLicense,
  fetchAppLicensePlans,
  fetchAppLicenseOrders,
  createAppLicenseOrder,
  payAppLicenseOrder,
  fetchAvailableApps,
  deleteAppLicense,
  deleteAppLicensePlan,
  type AppLicense,
  type AppLicensePlan,
  type AppLicenseOrder,
} from '@/api/appLicenses'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, LoadingState } from '@/components/ui/states'
import { useAppCatalog } from '@/hooks/useAppCatalog'
import { useWindowStore } from '@/store/windowStore'
import { useI18n } from '@/lib/i18n'
import { CreateLicenseModal } from './app-licenses/CreateLicenseModal'
import { CreatePlanModal } from './app-licenses/CreatePlanModal'
import { LicenseIntegrationModal } from './app-licenses/LicenseIntegrationModal'

type LicenseTab = 'licenses' | 'plans' | 'invoices'

export function AppLicensesWindow() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const openWindow = useWindowStore((s) => s.openWindow)
  const { data: catalogData } = useAppCatalog()

  const [activeTab, setActiveTab] = useState<LicenseTab>('licenses')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED'>('ALL')
  const [selectedAppFilter, setSelectedAppFilter] = useState<string>('ALL')
  const [selectedPlansApp, setSelectedPlansApp] = useState<string>('reneo-crm')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Modals
  const [createLicenseModalOpen, setCreateLicenseModalOpen] = useState(false)
  const [createPlanModalOpen, setCreatePlanModalOpen] = useState(false)
  const [integrationModalOpen, setIntegrationModalOpen] = useState(false)
  const [integrationLicense, setIntegrationLicense] = useState<AppLicense | null>(null)

  const [renewModalOpen, setRenewModalOpen] = useState(false)
  const [selectedLicense, setSelectedLicense] = useState<AppLicense | null>(null)
  const [months, setMonths] = useState<number>(1)
  const [paymentMethod, setPaymentMethod] = useState<'saldo' | 'qris' | 'va'>('saldo')

  // Invoice & Order modal
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<AppLicenseOrder | null>(null)

  // Queries
  const {
    data: licenses = [],
    isLoading: licensesLoading,
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
    refetch: refetchPlans,
  } = useQuery({
    queryKey: ['app-license-plans', selectedPlansApp],
    queryFn: () => fetchAppLicensePlans(selectedPlansApp),
    staleTime: 60_000,
  })

  const {
    data: orders = [],
    isLoading: ordersLoading,
    refetch: refetchOrders,
  } = useQuery({
    queryKey: ['app-license-orders'],
    queryFn: () => fetchAppLicenseOrders(),
    staleTime: 15_000,
  })

  // Mutations
  const deleteLicenseMutation = useMutation({
    mutationFn: deleteAppLicense,
    onSuccess: () => {
      toast.success('Lisensi berhasil dihapus.')
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
      toast.success('Invoice baru berhasil diterbitkan!')
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

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    toast.success('License key berhasil disalin ke papan klip!')
    setTimeout(() => setCopiedKey(null), 2500)
  }

  const handleOpenRenew = (lic: AppLicense) => {
    setSelectedLicense(lic)
    setMonths(1)
    setPaymentMethod('saldo')
    setRenewModalOpen(true)
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
      if (selectedAppFilter !== 'ALL' && lic.catalogId !== selectedAppFilter) return false
      if (statusFilter === 'ACTIVE' && (lic.isExpired || lic.status === 'EXPIRED')) return false
      if (statusFilter === 'EXPIRED' && !lic.isExpired && lic.status !== 'EXPIRED') return false
      if (!q) return true
      return (
        lic.appName.toLowerCase().includes(q) ||
        lic.catalogId.toLowerCase().includes(q) ||
        lic.licenseKey.toLowerCase().includes(q) ||
        lic.planName.toLowerCase().includes(q)
      )
    })
  }, [licenses, search, statusFilter, selectedAppFilter])

  const activeCount = useMemo(
    () => licenses.filter((l) => !l.isExpired && l.status !== 'EXPIRED').length,
    [licenses]
  )
  const expiredCount = useMemo(
    () => licenses.filter((l) => l.isExpired || l.status === 'EXPIRED').length,
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[var(--win-border)] bg-[var(--card-bg)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold leading-none">Pusat Lisensi & Tagihan Aplikasi</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {activeCount} Aktif
              </span>
              {pendingOrdersCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse">
                  {pendingOrdersCount} Invoice Belum Dibayar
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Atur harga lisensi paket dari Reneo, terbitkan invoice pemesanan, dan kelola pembayaran otomatis.
            </p>
          </div>
        </div>

        {/* Tab switcher buttons */}
        <div className="flex items-center gap-1.5 bg-[var(--win-bg)] border border-[var(--win-border)] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('licenses')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'licenses'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
            }`}
          >
            <Shield size={14} />
            <span>Lisensi Aktif</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('plans')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'plans'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
            }`}
          >
            <Boxes size={14} />
            <span>Paket & Tarif ({plans.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('invoices')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'invoices'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
            }`}
          >
            <ReceiptText size={14} />
            <span>Riwayat Invoice ({orders.length})</span>
          </button>
        </div>

        {/* Refresh button */}
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

      {/* Tab 1: Licenses */}
      {activeTab === 'licenses' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Subheader Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                  size={14}
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari lisensi aplikasi..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] focus:outline-none focus:border-emerald-500 w-44 sm:w-56 transition"
                />
              </div>

              {/* App selector filter */}
              <select
                value={selectedAppFilter}
                onChange={(e) => setSelectedAppFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 transition"
              >
                <option value="ALL">Semua Aplikasi ({licenses.length})</option>
                {availableApps.map((a) => (
                  <option key={a.catalogId} value={a.catalogId}>
                    {a.name} ({a.catalogId})
                  </option>
                ))}
              </select>

              <div className="flex items-center bg-[var(--card-bg)] border border-[var(--win-border)] rounded-lg p-0.5 text-xs">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    statusFilter === 'ALL'
                      ? 'bg-[var(--win-bg)] font-semibold text-[var(--win-text)] shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                  }`}
                >
                  Semua ({licenses.length})
                </button>
                <button
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    statusFilter === 'ACTIVE'
                      ? 'bg-[var(--win-bg)] font-semibold text-emerald-600 shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-emerald-600'
                  }`}
                >
                  Aktif ({activeCount})
                </button>
                <button
                  onClick={() => setStatusFilter('EXPIRED')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    statusFilter === 'EXPIRED'
                      ? 'bg-[var(--win-bg)] font-semibold text-rose-600 shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-rose-600'
                  }`}
                >
                  Kedaluwarsa ({expiredCount})
                </button>
              </div>
            </div>

            <Button
              size="sm"
              variant="primary"
              onClick={() => setCreateLicenseModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs gap-1.5 shadow-sm"
            >
              <Plus size={14} />
              Buat Lisensi Baru
            </Button>
          </div>

          {/* Licenses List */}
          {licensesLoading ? (
            <div className="py-16">
              <LoadingState>Memuat lisensi aplikasi...</LoadingState>
            </div>
          ) : filteredLicenses.length === 0 ? (
            <div className="py-16">
              <EmptyState>
                <div className="flex flex-col items-center gap-2">
                  <Shield size={36} className="text-[var(--text-secondary)] opacity-60" />
                  <span className="font-semibold text-sm">Tidak ada lisensi aplikasi ditemukan</span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    Pilih paket pada tab "Paket & Tarif" untuk menerbitkan lisensi baru.
                  </span>
                  <Button size="sm" variant="primary" className="mt-2" onClick={() => setActiveTab('plans')}>
                    Lihat Paket Lisensi
                  </Button>
                </div>
              </EmptyState>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredLicenses.map((lic) => {
                const isExpired = lic.isExpired || lic.status === 'EXPIRED'
                const progressPct = Math.min(100, Math.max(0, (lic.daysLeft / 30) * 100))

                return (
                  <div
                    key={lic.id}
                    className={`rounded-2xl border p-5 transition-all shadow-sm ${
                      isExpired
                        ? 'border-rose-500/30 bg-rose-500/5'
                        : 'border-[var(--win-border)] bg-[var(--card-bg)] hover:border-emerald-500/40'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* App identity */}
                      <div className="flex items-start gap-4">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                            isExpired
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                          }`}
                        >
                          {isExpired ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />}
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-[var(--win-text)]">{lic.appName}</h3>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--win-bg)] border border-[var(--win-border)] text-[var(--text-secondary)]">
                              {lic.catalogId}
                            </span>

                            {isExpired ? (
                              <Badge tone="danger" dot size="sm">
                                Kedaluwarsa
                              </Badge>
                            ) : lic.status === 'TRIAL' ? (
                              <Badge tone="warning" dot size="sm">
                                Trial ({lic.daysLeft} hari lagi)
                              </Badge>
                            ) : (
                              <Badge tone="success" dot size="sm">
                                Aktif ({lic.daysLeft} hari lagi)
                              </Badge>
                            )}

                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              {lic.planName}
                            </span>
                          </div>

                          {/* Key */}
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                              <Lock size={12} /> License Key:
                            </span>
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[var(--win-bg)] border border-[var(--win-border)] text-emerald-600 dark:text-emerald-400">
                              {lic.licenseKey}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyKey(lic.licenseKey)}
                              className="p-1 text-[var(--text-secondary)] hover:text-emerald-500 rounded transition"
                              title="Salin License Key"
                            >
                              {copiedKey === lic.licenseKey ? (
                                <Check size={14} className="text-emerald-500" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2 lg:self-center">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleOpenRenew(lic)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs gap-1.5 shadow-sm"
                        >
                          <CreditCard size={14} />
                          Perpanjang Lisensi
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIntegrationLicense(lic)
                            setIntegrationModalOpen(true)
                          }}
                          className="text-xs gap-1.5"
                        >
                          <Code2 size={14} />
                          Integrasi API
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenApp(lic)}
                          className="text-xs gap-1.5"
                        >
                          <ExternalLink size={14} />
                          Buka Aplikasi
                        </Button>

                        <IconButton
                          label="Hapus Lisensi"
                          onClick={() => {
                            if (window.confirm(`Hapus lisensi ${lic.appName} (${lic.licenseKey})?`)) {
                              deleteLicenseMutation.mutate(lic.id)
                            }
                          }}
                          className="text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </div>

                    <div className="h-px bg-[var(--win-border)] my-4" />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="space-y-1">
                        <span className="text-[var(--text-secondary)]">Tarif Langganan:</span>
                        <div className="font-semibold text-sm text-[var(--win-text)]">
                          Rp {lic.priceAmount?.toLocaleString('id-ID')}
                          <span className="text-xs font-normal text-[var(--text-secondary)]">
                            {' '}
                            / {lic.period === 'annual' ? 'tahun' : 'bulan'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          Dikelola & ditagihkan melalui Reneo Panel
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[var(--text-secondary)] flex items-center gap-1">
                          <Calendar size={12} /> Masa Berlaku:
                        </span>
                        <div className="font-medium text-[var(--win-text)]">
                          Hingga{' '}
                          {new Date(lic.expiresAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="w-full bg-[var(--win-bg)] border border-[var(--win-border)] rounded-full h-2 mt-1.5 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
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

                      <div className="space-y-1">
                        <span className="text-[var(--text-secondary)]">Fitur Terkoneksi:</span>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {lic.features && Object.keys(lic.features).length > 0 ? (
                            Object.entries(lic.features).map(([k, v]) => {
                              if (v === false || v === null || v === undefined) return null
                              const label =
                                k === 'broadcast' || k === 'unlimitedBroadcast'
                                  ? 'Broadcast WA'
                                  : k === 'apiAccess'
                                  ? 'Akses API'
                                  : k === 'multiUser'
                                  ? 'Multi-User'
                                  : k === 'fullModules'
                                  ? 'Semua Modul'
                                  : k === 'liveChat'
                                  ? 'Live Chat CRM'
                                  : k === 'botBirthday'
                                  ? 'Bot Ultah'
                                  : k === 'maxContacts'
                                  ? `${Number(v).toLocaleString('id-ID')} Kontak`
                                  : `${k}: ${String(v)}`
                              return (
                                <span
                                  key={k}
                                  className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1"
                                >
                                  <Check size={10} strokeWidth={2.5} />
                                  {label}
                                </span>
                              )
                            })
                          ) : (
                            <>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                                <Check size={10} strokeWidth={2.5} />
                                WA Broadcast Pacing
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                                <Check size={10} strokeWidth={2.5} />
                                Bot Ulang Tahun
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                                <Check size={10} strokeWidth={2.5} />
                                Live Chat CRM
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 inline-flex items-center gap-1">
                                <Check size={10} strokeWidth={2.5} />
                                10.000 Kontak
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Plans & Pricing (Diatur dari Reneo) */}
      {activeTab === 'plans' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-transparent flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                <Boxes size={20} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[var(--win-text)]">
                  Paket & Tarif Lisensi Aplikasi Terpusat
                </h4>
                <p className="text-xs text-[var(--text-secondary)]">
                  Kelola paket langganan untuk aplikasi katalog, proyek kustom, atau server. Pesanan menerbitkan invoice resmi dan dapat dibayar langsung di sini.
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="primary"
              onClick={() => setCreatePlanModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs gap-1.5 shadow-sm"
            >
              <Plus size={14} />
              Tambah Paket Tarif
            </Button>
          </div>

          {/* App Switcher for Plans */}
          <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-[var(--win-border)]">
            <span className="text-xs font-semibold text-[var(--win-text)] mr-1">Pilih Aplikasi:</span>
            {availableApps.map((a) => {
              const isSelected = selectedPlansApp === a.catalogId
              return (
                <button
                  key={a.catalogId}
                  type="button"
                  onClick={() => setSelectedPlansApp(a.catalogId)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-[var(--card-bg)] border border-[var(--win-border)] text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                  }`}
                >
                  {a.name} ({a.catalogId})
                </button>
              )
            })}
          </div>

          {plansLoading ? (
            <div className="py-16">
              <LoadingState>Memuat paket langganan aplikasi...</LoadingState>
            </div>
          ) : plans.length === 0 ? (
            <div className="py-16">
              <EmptyState>
                <div className="flex flex-col items-center gap-2">
                  <Boxes size={36} className="text-[var(--text-secondary)] opacity-60" />
                  <span className="font-semibold text-sm">Belum ada paket tarif untuk aplikasi ini</span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    Klik tombol "Tambah Paket Tarif" untuk membuat tier harga baru.
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => setCreatePlanModalOpen(true)}
                  >
                    Tambah Paket Tarif
                  </Button>
                </div>
              </EmptyState>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-5 flex flex-col justify-between transition-all bg-[var(--card-bg)] ${
                    p.highlighted
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md'
                      : 'border-[var(--win-border)] hover:border-emerald-500/40'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        {p.period === 'annual' ? 'Paket Tahunan' : 'Paket Bulanan'}
                      </span>
                      {p.highlighted && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                          Paling Populer
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-[var(--win-text)]">{p.name}</h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{p.tagline}</p>

                    <div className="pt-2">
                      <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                        Rp {p.priceAmount.toLocaleString('id-ID')}
                        <span className="text-xs font-normal text-[var(--text-secondary)]">
                          {' '}
                          / {p.period === 'annual' ? 'tahun' : 'bulan'}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-[var(--win-border)] pt-3 space-y-2 text-xs">
                      {p.features?.maxContacts && (
                        <div className="flex items-center gap-2 text-[var(--win-text)]">
                          <Check size={14} className="text-emerald-500 shrink-0" />
                          <span>Kapasitas Kontak: {Number(p.features.maxContacts).toLocaleString('id-ID')} Kontak</span>
                        </div>
                      )}
                      {p.features?.unlimitedBroadcast !== undefined && (
                        <div className="flex items-center gap-2 text-[var(--win-text)]">
                          <Check size={14} className="text-emerald-500 shrink-0" />
                          <span>
                            {p.features.unlimitedBroadcast ? 'Broadcast WA Tanpa Batas' : 'Broadcast WA Terjadwal'}
                          </span>
                        </div>
                      )}
                      {p.features?.botBirthday && (
                        <div className="flex items-center gap-2 text-[var(--win-text)]">
                          <Check size={14} className="text-emerald-500 shrink-0" />
                          <span>Bot Ucapan Ulang Tahun Otomatis</span>
                        </div>
                      )}
                      {p.features?.liveChat && (
                        <div className="flex items-center gap-2 text-[var(--win-text)]">
                          <Check size={14} className="text-emerald-500 shrink-0" />
                          <span>Live Chat & Conversation CRM Inbox</span>
                        </div>
                      )}
                      {p.features &&
                        Object.entries(p.features)
                          .filter(
                            ([k]) =>
                              !['maxContacts', 'unlimitedBroadcast', 'botBirthday', 'liveChat'].includes(k)
                          )
                          .map(([k, v]) => {
                            if (!v) return null
                            return (
                              <div key={k} className="flex items-center gap-2 text-[var(--win-text)]">
                                <Check size={14} className="text-emerald-500 shrink-0" />
                                <span>{String(v === true ? k : `${k}: ${v}`)}</span>
                              </div>
                            )
                          })}
                    </div>
                  </div>

                  <div className="pt-5 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={p.highlighted ? 'primary' : 'outline'}
                      block
                      loading={orderMutation.isPending}
                      onClick={() => handleOrderPlan(p)}
                      className={`text-xs gap-1.5 flex-1 ${
                        p.highlighted ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
                      }`}
                    >
                      <ReceiptText size={14} />
                      Terbitkan Invoice & Langganan
                    </Button>
                    <IconButton
                      label="Hapus Paket"
                      onClick={() => {
                        if (window.confirm(`Hapus paket "${p.name}"?`)) {
                          deletePlanMutation.mutate(p.id)
                        }
                      }}
                      className="text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Riwayat Invoice & Pembayaran */}
      {activeTab === 'invoices' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--win-text)]">Daftar Tagihan & Invoice Lisensi</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Semua invoice pesanan lisensi aplikasi yang diterbitkan untuk akun ini.
              </p>
            </div>
          </div>

          {ordersLoading ? (
            <div className="py-16">
              <LoadingState>Memuat riwayat invoice...</LoadingState>
            </div>
          ) : orders.length === 0 ? (
            <div className="py-16">
              <EmptyState>
                <div className="flex flex-col items-center gap-2">
                  <ReceiptText size={36} className="text-[var(--text-secondary)] opacity-60" />
                  <span className="font-semibold text-sm">Belum ada invoice yang diterbitkan</span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    Pilih paket pada tab "Paket & Tarif" untuk menerbitkan invoice pesanan pertama Anda.
                  </span>
                  <Button size="sm" variant="primary" className="mt-2" onClick={() => setActiveTab('plans')}>
                    Buka Paket Lisensi
                  </Button>
                </div>
              </EmptyState>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((ord) => {
                const isPaid = ord.status === 'paid'
                return (
                  <div
                    key={ord.id}
                    className="p-4 rounded-xl border border-[var(--win-border)] bg-[var(--card-bg)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-emerald-500/40"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                          isPaid
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-600'
                        }`}
                      >
                        <ReceiptText size={20} />
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[var(--win-text)]">
                            {ord.invoiceNumber}
                          </span>
                          {isPaid ? (
                            <Badge tone="success" dot size="sm">
                              Lunas
                            </Badge>
                          ) : (
                            <Badge tone="warning" dot size="sm">
                              Menunggu Pembayaran
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          {ord.appName} · {ord.planName} ({ord.months} Bulan)
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          Diterbitkan:{' '}
                          {new Date(ord.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[11px] text-[var(--text-secondary)] block">Total Tagihan:</span>
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          Rp {ord.amountTotal.toLocaleString('id-ID')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isPaid && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setSelectedOrder(ord)
                              setInvoiceModalOpen(true)
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                          >
                            <CreditCard size={13} />
                            Bayar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedOrder(ord)
                            setInvoiceModalOpen(true)
                          }}
                          className="text-xs gap-1"
                        >
                          <FileText size={13} />
                          Lihat Invoice
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
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
                  <Button
                    variant="primary"
                    size="sm"
                    loading={payMutation.isPending}
                    onClick={() => {
                      payMutation.mutate({
                        publicId: selectedOrder.publicId,
                        method: 'saldo',
                      })
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    <CheckCircle2 size={14} />
                    Bayar Sekarang (Saldo Reneo)
                  </Button>
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
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {selectedOrder.status === 'paid' ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <AlertTriangle size={18} />
                )}
                <div>
                  <span className="font-bold block">
                    {selectedOrder.status === 'paid'
                      ? 'Lunas (Telah Dibayar)'
                      : 'Menunggu Pembayaran'}
                  </span>
                  <span className="text-[11px] opacity-80">
                    {selectedOrder.status === 'paid'
                      ? `Lisensi telah aktif sejak ${new Date(selectedOrder.paidAt || selectedOrder.createdAt).toLocaleDateString('id-ID')}`
                      : `Batas waktu pembayaran: ${new Date(selectedOrder.expiresAt).toLocaleDateString('id-ID')}`}
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
                <span className="font-semibold">Rp {selectedOrder.amountList.toLocaleString('id-ID')}</span>
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
                  <div className="p-2 rounded-lg bg-[var(--card-bg)] border border-[var(--win-border)]">
                    <span className="font-bold text-[var(--win-text)] block">BCA (Bank Central Asia)</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      8831-2940-11
                    </span>{' '}
                    · a/n Reneo Payments
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--card-bg)] border border-[var(--win-border)]">
                    <span className="font-bold text-[var(--win-text)] block">QRIS Instan Semua Bank & E-Wallet</span>
                    <span className="text-[var(--text-secondary)]">Scan QRIS melalui Reneo Panel Gateway</span>
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
          subtitle={`Pilih durasi paket langganan dan metode pembayaran untuk memperpanjang masa aktif.`}
          icon={<ShieldCheck className="text-emerald-500" size={20} />}
          size="md"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-xs">
                <span className="text-[var(--text-secondary)]">Total Pembayaran:</span>
                <span className="block font-bold text-base text-emerald-600 dark:text-emerald-400">
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
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
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

            <div>
              <label className="block font-semibold text-[var(--win-text)] mb-2">
                Metode Pembayaran (Reneo Gateway):
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('saldo')}
                  className={`p-2.5 rounded-xl border text-center transition ${
                    paymentMethod === 'saldo'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 font-semibold'
                      : 'border-[var(--win-border)] bg-[var(--win-bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Wallet size={18} className="mx-auto mb-1" />
                  <span className="text-[11px] block">Saldo Reneo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('qris')}
                  className={`p-2.5 rounded-xl border text-center transition ${
                    paymentMethod === 'qris'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 font-semibold'
                      : 'border-[var(--win-border)] bg-[var(--win-bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  <CreditCard size={18} className="mx-auto mb-1" />
                  <span className="text-[11px] block">QRIS Instan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('va')}
                  className={`p-2.5 rounded-xl border text-center transition ${
                    paymentMethod === 'va'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 font-semibold'
                      : 'border-[var(--win-border)] bg-[var(--win-bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Building size={18} className="mx-auto mb-1" />
                  <span className="text-[11px] block">Virtual Account</span>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)] space-y-2">
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

      {/* Create Plan Modal */}
      <CreatePlanModal
        open={createPlanModalOpen}
        onClose={() => setCreatePlanModalOpen(false)}
        availableApps={availableApps}
        defaultCatalogId={selectedPlansApp}
        onSuccess={() => {
          refetchPlans()
          refetchApps()
          queryClient.invalidateQueries({ queryKey: ['app-license-plans'] })
          queryClient.invalidateQueries({ queryKey: ['app-licenses-available-apps'] })
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
