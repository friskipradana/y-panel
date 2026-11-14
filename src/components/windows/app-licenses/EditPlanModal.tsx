import { useState, useEffect } from 'react'
import { Pencil, CheckCircle2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { updateAppLicensePlan, type AppLicensePlan } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface EditPlanModalProps {
  open: boolean
  plan: AppLicensePlan | null
  onClose: () => void
  onSuccess: () => void
}

export function EditPlanModal({
  open,
  plan,
  onClose,
  onSuccess,
}: EditPlanModalProps) {
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [months, setMonths] = useState<number>(1)
  const [priceAmount, setPriceAmount] = useState<number>(99000)
  const [highlighted, setHighlighted] = useState(false)
  const [isActive, setIsActive] = useState(true)

  // Feature flags & monetization quotas
  const [maxContacts, setMaxContacts] = useState<number>(10000)
  const [unlimitedBroadcast, setUnlimitedBroadcast] = useState(true)
  const [maxBroadcastPerMonth, setMaxBroadcastPerMonth] = useState<number>(0)
  const [liveChat, setLiveChat] = useState(true)
  const [multiSession, setMultiSession] = useState(false)
  const [maxSessions, setMaxSessions] = useState<number>(1)
  const [maxTemplates, setMaxTemplates] = useState<number>(0)
  const [maxUsers, setMaxUsers] = useState<number>(1)
  const [birthdayBot, setBirthdayBot] = useState(true)
  const [wahaSync, setWahaSync] = useState(true)
  const [apiAccess, setApiAccess] = useState(false)
  const [supportPriority, setSupportPriority] = useState<string>('standard')

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && plan) {
      setName(plan.name || '')
      setTagline(plan.tagline || '')
      setPeriod(plan.period === 'annual' ? 'annual' : 'monthly')
      setMonths(plan.months || (plan.period === 'annual' ? 12 : 1))
      setPriceAmount(plan.priceAmount ?? 0)
      setHighlighted(Boolean(plan.highlighted))
      setIsActive(plan.isActive !== false)

      const feats = plan.features || {}
      setMaxContacts(Number(feats.maxContacts ?? 10000) || 0)
      const isUnlim = Boolean(feats.unlimitedBroadcast ?? feats.broadcast)
      setUnlimitedBroadcast(isUnlim)
      setMaxBroadcastPerMonth(Number(feats.maxBroadcastPerMonth ?? (isUnlim ? 0 : 500)) || 0)
      setLiveChat(Boolean(feats.liveChat ?? feats.liveChatCrm))
      const isMulti = Boolean(feats.multiSession ?? feats.multiUser)
      setMultiSession(isMulti)
      setMaxSessions(Number(feats.maxSessions ?? (isMulti ? 5 : 1)) || 1)
      setMaxTemplates(Number(feats.maxTemplates ?? 0) || 0)
      setMaxUsers(Number(feats.maxUsers ?? 1) || 1)
      setBirthdayBot(Boolean(feats.birthdayBot ?? feats.botBirthday))
      setWahaSync(Boolean(feats.wahaSync))
      setApiAccess(Boolean(feats.apiAccess))
      setSupportPriority(String(feats.supportPriority || 'standard').toLowerCase())
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
        unlimitedBroadcast,
        maxBroadcastPerMonth: unlimitedBroadcast ? 0 : Math.max(0, maxBroadcastPerMonth),
        liveChat,
        multiSession: multiSession || maxSessions > 1,
        maxSessions: Math.max(1, maxSessions),
        maxTemplates: Math.max(0, maxTemplates),
        maxUsers: Math.max(1, maxUsers),
        birthdayBot,
        wahaSync,
        apiAccess,
        supportPriority,
      }

      await updateAppLicensePlan(plan.id, {
        catalogId: plan.catalogId,
        slug: plan.slug,
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        period,
        months: Math.max(1, months),
        priceAmount: Math.max(0, priceAmount),
        highlighted,
        isActive,
        features: mergedFeatures,
      })

      toast.success('Paket tarif berhasil diperbarui')
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
      title="Edit Paket & Tarif"
      subtitle={`${plan.catalogId} · ${plan.slug}`}
      icon={<Pencil className="text-emerald-500" size={20} />}
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
            className="gap-1.5"
          >
            <CheckCircle2 size={14} />
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
              placeholder="Pro Bulanan"
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
              placeholder="Cocok untuk UMKM..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Tarif (Rp)
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

        <div className="pt-2 border-t border-[var(--win-border)] space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--win-text)]">
            <KeyRound size={14} className="text-[var(--panel-primary-text)]" />
            <span>Fitur & Kuota Paket</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--card-hover-bg)]">
              <input
                type="checkbox"
                checked={liveChat}
                onChange={(e) => setLiveChat(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Live Chat CRM (Conversation)</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--card-hover-bg)]">
              <input
                type="checkbox"
                checked={multiSession}
                onChange={(e) => setMultiSession(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Multi-Sesi WhatsApp</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--card-hover-bg)]">
              <input
                type="checkbox"
                checked={unlimitedBroadcast}
                onChange={(e) => setUnlimitedBroadcast(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Broadcast WA Tanpa Batas</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--card-hover-bg)]">
              <input
                type="checkbox"
                checked={wahaSync}
                onChange={(e) => setWahaSync(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Integrasi WAHA</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--card-hover-bg)]">
              <input
                type="checkbox"
                checked={birthdayBot}
                onChange={(e) => setBirthdayBot(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Bot Ulang Tahun</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-[var(--win-border)] cursor-pointer hover:bg-[var(--card-hover-bg)]">
              <input
                type="checkbox"
                checked={apiAccess}
                onChange={(e) => setApiAccess(e.target.checked)}
                className="rounded border-[var(--win-border)]"
              />
              <span>Akses API & Webhook</span>
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
        </div>
      </form>
    </Modal>
  )
}

