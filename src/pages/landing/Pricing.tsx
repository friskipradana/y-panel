import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { formatRupiah, getPublicHosting, type PublicPlan } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { useI18n } from '@/lib/i18n'
import { buildOrderLink, fillOrderMessage } from '@/lib/orderMessage'

function getPlanLimits(plan: PublicPlan, t: (key: string, params?: Record<string, string | number>) => string) {
  const disk = plan.diskQuotaMb >= 1024 ? `${Math.round((plan.diskQuotaMb / 1024) * 10) / 10} GB` : `${plan.diskQuotaMb} MB`
  const ram = plan.memoryLimitMb >= 1024 ? `${Math.round((plan.memoryLimitMb / 1024) * 10) / 10} GB` : `${plan.memoryLimitMb} MB`
  return [
    t('hosting.landing.projects', { count: plan.maxProjects }),
    t('hosting.landing.databases', { count: plan.maxDatabases }),
    t('hosting.landing.subdomains', { count: plan.maxSubdomains }),
    ...(plan.maxCustomDomains > 0 ? [t('hosting.landing.customDomains', { count: plan.maxCustomDomains })] : []),
    t('hosting.landing.disk', { amount: disk }),
    t('hosting.landing.ram', { amount: ram }),
  ]
}

// Plans the server owner sells; shown only while hosting mode is on and at least one plan is visible
export function Pricing() {
  const { t } = useI18n()
  const query = useQuery({ queryKey: ['public-hosting'], queryFn: getPublicHosting, staleTime: 30_000, retry: 0 })
  const data = query.data
  if (!data?.enabled || data.plans.length === 0) return null

  return (
    <section className="mt-14" aria-labelledby="landing-pricing">
      <h2 id="landing-pricing" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('hosting.landing.title')}
      </h2>
      <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('hosting.landing.subtitle')}</p>

      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.plans.map((plan) => {
          const limits = getPlanLimits(plan, t)
          const message = fillOrderMessage(data.orderMessage || t('hosting.order.defaultMessage'), {
            plan: plan.name,
            price: plan.priceAmount === 0 ? t('hosting.landing.free') : formatRupiah(plan.priceAmount),
            period: plan.priceAmount === 0 ? '' : t(`hosting.period.${plan.period}`),
          })

          return (
            <li
              key={plan.slug}
              className={`relative flex flex-col rounded-2xl border bg-[var(--panel-surface)] p-5 transition-colors sm:p-6 ${
                plan.highlighted
                  ? 'border-[var(--panel-primary-solid)] ring-1 ring-[var(--panel-primary-solid)] shadow-sm'
                  : 'border-[var(--win-border)] hover:border-[var(--text-secondary)]/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[1.0625rem] font-bold text-[var(--win-text)]">{plan.name}</h3>
                {plan.highlighted ? <Badge tone="primary">{t('hosting.landing.recommended')}</Badge> : null}
              </div>
              {plan.tagline ? (
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{plan.tagline}</p>
              ) : null}

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold tracking-tight text-[var(--win-text)] sm:text-[1.75rem]">
                  {plan.priceAmount === 0 ? t('hosting.landing.free') : formatRupiah(plan.priceAmount)}
                </span>
                {plan.priceAmount > 0 ? (
                  <span className="text-[0.8125rem] font-medium text-[var(--text-secondary)]">
                    {t(`hosting.period.${plan.period}`)}
                  </span>
                ) : null}
              </div>

              <div className="mt-3.5 flex flex-wrap gap-1.5" aria-label={t('hosting.landing.limitsLabel')}>
                {limits.map((limit) => (
                  <span
                    key={limit}
                    className="panel-mono inline-flex items-center rounded-md border border-[var(--win-border)] bg-[var(--panel-surface-strong)] px-2 py-0.5 text-[0.71875rem] font-medium text-[var(--win-text)] whitespace-nowrap"
                  >
                    {limit}
                  </span>
                ))}
              </div>

              {plan.features.length > 0 ? (
                <div className="mt-5 border-t border-[var(--win-border)] pt-4">
                  <ul className="space-y-2 text-[0.8125rem]">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-[var(--win-text)]">
                        <Check size={14} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" aria-hidden="true" />
                        <span className="leading-snug">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {data.selfSignup ? (
                <div className="mt-auto space-y-2 pt-6">
                  <Link
                    to={`/order?plan=${encodeURIComponent(plan.slug)}`}
                    className={`panel-btn w-full justify-center ${plan.highlighted ? 'panel-btn--primary' : 'panel-btn--outline'}`}
                  >
                    {t('hosting.landing.order', { name: plan.name })}
                  </Link>
                  {plan.trialDays > 0 ? (
                    <Link to={`/order?plan=${encodeURIComponent(plan.slug)}&trial=1`} className="panel-btn panel-btn--ghost w-full justify-center">
                      {t('order.trial', { days: plan.trialDays })}
                    </Link>
                  ) : null}
                </div>
              ) : data.orderUrl ? (
                <div className="mt-auto pt-6">
                  <a
                    href={buildOrderLink(data.orderUrl, message, t('hosting.order.subject', { name: plan.name }))}
                    target={data.orderUrl.startsWith('mailto:') ? undefined : '_blank'}
                    rel="noreferrer"
                    className={`panel-btn w-full justify-center ${
                      plan.highlighted ? 'panel-btn--primary' : 'panel-btn--outline'
                    }`}
                  >
                    {t('hosting.landing.order', { name: plan.name })}
                  </a>
                </div>
              ) : (
                <div className="mt-auto pt-6">
                  <button
                    type="button"
                    className="panel-btn w-full justify-center panel-btn--outline"
                    onClick={() => {
                      void copyTextToClipboard(message).then(() => toast.success(t('hosting.order.copied')))
                    }}
                  >
                    <Copy size={14} aria-hidden="true" />
                    {t('hosting.order.copy')}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {!data.orderUrl && !data.selfSignup ? <p className="mt-3 text-[0.8125rem] text-[var(--text-secondary)]">{t('hosting.landing.contact')}</p> : null}
    </section>
  )
}

