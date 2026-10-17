import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { formatRupiah, getPublicHosting, type PublicPlan } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { useI18n } from '@/lib/i18n'

function limitsLine(plan: PublicPlan, t: (key: string, params?: Record<string, string | number>) => string) {
  const disk = plan.diskQuotaMb >= 1024 ? `${Math.round((plan.diskQuotaMb / 1024) * 10) / 10} GB` : `${plan.diskQuotaMb} MB`
  return [
    t('hosting.landing.projects', { count: plan.maxProjects }),
    t('hosting.landing.databases', { count: plan.maxDatabases }),
    t('hosting.landing.subdomains', { count: plan.maxSubdomains }),
    `${disk} disk`,
    `${plan.memoryLimitMb} MB RAM`,
  ].join(' · ')
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

      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.plans.map((plan) => (
          <li
            key={plan.slug}
            className={`flex flex-col rounded-2xl border bg-[var(--panel-surface)] p-5 ${plan.highlighted ? 'border-[var(--panel-primary-text)]' : 'border-[var(--win-border)]'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[1rem] font-bold">{plan.name}</h3>
              {plan.highlighted ? <Badge tone="primary">{t('hosting.landing.recommended')}</Badge> : null}
            </div>
            {plan.tagline ? <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{plan.tagline}</p> : null}

            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="panel-mono text-[1.625rem] font-bold leading-none">{plan.priceAmount === 0 ? t('hosting.landing.free') : formatRupiah(plan.priceAmount)}</span>
              {plan.priceAmount > 0 ? <span className="text-[0.8125rem] text-[var(--text-secondary)]">{t(`hosting.period.${plan.period}`)}</span> : null}
            </p>

            <p className="panel-mono mt-3 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{limitsLine(plan, t)}</p>

            {plan.features.length > 0 ? (
              <ul className="mt-4 space-y-1.5 text-[0.8125rem]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 shrink-0 text-[var(--panel-success-text)]" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {data.orderUrl ? (
              <a
                href={data.orderUrl}
                target={data.orderUrl.startsWith('mailto:') ? undefined : '_blank'}
                rel="noreferrer"
                className={`panel-btn ${plan.highlighted ? 'panel-btn--primary' : 'panel-btn--outline'} mt-5 justify-center`}
              >
                {t('hosting.landing.order', { name: plan.name })}
              </a>
            ) : null}
          </li>
        ))}
      </ul>

      {!data.orderUrl ? <p className="mt-3 text-[0.8125rem] text-[var(--text-secondary)]">{t('hosting.landing.contact')}</p> : null}
    </section>
  )
}
