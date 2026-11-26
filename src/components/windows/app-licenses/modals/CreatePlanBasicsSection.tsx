import type { AvailableApp } from '@/api/appLicenses'
import { useI18n } from '@/lib/i18n'
import { computeAnnualPrice, computeDiscountPercent } from './featureQuotas'

export type PlanBillingMode = 'both' | 'monthly' | 'annual'

interface CreatePlanBasicsSectionProps {
  availableApps: AvailableApp[]
  catalogId: string
  isCustomApp: boolean
  customCatalogId: string
  name: string
  tagline: string
  billingMode: PlanBillingMode
  trialDays: number
  priceAmount: number
  originalPriceAmount: number
  annualDiscountPercent: number
  promoValidUntil: string
  highlighted: boolean
  onCatalogChange: (catalogId: string, isCustom: boolean) => void
  onCustomCatalogIdChange: (value: string) => void
  onNameChange: (value: string) => void
  onTaglineChange: (value: string) => void
  onBillingModeChange: (mode: PlanBillingMode) => void
  onAnnualDiscountChange: (value: number) => void
  onPriceAmountChange: (value: number) => void
  onOriginalPriceAmountChange: (value: number) => void
  onPromoValidUntilChange: (value: string) => void
  onTrialDaysChange: (value: number) => void
  onHighlightedChange: (value: boolean) => void
}

const BILLING_OPTIONS: ReadonlyArray<{ id: PlanBillingMode; label: string }> = [
  { id: 'both', label: 'Bulanan + Tahunan' },
  { id: 'monthly', label: 'Bulanan Saja' },
  { id: 'annual', label: 'Tahunan Saja' },
]

export function CreatePlanBasicsSection({
  availableApps,
  catalogId,
  isCustomApp,
  customCatalogId,
  name,
  tagline,
  billingMode,
  trialDays,
  priceAmount,
  originalPriceAmount,
  annualDiscountPercent,
  promoValidUntil,
  highlighted,
  onCatalogChange,
  onCustomCatalogIdChange,
  onNameChange,
  onTaglineChange,
  onBillingModeChange,
  onAnnualDiscountChange,
  onPriceAmountChange,
  onOriginalPriceAmountChange,
  onPromoValidUntilChange,
  onTrialDaysChange,
  onHighlightedChange,
}: CreatePlanBasicsSectionProps) {
  const { t } = useI18n()

  return (
    <>
      <div>
        <label className="block font-semibold text-[var(--win-text)] mb-1.5">
          Pilih Aplikasi:
        </label>
        <select
          value={isCustomApp ? '__custom__' : catalogId}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              onCatalogChange(catalogId, true)
            } else {
              onCatalogChange(e.target.value, false)
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
            onChange={(e) => onCustomCatalogIdChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder={t('appLicenses.planSlugPlaceholder')}
            className="w-full px-3 py-1.5 font-mono rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--win-text)] focus:outline-none focus:border-[var(--panel-primary-text)] text-xs"
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-medium text-[var(--win-text)] mb-1">
            Nama Paket:
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
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
            onChange={(e) => onTaglineChange(e.target.value)}
            placeholder={t('appLicenses.planTaglinePlaceholder')}
            className="w-full px-3 py-1.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] text-[var(--win-text)] focus:outline-none focus:border-[var(--panel-primary-text)] text-xs"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block font-medium text-[var(--win-text)]">
          Opsi Penagihan Paket:
        </label>
        <div className="grid grid-cols-3 gap-2">
          {BILLING_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onBillingModeChange(opt.id)}
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
                onChange={(e) => onAnnualDiscountChange(Math.max(0, Math.min(80, Number(e.target.value))))}
                className="panel-input panel-input--mono w-20 text-xs"
              />
              <span className="text-[11px] text-[var(--text-secondary)]">%</span>
            </div>
          </div>
        )}
      </div>

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
            onChange={(e) => onPriceAmountChange(Number(e.target.value))}
            className="panel-input panel-input--mono w-full text-xs"
          />
        </div>

        <div>
          <label className="block font-medium text-[var(--win-text)] mb-1">
            Harga Asli / Coret (Rp):{' '}
            {originalPriceAmount > priceAmount && (
              <span className="text-[11px] font-semibold text-[var(--panel-danger-text)]">
                (Hemat {computeDiscountPercent(originalPriceAmount, priceAmount)}%)
              </span>
            )}
          </label>
          <input
            type="number"
            step={1000}
            min={0}
            value={originalPriceAmount}
            onChange={(e) => onOriginalPriceAmountChange(Math.max(0, Number(e.target.value)))}
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
            onChange={(e) => onPromoValidUntilChange(e.target.value)}
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
            onChange={(e) => onTrialDaysChange(Math.max(0, Number(e.target.value)))}
            className="panel-input panel-input--mono w-full text-xs"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={highlighted}
              onChange={(e) => onHighlightedChange(e.target.checked)}
              className="rounded border-[var(--win-border)] accent-[var(--panel-primary)]"
            />
            <span className="font-medium text-[var(--win-text)]">
              Tandai &quot;Populer&quot;
            </span>
          </label>
        </div>
      </div>
    </>
  )
}
