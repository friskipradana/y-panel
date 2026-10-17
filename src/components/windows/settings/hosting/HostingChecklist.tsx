import { useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, ListChecks } from 'lucide-react'
import { listHostingDomains, listHostingPlans } from '@/api/hosting'
import { getSiteSettings } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { useI18n } from '@/lib/i18n'

export type HostingSection = 'plans' | 'domains' | 'subdomains' | 'terms' | 'demo'

interface Step {
  key: string
  done: boolean
  /** A step that blocks selling, or one that only helps */
  required: boolean
  go: HostingSection | null
}

// What is still missing before buyers can order: shown at the top so the next thing to do is obvious
export function HostingChecklist({ onGo }: { onGo: (section: HostingSection) => void }) {
  const { t } = useI18n()
  const site = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, retry: 0 })
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, retry: 0 })

  if (!site.data) return null
  const steps: Step[] = [
    { key: 'cloudflare', done: domains.isSuccess, required: true, go: 'domains' },
    { key: 'plan', done: (plans.data ?? []).some((plan) => plan.visible), required: true, go: 'plans' },
    { key: 'domain', done: (domains.data ?? []).some((domain) => domain.enabled), required: true, go: 'domains' },
    { key: 'landing', done: site.data.landingEnabled, required: true, go: null },
    { key: 'order', done: site.data.orderUrl !== '', required: false, go: 'terms' },
  ]
  const missing = steps.filter((step) => !step.done)
  const blocking = missing.filter((step) => step.required)

  return (
    <div className="panel-shell-card flex flex-col gap-3 p-4.5">
      <SectionHeader
        icon={<ListChecks />}
        title={t('hosting.check.title')}
        subtitle={blocking.length === 0 ? t('hosting.check.ready') : t('hosting.check.missing', { count: blocking.length })}
      />
      {/* only what is missing is listed; when all is done the header says so */}
      {missing.length > 0 ? (
      <ul className="flex flex-col gap-1.5">
        {missing.map((step) => (
          <li key={step.key} className="flex items-center gap-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12.5px]">
            {step.done ? (
              <CircleCheck size={16} className="shrink-0 text-[var(--panel-success-text)]" aria-hidden="true" />
            ) : (
              <CircleAlert size={16} className={`shrink-0 ${step.required ? 'text-[var(--panel-warning-text)]' : 'text-[var(--text-secondary)]'}`} aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="font-medium">{t(`hosting.check.${step.key}`)}</span>
              {!step.done ? <span className="block text-[11.5px] text-[var(--text-secondary)]">{t(`hosting.check.${step.key}.hint`)}</span> : null}
            </span>
            {!step.done && step.go ? (
              <Button variant="ghost" onClick={() => onGo(step.go as HostingSection)}>
                {t('hosting.check.open')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      ) : null}
    </div>
  )
}
