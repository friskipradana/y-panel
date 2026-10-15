import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { resetUserPassword, type PanelUser } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

interface ResetPasswordModalProps {
  user: PanelUser | null
  onClose: () => void
}

const MIN_LENGTH = 8

// Admin-side reset: sets a new password and signs the user out everywhere
export function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const close = () => {
    setPassword('')
    setConfirm('')
    onClose()
  }

  const mutation = useMutation({
    mutationFn: () => resetUserPassword(user!.id, password),
    onSuccess: () => {
      alertLib.fire(t('users.passwordResetTitle'), t('users.passwordResetMessage', { username: user!.username }), 'success', 'users')
      close()
    },
    onError: (e: unknown) => {
      const message = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? t('users.passwordResetFailed')
      alertLib.fire(t('users.passwordResetFailedTitle'), message, 'error', 'users')
    },
  })

  const tooShort = password.length > 0 && password.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== password
  const ready = password.length >= MIN_LENGTH && confirm === password

  return (
    <Modal
      open={!!user}
      onClose={close}
      title={t('users.resetPassword')}
      subtitle={user?.username}
      icon={<KeyRound />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!ready} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t('users.resetPassword')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('users.resetPasswordHint')}</p>
        <Field label={t('users.newPassword')} error={tooShort ? t('users.passwordTooShort', { min: MIN_LENGTH }) : undefined}>
          <TextInput type="password" autoComplete="new-password" value={password} invalid={tooShort} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t('users.confirmPassword')} error={mismatch ? t('users.passwordMismatch') : undefined}>
          <TextInput type="password" autoComplete="new-password" value={confirm} invalid={mismatch} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
