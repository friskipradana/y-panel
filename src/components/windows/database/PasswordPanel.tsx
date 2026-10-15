import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, RefreshCw } from 'lucide-react'
import { setDatabasePassword } from '@/api/agent'
import { CopyBlock } from '@/components/public/CopyBlock'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

function apiError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

export function PasswordPanel({ databaseId, engine }: { databaseId: number; engine: string }) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (password?: string) => setDatabasePassword(databaseId, password),
    onSuccess: (res) => {
      setResult(res.password)
      setValue('')
    },
    onError: (e: unknown) => alertLib.fire(t('databases.admin.passwordFailed'), apiError(e, t('databases.actionFailed')), 'error', 'database'),
  })

  const strong = /^[A-Za-z0-9!@#%^*_+=.,:-]{8,64}$/.test(value)

  return (
    <div className="space-y-4">
      <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
        {engine === 'redis' ? t('databases.admin.passwordNoteRedis') : t('databases.admin.passwordNote')}
      </p>
      <Field label={t('databases.admin.newPassword')} hint={t('databases.admin.passwordRules')} error={value && !strong ? t('databases.admin.passwordInvalid') : undefined}>
        <TextInput mono type="password" value={value} invalid={!!value && !strong} autoComplete="new-password" onChange={(e) => setValue(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!strong} loading={mutation.isPending} onClick={() => mutation.mutate(value)}>
          <KeyRound className="h-3.5 w-3.5" />
          {t('databases.admin.setPassword')}
        </Button>
        <Button variant="ghost" loading={mutation.isPending} onClick={() => mutation.mutate(undefined)}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t('databases.admin.generatePassword')}
        </Button>
      </div>
      {result ? (
        <div className="space-y-2 rounded-lg border border-[var(--panel-success-border)] bg-[var(--panel-success-bg)] p-3">
          <p className="text-[0.75rem]">{t('databases.admin.passwordChanged')}</p>
          <CopyBlock text={result} />
        </div>
      ) : null}
    </div>
  )
}
