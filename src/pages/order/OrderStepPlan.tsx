import { formatRupiah } from '@/api/hosting'
import { PeriodPicker } from '@/components/hosting/PeriodPicker'
import { PriceLines } from '@/components/hosting/PriceLines'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'
import type { OrderFormState } from './useOrderForm'

// Step 1: which plan, buy or try, and for how many periods
export function OrderStepPlan({ order }: { order: OrderFormState }) {
  const { t } = useI18n()
  const {
    plan, plans, setSlug, trialOffered, isTrial, setTrial, maxPeriods, count, setPeriods,
    appAddon, planIncludesApp, addonSelected, addonAmount, setAddonSelected,
    price, total, voucherApplied, voucherValid,
  } = order
  if (!plan) return null

  return (
    <section className="space-y-3">
      <Field label={t('order.plan')} htmlFor="order-plan">
        <Select
          id="order-plan"
          value={plan.slug}
          onChange={setSlug}
          options={plans.map((p) => ({
            value: p.slug,
            label: p.name,
            description: p.priceAmount === 0 ? t('hosting.landing.free') : `${formatRupiah(p.priceAmount)} ${t(`hosting.period.${p.period}`)}`,
          }))}
        />
      </Field>
      {trialOffered ? (
        <div className="flex gap-2" role="group" aria-label={t('order.mode')}>
          <Button type="button" size="sm" variant={isTrial ? 'outline' : 'primary'} onClick={() => setTrial(false)}>
            {t('order.buy')}
          </Button>
          <Button type="button" size="sm" variant={isTrial ? 'primary' : 'outline'} onClick={() => setTrial(true)}>
            {t('order.trial', { days: plan.trialDays })}
          </Button>
        </div>
      ) : null}
      {!isTrial && maxPeriods > 1 ? (
        <Field label={t('order.periods')}>
          <PeriodPicker plan={plan} value={count} maxPeriods={maxPeriods} onChange={(n) => setPeriods(String(n))} />
        </Field>
      ) : null}
      {!isTrial && (planIncludesApp || appAddon) ? (
        planIncludesApp ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--panel-success-border)] bg-[var(--panel-success-bg)] px-3 py-2 text-[0.8125rem]">
            <div>
              <p className="font-medium text-[var(--panel-success-text)]">{t('order.addon.includedTitle')}</p>
              <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('order.addon.includedHint')}</p>
            </div>
            <span className="panel-badge panel-badge--success shrink-0">{t('order.addon.includedBadge')}</span>
          </div>
        ) : appAddon ? (
          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors ${
              addonSelected
                ? 'border-[var(--panel-primary)] bg-[var(--panel-primary-soft)]'
                : 'border-[var(--win-border)] bg-[var(--win-bg-soft)] hover:border-[var(--panel-primary)]'
            }`}
          >
            <input
              type="checkbox"
              checked={addonSelected}
              onChange={(e) => setAddonSelected(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--panel-primary)]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.8125rem] font-medium text-[var(--win-text)]">{t('order.addon.title')}</span>
                <span className="panel-mono text-[0.8125rem] font-semibold text-[var(--win-text)]">
                  + {formatRupiah(appAddon.priceAmount)} {t('hosting.period.monthly')}
                </span>
              </div>
              <p className="mt-0.5 text-[0.75rem] text-[var(--text-secondary)]">
                {addonSelected && addonAmount > 0
                  ? t('order.addon.selectedHint', { amount: formatRupiah(addonAmount) })
                  : t('order.addon.hint')}
              </p>
            </div>
          </label>
        ) : null
      ) : null}
      {isTrial ? (
        <p className="flex items-baseline justify-between text-[0.875rem]">
          <span className="text-[var(--text-secondary)]">{t('order.trialNote', { days: plan.trialDays })}</span>
          <span className="panel-mono font-semibold text-[var(--win-text)]">{t('hosting.landing.free')}</span>
        </p>
      ) : total === 0 && plan.priceAmount === 0 && !addonSelected ? (
        <p className="flex items-baseline justify-between text-[0.875rem]">
          <span className="text-[var(--text-secondary)]">{t('order.price')}</span>
          <span className="panel-mono font-semibold text-[var(--win-text)]">{t('hosting.landing.free')}</span>
        </p>
      ) : (
        <PriceLines
          list={price.list}
          promoPercent={price.promoPercent}
          promoDiscount={price.promoDiscount}
          durationPercent={price.durationPercent}
          durationDiscount={price.durationDiscount}
          voucherCode={voucherValid ? voucherApplied : undefined}
          voucherDiscount={voucherValid ? price.voucherDiscount : 0}
          subtotal={voucherValid || !voucherApplied ? price.subtotal : price.list - price.promoDiscount - price.durationDiscount}
        />
      )}
    </section>
  )
}
