import { useState, useEffect } from 'react'
import { Pencil, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateAppLicense, type AppLicense } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface EditLicenseModalProps {
  open: boolean
  license: AppLicense | null
  onClose: () => void
  onSuccess: () => void
}

function toDateInputValue(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

export function EditLicenseModal({
  open,
  license,
  onClose,
  onSuccess,
}: EditLicenseModalProps) {
  const [appName, setAppName] = useState('')
  const [status, setStatus] = useState<'ACTIVE' | 'TRIAL' | 'EXPIRED'>('ACTIVE')
  const [planName, setPlanName] = useState('')
  const [period, setPeriod] = useState('monthly')
  const [priceAmount, setPriceAmount] = useState<number>(0)
  const [expiresDate, setExpiresDate] = useState('')

  // Feature flags
  const [unlimitedBroadcast, setUnlimitedBroadcast] = useState(false)
  const [liveChat, setLiveChat] = useState(false)
  const [multiSession, setMultiSession] = useState(false)
  const [maxSessions, setMaxSessions] = useState<number>(1)
  const [birthdayBot, setBirthdayBot] = useState(false)
  const [wahaSync, setWahaSync] = useState(false)
  const [maxContacts, setMaxContacts] = useState<number>(1000)

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && license) {
      setAppName(license.appName || '')
      setStatus(
        license.status === 'TRIAL' || license.status === 'EXPIRED' ? license.status : 'ACTIVE'
      )
      setPlanName(license.planName || '')
      setPeriod(license.period || 'monthly')
      setPriceAmount(license.priceAmount ?? 0)
      setExpiresDate(toDateInputValue(license.expiresAt))

      const feats = license.features || {}
      setUnlimitedBroadcast(Boolean(feats.unlimitedBroadcast ?? feats.broadcast))
      setLiveChat(Boolean(feats.liveChat ?? feats.liveChatCrm))
      setMultiSession(Boolean(feats.multiSession ?? feats.multiUser))
      setMaxSessions(Number(feats.maxSessions ?? 1) || 1)
      setBirthdayBot(Boolean(feats.birthdayBot ?? feats.botBirthday))
      setWahaSync(Boolean(feats.wahaSync))
      setMaxContacts(Number(feats.maxContacts ?? 1000) || 1000)
    }
  }, [open, license])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!license) return
    if (!appName.trim()) {
      toast.error('Nama aplikasi wajib diisi')
      return
    }
    if (!planName.trim()) {
      toast.error('Nama paket wajib diisi')
      return
    }

    setLoading(true)
    try {
      const mergedFeatures: Record<string, string | number | boolean> = {
        ...(license.features || {}),
        unlimitedBroadcast,
        liveChat,
        multiSession,
        maxSessions: multiSession ? Math.max(1, maxSessions) : 1,
        birthdayBot,
        wahaSync,
        maxContacts: Math.max(0, maxContacts),
      }

      const expiresAtIso = expiresDate ? `${expiresDate}T23:59:59Z` : undefined

      await updateAppLicense(license.id, {
        appName: appName.trim(),
        status,
        planName: planName.trim(),
        period,
        priceAmount: Math.max(0, priceAmount),
        expiresAt: expiresAtIso,
        features: mergedFeatures,
      })

      toast.success('Lisensi berhasil diperbarui')
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal memperbarui lisensi')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  if (!license) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Lisensi Aplikasi"
      subtitle={`${license.catalogId} · ${license.licenseKey}`}
      icon={<Pencil className="text-emerald-500" size={20} />}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            type="submit"
            form="edit-license-form"
            variant="primary"
            size="sm"
            loading={loading}
            className="gap-1.5"
          >
            <CheckCircle2 size={14} />
            Simpan Perubahan
          </Button>
        </div>
      }
    >
      <form id="edit-license-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Nama Aplikasi
            </label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="panel-input w-full text-xs"
              placeholder="Reneo CRM Services"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Status Lisensi
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'TRIAL' | 'EXPIRED')}
              className="panel-input w-full text-xs"
            >
              <option value="ACTIVE">ACTIVE (Aktif)</option>
              <option value="TRIAL">TRIAL (Uji Coba)</option>
              <option value="EXPIRED">EXPIRED (Kedaluwarsa)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Nama Paket
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="panel-input w-full text-xs"
              placeholder="Bulanan (Pro)"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Periode Tagihan
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="panel-input w-full text-xs"
            >
              <option value="monthly">Bulanan (monthly)</option>
              <option value="yearly">Tahunan (yearly)</option>
              <option value="lifetime">Selamanya (lifetime)</option>
            </select>
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
              Masa Berlaku Hingga
            </label>
            <input
              type="date"
              value={expiresDate}
              onChange={(e) => setExpiresDate(e.target.value)}
              className="panel-input panel-input--mono w-full text-xs"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-[var(--win-border)] space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--win-text)]">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Hak Fitur & Kuota</span>
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                Maksimal Kontak CRM
              </label>
              <input
                type="number"
                min={0}
                value={maxContacts}
                onChange={(e) => setMaxContacts(Number(e.target.value))}
                className="panel-input panel-input--mono w-full text-xs"
              />
            </div>

            {multiSession && (
              <div>
                <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
                  Maksimal Sesi WA
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxSessions}
                  onChange={(e) => setMaxSessions(Number(e.target.value))}
                  className="panel-input panel-input--mono w-full text-xs"
                />
              </div>
            )}
          </div>
        </div>
      </form>
    </Modal>
  )
}
