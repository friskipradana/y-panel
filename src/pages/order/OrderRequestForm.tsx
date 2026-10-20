import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Check, Copy, Send } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { checkPublicSubdomain, formatRupiah, getPublicHosting } from '@/api/hosting'
import { SubdomainPicker, type SubdomainChoice } from '@/components/hosting/SubdomainPicker'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'
import { buildOrderLink, fillRequestMessage } from '@/lib/orderMessage'

// The order form of an owner who takes orders by message (WhatsApp, email, or any chat): the buyer picks the plan, the
// panel address and says who they are, and that becomes the message to the owner. No account is made until the owner does.
export function OrderRequestForm() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const query = useQuery({ queryKey: ['public-hosting'], queryFn: getPublicHosting, staleTime: 30_000, retry: 0 })
  const [slug, setSlug] = useState(params.get('plan') ?? '')
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '' })
  const [address, setAddress] = useState<SubdomainChoice>({ label: '', zoneId: '', available: false })
  const [sent, setSent] = useState<string | null>(null)
  const patch = (next: Partial<typeof form>) => setForm((current) => ({ ...current, ...next }))

  const data = query.data
  const plans = data?.plans ?? []
  const plan = plans.find((p) => p.slug === slug) ?? plans[0]
  const domains = data?.domains ?? []
  const main = domains[0]
  if (!data || !plan) return null

  // the name is checked while typing; if the check cannot be done the request still goes, and the seller decides
  const addressText = address.label && main ? `${address.label}.${main.name}` : ''
  const template = data.orderMessage || t('hosting.order.defaultMessage')
  const message = fillRequestMessage(
    template,
    {
      plan: plan.name,
      price: plan.priceAmount === 0 ? t('hosting.landing.free') : formatRupiah(plan.priceAmount),
      period: plan.priceAmount === 0 ? '' : t(`hosting.period.${plan.period}`),
    },
    { name: form.name.trim(), email: form.email.trim(), whatsapp: form.whatsapp.trim(), address: addressText },
    { name: t('order.requestName'), email: t('order.email'), whatsapp: t('order.whatsapp'), address: t('order.address') },
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (data.orderUrl) {
      window.open(buildOrderLink(data.orderUrl, message, t('hosting.order.subject', { name: plan.name })), data.orderUrl.startsWith('mailto:') ? '_self' : '_blank', 'noopener,noreferrer')
    } else {
      void copyTextToClipboard(message).then(() => toast.success(t('hosting.order.copied')))
    }
    setSent(message)
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t('order.title')}</h1>
        <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('order.requestSubtitle')}</p>
      </div>

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
      </section>

      {main ? (
        <section className="space-y-3">
          <div>
            <p className="panel-section-label">{t('order.address')}</p>
            <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('order.requestAddressHint')}</p>
          </div>
          <SubdomainPicker domains={domains} check={checkPublicSubdomain} onChange={setAddress} />
        </section>
      ) : null}

      <section className="space-y-3">
        <Field label={t('order.requestName')} htmlFor="request-name">
          <TextInput id="request-name" autoComplete="name" required maxLength={60} value={form.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>
        <Field label={t('order.whatsapp')} htmlFor="request-whatsapp">
          <TextInput id="request-whatsapp" mono type="tel" inputMode="tel" autoComplete="tel" required placeholder="0812 3456 7890" value={form.whatsapp} onChange={(e) => patch({ whatsapp: e.target.value })} />
        </Field>
        <Field label={t('order.email')} htmlFor="request-email">
          <TextInput id="request-email" type="email" autoComplete="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} />
        </Field>
      </section>

      {sent ? (
        <section className="space-y-2 rounded-2xl border border-[var(--panel-success-border)] bg-[var(--panel-success-bg)] p-4 text-[0.8125rem]" role="status">
          <p className="flex items-center gap-1.5 font-semibold text-[var(--panel-success-text)]">
            <Check size={14} aria-hidden="true" />
            {data.orderUrl ? t('order.requestSent') : t('order.requestCopied')}
          </p>
          <pre className="panel-mono whitespace-pre-wrap break-words text-[0.75rem] text-[var(--win-text)]">{sent}</pre>
          <Button type="button" variant="outline" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void copyTextToClipboard(sent).then(() => toast.success(t('common.copied')))}>
            {t('hosting.order.copy')}
          </Button>
        </section>
      ) : null}

      <Button type="submit" variant="primary" size="lg" block icon={<Send className="h-4 w-4" />} disabled={!!main && !address.available && !address.checkFailed}>
        {data.orderUrl ? t('order.requestSend') : t('order.requestCopy')}
      </Button>
    </form>
  )
}
