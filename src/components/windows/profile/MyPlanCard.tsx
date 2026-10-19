import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { getMyPlan, quoteMyRenewal, renewMyPlan, type PlanState } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDateID } from '@/lib/datetime'
import { Field } from '@/components/ui/Field'
import { PeriodPicker, periodChoices } from '@/components/hosting/PeriodPicker'
import { PriceLines } from '@/components/hosting/PriceLines'
import { VoucherField } from '@/components/hosting/VoucherField'
import { priceFor } from '@/lib/planPricing'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { PaymentInstructions } from '@/pages/order/PaymentInstructions'
import { useI18n } from '@/lib/i18n'

const TONE: Record<PlanState, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', grace: 'warning', expired: 'danger', none: 'neutral' }

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
  // what the renewal costs: the agent says if the voucher works, and what it takes off
  const quoteQuery = useQuery({
    queryKey: ['me-renew-quote', plan?.plan?.id, periods, voucherApplied],
    queryFn: () => quoteMyRenewal({ planId: plan!.plan!.id, periods: Number(periods), voucher: voucherApplied }),
    enabled: !!plan?.plan && !!plan.renewable && voucherApplied !== '',
    staleTime: 10_000,
    retry: 0,
  })
  const voucherValid = voucherApplied !== '' && quoteQuery.data?.voucher?.valid === true
  const price = plan?.plan ? (voucherApplied && quoteQuery.data ? quoteQuery.data.quote : priceFor(plan.plan, Number(periods))) : null

  const renew = useMutation({
    mutationFn: () => renewMyPlan(Number(periods), voucherValid ? voucherApplied : undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me-plan'] }),
    onError: (error) => toast.error(apiError(error, t('profile.plan.renewFailed'))),
  })

  if (!plan?.plan) return null

  return (
    <div className="panel-shell-card flex flex-col gap-4 p-5">
      <SectionHeader
        icon={<Boxes />}
        title={t('profile.plan.title')}
        subtitle={plan.plan.name}
        actions={<Badge tone={TONE[plan.state]} dot>{t(`profile.plan.state.${plan.state}`)}</Badge>}
      />

      <p className="text-[0.8125rem] text-[var(--text-secondary)]">
        {plan.expiresAt ? (
          <>
            {t('profile.plan.endsAt')} <DateTimeText value={plan.expiresAt} />
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
          <p className="text-[0.8125rem] font-medium">{t('profile.plan.openOrder')}</p>
          <PaymentInstructions order={plan.openOrder} />
        </>
      ) : plan.renewable ? (
        <div className="space-y-3">
          {plan.plan && periodChoices(plan.plan.period).filter((n) => n <= (plan.maxPeriods ?? 1)).length > 1 ? (
            <Field label={t('order.periods')}>
              <PeriodPicker plan={plan.plan} value={Number(periods)} maxPeriods={plan.maxPeriods ?? 1} onChange={(n) => setPeriods(String(n))} />
            </Field>
          ) : null}
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
          {price ? (
            <PriceLines
              list={price.list}
              durationPercent={price.durationPercent}
              durationDiscount={price.durationDiscount}
              voucherCode={voucherValid ? voucherApplied : undefined}
              voucherDiscount={voucherValid ? price.voucherDiscount : 0}
              subtotal={price.subtotal}
            />
          ) : null}
          <Button variant="primary" loading={renew.isPending} disabled={voucherApplied !== '' && quoteQuery.isFetching} onClick={() => renew.mutate()}>
            {t('profile.plan.renew')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
