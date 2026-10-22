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
  const { plan, plans, setSlug, trialOffered, isTrial, setTrial, maxPeriods, count, setPeriods, price, total, voucherApplied, voucherValid } = order
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
      {isTrial ? (
        <p className="flex items-baseline justify-between text-[0.875rem]">
          <span className="text-[var(--text-secondary)]">{t('order.trialNote', { days: plan.trialDays })}</span>
          <span className="panel-mono font-semibold text-[var(--win-text)]">{t('hosting.landing.free')}</span>
        </p>
      ) : total === 0 && plan.priceAmount === 0 ? (
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
