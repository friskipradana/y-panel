import { Check } from 'lucide-react'
import { formatRupiah, type PublicPlan } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { formatDateID } from '@/lib/datetime'
import { getPlanLimits } from '@/lib/hostingLimits'
import { useI18n } from '@/lib/i18n'
import { maxDurationPercent, priceFor, promoActive } from '@/lib/planPricing'

// Info, pricing, resource quotas, and benefit checklist of the currently chosen hosting plan inside /order
export function OrderPlanDetails({ plan, mainDomain, periods = 1, isTrial = false }: {
  plan: PublicPlan
  mainDomain?: string
  periods?: number
  isTrial?: boolean
}) {
  const { t } = useI18n()
  const limits = getPlanLimits(plan, t, mainDomain)
  const promo = !isTrial && promoActive(plan, 'new') ? priceFor(plan, periods, null, 'new') : null
  const perUnit = !isTrial && promoActive(plan, 'new') ? priceFor(plan, 1, null, 'new') : null
  const maxDurationPct = maxDurationPercent(plan.durationDiscounts)

  return (
    <section
      aria-label={t('order.planDetailsTitle')}
      className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4 space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[0.9375rem] font-semibold text-[var(--win-text)]">{plan.name}</h2>
            {plan.highlighted ? <Badge tone="primary" size="sm">{t('hosting.landing.recommended')}</Badge> : null}
            {promo ? <Badge tone="success" size="sm">{t('order.price.promo', { percent: promo.promoPercent })}</Badge> : null}
          </div>
          {plan.tagline ? (
            <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{plan.tagline}</p>
          ) : null}
        </div>
        <div className="text-right shrink-0">
          {perUnit ? (
            <s className="block panel-mono text-[0.75rem] text-[var(--text-secondary)] opacity-75">
              {formatRupiah(plan.priceAmount)}
            </s>
          ) : null}
          <p className="panel-mono text-[0.9375rem] font-bold text-[var(--win-text)]">
            {plan.priceAmount === 0 ? t('hosting.landing.free') : formatRupiah(perUnit ? perUnit.subtotal : plan.priceAmount)}
          </p>
          {plan.priceAmount > 0 ? (
            <span className="text-[0.75rem] text-[var(--text-secondary)]">{t(`hosting.period.${plan.period}`)}</span>
          ) : null}
        </div>
      </div>

      {promo ? (
        <p className="text-[0.75rem] font-medium text-[var(--panel-success-text)]">
          {t('hosting.landing.promoUntil', { percent: promo.promoPercent, date: formatDateID(plan.promoEndsAt) })}
        </p>
      ) : null}
      {!promo?.promoExclusive && maxDurationPct > 0 ? (
        <p className="text-[0.75rem] font-medium text-[var(--panel-success-text)]">
          {t('hosting.landing.discountUpTo', { percent: maxDurationPct })}
        </p>
      ) : null}

      <div className="border-t border-[var(--win-border)] pt-3">
        <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {t('hosting.landing.limitsLabel')}
        </p>
        <ul className="panel-mono grid gap-x-4 gap-y-1 text-[0.75rem] text-[var(--win-text)] sm:grid-cols-2">
          {limits.map((limit) => (
            <li key={limit} className="truncate">
              {limit}
            </li>
          ))}
        </ul>
      </div>

      {plan.features.length > 0 ? (
        <div className="border-t border-[var(--win-border)] pt-3">
          <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {t('order.planBenefitsLabel')}
          </p>
          <ul className="grid gap-1.5 text-[0.8125rem] sm:grid-cols-2">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-[var(--win-text)]">
                <Check size={14} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" strokeWidth={1.75} aria-hidden="true" />
                <span className="leading-snug">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
