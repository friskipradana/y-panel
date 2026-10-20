import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { changeMyPassword, getMyUsage } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

const MIN_LENGTH = 8

// A count limit of a billion or more, and a size limit of 0, mean the account has no limit (the superadmin has none)
const NO_COUNT_LIMIT = 1_000_000_000

function UsageLine({ label, used, limit, unit }: { label: string; used: number; limit: number; unit?: string }) {
  const { t } = useI18n()
  const unlimited = limit >= NO_COUNT_LIMIT || (unit !== undefined && limit === 0)
  const over = !unlimited && limit > 0 && used >= limit
  const suffix = unit ? ` ${unit}` : ''
  return (
    <SettingRow
      title={label}
      control={
        <span className={`panel-mono text-[12px] font-medium ${over ? 'text-[var(--panel-danger-text)]' : 'text-[var(--win-text)]'}`}>
          {unlimited ? (
            <>
              {used}
              {suffix} <span className="text-[var(--text-secondary)]">· {t('account.unlimited')}</span>
            </>
          ) : (
            <>
              {used}
              {suffix} / {limit}
              {suffix}
            </>
          )}
        </span>
      }
    />
  )
}

// Own usage against the quota
export function AccountUsage() {
  const { t } = useI18n()
  const isDemo = useAuthStore((s) => s.user?.role) === 'demo'
  const usage = useQuery({ queryKey: ['my-usage'], queryFn: getMyUsage, staleTime: 30_000 })
  const quota = usage.data?.quota
  if (isDemo || !quota || !usage.data) return null
  return (
    <div className="panel-shell-card settings-card !p-3.5 !gap-3.5">
      <SectionHeader icon={<KeyRound />} title={t('account.usageTitle')} subtitle={t('account.usageSubtitle')} size="sm" />
      <UsageLine label={t('users.usageProjects')} used={usage.data.projects} limit={quota.maxProjects} />
      <UsageLine label={t('users.usageTunnels')} used={usage.data.tunnels} limit={quota.maxTunnels} />
      <UsageLine label={t('users.usageDatabases')} used={usage.data.databases} limit={quota.maxDatabases} />
      <UsageLine label={t('users.usageDisk')} used={usage.data.diskUsedMb} limit={quota.diskQuotaMb} unit="MB" />
    </div>
  )
}

// A self-service password change
export function AccountPassword({ titled = true }: { titled?: boolean }) {
  const { t } = useI18n()
  const isDemo = useAuthStore((s) => s.user?.role) === 'demo'
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

  if (isDemo) {
    return (
      <div className="panel-shell-card p-5">
        <SectionHeader icon={<KeyRound />} title={t('account.demoTitle')} subtitle={t('account.demoNotice')} size="sm" />
      </div>
    )
  }

  return (
    <form
      className="panel-shell-card settings-card !p-3.5 !gap-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) mutation.mutate()
      }}
    >
      {titled ? <SectionHeader icon={<KeyRound />} title={t('account.passwordTitle')} subtitle={t('account.passwordSubtitle')} size="sm" /> : null}
      <Field label={t('account.currentPassword')}>
        <PasswordInput autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('users.newPassword')} hint={t('account.passwordRule', { min: MIN_LENGTH })} error={tooShort ? t('users.passwordTooShort', { min: MIN_LENGTH }) : undefined}>
          <PasswordInput autoComplete="new-password" value={next} invalid={tooShort} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('users.confirmPassword')} error={mismatch ? t('users.passwordMismatch') : undefined}>
          <PasswordInput autoComplete="new-password" value={confirm} invalid={mismatch} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={!ready} loading={mutation.isPending}>
          {t('account.changePassword')}
        </Button>
      </div>
    </form>
  )
}

// Usage and password together, for Settings > Security of the accounts that are not the superadmin
export function AccountSecurityCard() {
  return (
    <div className="space-y-3">
      <AccountUsage />
      <AccountPassword />
    </div>
  )
}
