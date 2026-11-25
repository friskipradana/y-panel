import { useState, useEffect, useMemo } from 'react'
import { Pencil, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { createAppLicensePlan, updateAppLicensePlan, type AppLicensePlan } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'

interface EditPlanModalProps {
  open: boolean
  plan: AppLicensePlan | null
  allPlans?: AppLicensePlan[]
  onClose: () => void
  onSuccess: () => void
}

export function EditPlanModal({
  open,
  plan,
  allPlans = [],
  onClose,
  onSuccess,
}: EditPlanModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [months, setMonths] = useState<number>(1)
  const [trialDays, setTrialDays] = useState<number>(7)
  const [priceAmount, setPriceAmount] = useState<number>(99000)
  const [originalPriceAmount, setOriginalPriceAmount] = useState<number>(0)
  const [promoValidUntil, setPromoValidUntil] = useState<string>('')
  const [highlighted, setHighlighted] = useState(false)
  const [isActive, setIsActive] = useState(true)

  // Feature flags & monetization quotas
  const [maxContacts, setMaxContacts] = useState<number>(10000)
  const [unlimitedBroadcast, setUnlimitedBroadcast] = useState(true)
  const [maxBroadcastPerMonth, setMaxBroadcastPerMonth] = useState<number>(0)
  const [liveChat, setLiveChat] = useState(true)
  const [multiSession, setMultiSession] = useState(false)
  const [maxSessions, setMaxSessions] = useState<number>(1)
  const [maxSessionIdentitySwitches, setMaxSessionIdentitySwitches] = useState<number>(2)
  const [maxTemplates, setMaxTemplates] = useState<number>(0)
  const [maxUsers, setMaxUsers] = useState<number>(1)
  const [customRoles, setCustomRoles] = useState(false)
  const [omnichannel, setOmnichannel] = useState(false)
  const [maxChannels, setMaxChannels] = useState<number>(0)
  const [scheduledPosts, setScheduledPosts] = useState(false)
  const [autoReply, setAutoReply] = useState(true)
  const [aiAgent, setAiAgent] = useState(false)
  const [mcpTools, setMcpTools] = useState(false)
  const [exportReports, setExportReports] = useState(false)
  const [birthdayBot, setBirthdayBot] = useState(true)
  const [wahaSync, setWahaSync] = useState(true)
  const [apiAccess, setApiAccess] = useState(false)
  const [supportPriority, setSupportPriority] = useState<string>('standard')
  const [maxStorageMb, setMaxStorageMb] = useState<number>(5120)
  const [maxAttachmentSizeMb, setMaxAttachmentSizeMb] = useState<number>(25)
  const [syncPairedFeatures, setSyncPairedFeatures] = useState<boolean>(true)
  const [alsoCreateAnnual, setAlsoCreateAnnual] = useState<boolean>(false)
  const [annualDiscountPercent, setAnnualDiscountPercent] = useState<number>(17)

  const [loading, setLoading] = useState(false)

  const pairedPlan = useMemo(() => {
    if (!plan || !allPlans.length) return null
    const baseSlug = plan.slug.replace(/-(monthly|annual)$/i, '')
    const targetSuffix = plan.period === 'annual' ? '-monthly' : '-annual'
    return (
      allPlans.find(
        (p) =>
          p.id !== plan.id &&
          p.catalogId === plan.catalogId &&
          p.slug.toLowerCase() === `${baseSlug}${targetSuffix}`.toLowerCase()
      ) || null
    )
  }, [plan, allPlans])

  useEffect(() => {
    if (open && plan) {
      setName(plan.name || '')
      setTagline(plan.tagline || '')
      setPeriod(plan.period === 'annual' ? 'annual' : 'monthly')
      setMonths(plan.months || (plan.period === 'annual' ? 12 : 1))
      setTrialDays(plan.trialDays ?? 7)
      setPriceAmount(plan.priceAmount ?? 0)
      setOriginalPriceAmount(plan.originalPriceAmount ?? 0)
      setPromoValidUntil(plan.promoValidUntil || '')
      setHighlighted(Boolean(plan.highlighted))
      setIsActive(plan.isActive !== false)

      const feats = plan.features || {}
      setMaxContacts(Number(feats.maxContacts ?? 10000) || 0)
      const isUnlim = Boolean(feats.unlimitedBroadcast ?? feats.broadcast)
      setUnlimitedBroadcast(isUnlim)
      setMaxBroadcastPerMonth(Number(feats.maxBroadcastPerMonth ?? (isUnlim ? 0 : 1500)) || 0)
      setLiveChat(Boolean(feats.liveChat ?? feats.liveChatCrm))
      const isMulti = Boolean(feats.multiSession ?? feats.multiUser)
      setMultiSession(isMulti)
      setMaxSessions(Number(feats.maxSessions ?? (isMulti ? 3 : 1)) || 1)
      setMaxSessionIdentitySwitches(Number(feats.maxSessionIdentitySwitches ?? 2) || 2)
      setMaxTemplates(Number(feats.maxTemplates ?? 0) || 0)
      setMaxUsers(Number(feats.maxUsers ?? feats.maxAgents ?? 1) || 1)
      setCustomRoles(Boolean(feats.customRoles))
      setOmnichannel(Boolean(feats.omnichannel))
      setMaxChannels(Number(feats.maxChannels ?? 0) || 0)
      setScheduledPosts(Boolean(feats.scheduledPosts))
      setAutoReply(feats.autoReply !== undefined ? Boolean(feats.autoReply) : true)
      setAiAgent(Boolean(feats.aiAgent))
      setMcpTools(Boolean(feats.mcpTools))
      setExportReports(Boolean(feats.exportReports))
      setBirthdayBot(Boolean(feats.birthdayBot ?? feats.botBirthday))
      setWahaSync(Boolean(feats.wahaSync))
      setApiAccess(Boolean(feats.apiAccess))
      setSupportPriority(String(feats.supportPriority || 'standard').toLowerCase())
      setMaxStorageMb(Number(feats.maxStorageMb ?? 5120) || 5120)
      setMaxAttachmentSizeMb(Number(feats.maxAttachmentSizeMb ?? 25) || 25)
      setSyncPairedFeatures(true)
      setAlsoCreateAnnual(false)
      setAnnualDiscountPercent(17)
    }
  }, [open, plan])

  const handlePeriodChange = (p: 'monthly' | 'annual') => {
    setPeriod(p)
    if (p === 'annual') {
      setMonths(12)
    } else {
      setMonths(1)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!plan) return
    if (!name.trim()) {
      toast.error('Nama paket tarif wajib diisi')
      return
    }

    setLoading(true)
    try {
      const mergedFeatures: Record<string, string | number | boolean> = {
        ...(plan.features || {}),
        maxContacts: Math.max(0, maxContacts),
        unlimitedContacts: maxContacts === 0,
        unlimitedBroadcast,
        maxBroadcastPerMonth: unlimitedBroadcast ? 0 : Math.max(0, maxBroadcastPerMonth),
        liveChat,
        multiSession: multiSession || maxSessions > 1,
        maxSessions: Math.max(1, maxSessions),
        maxSessionIdentitySwitches: Math.max(1, maxSessionIdentitySwitches),
        maxTemplates: Math.max(0, maxTemplates),
        maxUsers: Math.max(1, maxUsers),
        maxAgents: Math.max(1, maxUsers),
        multiAgent: maxUsers > 1,
        customRoles,
        omnichannel,
        maxChannels: Math.max(0, maxChannels),
        scheduledPosts,
        autoReply,
        aiAgent,
        mcpTools,
        exportReports,
        birthdayBot,
        wahaSync,
        apiAccess,
        supportPriority,
        maxStorageMb: Math.max(100, maxStorageMb),
        maxAttachmentSizeMb: Math.max(1, maxAttachmentSizeMb),
      }

      await updateAppLicensePlan(plan.id, {
        catalogId: plan.catalogId,
        slug: plan.slug,
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        period,
        months: Math.max(1, months),
        trialDays: Math.max(0, trialDays),
        priceAmount: Math.max(0, priceAmount),
        originalPriceAmount: Math.max(0, originalPriceAmount),
        discountPercent:
          originalPriceAmount > priceAmount
            ? Math.round(((originalPriceAmount - priceAmount) / originalPriceAmount) * 100)
            : 0,
        promoValidUntil: promoValidUntil.trim(),
        highlighted,
        isActive,
        features: mergedFeatures,
      })

      if (pairedPlan && syncPairedFeatures) {
        await updateAppLicensePlan(pairedPlan.id, {
          catalogId: pairedPlan.catalogId,
          slug: pairedPlan.slug,
          name: pairedPlan.name,
          tagline: pairedPlan.tagline || tagline.trim() || undefined,
          period: pairedPlan.period,
          months: pairedPlan.months || (pairedPlan.period === 'annual' ? 12 : 1),
          trialDays: Math.max(0, trialDays),
          priceAmount: pairedPlan.priceAmount,
          originalPriceAmount: pairedPlan.originalPriceAmount ?? 0,
          discountPercent: pairedPlan.discountPercent ?? 0,
          promoValidUntil: promoValidUntil.trim(),
          highlighted: pairedPlan.highlighted,
          isActive: pairedPlan.isActive,
          features: mergedFeatures,
        })
      } else if (!pairedPlan && period === 'monthly' && alsoCreateAnnual) {
        const cleanDisc = Math.max(0, Math.min(80, annualDiscountPercent))
        const monthlyPrice = Math.max(0, priceAmount)
        const annualPrice =
          cleanDisc === 17
            ? monthlyPrice * 10
            : Math.round((monthlyPrice * 12 * (1 - cleanDisc / 100)) / 1000) * 1000
        const annualOrig =
          originalPriceAmount > monthlyPrice ? originalPriceAmount * 12 : monthlyPrice * 12
        const baseName = name.trim().replace(/\s+(Bulanan|Tahunan)$/i, '')
        const baseSlug = plan.slug.replace(/-(monthly|annual)$/i, '')
        await createAppLicensePlan({
          catalogId: plan.catalogId,
          slug: `${baseSlug}-annual`,
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
          features: mergedFeatures,
        })
      }

      toast.success(
        pairedPlan && syncPairedFeatures
          ? `Paket & pasangannya (${pairedPlan.name}) berhasil disinkronkan`
          : !pairedPlan && period === 'monthly' && alsoCreateAnnual
            ? 'Paket diperbarui & versi Tahunan dengan fitur identik berhasil dibuat'
            : 'Paket tarif berhasil diperbarui'
      )
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal memperbarui paket tarif')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  if (!plan) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('appLicenses.editPlanTitle')}
      subtitle={`${plan.catalogId} · ${plan.slug}`}
      icon={<Pencil className="text-[var(--panel-primary-text)]" size={20} />}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            type="submit"
            form="edit-plan-form"
            variant="primary"
            size="sm"
            loading={loading}
          >
            Simpan Paket
          </Button>
        </div>
      }
    >
      <form id="edit-plan-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Nama Paket
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="panel-input w-full text-xs"
              placeholder={t('appLicenses.editPlanShortPlaceholder')}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Periode Tagihan
            </label>
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value as 'monthly' | 'annual')}
              className="panel-input w-full text-xs"
            >
              <option value="monthly">Bulanan (monthly)</option>
              <option value="annual">Tahunan (annual)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Deskripsi Singkat (Tagline)
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="panel-input w-full text-xs"
              placeholder={t('appLicenses.planTaglinePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Harga Promo / Jual (Rp)
            </label>
            <input
              type="number"
              min={0}
              value={priceAmount}
              onChange={(e) => setPriceAmount(Number(e.target.value))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Harga Asli / Coret (Rp){' '}
              {originalPriceAmount > priceAmount && (
                <span className="text-[11px] font-semibold text-[var(--panel-danger-text)]">
                  (Hemat {Math.round(((originalPriceAmount - priceAmount) / originalPriceAmount) * 100)}%)
                </span>
              )}
            </label>
            <input
              type="number"
              min={0}
              value={originalPriceAmount}
              onChange={(e) => setOriginalPriceAmount(Math.max(0, Number(e.target.value)))}
              className="panel-input panel-input--mono w-full text-xs"
              placeholder="0 = tanpa harga coret"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Promo Berlaku Sampai
            </label>
            <input
              type="text"
              value={promoValidUntil}
              onChange={(e) => setPromoValidUntil(e.target.value)}
              className="panel-input w-full text-xs"
              placeholder={t('appLicenses.promoUntilPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Durasi (Bulan)
            </label>
            <input
              type="number"
              min={1}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Durasi Trial (Hari, 0 = tanpa trial)
            </label>
            <input
              type="number"
              min={0}
              value={trialDays}
              onChange={(e) => setTrialDays(Math.max(0, Number(e.target.value)))}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={highlighted}
              onChange={(e) => setHighlighted(e.target.checked)}
              className="rounded border-[var(--win-border)]"
            />
            <span>Tandai Paling Populer</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-[var(--win-border)]"
            />
            <span>Paket Aktif</span>
          </label>
        </div>

        {pairedPlan ? (
          <div className="p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--win-bg)] text-xs">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncPairedFeatures}
                onChange={(e) => setSyncPairedFeatures(e.target.checked)}
                className="rounded border-[var(--win-border)] mt-0.5"
              />
              <div>
                <span className="font-medium text-[var(--win-text)]">
                  Sinkronkan fitur, kuota &amp; promo ke pasangan ({pairedPlan.name})
                </span>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Menjaga kuota &amp; fitur Bulanan dan Tahunan selalu 100% identik secara otomatis.
                </p>
              </div>
            </label>
          </div>
        ) : period === 'monthly' ? (
          <div className="p-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--win-bg)] text-xs space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={alsoCreateAnnual}
                onChange={(e) => setAlsoCreateAnnual(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span className="font-medium text-[var(--win-text)]">
                Sekalian buatkan versi Tahunan (fitur &amp; kuota identik)
              </span>
            </label>
            {alsoCreateAnnual && (
              <div className="flex items-center justify-between gap-2 pl-5">
                <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                  Diskon Tahunan: {annualDiscountPercent}% → Rp{' '}
                  {(annualDiscountPercent === 17
                    ? Math.max(0, priceAmount) * 10
                    : Math.round((Math.max(0, priceAmount) * 12 * (1 - annualDiscountPercent / 100)) / 1000) * 1000
                  ).toLocaleString('id-ID')}
                  /thn
                </span>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={annualDiscountPercent}
                  onChange={(e) => setAnnualDiscountPercent(Math.max(0, Math.min(80, Number(e.target.value))))}
                  className="panel-input panel-input--mono w-16 text-xs"
                />
              </div>
            )}
          </div>
        ) : null}

        <div className="pt-2 border-t border-[var(--win-border)] space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--win-text)]">
            <KeyRound size={14} className="text-[var(--panel-primary-text)]" />
            <span>Fitur & Kuota Paket</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={liveChat}
                onChange={(e) => setLiveChat(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Live Chat CRM (Conversation)</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={multiSession}
                onChange={(e) => setMultiSession(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Multi-Sesi WhatsApp</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={unlimitedBroadcast}
                onChange={(e) => setUnlimitedBroadcast(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Broadcast WA Tanpa Batas</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={wahaSync}
                onChange={(e) => setWahaSync(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Integrasi WAHA</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={birthdayBot}
                onChange={(e) => setBirthdayBot(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Bot Ulang Tahun</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={customRoles}
                onChange={(e) => setCustomRoles(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Role CS Kustom Granular</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={omnichannel}
                onChange={(e) => setOmnichannel(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Omnichannel Sosial</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={scheduledPosts}
                onChange={(e) => setScheduledPosts(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Jadwal Post &amp; Story WA</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={autoReply}
                onChange={(e) => setAutoReply(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Auto-Reply &amp; Jam Kerja</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={aiAgent}
                onChange={(e) => setAiAgent(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Agent AI Multi-Model</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={mcpTools}
                onChange={(e) => setMcpTools(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>MCP Tool Servers</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={exportReports}
                onChange={(e) => setExportReports(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Ekspor Laporan CSV</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--panel-surface-hover)]">
              <input
                type="checkbox"
                checked={apiAccess}
                onChange={(e) => setApiAccess(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Akses API &amp; Webhook</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Maks. Kontak <span className="text-[11px] font-normal text-[var(--text-secondary)]">(0 = Tanpa Batas)</span>
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
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Kuota Sesi WA <span className="text-[11px] font-normal text-[var(--text-secondary)]">(Multi-Sesi)</span>
              </label>
              <input
                type="number"
                min={1}
                value={maxSessions}
                onChange={(e) => {
                  const val = Math.max(1, Number(e.target.value))
                  setMaxSessions(val)
                  if (val > 1) setMultiSession(true)
                }}
                className="panel-input panel-input--mono w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Batas Ganti Nomor / Sesi <span className="text-[11px] font-normal text-[var(--text-secondary)]">(x kali)</span>
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
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Kuota Broadcast / Bulan
              </label>
              <input
                type="number"
                min={0}
                disabled={unlimitedBroadcast}
                value={unlimitedBroadcast ? 0 : maxBroadcastPerMonth}
                onChange={(e) => setMaxBroadcastPerMonth(Number(e.target.value))}
                className="panel-input panel-input--mono w-full text-xs disabled:opacity-50"
                placeholder={unlimitedBroadcast ? 'Tanpa Batas' : '500'}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Kuota Template <span className="text-[11px] font-normal text-[var(--text-secondary)]">(0 = Tanpa Batas)</span>
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
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
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
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Kuota Akun Kanal <span className="text-[11px] font-normal text-[var(--text-secondary)]">(0 = Unlimited)</span>
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
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
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

            <div>
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Kapasitas Penyimpanan Media (MB) <span className="text-[11px] font-normal text-[var(--text-secondary)]">(5120 = 5 GB)</span>
              </label>
              <input
                type="number"
                min={100}
                value={maxStorageMb}
                onChange={(e) => setMaxStorageMb(Math.max(100, Number(e.target.value)))}
                className="panel-input panel-input--mono w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Maks. Ukuran Berkas / Dokumen (MB)
              </label>
              <input
                type="number"
                min={1}
                value={maxAttachmentSizeMb}
                onChange={(e) => setMaxAttachmentSizeMb(Math.max(1, Number(e.target.value)))}
                className="panel-input panel-input--mono w-full text-xs"
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}

