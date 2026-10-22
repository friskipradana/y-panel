import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { formatRupiah, getMyPlan, quoteMyRenewal, renewMyPlan, type PlanState } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDateID } from '@/lib/datetime'
import { planNotice } from '@/lib/planNotice'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Tabs } from '@/components/ui/Tabs'
import { estimateUpgradeEnd, monthlyPrice, renewedEnd } from '@/lib/upgrade'
import { PeriodPicker, periodChoices } from '@/components/hosting/PeriodPicker'
import { monthsLabel } from '@/lib/duration'
import { PriceLines } from '@/components/hosting/PriceLines'
import { VoucherField } from '@/components/hosting/VoucherField'
import { priceFor } from '@/lib/planPricing'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { PaymentInstructions } from '@/pages/order/PaymentInstructions'
import { useI18n } from '@/lib/i18n'

const TONE: Record<PlanState, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', grace: 'warning', expired: 'danger', none: 'neutral' }

// The end of the plan now, and the end it will have: the same date when only the difference is paid, an estimate when the
// time left on another plan is converted
function ValidityPair({ current, next, kept = false, estimate = false }: { current: string | null | undefined; next: Date | null; kept?: boolean; estimate?: boolean }) {
  const { t } = useI18n()
  if (!current && !next) return null
  return (
    <dl className="settings-inset text-[0.8125rem]">
      {current ? (
        <div className="flex items-baseline justify-between gap-3 py-0.5">
          <dt className="whitespace-nowrap text-[var(--text-secondary)]">{t('profile.plan.currentEnd')}</dt>
          <dd className="font-medium">{formatDateID(current)}</dd>
        </div>
      ) : null}
      {next ? (
        <div className="flex items-baseline justify-between gap-3 py-0.5">
          <dt className="whitespace-nowrap text-[var(--text-secondary)]">{t('profile.plan.newEnd')}</dt>
          <dd className="text-right font-semibold text-[var(--panel-primary-text)]">
            {formatDateID(next)}
            {kept ? <span className="font-normal text-[var(--text-secondary)]"> · {t('profile.plan.endKept')}</span> : null}
            {estimate ? <span className="font-normal text-[var(--text-secondary)]"> · {t('profile.plan.endEstimate')}</span> : null}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The hosting plan of the signed-in buyer: what it is, when it ends, and renewing it by a transfer
export function MyPlanCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [periods, setPeriods] = useState('1')
  const [voucherText, setVoucherText] = useState('')
  const [voucherApplied, setVoucherApplied] = useState('')
  const query = useQuery({ queryKey: ['me-plan'], queryFn: getMyPlan, retry: 0, refetchInterval: (q) => (q.state.data?.openOrder ? 10_000 : false) })
  const plan = query.data
  // the plan the order is for: the account's own (a renewal), or a dearer one (an upgrade)
  const upgrades = plan?.upgrades ?? []
  const [targetId, setTargetId] = useState('')
  const [mode, setMode] = useState<'difference' | 'renew'>('difference')
  const own = plan?.plan ?? null
  const fallbackTarget = plan?.renewable ? own : upgrades[0] ?? own
  const target = upgrades.find((p) => String(p.id) === targetId) ?? (plan?.renewable ? own : fallbackTarget)
  const upgrading = !!target && !!own && target.id !== own.id
  // paying only the difference for the time left is offered while the plan runs; without it a renewal with the new plan is the way
  const difference = upgrading && target ? plan?.upgradeDifferences?.[String(target.id)] : undefined
  const payDifference = !!difference && mode === 'difference'
  const targetMaxPeriods = upgrading && target ? Math.max(...periodChoices(target.period)) : plan?.maxPeriods ?? 1
  const canOrder = !!plan && (!!plan.renewable || upgrades.length > 0)
  // what the renewal costs: the agent says if the voucher works, and what it takes off
  const quoteQuery = useQuery({
    queryKey: ['me-renew-quote', target?.id, periods, voucherApplied],
    queryFn: () => quoteMyRenewal({ planId: target!.id, periods: Number(periods), voucher: voucherApplied }),
    enabled: !!target && canOrder && voucherApplied !== '',
    staleTime: 10_000,
    retry: 0,
  })
  const voucherValid = voucherApplied !== '' && quoteQuery.data?.voucher?.valid === true
  const price = target ? (voucherApplied && quoteQuery.data ? quoteQuery.data.quote : priceFor(target, Number(periods), null, 'renew')) : null

  const renew = useMutation({
    mutationFn: () => renewMyPlan(Number(periods), voucherValid ? voucherApplied : undefined, upgrading && target ? target.id : undefined, payDifference ? 'difference' : undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me-plan'] }),
    onError: (error) => toast.error(apiError(error, t('profile.plan.renewFailed'))),
  })

  if (!plan?.plan) return null
  // what the waiting order is for, in words: a renewal of the plan, a renewal with another plan, or the difference of an upgrade
  // the months an order buys: the agent says so; an older one does not, and then the periods count in the period of that plan
  const monthsOf = (order: NonNullable<typeof plan.openOrder>): number => {
    if (order.months) return order.months
    const ordered = order.planName === plan.plan?.name ? plan.plan : upgrades.find((p) => p.name === order.planName)
    if (!ordered || ordered.period === 'once') return 0
    return ordered.period === 'yearly' ? order.periods * 12 : order.periods
  }
  const openOrderTitle = (order: NonNullable<typeof plan.openOrder>) => {
    const months = monthsOf(order)
    const howLong = months ? monthsLabel(t, months) : ''
    if (order.difference) return t('profile.plan.open.differenceTitle', { plan: order.planName })
    if (order.planName !== plan.plan?.name) return t('profile.plan.open.upgradeTitle', { plan: order.planName, period: howLong })
    return t('profile.plan.open.renewTitle', { plan: order.planName, period: howLong })
  }
  const openOrderNote = (order: NonNullable<typeof plan.openOrder>) => {
    if (order.difference) return t('profile.plan.open.differenceNote')
    if (order.planName === plan.plan?.name) return t('profile.plan.open.renewNote')
    return t('profile.plan.open.upgradeNote')
  }
  // the end the plan will have when the waiting order is paid
  const openOrderEnd = (order: NonNullable<typeof plan.openOrder>): { next: Date | null; kept: boolean; estimate: boolean } => {
    if (order.difference) return { next: plan.expiresAt ? new Date(plan.expiresAt) : null, kept: true, estimate: false }
    const months = monthsOf(order)
    if (!months) return { next: null, kept: false, estimate: false }
    if (order.planName === plan.plan?.name) return { next: renewedEnd(plan.expiresAt, months), kept: false, estimate: false }
    const other = upgrades.find((p) => p.name === order.planName)
    if (!other || !plan.plan) return { next: null, kept: false, estimate: false }
    const count = other.period === 'yearly' ? months / 12 : months
    return { next: estimateUpgradeEnd(plan.plan, other, plan.expiresAt, count), kept: false, estimate: true }
  }
  const notice = planNotice(plan)
  const expiring = notice?.kind === 'expiring'

  return (
    <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
      <SectionHeader
        icon={<Boxes />}
        title={t('profile.plan.title')}
        subtitle={plan.plan.name}
        actions={<Badge tone={expiring ? 'warning' : TONE[plan.state]} dot>{expiring ? t('profile.plan.state.expiring') : t(`profile.plan.state.${plan.state}`)}</Badge>}
      />

      <p className={`text-[0.8125rem] text-[var(--text-secondary)] ${plan.openOrder ? 'hidden' : ''}`}>
        {plan.expiresAt ? (
          <>
            {t('profile.plan.endsAt')} <DateTimeText value={plan.expiresAt} />
            {expiring && notice ? <span className="font-semibold text-[var(--panel-warning-text)]"> · {t('profile.plan.daysLeft', { days: notice.days })}</span> : null}
          </>
        ) : (
          t('profile.plan.noEnd')
        )}
      </p>

      {plan.trial ? (
        <p className="rounded-lg bg-[var(--panel-info-bg)] px-3 py-2 text-[0.8125rem] text-[var(--panel-info-text)]">
          {t('profile.plan.trial', { plan: plan.trial.plan?.name ?? '-', date: formatDateID(plan.trial.endsAt), own: plan.plan.name })}
        </p>
      ) : null}

      {plan.openOrder ? (
        <>
          <div className="space-y-0.5">
            <p className="text-[0.8125rem] font-semibold">{openOrderTitle(plan.openOrder)}</p>
            <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{openOrderNote(plan.openOrder)}</p>
          </div>
          <ValidityPair current={plan.expiresAt} {...openOrderEnd(plan.openOrder)} />
          <PaymentInstructions order={plan.openOrder} />
        </>
      ) : canOrder && target ? (
        <div className="space-y-3">
          {upgrades.length > 0 ? (
            <Field label={t('profile.plan.orderFor')} htmlFor="renew-plan">
              <Select
                id="renew-plan"
                value={String(target.id)}
                onChange={(value) => {
                  setTargetId(value)
                  setPeriods('1')
                }}
                options={[
                  ...(plan.renewable && own ? [{ value: String(own.id), label: own.name, description: t('profile.plan.current') }] : []),
                  ...upgrades.map((p) => ({
                    value: String(p.id),
                    label: p.name,
                    description: `${formatRupiah(p.priceAmount)} ${t(`hosting.period.${p.period}`)}${p.ownNotify ? ` · ${t('profile.plan.hasOwnBot')}` : ''}`,
                  })),
                ]}
              />
            </Field>
          ) : null}
          {difference ? (
            <Tabs
              label={t('profile.plan.orderFor')}
              value={mode}
              onChange={setMode}
              items={[
                { key: 'difference', label: t('profile.plan.mode.difference') },
                { key: 'renew', label: t('profile.plan.mode.renew') },
              ]}
            />
          ) : null}
          {payDifference && difference && own ? (
            <>
              <dl className="settings-inset text-[0.8125rem]">
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="text-[var(--text-secondary)]">{t('profile.plan.diff.perMonth')}</dt>
                  <dd className="panel-mono">{formatRupiah(Math.round(monthlyPrice(target) - monthlyPrice(own)))}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="text-[var(--text-secondary)]">{t('profile.plan.diff.left')}</dt>
                  <dd className="panel-mono">{t('profile.plan.diff.days', { days: difference.days })}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-1.5 font-semibold">
                  <dt>{t('profile.plan.diff.pay')}</dt>
                  <dd className="panel-mono">{formatRupiah(difference.amount)}</dd>
                </div>
              </dl>
              <ValidityPair current={plan.expiresAt} next={plan.expiresAt ? new Date(plan.expiresAt) : null} kept />
              <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('profile.plan.diff.note')}</p>
              <Button variant="primary" loading={renew.isPending} onClick={() => renew.mutate()}>
                {t('profile.plan.diff.button', { amount: formatRupiah(difference.amount) })}
              </Button>
            </>
          ) : null}
          {!payDifference && periodChoices(target.period).filter((n) => n <= targetMaxPeriods).length > 1 ? (
            <Field label={t('profile.plan.renewFor')}>
              <PeriodPicker plan={target} kind="renew" value={Number(periods)} maxPeriods={targetMaxPeriods} onChange={(n) => setPeriods(String(n))} />
            </Field>
          ) : null}
          {!payDifference ? (
          <>
          {price?.promoExclusive ? (
            <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('order.voucher.promoExclusiveNote')}</p>
          ) : (
          <VoucherField
            id="renew-voucher"
            value={voucherText}
            onChange={setVoucherText}
            applied={voucherApplied}
            onApply={() => setVoucherApplied(voucherText.trim().toUpperCase())}
            onRemove={() => {
              setVoucherApplied('')
              setVoucherText('')
            }}
            answer={quoteQuery.data?.voucher}
            discount={price?.voucherDiscount ?? 0}
            checking={quoteQuery.isFetching}
            failed={quoteQuery.isError}
          />
          )}
          {price ? (
            <PriceLines
              list={price.list}
              promoPercent={price.promoPercent}
              promoDiscount={price.promoDiscount}
              durationPercent={price.durationPercent}
              durationDiscount={price.durationDiscount}
              voucherCode={voucherValid ? voucherApplied : undefined}
              voucherDiscount={voucherValid ? price.voucherDiscount : 0}
              subtotal={price.subtotal}
            />
          ) : null}
          {upgrading && own ? (
            <ValidityPair current={plan.expiresAt} next={estimateUpgradeEnd(own, target, plan.expiresAt, Number(periods))} estimate />
          ) : !upgrading ? (
            <ValidityPair current={plan.expiresAt} next={renewedEnd(plan.expiresAt, target.period === 'yearly' ? Number(periods) * 12 : Number(periods))} />
          ) : null}
          {upgrading ? <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('profile.plan.upgradeNote')}</p> : null}
          <Button variant="primary" loading={renew.isPending} disabled={voucherApplied !== '' && quoteQuery.isFetching} onClick={() => renew.mutate()}>
            {upgrading ? t('profile.plan.upgradeTo', { plan: target.name }) : t('profile.plan.renew')}
          </Button>
          </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
