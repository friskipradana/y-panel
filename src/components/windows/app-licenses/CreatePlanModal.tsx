import { useState } from 'react'
import { Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { createAppLicensePlan, type AvailableApp, type CreateAppPlanPayload } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'

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
  const { t } = useI18n()
  const [catalogId, setCatalogId] = useState(defaultCatalogId)
  const [isCustomApp, setIsCustomApp] = useState(false)
  const [customCatalogId, setCustomCatalogId] = useState('')

  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [billingMode, setBillingMode] = useState<'both' | 'monthly' | 'annual'>('both')
  const [months, setMonths] = useState<number>(1)
  const [trialDays, setTrialDays] = useState<number>(7)
  const [priceAmount, setPriceAmount] = useState<number>(99000)
  const [originalPriceAmount, setOriginalPriceAmount] = useState<number>(199000)
  const [annualDiscountPercent, setAnnualDiscountPercent] = useState<number>(17)
  const [promoValidUntil, setPromoValidUntil] = useState<string>('30 November 2026')
  const [highlighted, setHighlighted] = useState(false)

  // Custom features & quotas
  const [maxContacts, setMaxContacts] = useState(5000)
  const [featBroadcast, setFeatBroadcast] = useState(false)
  const [maxBroadcastPerMonth, setMaxBroadcastPerMonth] = useState(5000)
  const [featLiveChat, setFeatLiveChat] = useState(true)
  const [featMultiSession, setFeatMultiSession] = useState(true)
  const [maxSessions, setMaxSessions] = useState(2)
  const [maxSessionIdentitySwitches, setMaxSessionIdentitySwitches] = useState(5)
  const [maxTemplates, setMaxTemplates] = useState(50)
  const [maxUsers, setMaxUsers] = useState(5)
  const [featCustomRoles, setFeatCustomRoles] = useState(true)
  const [featOmnichannel, setFeatOmnichannel] = useState(true)
  const [maxChannels, setMaxChannels] = useState(4)
  const [featScheduledPosts, setFeatScheduledPosts] = useState(true)
  const [featAutoReply, setFeatAutoReply] = useState(true)
  const [featAiAgent, setFeatAiAgent] = useState(false)
  const [featMcpTools, setFeatMcpTools] = useState(false)
  const [featExportReports, setFeatExportReports] = useState(true)
  const [featBotUltah, setFeatBotUltah] = useState(true)
  const [featWahaSync, setFeatWahaSync] = useState(true)
  const [featApiAccess, setFeatApiAccess] = useState(false)
  const [supportPriority, setSupportPriority] = useState('fast')

  const [loading, setLoading] = useState(false)

  const computeAnnualPrice = (monthlyPrice: number, discPct: number) => {
    const cleanDisc = Math.max(0, Math.min(80, discPct))
    if (cleanDisc === 17) return monthlyPrice * 10 // standar hemat 2 bulan (10x bulanan)
    return Math.round((monthlyPrice * 12 * (1 - cleanDisc / 100)) / 1000) * 1000
  }

  const handleBillingModeChange = (mode: 'both' | 'monthly' | 'annual') => {
    setBillingMode(mode)
    if (mode === 'annual') {
      setMonths(12)
      if (priceAmount < 500000) {
        setPriceAmount(computeAnnualPrice(priceAmount, annualDiscountPercent))
      }
      if (originalPriceAmount > 0 && originalPriceAmount < 500000) {
        setOriginalPriceAmount(originalPriceAmount * 12)
      }
    } else {
      setMonths(1)
      if (priceAmount >= 500000) {
        setPriceAmount(Math.round(priceAmount / 10 / 1000) * 1000)
      }
      if (originalPriceAmount >= 500000) {
        setOriginalPriceAmount(Math.round(originalPriceAmount / 12 / 1000) * 1000)
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
      const baseName = name.trim().replace(/\s+(Bulanan|Tahunan)$/i, '')
      const slugBase = baseName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      const sharedFeatures = {
        maxContacts: Math.max(0, maxContacts),
        unlimitedContacts: maxContacts === 0,
        unlimitedBroadcast: featBroadcast,
        maxBroadcastPerMonth: featBroadcast ? 0 : Math.max(0, maxBroadcastPerMonth),
        liveChat: featLiveChat,
        multiSession: featMultiSession || maxSessions > 1,
        maxSessions: Math.max(1, maxSessions),
        maxSessionIdentitySwitches: Math.max(1, maxSessionIdentitySwitches),
        maxTemplates: Math.max(0, maxTemplates),
        maxUsers: Math.max(1, maxUsers),
        maxAgents: Math.max(1, maxUsers),
        multiAgent: maxUsers > 1,
        customRoles: featCustomRoles,
        omnichannel: featOmnichannel,
        maxChannels: Math.max(0, maxChannels),
        scheduledPosts: featScheduledPosts,
        autoReply: featAutoReply,
        aiAgent: featAiAgent,
        mcpTools: featMcpTools,
        exportReports: featExportReports,
        birthdayBot: featBotUltah,
        wahaSync: featWahaSync,
        apiAccess: featApiAccess,
        supportPriority,
      }

      if (billingMode === 'both') {
        const monthlyPrice = Math.max(0, priceAmount)
        const monthlyOrig = Math.max(0, originalPriceAmount)
        const annualPrice = computeAnnualPrice(monthlyPrice, annualDiscountPercent)
        const annualOrig = monthlyOrig > monthlyPrice ? monthlyOrig * 12 : monthlyPrice * 12

        const monthlyPayload: CreateAppPlanPayload = {
          catalogId: targetCatalogId,
          slug: `${slugBase}-monthly`,
          name: `${baseName} Bulanan`,
          tagline: tagline.trim() || undefined,
          period: 'monthly',
          months: 1,
          trialDays: Math.max(0, trialDays),
          priceAmount: monthlyPrice,
          originalPriceAmount: monthlyOrig,
          discountPercent:
            monthlyOrig > monthlyPrice
              ? Math.round(((monthlyOrig - monthlyPrice) / monthlyOrig) * 100)
              : 0,
          promoValidUntil: promoValidUntil.trim(),
          highlighted,
          isActive: true,
          features: sharedFeatures,
        }

        const annualPayload: CreateAppPlanPayload = {
          catalogId: targetCatalogId,
          slug: `${slugBase}-annual`,
          name: `${baseName} Tahunan`,
          tagline: tagline.trim() || undefined,
          period: 'annual',
          months: 12,
          trialDays: Math.max(0, trialDays),
          priceAmount: annualPrice,
          originalPriceAmount: annualOrig,
          discountPercent:
            annualOrig > annualPrice
              ? Math.round(((annualOrig - annualPrice) / annualOrig) * 100)
              : 0,
          promoValidUntil: promoValidUntil.trim(),
          highlighted: false,
          isActive: true,
          features: sharedFeatures,
        }

        await createAppLicensePlan(monthlyPayload)
        await createAppLicensePlan(annualPayload)
        toast.success(`Paket "${baseName}" (Bulanan & Tahunan dengan fitur identik) berhasil ditambahkan!`)
      } else {
        const period = billingMode
        const payload: CreateAppPlanPayload = {
          catalogId: targetCatalogId,
          slug: `${slugBase}-${period}`,
          name: name.trim(),
          tagline: tagline.trim() || undefined,
          period,
          months: period === 'annual' ? Math.max(12, months) : Math.max(1, months),
          trialDays: Math.max(0, trialDays),
          priceAmount: Math.max(0, priceAmount),
          originalPriceAmount: Math.max(0, originalPriceAmount),
          discountPercent:
            originalPriceAmount > priceAmount
              ? Math.round(((originalPriceAmount - priceAmount) / originalPriceAmount) * 100)
              : 0,
          promoValidUntil: promoValidUntil.trim(),
          highlighted,
          isActive: true,
          features: sharedFeatures,
        }

        await createAppLicensePlan(payload)
        toast.success(`Paket "${name.trim()}" berhasil ditambahkan ke aplikasi!`)
      }
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
      title={t('appLicenses.createPlanTitle')}
      subtitle={t('appLicenses.createPlanSubtitle')}
      icon={<Boxes className="text-[var(--panel-primary-text)]" size={20} />}
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
            className="w-full px-3 py-2 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--win-text)] focus:outline-none focus:border-[var(--panel-primary-text)] text-xs"
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
              placeholder={t('appLicenses.planSlugPlaceholder')}
              className="w-full px-3 py-1.5 font-mono rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--win-text)] focus:outline-none focus:border-[var(--panel-primary-text)] text-xs"
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
              placeholder={t('appLicenses.planNamePlaceholder')}
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--win-text)] focus:outline-none focus:border-[var(--panel-primary-text)] text-xs"
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
              placeholder={t('appLicenses.planTaglinePlaceholder')}
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--win-text)] focus:outline-none focus:border-[var(--panel-primary-text)] text-xs"
            />
          </div>
        </div>

        {/* Billing Mode (Bulanan + Tahunan | Bulanan Saja | Tahunan Saja) */}
        <div className="space-y-2">
          <label className="block font-medium text-[var(--win-text)]">
            Opsi Penagihan Paket:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'both', label: 'Bulanan + Tahunan' },
                { id: 'monthly', label: 'Bulanan Saja' },
                { id: 'annual', label: 'Tahunan Saja' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleBillingModeChange(opt.id)}
                className={`py-1.5 px-2 rounded-lg border text-center transition text-xs cursor-pointer ${
                  billingMode === opt.id
                    ? 'border-[var(--panel-primary)] bg-[var(--panel-primary-soft)] text-[var(--panel-primary-text)] font-bold'
                    : 'border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--text-secondary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {billingMode === 'both' && (
            <div className="p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--win-bg)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="font-medium text-[var(--win-text)]">
                  Diskon Tahunan (%) — Fitur &amp; Kuota 100% Identik
                </div>
                <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                  Tahunan: Rp {computeAnnualPrice(Math.max(0, priceAmount), annualDiscountPercent).toLocaleString('id-ID')}/thn
                  {' '}(coret Rp {(originalPriceAmount > priceAmount ? originalPriceAmount * 12 : priceAmount * 12).toLocaleString('id-ID')})
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={annualDiscountPercent}
                  onChange={(e) => setAnnualDiscountPercent(Math.max(0, Math.min(80, Number(e.target.value))))}
                  className="panel-input panel-input--mono w-20 text-xs"
                />
                <span className="text-[11px] text-[var(--text-secondary)]">%</span>
              </div>
            </div>
          )}
        </div>

        {/* Trial & Price & Promo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Harga Promo / Jual (Rp):
            </label>
            <input
              type="number"
              step={1000}
              required
              value={priceAmount}
              onChange={(e) => setPriceAmount(Number(e.target.value))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>

          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Harga Asli / Coret (Rp):{' '}
              {originalPriceAmount > priceAmount && (
                <span className="text-[11px] font-semibold text-[var(--panel-danger-text)]">
                  (Hemat {Math.round(((originalPriceAmount - priceAmount) / originalPriceAmount) * 100)}%)
                </span>
              )}
            </label>
            <input
              type="number"
              step={1000}
              min={0}
              value={originalPriceAmount}
              onChange={(e) => setOriginalPriceAmount(Math.max(0, Number(e.target.value)))}
              placeholder="0 = tanpa coret"
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>

          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Promo Berlaku Sampai:
            </label>
            <input
              type="text"
              value={promoValidUntil}
              onChange={(e) => setPromoValidUntil(e.target.value)}
              placeholder={t('appLicenses.promoUntilPlaceholder')}
              className="panel-input w-full text-xs"
            />
          </div>

          <div>
            <label className="block font-medium text-[var(--win-text)] mb-1">
              Durasi Trial (Hari):
            </label>
            <input
              type="number"
              min={0}
              value={trialDays}
              onChange={(e) => setTrialDays(Math.max(0, Number(e.target.value)))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={highlighted}
                onChange={(e) => setHighlighted(e.target.checked)}
                className="rounded border-[var(--win-border)] accent-[var(--panel-primary)]"
              />
              <span className="font-medium text-[var(--win-text)]">
                Tandai &quot;Populer&quot;
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
                  Batas Ganti Nomor / Sesi (x kali)
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxSessionIdentitySwitches}
                  onChange={(e) => setMaxSessionIdentitySwitches(Math.max(1, Number(e.target.value)))}
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
                  Kuota Akun Kanal (0 = Unlimited)
                </label>
                <input
                  type="number"
                  min={0}
                  value={maxChannels}
                  onChange={(e) => setMaxChannels(Math.max(0, Number(e.target.value)))}
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
                  <option value="priority">Priority</option>
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
                <span>Live Chat &amp; CRM Inbox</span>
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
                  checked={featCustomRoles}
                  onChange={(e) => setFeatCustomRoles(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Role CS Kustom</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featOmnichannel}
                  onChange={(e) => setFeatOmnichannel(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Omnichannel Sosial</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featScheduledPosts}
                  onChange={(e) => setFeatScheduledPosts(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Jadwal Post &amp; Story WA</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featAutoReply}
                  onChange={(e) => setFeatAutoReply(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Auto-Reply &amp; Jam Kerja</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featAiAgent}
                  onChange={(e) => setFeatAiAgent(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Agent AI Multi-Model</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featMcpTools}
                  onChange={(e) => setFeatMcpTools(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>MCP Tool Servers</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featExportReports}
                  onChange={(e) => setFeatExportReports(e.target.checked)}
                  className="rounded border-[var(--win-border)] text-emerald-600 focus:ring-0"
                />
                <span>Ekspor Laporan CSV</span>
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
                <span>Akses API &amp; Webhook</span>
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
          >
            Simpan Paket
          </Button>
        </div>
      </form>
    </Modal>
  )
}

