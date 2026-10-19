import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import type { PanelUser } from '@/api/agent'
import { setUserPlan } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { SelectableCard } from '@/components/ui/SelectableCard'
import { apiError } from '@/components/windows/users/apiError'
import { alertLib } from '@/lib/alert'
import { formatDateID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'

const CHOICES = [1, 3, 6, 12, 24]
const STATE_TONE = { none: 'neutral', active: 'success', grace: 'warning', expired: 'danger' } as const

// Same rule as the agent: a short month keeps its last day, 31 Jan + 1 month is 28 Feb
function addMonths(from: Date, months: number) {
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1, from.getHours(), from.getMinutes(), from.getSeconds())
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(from.getDate(), last))
  return target
}

// Renewing the plan of an account: for how long, when it ends now, and when it will end after
export function RenewPlanModal({ user, open, onClose }: { user: PanelUser; open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const plan = user.hosting
  const [months, setMonths] = useState(1)
  const [custom, setCustom] = useState('')

  const customNumber = custom.trim() === '' ? undefined : Number(custom)
  const customValid = customNumber === undefined || (Number.isInteger(customNumber) && customNumber >= 1 && customNumber <= 60)
  const chosen = customNumber ?? months

  const close = () => {
    setMonths(1)
    setCustom('')
    onClose()
  }

  const mutation = useMutation({
    mutationFn: () => setUserPlan(user.id, { planId: plan!.planId, months: chosen }),
    onSuccess: () => {
      alertLib.fire(t('hosting.userPlan.savedTitle'), t('hosting.userPlan.savedMessage', { username: user.username }), 'success', 'users')
      void qc.invalidateQueries({ queryKey: ['users'] })
      void qc.invalidateQueries({ queryKey: ['users-summary'] })
      void qc.invalidateQueries({ queryKey: ['user-plan', user.id] })
      close()
    },
    onError: (e: unknown) => alertLib.fire(t('hosting.userPlan.failedTitle'), apiError(e, t('hosting.userPlan.failedMessage')), 'error', 'users'),
  })

  if (!plan?.planId) return null

  // the new end counts from the current one while the plan still runs, and from today once it has ended
  const now = new Date()
  const current = plan.expiresAt ? new Date(plan.expiresAt) : null
  const runs = !!current && current.getTime() > now.getTime()
  const next = addMonths(runs && current ? current : now, chosen)
  const label = (count: number) => (count % 12 === 0 ? (count === 12 ? t('order.duration.year') : t('order.duration.years', { count: count / 12 })) : count === 1 ? t('order.duration.month') : t('order.duration.months', { count }))

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('hosting.users.renewTitle')}
      subtitle={user.username}
      icon={<CalendarPlus />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} disabled={!customValid} onClick={() => mutation.mutate()}>
            {t('hosting.users.renewFor', { duration: label(chosen) })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.8125rem]">
          <dt className="text-[var(--text-secondary)]">{t('hosting.users.renewPlan')}</dt>
          <dd className="flex items-center gap-2 font-medium">
            {plan.planName}
            <Badge tone={STATE_TONE[plan.state]} dot>{t(`hosting.userPlan.state.${plan.state}`)}</Badge>
          </dd>
          <dt className="text-[var(--text-secondary)]">{t('hosting.users.renewCurrentEnd')}</dt>
          <dd className="panel-mono">{current ? formatDateID(current.toISOString()) : t('hosting.users.renewNoEnd')}</dd>
        </dl>

        <Field label={t('hosting.users.renewDuration')}>
          <div role="group" aria-label={t('hosting.users.renewDuration')} className="grid grid-cols-3 gap-2">
            {CHOICES.map((count) => (
              <SelectableCard key={count} selected={customNumber === undefined && months === count} onClick={() => { setMonths(count); setCustom('') }} className="rounded-xl px-3 py-2 text-center text-[0.875rem] font-semibold">
                {label(count)}
              </SelectableCard>
            ))}
          </div>
        </Field>
        <Field label={t('hosting.users.renewCustom')} error={customValid ? undefined : t('hosting.userPlan.monthsInvalid')}>
          <TextInput mono type="number" min={1} max={60} value={custom} onChange={(e) => setCustom(e.target.value)} />
        </Field>

        <div className="panel-muted-block space-y-1 px-3 py-2.5 text-[0.8125rem]">
          <p className="flex items-center justify-between gap-3">
            <span className="text-[var(--text-secondary)]">{t('hosting.users.renewNewEnd')}</span>
            <span className="panel-mono font-semibold">{customValid ? formatDateID(next.toISOString()) : '-'}</span>
          </p>
          <p className="text-[0.75rem] text-[var(--text-secondary)]">{runs ? t('hosting.users.renewFromEnd') : t('hosting.users.renewFromToday')}</p>
          {user.status === 'suspended' && plan.state !== 'active' ? <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('hosting.users.renewReactivate')}</p> : null}
        </div>
      </div>
    </Modal>
  )
}
