import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { changeMyPassword } from '@/api/users'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { IconBadge } from '@/components/ui/IconBadge'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

const MIN_LENGTH = 8

// Shown instead of the desktop to an account whose password came from an admin: it must choose its own first
export function PasswordGate() {
  const { t } = useI18n()
  const username = useAuthStore((s) => s.user?.username ?? '')
  const initSession = useAuthStore((s) => s.initSession)
  const logout = useAuthStore((s) => s.logout)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  const mutation = useMutation({
    mutationFn: () => changeMyPassword(current, next),
    onSuccess: async () => {
      toast.success(t('account.passwordChangedTitle'))
      await initSession()
    },
    onError: (e: unknown) => {
      const message = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? t('account.passwordChangeFailed')
      toast.error(t('account.passwordChangeFailedTitle'), { description: message })
    },
  })

  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const same = next.length > 0 && next === current
  const mismatch = confirm.length > 0 && confirm !== next
  const ready = current.length > 0 && next.length >= MIN_LENGTH && !same && confirm === next

  return (
    <main className="flex min-h-dvh w-full items-center justify-center overflow-y-auto bg-[var(--win-bg)] p-4 text-[var(--win-text)]">
      <form
        className="panel-shell-card flex w-full max-w-sm flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready && !mutation.isPending) mutation.mutate()
        }}
      >
        <div className="flex items-start gap-3">
          <IconBadge tone="primary">
            <KeyRound />
          </IconBadge>
          <div className="min-w-0">
            <h1 className="text-[0.9375rem] font-bold">{t('gate.password.title')}</h1>
            <p className="mt-0.5 text-[0.8125rem] text-[var(--text-secondary)]">{t('gate.password.subtitle', { username })}</p>
          </div>
        </div>

        <Field label={t('gate.password.current')}>
          <PasswordInput autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t('users.newPassword')} error={tooShort ? t('users.passwordTooShort', { min: MIN_LENGTH }) : same ? t('gate.password.same') : undefined}>
          <PasswordInput autoComplete="new-password" value={next} invalid={tooShort || same} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('users.confirmPassword')} error={mismatch ? t('users.passwordMismatch') : undefined}>
          <PasswordInput autoComplete="new-password" value={confirm} invalid={mismatch} onChange={(e) => setConfirm(e.target.value)} />
        </Field>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--win-border)] pt-3.5">
          <Button variant="ghost" icon={<LogOut className="h-3.5 w-3.5" />} onClick={() => void logout()}>
            {t('gate.password.logout')}
          </Button>
          <Button variant="primary" type="submit" disabled={!ready} loading={mutation.isPending}>
            {t('gate.password.submit')}
          </Button>
        </div>
      </form>
    </main>
  )
}
