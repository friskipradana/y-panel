import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { createUser } from '@/api/agent'
import { listHostingPlans } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { apiError } from '@/components/windows/users/apiError'
import { ROLE_SELECT_OPTIONS } from '@/components/windows/users/constants'

const EMPTY = { username: '', email: '', password: '', role: 'user', displayName: '', planId: '', months: '' }

interface CreateUserModalProps {
  open: boolean
  onClose: () => void
  assignable: string[]
  /** Superadmin with hosting mode on: the new account can be put on a plan right away */
  canGivePlan: boolean
}

// The form is keyed by the opening, so every opening starts empty
export function CreateUserModal(props: CreateUserModalProps) {
  return <CreateUserForm key={props.open ? 'open' : 'closed'} {...props} />
}

function CreateUserForm({ open, onClose, assignable, canGivePlan }: CreateUserModalProps) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [showPwd, setShowPwd] = useState(false)
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, enabled: open && canGivePlan, staleTime: 30_000, retry: 0 })

  const monthsNumber = form.months.trim() === '' ? undefined : Number(form.months)
  const monthsValid = monthsNumber === undefined || (Number.isInteger(monthsNumber) && monthsNumber >= 1 && monthsNumber <= 60)

  const mutation = useMutation({
    mutationFn: () =>
      createUser({
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
        displayName: form.displayName,
        planId: canGivePlan && form.planId ? Number(form.planId) : undefined,
        months: canGivePlan && form.planId ? monthsNumber : undefined,
      }),
    onSuccess: (u) => {
      alertLib.fire(t('users.createdTitle'), t('users.createdMessage', { username: u.username }), 'success', 'users')
      void qc.invalidateQueries({ queryKey: ['users'] })
      void qc.invalidateQueries({ queryKey: ['users-summary'] })
      void qc.invalidateQueries({ queryKey: ['hosting', 'plans'] })
      onClose()
    },
    onError: (e: unknown) => {
      const message = apiError(e, t('users.createFailed'))
      toast.error(t('users.createFailed'), { description: message })
      alertLib.fire(t('users.createFailedTitle'), message, 'error', 'users')
    },
  })

  const fields = [
    { key: 'username', label: t('users.username'), type: 'text', placeholder: 'john_doe' },
    { key: 'email', label: t('users.email'), type: 'email', placeholder: 'john@example.com' },
    { key: 'displayName', label: t('users.displayName'), type: 'text', placeholder: 'John Doe' },
  ] as const

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('users.createNewUser')}
      icon={<UserPlus />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={mutation.isPending} disabled={!monthsValid} onClick={() => mutation.mutate()}>
            {mutation.isPending ? t('users.creating') : t('users.createUser')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {fields.map(({ key, label, type, placeholder }) => (
          <Field key={key} label={label}>
            <TextInput type={type} placeholder={placeholder} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
          </Field>
        ))}
        <Field label={t('users.password')}>
          <div className="relative">
            <TextInput
              type={showPwd ? 'text' : 'password'}
              placeholder={t('users.passwordPlaceholder')}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="pr-10"
            />
            <IconButton label={showPwd ? t('users.hidePassword') : t('users.showPassword')} onClick={() => setShowPwd((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2">
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </IconButton>
          </div>
        </Field>
        <Field label={t('users.role')}>
          <Select
            id="users-create-role-select"
            value={form.role}
            onChange={(next) => setForm((f) => ({ ...f, role: next }))}
            options={ROLE_SELECT_OPTIONS(t, assignable)}
            buttonClassName="h-[42px]"
            searchable
            searchPlaceholder={t('users.searchRole')}
          />
        </Field>

        {canGivePlan && form.role !== 'superadmin' ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <Field label={t('hosting.userPlan.plan')} hint={t('hosting.users.planOnCreateHint')}>
              <Select
                value={form.planId}
                onChange={(next) => setForm((f) => ({ ...f, planId: next }))}
                options={[
                  { value: '', label: t('hosting.userPlan.none') },
                  ...(plans.data ?? []).map((plan) => ({ value: String(plan.id), label: plan.name, description: plan.slug })),
                ]}
              />
            </Field>
            <Field label={t('hosting.userPlan.months')} hint={t('hosting.userPlan.monthsHint')} error={monthsValid ? undefined : t('hosting.userPlan.monthsInvalid')}>
              <TextInput mono type="number" min={1} max={60} value={form.months} disabled={form.planId === ''} onChange={(e) => setForm((f) => ({ ...f, months: e.target.value }))} />
            </Field>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
