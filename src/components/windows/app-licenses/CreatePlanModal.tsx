import { useState } from 'react'
import { Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { createAppLicensePlan, type AvailableApp, type CreateAppPlanPayload } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'
import { CreatePlanBasicsSection, type PlanBillingMode } from './modals/CreatePlanBasicsSection'
import { CreatePlanFeaturesSection } from './modals/CreatePlanFeaturesSection'
import {
  CREATE_PLAN_DEFAULT_FEATURES,
  buildFeaturesPayload,
  computeAnnualPrice,
  computeDiscountPercent,
  type LicenseFeatureState,
} from './modals/featureQuotas'

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
  const [billingMode, setBillingMode] = useState<PlanBillingMode>('both')
  const [months, setMonths] = useState<number>(1)
  const [trialDays, setTrialDays] = useState<number>(7)
  const [priceAmount, setPriceAmount] = useState<number>(99000)
  const [originalPriceAmount, setOriginalPriceAmount] = useState<number>(199000)
  const [annualDiscountPercent, setAnnualDiscountPercent] = useState<number>(17)
  const [promoValidUntil, setPromoValidUntil] = useState<string>('30 November 2026')
  const [highlighted, setHighlighted] = useState(false)
  const [features, setFeatures] = useState<LicenseFeatureState>(CREATE_PLAN_DEFAULT_FEATURES)
  const [loading, setLoading] = useState(false)

  const updateFeature = <K extends keyof LicenseFeatureState>(
    key: K,
    val: LicenseFeatureState[K]
  ) => {
    setFeatures((prev) => ({ ...prev, [key]: val }))
  }

  const handleBillingModeChange = (mode: PlanBillingMode) => {
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
      const sharedFeatures = buildFeaturesPayload(features, { includeIdentitySwitches: true })

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
          discountPercent: computeDiscountPercent(monthlyOrig, monthlyPrice),
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
          discountPercent: computeDiscountPercent(annualOrig, annualPrice),
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
          discountPercent: computeDiscountPercent(originalPriceAmount, priceAmount),
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
        <CreatePlanBasicsSection
          availableApps={availableApps}
          catalogId={catalogId}
          isCustomApp={isCustomApp}
          customCatalogId={customCatalogId}
          name={name}
          tagline={tagline}
          billingMode={billingMode}
          trialDays={trialDays}
          priceAmount={priceAmount}
          originalPriceAmount={originalPriceAmount}
          annualDiscountPercent={annualDiscountPercent}
          promoValidUntil={promoValidUntil}
          highlighted={highlighted}
          onCatalogChange={(nextId, custom) => {
            setCatalogId(nextId)
            setIsCustomApp(custom)
          }}
          onCustomCatalogIdChange={setCustomCatalogId}
          onNameChange={setName}
          onTaglineChange={setTagline}
          onBillingModeChange={handleBillingModeChange}
          onAnnualDiscountChange={setAnnualDiscountPercent}
          onPriceAmountChange={setPriceAmount}
          onOriginalPriceAmountChange={setOriginalPriceAmount}
          onPromoValidUntilChange={setPromoValidUntil}
          onTrialDaysChange={setTrialDays}
          onHighlightedChange={setHighlighted}
        />

        <CreatePlanFeaturesSection value={features} onChange={updateFeature} />

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--win-border)]">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            Simpan Paket
          </Button>
        </div>
      </form>
    </Modal>
  )
}
