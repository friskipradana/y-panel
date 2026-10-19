import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { checkPublicSubdomain, createPublicOrder, formatRupiah, getPublicHosting } from '@/api/hosting'
import { SubdomainPicker, type SubdomainChoice } from '@/components/hosting/SubdomainPicker'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'

const MAX_PERIODS = { monthly: 12, yearly: 5, once: 1 } as const

function serverError(error: unknown, fallback: string) {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

// Sign-up of a buyer: the account is made now and switched on when the payment arrives (or the trial starts)
export function OrderForm() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const query = useQuery({ queryKey: ['public-hosting'], queryFn: getPublicHosting, staleTime: 30_000, retry: 0 })
  const [slug, setSlug] = useState(params.get('plan') ?? '')
  const [trial, setTrial] = useState(params.get('trial') === '1')
  const [periods, setPeriods] = useState('1')
  const [form, setForm] = useState({ username: '', email: '', displayName: '', password: '', whatsapp: '' })
  const [address, setAddress] = useState<SubdomainChoice>({ label: '', zoneId: '', available: false })
  const patch = (next: Partial<typeof form>) => setForm((current) => ({ ...current, ...next }))

  const plans = query.data?.plans ?? []
  const plan = plans.find((p) => p.slug === slug) ?? plans[0]
  const trialOffered = !!plan && plan.trialDays > 0
  // the panel address comes with every plan, on the main domain: picked here, created when the order is paid
  const needsAddress = !!plan && (query.data?.domains?.length ?? 0) > 0
  const domains = query.data?.domains ?? []
  const isTrial = trial && trialOffered
  const whatsappRequired = !!query.data?.whatsapp
  const maxPeriods = plan ? MAX_PERIODS[plan.period] : 1
  const count = Math.min(Math.max(Number(periods) || 1, 1), maxPeriods)
  const total = plan ? plan.priceAmount * count : 0

  const submit = useMutation({
    mutationFn: () =>
      createPublicOrder({
        planId: plan!.id, kind: isTrial ? 'trial' : 'new', periods: isTrial ? 1 : count, ...form, whatsapp: form.whatsapp.trim() || undefined,
        ...(needsAddress ? { subLabel: address.label, subZoneId: address.zoneId } : {}),
      }),
    onSuccess: (order) => navigate(`/order/${order.publicId}`),
  })

  if (query.isLoading) return <LoadingState>{t('order.loading')}</LoadingState>
  if (query.isError) return <ErrorState title={t('order.loadFailed')} hint={t('order.loadFailedHint')} />
  if (!query.data?.enabled || !query.data.selfSignup || !plan) {
    return <ErrorState title={t('order.closed')} hint={t('order.closedHint')} />
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    submit.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t('order.title')}</h1>
        <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('order.subtitle')}</p>
      </div>

      <section className="space-y-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
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
          <Field label={t('order.periods')} htmlFor="order-periods">
            <TextInput id="order-periods" mono type="number" min={1} max={maxPeriods} value={periods} onChange={(e) => setPeriods(e.target.value)} />
          </Field>
        ) : null}
        <p className="flex items-baseline justify-between text-[0.875rem]">
          <span className="text-[var(--text-secondary)]">{isTrial ? t('order.trialNote', { days: plan.trialDays }) : t('order.price')}</span>
          <span className="panel-mono font-semibold text-[var(--win-text)]">{isTrial || total === 0 ? t('hosting.landing.free') : formatRupiah(total)}</span>
        </p>
      </section>

      {needsAddress ? (
        <section className="space-y-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
          <div>
            <p className="panel-section-label">{t('order.address')}</p>
            <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('order.addressHint')}</p>
          </div>
          <SubdomainPicker domains={domains} check={checkPublicSubdomain} onChange={setAddress} />
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
        <Field label={t('order.username')} htmlFor="order-username" hint={t('order.usernameHint')}>
          <TextInput id="order-username" mono autoComplete="username" required value={form.username} onChange={(e) => patch({ username: e.target.value })} />
        </Field>
        <Field label={t('order.email')} htmlFor="order-email">
          <TextInput id="order-email" type="email" autoComplete="email" required value={form.email} onChange={(e) => patch({ email: e.target.value })} />
        </Field>
        <Field label={t('order.whatsapp')} htmlFor="order-whatsapp" hint={t(whatsappRequired ? 'order.whatsappHint' : 'order.whatsappOptionalHint')}>
          <TextInput id="order-whatsapp" mono type="tel" inputMode="tel" autoComplete="tel" required={whatsappRequired} placeholder="0812 3456 7890" value={form.whatsapp} onChange={(e) => patch({ whatsapp: e.target.value })} />
        </Field>
        <Field label={t('order.displayName')} htmlFor="order-name">
          <TextInput id="order-name" autoComplete="name" maxLength={60} value={form.displayName} onChange={(e) => patch({ displayName: e.target.value })} />
        </Field>
        <Field label={t('order.password')} htmlFor="order-password" hint={t('order.passwordHint')}>
          <TextInput id="order-password" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => patch({ password: e.target.value })} />
        </Field>
      </section>

      {submit.isError ? (
        <p role="alert" className="text-[0.8125rem] text-[var(--panel-danger-text)]">
          {serverError(submit.error, t('order.failed'))}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" block loading={submit.isPending} disabled={needsAddress && !address.available}>
        {isTrial ? t('order.startTrial') : t('order.submit')}
      </Button>
    </form>
  )
}
