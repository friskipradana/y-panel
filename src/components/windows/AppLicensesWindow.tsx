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
  Sparkles,
  RefreshCw,
  Search,
  Zap,
  CheckCircle2,
  Lock,
  Wallet,
  Building,
} from 'lucide-react'
import { toast } from 'sonner'
import { fetchAppLicenses, renewAppLicense, type AppLicense } from '@/api/appLicenses'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, LoadingState } from '@/components/ui/states'
import { useAppCatalog } from '@/hooks/useAppCatalog'
import { useWindowStore } from '@/store/windowStore'
import { useI18n } from '@/lib/i18n'

export function AppLicensesWindow() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const openWindow = useWindowStore((s) => s.openWindow)
  const { data: catalogData } = useAppCatalog()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED'>('ALL')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [renewModalOpen, setRenewModalOpen] = useState(false)
  const [selectedLicense, setSelectedLicense] = useState<AppLicense | null>(null)

  // Renew modal states
  const [months, setMonths] = useState<number>(1)
  const [paymentMethod, setPaymentMethod] = useState<'saldo' | 'qris' | 'va'>('saldo')

  const {
    data: licenses = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['app-licenses'],
    queryFn: fetchAppLicenses,
    staleTime: 30_000,
  })

  const renewMutation = useMutation({
    mutationFn: renewAppLicense,
    onSuccess: (data) => {
      toast.success(
        t('appLicenses.renewSuccess') ||
          `Lisensi untuk ${data.appName || selectedLicense?.appName || 'aplikasi'} berhasil diperpanjang!`
      )
      queryClient.invalidateQueries({ queryKey: ['app-licenses'] })
      setRenewModalOpen(false)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Gagal memperpanjang lisensi.')
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
      // Default fallback open via web URL or App Catalog
      if (lic.catalogId === 'reneo-crm') {
        window.open('http://localhost:18011', '_blank')
      } else {
        openWindow('app-catalog')
      }
    }
  }

  const filteredLicenses = useMemo(() => {
    const q = search.trim().toLowerCase()
    return licenses.filter((lic) => {
      if (statusFilter === 'ACTIVE' && lic.isExpired) return false
      if (statusFilter === 'EXPIRED' && !lic.isExpired) return false
      if (!q) return true
      return (
        lic.appName.toLowerCase().includes(q) ||
        lic.catalogId.toLowerCase().includes(q) ||
        lic.licenseKey.toLowerCase().includes(q) ||
        lic.planName.toLowerCase().includes(q)
      )
    })
  }, [licenses, search, statusFilter])

  const activeCount = useMemo(() => licenses.filter((l) => !l.isExpired && l.status === 'ACTIVE').length, [licenses])
  const expiredCount = useMemo(() => licenses.filter((l) => l.isExpired || l.status === 'EXPIRED').length, [licenses])

  // Calculation for renew modal
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
        price: Math.round(basePrice * 3 * 0.94), // 6% discount
        desc: 'Rp 93.000 / bln',
        savings: 'Hemat 6%',
      },
      {
        months: 12,
        label: '12 Bulan (1 Tahun)',
        period: 'annual',
        price: Math.round(basePrice * 10), // ~17% discount (pay for 10 months)
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[var(--win-border)] bg-[var(--card-bg)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold leading-none">Kelola Lisensi Aplikasi</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {activeCount} Aktif
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Pusat lisensi terpusat Reneo: kelola masa aktif, fitur berlangganan, dan tagihan aplikasi katalog.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari lisensi aplikasi..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--win-border)] bg-[var(--win-bg)] focus:outline-none focus:border-emerald-500 w-48 sm:w-60 transition"
            />
          </div>

          <div className="flex items-center bg-[var(--win-bg)] border border-[var(--win-border)] rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === 'ALL'
                  ? 'bg-[var(--card-bg)] font-semibold text-[var(--win-text)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
              }`}
            >
              Semua ({licenses.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === 'ACTIVE'
                  ? 'bg-[var(--card-bg)] font-semibold text-emerald-600 shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-emerald-600'
              }`}
            >
              Aktif ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('EXPIRED')}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === 'EXPIRED'
                  ? 'bg-[var(--card-bg)] font-semibold text-rose-600 shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-rose-600'
              }`}
            >
              Kedaluwarsa ({expiredCount})
            </button>
          </div>

          <IconButton
            label="Segarkan Status"
            loading={isRefetching}
            onClick={() => refetch()}
            className="border border-[var(--win-border)]"
          >
            <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
          </IconButton>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Info Banner */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
              <Zap size={18} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[var(--win-text)]">
                Manajemen Lisensi Terpusat & Verifikasi Otomatis
              </h4>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Semua aplikasi katalog (seperti Reneo CRM) otomatis memvalidasi status langganan ke Reneo Panel secara lokal tanpa ketergantungan pihak ketiga luar.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs gap-1.5"
            onClick={() => openWindow('hosting')}
          >
            <CreditCard size={14} />
            Buka Tagihan & Hosting
          </Button>
        </div>

        {/* Content list */}
        {isLoading ? (
          <div className="py-16">
            <LoadingState>Memuat daftar lisensi aplikasi...</LoadingState>
          </div>
        ) : filteredLicenses.length === 0 ? (
          <div className="py-16">
            <EmptyState>
              <div className="flex flex-col items-center gap-2">
                <Shield size={36} className="text-[var(--text-secondary)] opacity-60" />
                <span className="font-semibold text-sm">Tidak ada lisensi aplikasi ditemukan</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  Coba ubah kata kunci pencarian atau pasang aplikasi baru dari App Catalog.
                </span>
                <Button size="sm" variant="primary" className="mt-2" onClick={() => openWindow('app-catalog')}>
                  Buka App Catalog
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
                    {/* App info & badges */}
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
                          ) : (
                            <Badge tone="success" dot size="sm">
                              Aktif ({lic.daysLeft} hari lagi)
                            </Badge>
                          )}

                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            {lic.planName}
                          </span>
                        </div>

                        {/* License key display */}
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

                    {/* Expiration date & Action buttons */}
                    <div className="flex flex-wrap items-center gap-2 lg:self-center">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleOpenRenew(lic)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs gap-1.5 shadow-sm"
                      >
                        <Sparkles size={14} />
                        Perpanjang Lisensi
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
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-[var(--win-border)] my-4" />

                  {/* Details grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    {/* Period & Pricing */}
                    <div className="space-y-1">
                      <span className="text-[var(--text-secondary)]">Tarif Langganan:</span>
                      <div className="font-semibold text-sm text-[var(--win-text)]">
                        Rp {lic.priceAmount?.toLocaleString('id-ID')}
                        <span className="text-xs font-normal text-[var(--text-secondary)]"> / {lic.period === 'annual' ? 'tahun' : 'bulan'}</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        Dikelola & ditagihkan melalui Reneo Panel
                      </div>
                    </div>

                    {/* Active Timeline */}
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

                      {/* Progress bar */}
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

                    {/* Features enabled badge pills */}
                    <div className="space-y-1">
                      <span className="text-[var(--text-secondary)]">Fitur Aktif:</span>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          ✓ WA Broadcast Pacing
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          ✓ Bot Ulang Tahun
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          ✓ Live Chat CRM
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          ✓ 10.000 Kontak
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Renew Subscription Modal */}
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
                      planName: selectedPricing.months === 12 ? 'Tahunan (Enterprise)' : 'Bulanan (Pro)',
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
            {/* Durasi Paket */}
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
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        {opt.desc}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Metode Pembayaran */}
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

            {/* Info ringkasan masa aktif */}
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
              <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--win-border)]">
                <span className="text-[var(--text-secondary)]">Sistem Pembayaran:</span>
                <span className="text-[var(--win-text)] font-medium">Auto-verifikasi & aktivasi instan</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
export default AppLicensesWindow
