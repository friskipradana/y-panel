import { useState, useEffect } from 'react'
import { KeyRound, RefreshCw, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { createAppLicense, type AvailableApp, type CreateAppLicensePayload } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface CreateLicenseModalProps {
  open: boolean
  onClose: () => void
  availableApps: AvailableApp[]
  onSuccess: () => void
}

function generateRandomKey(prefix = 'RN'): string {
  const chars = '0123456789ABCDEF'
  let p1 = ''
  let p2 = ''
  for (let i = 0; i < 4; i++) {
    p1 += chars[Math.floor(Math.random() * chars.length)]
    p2 += chars[Math.floor(Math.random() * chars.length)]
  }
  const cleanPrefix = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'APP'
  return `RN-${cleanPrefix}-${p1}-${p2}`
}

export function CreateLicenseModal({
  open,
  onClose,
  availableApps,
  onSuccess,
}: CreateLicenseModalProps) {
  const [selectedApp, setSelectedApp] = useState<string>('reneo-crm')
  const [isCustom, setIsCustom] = useState(false)
  const [customAppName, setCustomAppName] = useState('')
  const [customCatalogId, setCustomCatalogId] = useState('')

  const [planName, setPlanName] = useState('Bulanan (Pro)')
  const [durationMonths, setDurationMonths] = useState<number>(1)
  const [priceAmount, setPriceAmount] = useState<number>(99000)
  const [licenseKey, setLicenseKey] = useState('')

  // Feature flags
  const [featBroadcast, setFeatBroadcast] = useState(true)
  const [featApiAccess, setFeatApiAccess] = useState(true)
  const [featMultiUser, setFeatMultiUser] = useState(true)
  const [featFullModules, setFeatFullModules] = useState(true)

  const [loading, setLoading] = useState(false)

  // Generate initial key when app changes
  useEffect(() => {
    if (open) {
      const appPrefix = isCustom ? customCatalogId || 'CUSTOM' : selectedApp
      setLicenseKey(generateRandomKey(appPrefix))
    }
  }, [open, selectedApp, isCustom, customCatalogId])

  const handleAppChange = (val: string) => {
    if (val === '__custom__') {
      setIsCustom(true)
    } else {
      setIsCustom(false)
      setSelectedApp(val)
    }
  }

  const handleDurationChange = (m: number) => {
    setDurationMonths(m)
    if (m === 1) {
      setPlanName('Bulanan (Pro)')
      setPriceAmount(99000)
    } else if (m === 3) {
      setPlanName('3 Bulan (Pro)')
      setPriceAmount(279000)
    } else if (m === 6) {
      setPlanName('6 Bulan (Pro)')
      setPriceAmount(540000)
    } else if (m === 12) {
      setPlanName('Tahunan (Enterprise)')
      setPriceAmount(990000)
    } else if (m === 0) {
      setPlanName('Lifetime (Selamanya)')
      setPriceAmount(2500000)
    } else if (m === -1) {
      setPlanName('Trial 14 Hari')
      setPriceAmount(0)
    }
  }

  const handleRegenerateKey = () => {
    const appPrefix = isCustom ? customCatalogId || 'CUSTOM' : selectedApp
    setLicenseKey(generateRandomKey(appPrefix))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const catalogId = isCustom ? customCatalogId.trim().toLowerCase() : selectedApp
    let appName = ''
    if (isCustom) {
      appName = customAppName.trim() || catalogId
    } else {
      const found = availableApps.find((a) => a.catalogId === selectedApp)
      appName = found?.name || selectedApp
    }

    if (!catalogId) {
      toast.error('ID Aplikasi / Catalog ID wajib diisi.')
      return
    }

    if (!licenseKey.trim()) {
      toast.error('License key tidak boleh kosong.')
      return
    }

    setLoading(true)
    try {
      const payload: CreateAppLicensePayload = {
        catalogId,
        appName,
        licenseKey: licenseKey.trim(),
        planName,
        period: durationMonths === 12 ? 'annual' : durationMonths === 0 ? 'lifetime' : durationMonths === -1 ? 'trial' : 'monthly',
        priceAmount,
        months: durationMonths,
        status: durationMonths === -1 ? 'TRIAL' : 'ACTIVE',
        features: {
          broadcast: featBroadcast,
          apiAccess: featApiAccess,
          multiUser: featMultiUser,
          fullModules: featFullModules,
        },
      }

      await createAppLicense(payload)
      toast.success(`Lisensi untuk ${appName} berhasil dibuat dan aktif!`)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Gagal menerbitkan lisensi.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Buat Lisensi Aplikasi Baru"
      subtitle="Terbitkan lisensi baru untuk aplikasi katalog, proyek server, atau aplikasi kustom."
      icon={<ShieldCheck className="text-emerald-500" size={20} />}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* App Selection */}
        <div>
          <label className="block font-semibold text-[var(--win-text)] mb-1.5">
            Pilih Aplikasi:
          </label>
          <select
            value={isCustom ? '__custom__' : selectedApp}
            onChange={(e) => handleAppChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
          >
            <optgroup label="Aplikasi Terdaftar">
              {availableApps.map((app) => (
                <option key={app.catalogId} value={app.catalogId}>
                  {app.name} ({app.catalogId})
                </option>
              ))}
            </optgroup>
            <optgroup label="Kustom">
              <option value="__custom__">+ Daftarkan Aplikasi Kustom Baru...</option>
            </optgroup>
          </select>
        </div>

        {/* Custom App Fields */}
        {isCustom && (
          <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
            <div>
              <label className="block font-medium text-[var(--win-text)] mb-1">
                Nama Aplikasi:
              </label>
              <input
                type="text"
                required
                value={customAppName}
                onChange={(e) => {
                  setCustomAppName(e.target.value)
                  if (!customCatalogId || customCatalogId === customAppName.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
                    setCustomCatalogId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'))
                  }
                }}
                placeholder="Contoh: Sistem POS Resto, WA Blast Bot, Inventory ERP"
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
              />
            </div>
            <div>
              <label className="block font-medium text-[var(--win-text)] mb-1">
                ID Aplikasi (Slug / Catalog ID):
              </label>
              <input
                type="text"
                required
                value={customCatalogId}
                onChange={(e) => setCustomCatalogId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="Contoh: pos-resto, wa-blast, inventory-erp"
                className="w-full px-3 py-1.5 font-mono rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
              />
              <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 block">
                ID unik ini digunakan aplikasi saat mengecek lisensi ke panel.
              </span>
            </div>
          </div>
        )}

        {/* Duration / Plan */}
        <div>
          <label className="block font-semibold text-[var(--win-text)] mb-1.5">
            Durasi / Paket Masa Aktif:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { m: 1, label: '1 Bulan' },
              { m: 3, label: '3 Bulan' },
              { m: 6, label: '6 Bulan' },
              { m: 12, label: '12 Bulan (1 Thn)' },
              { m: 0, label: 'Lifetime' },
              { m: -1, label: 'Trial 14 Hari' },
            ].map((opt) => (
              <button
                key={opt.m}
                type="button"
                onClick={() => handleDurationChange(opt.m)}
                className={`p-2 rounded-lg border text-center transition ${
                  durationMonths === opt.m
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 font-bold'
                    : 'border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:text-[var(--win-text)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* License Key Field */}
        <div>
          <label className="block font-semibold text-[var(--win-text)] mb-1.5">
            License Key:
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <KeyRound
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
              />
              <input
                type="text"
                required
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                placeholder="RN-APP-XXXX-XXXX"
                className="w-full pl-8 pr-3 py-1.5 font-mono font-bold text-xs rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRegenerateKey}
              title="Acak Ulang Key"
              className="gap-1 text-xs shrink-0"
            >
              <RefreshCw size={12} />
              Acak
            </Button>
          </div>
        </div>

        {/* Price & Plan Name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Nama Paket:
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>
          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Nilai Tagihan / Harga (Rp):
            </label>
            <input
              type="number"
              value={priceAmount}
              onChange={(e) => setPriceAmount(Number(e.target.value))}
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>
        </div>

        {/* Features Toggle */}
        <div>
          <label className="block font-semibold text-[var(--win-text)] mb-1.5">
            Fitur Lisensi Aktif:
          </label>
          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={featBroadcast}
                onChange={(e) => setFeatBroadcast(e.target.checked)}
                className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
              />
              <span>Broadcast & Messaging</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={featApiAccess}
                onChange={(e) => setFeatApiAccess(e.target.checked)}
                className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
              />
              <span>Akses API & Webhook</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={featMultiUser}
                onChange={(e) => setFeatMultiUser(e.target.checked)}
                className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
              />
              <span>Multi-User / Operator</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={featFullModules}
                onChange={(e) => setFeatFullModules(e.target.checked)}
                className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
              />
              <span>Semua Modul Terbuka</span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--win-border)]">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            <CheckCircle2 size={14} />
            Terbitkan Lisensi
          </Button>
        </div>
      </form>
    </Modal>
  )
}
