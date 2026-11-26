import { useState, useEffect } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { updateAppLicense, type AppLicense } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'
import { FeatureFlagsQuotasSection } from './modals/FeatureFlagsQuotasSection'
import {
  EDIT_LICENSE_DEFAULT_FEATURES,
  buildFeaturesPayload,
  extractApiError,
  parseFeaturesFromRecord,
  type LicenseFeatureState,
} from './modals/featureQuotas'

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
  const { t } = useI18n()
  const [appName, setAppName] = useState('')
  const [status, setStatus] = useState<'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED'>('ACTIVE')
  const [planName, setPlanName] = useState('')
  const [period, setPeriod] = useState('monthly')
  const [priceAmount, setPriceAmount] = useState<number>(0)
  const [expiresDate, setExpiresDate] = useState('')
  const [features, setFeatures] = useState<LicenseFeatureState>(EDIT_LICENSE_DEFAULT_FEATURES)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && license) {
      setAppName(license.appName || '')
      setStatus(
        license.status === 'TRIAL' ||
          license.status === 'EXPIRED' ||
          license.status === 'SUSPENDED'
          ? license.status
          : 'ACTIVE'
      )
      setPlanName(license.planName || '')
      setPeriod(license.period || 'monthly')
      setPriceAmount(license.priceAmount ?? 0)
      setExpiresDate(toDateInputValue(license.expiresAt))
      setFeatures(parseFeaturesFromRecord(license.features, 1500))
    }
  }, [open, license])

  const updateFeature = <K extends keyof LicenseFeatureState>(
    key: K,
    val: LicenseFeatureState[K]
  ) => {
    setFeatures((prev) => ({ ...prev, [key]: val }))
  }

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
      const mergedFeatures = buildFeaturesPayload(features, { base: license.features })
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
      toast.error(extractApiError(err, 'Gagal memperbarui lisensi'))
    } finally {
      setLoading(false)
    }
  }

  if (!license) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('appLicenses.editLicenseTitle')}
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
          >
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
              placeholder={t('appLicenses.editAppNamePlaceholder')}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
              Status Lisensi
            </label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED')
              }
              className="panel-input w-full text-xs"
            >
              <option value="ACTIVE">ACTIVE (Aktif)</option>
              <option value="TRIAL">TRIAL (Uji Coba)</option>
              <option value="SUSPENDED">SUSPENDED (Disuspend)</option>
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
              placeholder={t('appLicenses.editPlanNamePlaceholder')}
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

        <FeatureFlagsQuotasSection
          title={t('appLicenses.featuresQuotasTitle')}
          value={features}
          onChange={updateFeature}
        />
      </form>
    </Modal>
  )
}
