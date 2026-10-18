import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes } from 'lucide-react'
import { toast } from 'sonner'
import { getMyPlan, renewMyPlan, type PlanState } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDateID } from '@/lib/datetime'
import { Field, TextInput } from '@/components/ui/Field'
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
  const query = useQuery({ queryKey: ['me-plan'], queryFn: getMyPlan, retry: 0, refetchInterval: (q) => (q.state.data?.openOrder ? 10_000 : false) })
  const plan = query.data

  const renew = useMutation({
    mutationFn: () => renewMyPlan(Math.min(Math.max(Number(periods) || 1, 1), plan?.maxPeriods ?? 1)),
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
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          {(plan.maxPeriods ?? 1) > 1 ? (
            <Field label={t('order.periods')} htmlFor="renew-periods">
              <TextInput id="renew-periods" mono type="number" min={1} max={plan.maxPeriods} value={periods} onChange={(e) => setPeriods(e.target.value)} />
            </Field>
          ) : (
            <span />
          )}
          <Button variant="primary" loading={renew.isPending} onClick={() => renew.mutate()}>
            {t('profile.plan.renew')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
