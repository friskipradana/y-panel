import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { endPlanTrial, startPlanTrial, type HostingPlan, type UserPlanView } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { alertLib } from '@/lib/alert'
import { formatDateID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

interface Props {
  userId: number
  username: string
  view: UserPlanView
  plans: HostingPlan[]
}

// Trial upgrade: the account runs on a bigger plan for some days; its own plan waits and gets those days back
export function UserPlanTrial({ userId, username, view, plans }: Props) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [planId, setPlanId] = useState('')
  const [days, setDays] = useState('7')

  const daysNumber = Number(days)
  const daysValid = days.trim() !== '' && Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= 90
  const options = plans.filter((plan) => plan.id !== view.plan?.id).map((plan) => ({ value: String(plan.id), label: plan.name, description: plan.slug }))

  const done = (next: UserPlanView) => {
    qc.setQueryData(['user-plan', userId], next)
    void qc.invalidateQueries({ queryKey: ['quota', userId] })
    void qc.invalidateQueries({ queryKey: ['users'] })
  }
  const start = useMutation({
    mutationFn: () => startPlanTrial(userId, { planId: Number(planId), days: daysNumber }),
    onSuccess: (next) => {
      done(next)
      setPlanId('')
      alertLib.fire(t('hosting.trial.startedTitle'), t('hosting.trial.startedMessage', { username }), 'success', 'users')
    },
    onError: (error) => alertLib.fire(t('hosting.trial.failedTitle'), apiError(error, t('hosting.trial.failedMessage')), 'error', 'users'),
  })
  const end = useMutation({
    mutationFn: () => endPlanTrial(userId),
    onSuccess: (next) => {
      done(next)
      alertLib.fire(t('hosting.trial.endedTitle'), t('hosting.trial.endedMessage', { username }), 'success', 'users')
    },
    onError: (error) => alertLib.fire(t('hosting.trial.failedTitle'), apiError(error, t('hosting.trial.failedMessage')), 'error', 'users'),
  })

  const confirmEnd = async () => {
    const ok = await alertLib.confirm(t('hosting.trial.endTitle'), t('hosting.trial.endConfirm', { username }), t('hosting.trial.endAction'), t('common.cancel'), 'warning', 'users')
    if (ok) end.mutate()
  }

  // the trial runs on a plan the account does not own; without a plan of its own there is nothing to upgrade from
  if (!view.plan) return null

  return (
    <section aria-label={t('hosting.trial.title')} className="space-y-3 border-t border-[var(--win-border)] pt-3">
      <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('hosting.trial.title')}</p>

      {view.trial ? (
        <>
          <p className="text-[12px] text-[var(--text-secondary)]">
            {t('hosting.trial.running', { plan: view.trial.plan?.name ?? '-', date: formatDateID(view.trial.endsAt), own: view.plan.name })}
          </p>
          <Button variant="danger-soft" className="w-full" loading={end.isPending} onClick={() => void confirmEnd()}>
            {t('hosting.trial.endAction')}
          </Button>
        </>
      ) : view.state !== 'active' ? (
        <p className="text-[12px] text-[var(--text-secondary)]">{t('hosting.trial.needsActive')}</p>
      ) : (
        <>
          <p className="text-[12px] text-[var(--text-secondary)]">{t('hosting.trial.hint', { plan: view.plan.name })}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            <Field label={t('hosting.trial.plan')}>
              <Select value={planId} onChange={setPlanId} options={options} placeholder={t('hosting.trial.pick')} />
            </Field>
            <Field label={t('hosting.userPlan.days')} error={daysValid ? undefined : t('hosting.userPlan.daysInvalid')}>
              <TextInput mono type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
          </div>
          <Button variant="primary-soft" className="w-full" disabled={planId === '' || !daysValid} loading={start.isPending} onClick={() => start.mutate()}>
            {t('hosting.trial.start')}
          </Button>
        </>
      )}
    </section>
  )
}
