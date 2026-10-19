import { useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, ListChecks } from 'lucide-react'
import { getNotificationDevices } from '@/api/payment'
import { getCustomDomainSetup, listHostingDomains, listHostingPlans } from '@/api/hosting'
import { getSiteSettings } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'

export type HostingSection = 'plans' | 'domains' | 'subdomains' | 'orders' | 'payment' | 'terms' | 'demo'

interface Step {
  key: string
  done: boolean
  /** A step that blocks selling, or one that only helps */
  required: boolean
  go: HostingSection | null
}

// What is still missing before buyers can order: shown at the top so the next thing to do is obvious
export function HostingChecklist({ onGo, bare }: { onGo: (section: HostingSection) => void; bare?: boolean }) {
  const { t } = useI18n()
  const site = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, retry: 0 })
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, retry: 0 })
  const customSetup = useQuery({ queryKey: ['hosting', 'custom-domains'], queryFn: getCustomDomainSetup, retry: 0 })
  const devices = useQuery({ queryKey: ['notification-devices'], queryFn: getNotificationDevices, retry: 0 })

  if (!site.data) return null
  const steps: Step[] = [
    { key: 'cloudflare', done: domains.isSuccess, required: true, go: 'domains' },
    { key: 'plan', done: (plans.data ?? []).some((plan) => plan.visible), required: true, go: 'plans' },
    { key: 'domain', done: (domains.data ?? []).some((domain) => domain.enabled), required: true, go: 'domains' },
    { key: 'landing', done: site.data.landingEnabled, required: true, go: null },
    { key: 'order', done: site.data.orderUrl !== '' || site.data.selfSignup, required: false, go: 'terms' },
    // self-service ordering: where to pay, the switch, and the listener that reads the transfers
    { key: 'account', done: (site.data.orderMethods ?? []).some((method) => method.enabled) || (site.data.orderAccount !== '' && site.data.orderHolder !== ''), required: false, go: 'payment' },
    { key: 'selfSignup', done: site.data.selfSignup, required: false, go: 'payment' },
    { key: 'listener', done: (devices.data?.devices ?? []).length > 0 || devices.isError, required: false, go: null },
    { key: 'customDomains', done: customSetup.data?.ready ?? true, required: false, go: 'domains' },
  ]
  const missing = steps.filter((step) => !step.done)
  const blocking = missing.filter((step) => step.required)

  const content = (
    <>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
          <h3 className="text-[13px] font-semibold text-[var(--win-text)]">{t('hosting.check.title')}</h3>
        </div>
        <span className="text-[11px] text-[var(--text-secondary)]">
          {blocking.length === 0 ? t('hosting.check.ready') : t('hosting.check.missing', { count: blocking.length })}
        </span>
      </div>

      {/* only what is missing is listed; when all is done the header says so */}
      {missing.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {missing.map((step) => (
            <li key={step.key} className="flex items-center gap-2.5 rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12px]">
              {step.done ? (
                <CircleCheck size={15} className="shrink-0 text-[var(--panel-success-text)]" aria-hidden="true" />
              ) : (
                <CircleAlert size={15} className={`shrink-0 ${step.required ? 'text-[var(--panel-warning-text)]' : 'text-[var(--text-secondary)]'}`} aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className="font-medium text-[var(--win-text)]">{t(`hosting.check.${step.key}`)}</span>
                {!step.done ? <span className="block text-[11px] text-[var(--text-secondary)]">{t(`hosting.check.${step.key}.hint`)}</span> : null}
              </span>
              {!step.done && step.go ? (
                <Button variant="ghost" size="sm" onClick={() => onGo(step.go as HostingSection)} className="!h-7 text-xs px-2.5">
                  {t('hosting.check.open')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )

  if (bare) {
    return <div className="space-y-2">{content}</div>
  }

  return (
    <div className="panel-shell-card flex flex-col gap-3 settings-card !p-3.5 !gap-3.5">
      {content}
    </div>
  )
}
