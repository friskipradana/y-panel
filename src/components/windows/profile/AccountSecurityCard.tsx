import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { changeMyPassword, getMyUsage } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

const MIN_LENGTH = 8

function UsageLine({ label, used, limit, unit }: { label: string; used: number; limit: number; unit?: string }) {
  const over = limit > 0 && used >= limit
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 text-[12.5px]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className={`panel-mono ${over ? 'text-[var(--panel-danger-text)]' : 'text-[var(--win-text)]'}`}>
        {used}
        {unit ? ` ${unit}` : ''} / {limit}
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
  )
}

// Own usage against the quota and a self-service password change
export function AccountSecurityCard() {
  const { t } = useI18n()
  const isDemo = useAuthStore((s) => s.user?.role) === 'demo'
  const usage = useQuery({ queryKey: ['my-usage'], queryFn: getMyUsage, staleTime: 30_000 })
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  const mutation = useMutation({
    mutationFn: () => changeMyPassword(current, next),
    onSuccess: () => {
      alertLib.fire(t('account.passwordChangedTitle'), t('account.passwordChangedMessage'), 'success', 'profile')
      setCurrent('')
      setNext('')
      setConfirm('')
    },
    onError: (e: unknown) => {
      const message = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? t('account.passwordChangeFailed')
      alertLib.fire(t('account.passwordChangeFailedTitle'), message, 'error', 'profile')
    },
  })

  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && confirm !== next
  const ready = current.length > 0 && next.length >= MIN_LENGTH && confirm === next

  const quota = usage.data?.quota

  if (isDemo) {
    return (
      <div className="panel-shell-card p-5">
        <SectionHeader icon={<KeyRound />} title={t('account.demoTitle')} subtitle={t('account.demoNotice')} size="sm" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {quota && usage.data ? (
        <div className="panel-shell-card space-y-3 p-5">
          <SectionHeader icon={<KeyRound />} title={t('account.usageTitle')} subtitle={t('account.usageSubtitle')} size="sm" />
          <div className="space-y-2">
            <UsageLine label={t('users.usageProjects')} used={usage.data.projects} limit={quota.maxProjects} />
            <UsageLine label={t('users.usageTunnels')} used={usage.data.tunnels} limit={quota.maxTunnels} />
            <UsageLine label={t('users.usageDatabases')} used={usage.data.databases} limit={quota.maxDatabases} />
            <UsageLine label={t('users.usageDisk')} used={usage.data.diskUsedMb} limit={quota.diskQuotaMb} unit="MB" />
          </div>
        </div>
      ) : null}

      <form
        className="panel-shell-card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) mutation.mutate()
        }}
      >
        <SectionHeader icon={<KeyRound />} title={t('account.passwordTitle')} subtitle={t('account.passwordSubtitle')} size="sm" />
        <Field label={t('account.currentPassword')}>
          <PasswordInput autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t('users.newPassword')} error={tooShort ? t('users.passwordTooShort', { min: MIN_LENGTH }) : undefined}>
          <PasswordInput autoComplete="new-password" value={next} invalid={tooShort} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('users.confirmPassword')} error={mismatch ? t('users.passwordMismatch') : undefined}>
          <PasswordInput autoComplete="new-password" value={confirm} invalid={mismatch} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={!ready} loading={mutation.isPending}>
          {t('account.changePassword')}
        </Button>
      </form>
    </div>
  )
}
