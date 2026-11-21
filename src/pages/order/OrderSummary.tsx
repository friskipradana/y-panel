import { formatRupiah } from '@/api/hosting'
import { useDurationLabel } from '@/components/hosting/PeriodPicker'
import { Badge } from '@/components/ui/Badge'
import { monthsLabel } from '@/lib/duration'
import { useI18n } from '@/lib/i18n'
import type { OrderFormState } from './useOrderForm'

// Live sticky order summary for desktop sidebar and compact mobile strip
export function OrderSummary({ order, compact = false }: { order: OrderFormState; compact?: boolean }) {
  const { t } = useI18n()
  const {
    plan, count, isTrial, basePrice, total,
    planIncludesApp, bundledApp, bundledLicense,
    addonSelected, selectedAddonApp, selectedAddonLicense, addonMonths, addonAmount,
    domains, address,
  } = order
  const durationLabel = useDurationLabel(plan?.period ?? 'monthly')
  if (!plan) return null

  const domain = domains.find((d) => d.zoneId === address.zoneId) ?? domains[0]
  const fullHost = address.label && domain ? `${address.label}.${domain.name}` : ''
  const totalFormatted = isTrial || total === 0 ? t('hosting.landing.free') : formatRupiah(total)

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3.5 py-2.5 lg:hidden">
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] font-semibold text-[var(--win-text)]">
            {plan.name}
            {!isTrial && plan.period !== 'once' ? ` · ${durationLabel(count)}` : ''}
          </p>
          {addonSelected && selectedAddonApp && selectedAddonLicense ? (
            <p className="truncate text-[0.75rem] text-[var(--text-secondary)]">
              + {selectedAddonApp.name} ({selectedAddonLicense.name})
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[0.6875rem] text-[var(--text-secondary)]">{t('order.addon.estimatedTotal')}</p>
          <p className="panel-mono text-[0.875rem] font-bold text-[var(--win-text)]">{totalFormatted}</p>
        </div>
      </div>
    )
  }

  return (
    <aside
      aria-label={t('order.summary.title')}
      className="hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5 space-y-4 lg:sticky lg:top-6 lg:block"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--win-border)] pb-3">
        <h2 className="text-[0.875rem] font-semibold text-[var(--win-text)]">{t('order.summary.title')}</h2>
        {isTrial ? <Badge tone="primary" size="sm">{t('order.trial', { days: plan.trialDays })}</Badge> : null}
      </div>

      <dl className="space-y-3 text-[0.8125rem]">
        <div className="flex items-start justify-between gap-3">
          <dt className="min-w-0 text-[var(--text-secondary)]">
            <span className="block font-medium text-[var(--win-text)]">{t('order.addon.hostingLine', { plan: plan.name })}</span>
            {!isTrial && plan.period !== 'once' ? (
              <span className="text-[0.75rem] text-[var(--text-secondary)]">{durationLabel(count)}</span>
            ) : null}
          </dt>
          <dd className="panel-mono shrink-0 font-semibold text-[var(--win-text)]">
            {isTrial || plan.priceAmount === 0 ? t('hosting.landing.free') : formatRupiah(basePrice.subtotal)}
          </dd>
        </div>

        {planIncludesApp && bundledApp ? (
          <div className="flex items-start justify-between gap-3 border-t border-[var(--win-border)] pt-2.5">
            <dt className="min-w-0">
              <span className="block font-medium text-[var(--win-text)]">{bundledApp.name}</span>
              {bundledLicense ? <span className="text-[0.75rem] text-[var(--text-secondary)]">{bundledLicense.name}</span> : null}
            </dt>
            <dd className="shrink-0">
              <Badge tone="success" size="sm">{t('order.addon.includedBadge')}</Badge>
            </dd>
          </div>
        ) : null}

        {addonSelected && selectedAddonApp && selectedAddonLicense ? (
          <div className="flex items-start justify-between gap-3 border-t border-[var(--win-border)] pt-2.5">
            <dt className="min-w-0">
              <span className="block font-medium text-[var(--win-text)]">{selectedAddonApp.name}</span>
              <span className="text-[0.75rem] text-[var(--text-secondary)]">
                {selectedAddonLicense.name} · {monthsLabel(t, addonMonths)}
              </span>
            </dt>
            <dd className="panel-mono shrink-0 font-semibold text-[var(--win-text)]">{formatRupiah(addonAmount)}</dd>
          </div>
        ) : null}

        {fullHost ? (
          <div className="border-t border-[var(--win-border)] pt-2.5 space-y-0.5">
            <dt className="text-[0.75rem] text-[var(--text-secondary)]">{t('order.address')}</dt>
            <dd className="panel-mono truncate text-[0.75rem] font-medium text-[var(--win-text)]">{fullHost}</dd>
          </div>
        ) : null}
      </dl>

      <div className="border-t border-[var(--win-border)] pt-3.5 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[0.8125rem] font-medium text-[var(--text-secondary)]">{t('order.addon.estimatedTotal')}</span>
          <span className="panel-mono text-[1rem] font-bold text-[var(--win-text)]">{totalFormatted}</span>
        </div>
        <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
          {t('order.summary.autoActivate')}
        </p>
      </div>
    </aside>
  )
}
