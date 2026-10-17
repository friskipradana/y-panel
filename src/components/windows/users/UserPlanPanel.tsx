import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getUserPlan, listHostingPlans, setUserPlan, type PlanState } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { formatDateID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'

const NONE = ''
const TONE: Record<PlanState, 'neutral' | 'success' | 'warning' | 'danger'> = { none: 'neutral', active: 'success', grace: 'warning', expired: 'danger' }

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// Which plan an account is on and until when. Assigning a plan sets the account quota from it.
export function UserPlanPanel({ userId, username }: { userId: number; username: string }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, staleTime: 30_000, retry: 0 })
  const current = useQuery({ queryKey: ['user-plan', userId], queryFn: () => getUserPlan(userId), retry: 0 })
  const [planId, setPlanId] = useState<string | null>(null)
  const [months, setMonths] = useState('')

  const view = current.data
  const selected = planId ?? (view?.plan ? String(view.plan.id) : NONE)
  const monthsNumber = months.trim() === '' ? undefined : Number(months)
  const monthsValid = monthsNumber === undefined || (Number.isInteger(monthsNumber) && monthsNumber >= 1 && monthsNumber <= 60)

  const mutation = useMutation({
    mutationFn: () => setUserPlan(userId, { planId: selected === NONE ? null : Number(selected), months: selected === NONE ? undefined : monthsNumber }),
    onSuccess: (next) => {
      qc.setQueryData(['user-plan', userId], next)
      // the plan sets the quota and may reactivate the account
      void qc.invalidateQueries({ queryKey: ['quota', userId] })
      void qc.invalidateQueries({ queryKey: ['users'] })
      void qc.invalidateQueries({ queryKey: ['hosting', 'plans'] })
      setPlanId(null)
      setMonths('')
      alertLib.fire(t('hosting.userPlan.savedTitle'), t('hosting.userPlan.savedMessage', { username }), 'success', 'users')
    },
    onError: (error) => alertLib.fire(t('hosting.userPlan.failedTitle'), apiError(error, t('hosting.userPlan.failedMessage')), 'error', 'users'),
  })

  if (current.isLoading || plans.isLoading) return <LoadingState>{t('hosting.userPlan.loading')}</LoadingState>
  if (!view || !plans.data) return <p className="text-[12px] text-[var(--text-secondary)]">{t('hosting.userPlan.loadFailed')}</p>

  const sameAsCurrent = selected === (view.plan ? String(view.plan.id) : NONE)
  const dirty = !sameAsCurrent || (selected !== NONE && monthsNumber !== undefined)

  return (
    <section aria-label={t('hosting.userPlan.title')} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('hosting.userPlan.title')}</p>
        {view.plan ? (
          <Badge tone={TONE[view.state]} dot>
            {t(`hosting.userPlan.state.${view.state}`)}
          </Badge>
        ) : null}
      </div>

      {view.plan ? (
        <p className="text-[12px] text-[var(--text-secondary)]">
          {view.expiresAt
            ? view.state === 'grace' && view.graceEndsAt
              ? t('hosting.userPlan.graceUntil', { date: formatDateID(view.expiresAt), end: formatDateID(view.graceEndsAt) })
              : view.state === 'expired'
                ? t('hosting.userPlan.endedOn', { date: formatDateID(view.expiresAt) })
                : t('hosting.userPlan.activeUntil', { date: formatDateID(view.expiresAt) })
            : t('hosting.userPlan.noEnd')}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <Field label={t('hosting.userPlan.plan')}>
          <Select
            value={selected}
            onChange={setPlanId}
            options={[
              { value: NONE, label: t('hosting.userPlan.none') },
              ...plans.data.map((plan) => ({ value: String(plan.id), label: plan.name, description: plan.slug })),
            ]}
          />
        </Field>
        <Field label={t('hosting.userPlan.months')} hint={t('hosting.userPlan.monthsHint')} error={monthsValid ? undefined : t('hosting.userPlan.monthsInvalid')}>
          <TextInput mono type="number" min={1} max={60} value={months} disabled={selected === NONE} onChange={(e) => setMonths(e.target.value)} />
        </Field>
      </div>

      <Button variant="primary-soft" className="w-full" disabled={!dirty || !monthsValid} loading={mutation.isPending} onClick={() => mutation.mutate()}>
        {selected === NONE ? t('hosting.userPlan.remove') : view.plan && sameAsCurrent ? t('hosting.userPlan.renew') : t('hosting.userPlan.apply')}
      </Button>
    </section>
  )
}
