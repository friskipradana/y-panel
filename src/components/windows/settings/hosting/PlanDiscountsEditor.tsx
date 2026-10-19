import type { DurationDiscount, PlanPeriod } from '@/api/hosting'
import { periodChoices, useDurationLabel } from '@/components/hosting/PeriodPicker'
import { Field, TextInput } from '@/components/ui/Field'
import { useI18n } from '@/lib/i18n'

export const MAX_DISCOUNT_PERCENT = 90

// One box of percent for each length the buyer can pick (3, 6, 12 and 24 months for a monthly plan, 2 years for a yearly one)
export function PlanDiscountsEditor({
  period,
  values,
  onChange,
}: {
  period: PlanPeriod
  /** Percent as typed, by the number of periods */
  values: Record<number, string>
  onChange: (next: Record<number, string>) => void
}) {
  const { t } = useI18n()
  const label = useDurationLabel(period)
  const tiers = periodChoices(period).filter((count) => count > 1)
  if (tiers.length === 0) return null

  return (
    <section aria-label={t('hosting.plan.discounts')}>
      <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('hosting.plan.discounts')}</p>
      <p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{t('hosting.plan.discountsHint')}</p>
      <div className="panel-grid-compact panel-grid-compact--3">
        {tiers.map((count) => {
          const raw = values[count] ?? ''
          const number = Number(raw)
          const invalid = raw !== '' && (!Number.isFinite(number) || number < 0 || number > MAX_DISCOUNT_PERCENT || !Number.isInteger(number))
          return (
            <Field key={count} label={label(count)} error={invalid ? t('hosting.plan.discountInvalid', { max: MAX_DISCOUNT_PERCENT }) : undefined}>
              <TextInput
                mono
                type="number"
                min={0}
                max={MAX_DISCOUNT_PERCENT}
                value={raw}
                placeholder="0"
                invalid={invalid}
                onChange={(e) => onChange({ ...values, [count]: e.target.value })}
              />
            </Field>
          )
        })}
      </div>
    </section>
  )
}

// The boxes as the list the agent stores: only the tiers that take something off
export function discountsFromValues(period: PlanPeriod, values: Record<number, string>): DurationDiscount[] {
  if (period === 'once') return []
  return periodChoices(period)
    .filter((count) => count > 1)
    .map((count) => ({ periods: count, percent: Math.round(Number(values[count] ?? 0)) }))
    .filter((tier) => tier.percent > 0)
}

export function valuesFromDiscounts(discounts: DurationDiscount[] | undefined): Record<number, string> {
  const out: Record<number, string> = {}
  for (const tier of discounts ?? []) out[tier.periods] = String(tier.percent)
  return out
}

export function discountsValid(period: PlanPeriod, values: Record<number, string>): boolean {
  return periodChoices(period)
    .filter((count) => count > 1)
    .every((count) => {
      const raw = values[count] ?? ''
      if (raw === '') return true
      const number = Number(raw)
      return Number.isInteger(number) && number >= 0 && number <= MAX_DISCOUNT_PERCENT
    })
}
