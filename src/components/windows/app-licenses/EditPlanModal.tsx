import { useState, useEffect, useMemo } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { createAppLicensePlan, updateAppLicensePlan, type AppLicensePlan } from '@/api/appLicenses'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/lib/i18n'
import { EditPlanBasicsSection } from './modals/EditPlanBasicsSection'
import { FeatureFlagsQuotasSection } from './modals/FeatureFlagsQuotasSection'
import {
  EDIT_PLAN_DEFAULT_FEATURES,
  buildFeaturesPayload,
  computeAnnualPrice,
  computeDiscountPercent,
  extractApiError,
  parseFeaturesFromRecord,
  type LicenseFeatureState,
} from './modals/featureQuotas'

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
  const [features, setFeatures] = useState<LicenseFeatureState>(EDIT_PLAN_DEFAULT_FEATURES)
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
      setFeatures(parseFeaturesFromRecord(plan.features, 10000))
      setSyncPairedFeatures(true)
      setAlsoCreateAnnual(false)
      setAnnualDiscountPercent(17)
    }
  }, [open, plan])

  const updateFeature = <K extends keyof LicenseFeatureState>(
    key: K,
    val: LicenseFeatureState[K]
  ) => {
    setFeatures((prev) => ({ ...prev, [key]: val }))
  }

  const handlePeriodChange = (p: 'monthly' | 'annual') => {
    setPeriod(p)
    setMonths(p === 'annual' ? 12 : 1)
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
      const mergedFeatures = buildFeaturesPayload(features, {
        base: plan.features,
        includeIdentitySwitches: true,
        includeStorage: true,
      })

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
        discountPercent: computeDiscountPercent(originalPriceAmount, priceAmount),
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
        const monthlyPrice = Math.max(0, priceAmount)
        const annualPrice = computeAnnualPrice(monthlyPrice, annualDiscountPercent)
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
          discountPercent: computeDiscountPercent(annualOrig, annualPrice),
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
      toast.error(extractApiError(err, 'Gagal memperbarui paket tarif'))
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
        <EditPlanBasicsSection
          name={name}
          tagline={tagline}
          period={period}
          months={months}
          trialDays={trialDays}
          priceAmount={priceAmount}
          originalPriceAmount={originalPriceAmount}
          promoValidUntil={promoValidUntil}
          highlighted={highlighted}
          isActive={isActive}
          pairedPlan={pairedPlan}
          syncPairedFeatures={syncPairedFeatures}
          alsoCreateAnnual={alsoCreateAnnual}
          annualDiscountPercent={annualDiscountPercent}
          onNameChange={setName}
          onTaglineChange={setTagline}
          onPeriodChange={handlePeriodChange}
          onMonthsChange={setMonths}
          onTrialDaysChange={setTrialDays}
          onPriceAmountChange={setPriceAmount}
          onOriginalPriceAmountChange={setOriginalPriceAmount}
          onPromoValidUntilChange={setPromoValidUntil}
          onHighlightedChange={setHighlighted}
          onIsActiveChange={setIsActive}
          onSyncPairedFeaturesChange={setSyncPairedFeatures}
          onAlsoCreateAnnualChange={setAlsoCreateAnnual}
          onAnnualDiscountPercentChange={setAnnualDiscountPercent}
        />

        <FeatureFlagsQuotasSection
          title={t('appLicenses.planFeaturesQuotasTitle')}
          value={features}
          onChange={updateFeature}
          showIdentitySwitches
          showStorageLimits
        />
      </form>
    </Modal>
  )
}
