import { useState } from 'react'
import { Boxes, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { createAppLicensePlan, type AvailableApp, type CreateAppPlanPayload } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface CreatePlanModalProps {
  open: boolean
  onClose: () => void
  availableApps: AvailableApp[]
  defaultCatalogId?: string
  onSuccess: () => void
}

export function CreatePlanModal({
  open,
  onClose,
  availableApps,
  defaultCatalogId = 'reneo-crm',
  onSuccess,
}: CreatePlanModalProps) {
  const [catalogId, setCatalogId] = useState(defaultCatalogId)
  const [isCustomApp, setIsCustomApp] = useState(false)
  const [customCatalogId, setCustomCatalogId] = useState('')

  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [months, setMonths] = useState<number>(1)
  const [priceAmount, setPriceAmount] = useState<number>(99000)
  const [highlighted, setHighlighted] = useState(false)

  // Custom features & quotas
  const [maxContacts, setMaxContacts] = useState(10000)
  const [featBroadcast, setFeatBroadcast] = useState(true)
  const [maxBroadcastPerMonth, setMaxBroadcastPerMonth] = useState(0)
  const [featLiveChat, setFeatLiveChat] = useState(true)
  const [featMultiSession, setFeatMultiSession] = useState(false)
  const [maxSessions, setMaxSessions] = useState(1)
  const [maxTemplates, setMaxTemplates] = useState(0)
  const [maxUsers, setMaxUsers] = useState(1)
  const [featBotUltah, setFeatBotUltah] = useState(true)
  const [featWahaSync, setFeatWahaSync] = useState(true)
  const [featApiAccess, setFeatApiAccess] = useState(false)
  const [supportPriority, setSupportPriority] = useState('standard')

  const [loading, setLoading] = useState(false)

  const handlePeriodChange = (p: 'monthly' | 'annual') => {
    setPeriod(p)
    if (p === 'annual') {
      setMonths(12)
      if (priceAmount < 200000) {
        setPriceAmount(990000)
      }
    } else {
      setMonths(1)
      if (priceAmount > 500000) {
        setPriceAmount(99000)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const targetCatalogId = isCustomApp ? customCatalogId.trim().toLowerCase() : catalogId
    if (!targetCatalogId) {
      toast.error('ID Aplikasi tidak boleh kosong.')
      return
    }

    if (!name.trim()) {
      toast.error('Nama paket tarif harus diisi.')
      return
    }

    setLoading(true)
    try {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const payload: CreateAppPlanPayload = {
        catalogId: targetCatalogId,
        slug: `${slug}-${period}-${Date.now().toString().slice(-4)}`,
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        period,
        months,
        priceAmount,
        highlighted,
        isActive: true,
        features: {
          maxContacts: Math.max(0, maxContacts),
          unlimitedBroadcast: featBroadcast,
          maxBroadcastPerMonth: featBroadcast ? 0 : Math.max(0, maxBroadcastPerMonth),
          liveChat: featLiveChat,
          multiSession: featMultiSession || maxSessions > 1,
          maxSessions: Math.max(1, maxSessions),
          maxTemplates: Math.max(0, maxTemplates),
          maxUsers: Math.max(1, maxUsers),
          birthdayBot: featBotUltah,
          wahaSync: featWahaSync,
          apiAccess: featApiAccess,
          supportPriority,
        },
      }

      await createAppLicensePlan(payload)
      toast.success(`Paket "${name}" berhasil ditambahkan ke aplikasi!`)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Gagal menambahkan paket tarif.'
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
      title="Tambah Paket & Tarif Lisensi"
      subtitle="Definisikan tier harga, durasi langganan, dan fitur aplikasi untuk pelanggan."
      icon={<Boxes className="text-emerald-500" size={20} />}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* App selection */}
        <div>
          <label className="block font-semibold text-[var(--win-text)] mb-1.5">
            Pilih Aplikasi:
          </label>
          <select
            value={isCustomApp ? '__custom__' : catalogId}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setIsCustomApp(true)
              } else {
                setIsCustomApp(false)
                setCatalogId(e.target.value)
              }
            }}
            className="w-full px-3 py-2 rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
          >
            <optgroup label="Aplikasi Terdaftar">
              {availableApps.map((a) => (
                <option key={a.catalogId} value={a.catalogId}>
                  {a.name} ({a.catalogId})
                </option>
              ))}
            </optgroup>
            <optgroup label="Lainnya">
              <option value="__custom__">+ Aplikasi Kustom Lainnya...</option>
            </optgroup>
          </select>
        </div>

        {isCustomApp && (
          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Catalog ID / ID Aplikasi Kustom:
            </label>
            <input
              type="text"
              required
              value={customCatalogId}
              onChange={(e) => setCustomCatalogId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="contoh: pos-resto, wa-bot, erp-gudang"
              className="w-full px-3 py-1.5 font-mono rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>
        )}

        {/* Plan Name & Tagline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Nama Paket:
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Pro Bulanan, Enterprise Tahunan"
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>
          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Tagline / Keterangan Singkat:
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Cocok untuk UMKM atau tim operasional"
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>
        </div>

        {/* Period & Months */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Periode Penagihan:
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePeriodChange('monthly')}
                className={`flex-1 py-1.5 rounded-lg border text-center transition ${
                  period === 'monthly'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 font-bold'
                    : 'border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--text-secondary)]'
                }`}
              >
                Bulanan
              </button>
              <button
                type="button"
                onClick={() => handlePeriodChange('annual')}
                className={`flex-1 py-1.5 rounded-lg border text-center transition ${
                  period === 'annual'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 font-bold'
                    : 'border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--text-secondary)]'
                }`}
              >
                Tahunan
              </button>
            </div>
          </div>

          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Durasi (Bulan):
            </label>
            <input
              type="number"
              min={1}
              value={months}
              onChange={(e) => setMonths(Math.max(1, Number(e.target.value)))}
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>
        </div>

        {/* Price & Highlight */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Harga Paket (Rp):
            </label>
            <input
              type="number"
              step={1000}
              required
              value={priceAmount}
              onChange={(e) => setPriceAmount(Number(e.target.value))}
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--card-bg)] text-[var(--win-text)] focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          <div className="pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={highlighted}
                onChange={(e) => setHighlighted(e.target.checked)}
                className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
              />
              <span className="font-medium text-[var(--win-text)]">
                Tandai sebagai "Paling Populer"
              </span>
            </label>
          </div>
        </div>

        {/* Feature inclusions */}
        <div>
          <label className="block font-semibold text-[var(--win-text)] mb-1.5">
            Fitur & Kuota dalam Paket:
          </label>
          <div className="space-y-3 p-3 rounded-xl border border-[var(--win-border)] bg-[var(--win-bg)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Maks. Kontak (0 = Tanpa Batas)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxContacts}
                  onChange={(e) => setMaxContacts(Number(e.target.value))}
                  className="panel-input panel-input--mono w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Kuota Sesi WA (Multi-Sesi)
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxSessions}
                  onChange={(e) => {
                    const v = Math.max(1, Number(e.target.value))
                    setMaxSessions(v)
                    if (v > 1) setFeatMultiSession(true)
                  }}
                  className="panel-input panel-input--mono w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Kuota Broadcast / Bulan
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={featBroadcast}
                  value={featBroadcast ? 0 : maxBroadcastPerMonth}
                  onChange={(e) => setMaxBroadcastPerMonth(Number(e.target.value))}
                  className="panel-input panel-input--mono w-full text-xs disabled:opacity-50"
                  placeholder={featBroadcast ? 'Tanpa Batas' : '500'}
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Kuota Template (0 = Tanpa Batas)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxTemplates}
                  onChange={(e) => setMaxTemplates(Number(e.target.value))}
                  className="panel-input panel-input--mono w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Maks. User / Agent
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxUsers}
                  onChange={(e) => setMaxUsers(Math.max(1, Number(e.target.value)))}
                  className="panel-input panel-input--mono w-full text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Prioritas Support
                </label>
                <select
                  value={supportPriority}
                  onChange={(e) => setSupportPriority(e.target.value)}
                  className="panel-input w-full text-xs"
                >
                  <option value="standard">Standard</option>
                  <option value="fast">Fast</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--win-border)]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featBroadcast}
                  onChange={(e) => setFeatBroadcast(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Broadcast Tanpa Batas</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featLiveChat}
                  onChange={(e) => setFeatLiveChat(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Live Chat & CRM Inbox</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featMultiSession}
                  onChange={(e) => setFeatMultiSession(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Multi-Sesi WhatsApp</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featWahaSync}
                  onChange={(e) => setFeatWahaSync(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Integrasi WAHA</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featBotUltah}
                  onChange={(e) => setFeatBotUltah(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Bot Ulang Tahun</span>
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
            </div>
          </div>
        </div>

        {/* Modal actions */}
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
            Simpan Paket
          </Button>
        </div>
      </form>
    </Modal>
  )
}

