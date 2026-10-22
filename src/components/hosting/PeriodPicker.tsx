import { formatRupiah, type HostingPlan } from '@/api/hosting'
import { priceFor, type PromoFields } from '@/lib/planPricing'
import { Badge } from '@/components/ui/Badge'
import { SelectableCard } from '@/components/ui/SelectableCard'
import { useI18n } from '@/lib/i18n'

// How long a plan can be bought for, as the buyer thinks of it: a monthly plan by 1, 3, 6, 12 or 24 months, a yearly one by 1 or 2 years.
// The number sent to the agent is still a count of the plan's own period.
const CHOICES = { monthly: [1, 3, 6, 12, 24], yearly: [1, 2], once: [1] } as const

export const periodChoices = (period: HostingPlan['period']): readonly number[] => CHOICES[period]

// Months of a choice, for the name: 12 months reads as 1 year
export function useDurationLabel(period: HostingPlan['period']) {
  const { t } = useI18n()
  return (count: number) => {
    const months = period === 'yearly' ? count * 12 : count
    if (months % 12 === 0) {
      const years = months / 12
      return years === 1 ? t('order.duration.year') : t('order.duration.years', { count: years })
    }
    return months === 1 ? t('order.duration.month') : t('order.duration.months', { count: months })
  }
}

export function PeriodPicker({ plan, value, onChange, maxPeriods, kind = 'new' }: { plan: Pick<HostingPlan, 'period' | 'priceAmount' | 'durationDiscounts'> & PromoFields; value: number; onChange: (periods: number) => void; maxPeriods: number; kind?: 'new' | 'renew' }) {
  const { t } = useI18n()
  const label = useDurationLabel(plan.period)
  const choices = periodChoices(plan.period).filter((count) => count <= maxPeriods)
  if (choices.length < 2) return null

  return (
    <div role="group" aria-label={t('order.periods')} className="grid gap-1.5">
      {choices.map((count) => {
        const price = priceFor(plan, count, null, kind)
        return (
          <SelectableCard key={count} selected={value === count} onClick={() => onChange(count)} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left">
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-[0.875rem] font-semibold text-[var(--win-text)]">{label(count)}</span>
              {price.durationPercent > 0 ? <Badge tone="success" size="sm">{t('order.save', { percent: price.durationPercent })}</Badge> : null}
            </span>
            <span className="panel-mono flex shrink-0 flex-wrap items-baseline justify-end gap-x-1.5 text-[0.8125rem] text-[var(--win-text)]">
              {price.durationDiscount > 0 || price.promoDiscount > 0 ? <s className="text-[0.75rem] text-[var(--text-secondary)] opacity-70">{formatRupiah(price.list)}</s> : null}
              {plan.priceAmount === 0 ? t('hosting.landing.free') : formatRupiah(price.subtotal)}
            </span>
          </SelectableCard>
        )
      })}
    </div>
  )
}
