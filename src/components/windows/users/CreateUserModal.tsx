import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { createUser } from '@/api/agent'
import { createSubdomainForUser, listHostingDomains, listHostingPlans } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { apiError } from '@/components/windows/users/apiError'
import { ROLE_SELECT_OPTIONS } from '@/components/windows/users/constants'
import { AccessShareModal, type AccessInfo } from './AccessShareModal'

const EMPTY = { username: '', email: '', password: '', role: 'user', displayName: '', planId: '', months: '', label: '', zoneId: '' }

const LABEL_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/

interface CreateUserModalProps {
  open: boolean
  onClose: () => void
  assignable: string[]
  /** Superadmin with hosting mode on: the new account can be put on a plan right away */
  canGivePlan: boolean
}

// The form is keyed by the opening, so every opening starts empty; the access to send outlives it
export function CreateUserModal(props: CreateUserModalProps) {
  const [shared, setShared] = useState<AccessInfo | null>(null)
  return (
    <>
      <CreateUserForm key={props.open ? 'open' : 'closed'} {...props} onCreated={setShared} />
      <AccessShareModal info={shared} onClose={() => setShared(null)} />
    </>
  )
}

function CreateUserForm({ open, onClose, assignable, canGivePlan, onCreated }: CreateUserModalProps & { onCreated: (info: AccessInfo) => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [showPwd, setShowPwd] = useState(false)
  const [forceChange, setForceChange] = useState(true)
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, enabled: open && canGivePlan, staleTime: 30_000, retry: 0 })
  const offered = (domains.data ?? []).filter((domain) => domain.enabled)
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, enabled: open && canGivePlan, staleTime: 30_000, retry: 0 })

  const monthsNumber = form.months.trim() === '' ? undefined : Number(form.months)
  const monthsValid = monthsNumber === undefined || (Number.isInteger(monthsNumber) && monthsNumber >= 1 && monthsNumber <= 60)
  const wantsAddress = canGivePlan && form.role !== 'superadmin' && form.label !== ''
  const zoneId = form.zoneId || offered[0]?.zoneId || ''
  const labelValid = !wantsAddress || (LABEL_RE.test(form.label) && !form.label.includes('--') && zoneId !== '')

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
        forcePasswordChange: forceChange,
      }),
    onSuccess: async (u) => {
      // the panel address is made after the account, so a name that turns out taken does not lose the account
      let address: string | undefined
      if (wantsAddress) {
        try {
          const made = await createSubdomainForUser({ userId: u.id, label: form.label, zoneId })
          address = `https://${made.hostname}`
        } catch (e) {
          toast.warning(t('users.addressFailed'), { description: apiError(e, t('hosting.sub.createFailed')) })
        }
        void qc.invalidateQueries({ queryKey: ['hosting', 'subdomains'] })
      }
      onCreated({ userId: u.id, username: u.username, displayName: u.displayName || form.displayName, email: u.email, password: form.password, forcedChange: forceChange, address })
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
          <Button variant="primary" loading={mutation.isPending} disabled={!monthsValid || !labelValid} onClick={() => mutation.mutate()}>
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

        <Checkbox checked={forceChange} onChange={setForceChange} label={t('users.forceChange')} description={t('users.forceChangeHint')} />

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

        {canGivePlan && form.role !== 'superadmin' && offered.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <Field label={t('users.panelAddress')} hint={t('users.panelAddressHint')} error={form.label !== '' && !labelValid ? t('hosting.sub.labelInvalid') : undefined}>
              <TextInput mono value={form.label} maxLength={32} autoComplete="off" placeholder={t('hosting.sub.namePlaceholder')} invalid={form.label !== '' && !labelValid} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value.toLowerCase().trim() }))} />
            </Field>
            <Field label={t('hosting.sub.domain')}>
              <Select value={zoneId} onChange={(next) => setForm((f) => ({ ...f, zoneId: next }))} options={offered.map((domain) => ({ value: domain.zoneId, label: domain.name }))} searchable={offered.length > 8} />
            </Field>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
