import type { AppLicensePlan } from '@/api/appLicenses'
import { useI18n } from '@/lib/i18n'
import { computeAnnualPrice, computeDiscountPercent } from './featureQuotas'

interface EditPlanBasicsSectionProps {
  name: string
  tagline: string
  period: 'monthly' | 'annual'
  months: number
  trialDays: number
  priceAmount: number
  originalPriceAmount: number
  promoValidUntil: string
  highlighted: boolean
  isActive: boolean
  pairedPlan: AppLicensePlan | null
  syncPairedFeatures: boolean
  alsoCreateAnnual: boolean
  annualDiscountPercent: number
  onNameChange: (value: string) => void
  onTaglineChange: (value: string) => void
  onPeriodChange: (period: 'monthly' | 'annual') => void
  onMonthsChange: (value: number) => void
  onTrialDaysChange: (value: number) => void
  onPriceAmountChange: (value: number) => void
  onOriginalPriceAmountChange: (value: number) => void
  onPromoValidUntilChange: (value: string) => void
  onHighlightedChange: (value: boolean) => void
  onIsActiveChange: (value: boolean) => void
  onSyncPairedFeaturesChange: (value: boolean) => void
  onAlsoCreateAnnualChange: (value: boolean) => void
  onAnnualDiscountPercentChange: (value: number) => void
}

export function EditPlanBasicsSection({
  name,
  tagline,
  period,
  months,
  trialDays,
  priceAmount,
  originalPriceAmount,
  promoValidUntil,
  highlighted,
  isActive,
  pairedPlan,
  syncPairedFeatures,
  alsoCreateAnnual,
  annualDiscountPercent,
  onNameChange,
  onTaglineChange,
  onPeriodChange,
  onMonthsChange,
  onTrialDaysChange,
  onPriceAmountChange,
  onOriginalPriceAmountChange,
  onPromoValidUntilChange,
  onHighlightedChange,
  onIsActiveChange,
  onSyncPairedFeaturesChange,
  onAlsoCreateAnnualChange,
  onAnnualDiscountPercentChange,
}: EditPlanBasicsSectionProps) {
  const { t } = useI18n()

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
            Nama Paket
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
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
            onChange={(e) => onPeriodChange(e.target.value as 'monthly' | 'annual')}
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
            onChange={(e) => onTaglineChange(e.target.value)}
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
            onChange={(e) => onPriceAmountChange(Number(e.target.value))}
            className="panel-input panel-input--mono w-full text-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--win-text)] mb-1">
            Harga Asli / Coret (Rp){' '}
            {originalPriceAmount > priceAmount && (
              <span className="text-[11px] font-semibold text-[var(--panel-danger-text)]">
                (Hemat {computeDiscountPercent(originalPriceAmount, priceAmount)}%)
              </span>
            )}
          </label>
          <input
            type="number"
            min={0}
            value={originalPriceAmount}
            onChange={(e) => onOriginalPriceAmountChange(Math.max(0, Number(e.target.value)))}
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
            onChange={(e) => onPromoValidUntilChange(e.target.value)}
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
            onChange={(e) => onMonthsChange(Number(e.target.value))}
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
            onChange={(e) => onTrialDaysChange(Math.max(0, Number(e.target.value)))}
            className="panel-input panel-input--mono w-full text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={highlighted}
            onChange={(e) => onHighlightedChange(e.target.checked)}
            className="rounded border-[var(--win-border)]"
          />
          <span>Tandai Paling Populer</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => onIsActiveChange(e.target.checked)}
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
              onChange={(e) => onSyncPairedFeaturesChange(e.target.checked)}
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
              onChange={(e) => onAlsoCreateAnnualChange(e.target.checked)}
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
                {computeAnnualPrice(Math.max(0, priceAmount), annualDiscountPercent).toLocaleString('id-ID')}
                /thn
              </span>
              <input
                type="number"
                min={0}
                max={80}
                value={annualDiscountPercent}
                onChange={(e) => onAnnualDiscountPercentChange(Math.max(0, Math.min(80, Number(e.target.value))))}
                className="panel-input panel-input--mono w-16 text-xs"
              />
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}
