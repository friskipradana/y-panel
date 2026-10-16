import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, UserPlus } from 'lucide-react'
import { createDatabaseAccount, deleteDatabaseAccount, listDatabaseAccounts } from '@/api/agent'
import { CopyBlock } from '@/components/public/CopyBlock'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

type Access = 'read' | 'write' | 'all'

function apiError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

export function UsersPanel({ databaseId, supported }: { databaseId: number; supported: boolean }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [access, setAccess] = useState<Access>('read')
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null)

  const users = useQuery({ queryKey: ['db-users', databaseId], queryFn: () => listDatabaseAccounts(databaseId), enabled: supported, retry: 0 })

  const createMut = useMutation({
    mutationFn: () => createDatabaseAccount(databaseId, { username, password: password || undefined, access }),
    onSuccess: (res) => {
      setCreated(res.password ? { username: res.username, password: res.password } : null)
      setUsername('')
      setPassword('')
      void qc.invalidateQueries({ queryKey: ['db-users', databaseId] })
    },
    onError: (e: unknown) => alertLib.fire(t('databases.admin.userFailed'), apiError(e, t('databases.actionFailed')), 'error', 'database'),
  })
  const deleteMut = useMutation({
    mutationFn: (name: string) => deleteDatabaseAccount(databaseId, name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['db-users', databaseId] }),
    onError: (e: unknown) => alertLib.fire(t('databases.admin.userFailed'), apiError(e, t('databases.actionFailed')), 'error', 'database'),
  })

  const confirmDelete = async (name: string) => {
    const ok = await alertLib.confirm(t('databases.admin.userDeleteQuestion'), t('databases.admin.userDeleteMessage', { name }), t('common.delete'), t('common.cancel'), 'warning', 'database')
    if (ok) deleteMut.mutate(name)
  }

  if (!supported) return <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('databases.admin.usersUnavailable')}</p>

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
        <h3 className="text-[0.8125rem] font-semibold">{t('databases.admin.addUser')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('databases.username')}>
            <TextInput mono value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('databases.usernamePlaceholder')} autoComplete="off" />
          </Field>
          <Field label={t('databases.admin.accessLevel')}>
            <Select
              value={access}
              onChange={(value) => setAccess(value as Access)}
              options={[
                { value: 'read', label: t('databases.admin.accessRead'), description: 'SELECT' },
                { value: 'write', label: t('databases.admin.accessWrite'), description: 'SELECT, INSERT, UPDATE, DELETE' },
                { value: 'all', label: t('databases.admin.accessAll'), description: 'ALL PRIVILEGES' },
              ]}
            />
          </Field>
        </div>
        <Field label={t('databases.password')} hint={t('databases.admin.passwordOptional')}>
          <TextInput mono type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button variant="primary" disabled={!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(username)} loading={createMut.isPending} onClick={() => createMut.mutate()}>
          <UserPlus className="h-3.5 w-3.5" />
          {t('databases.admin.addUser')}
        </Button>
        {created ? (
          <div className="space-y-2 rounded-lg border border-[var(--panel-success-border)] bg-[var(--panel-success-bg)] p-3">
            <p className="text-[0.75rem]">{t('databases.admin.generatedFor', { name: created.username })}</p>
            <CopyBlock text={created.password} />
          </div>
        ) : null}
      </section>

      {users.isLoading ? (
        <LoadingState>{t('databases.admin.loading')}</LoadingState>
      ) : users.isError || !users.data ? (
        <ErrorState title={t('databases.admin.loadFailed')} hint={apiError(users.error, t('databases.admin.loadFailedHint'))} />
      ) : users.data.users.length === 0 ? (
        <EmptyState icon={<UserPlus />}>{t('databases.admin.noUsers')}</EmptyState>
      ) : (
        <ul className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
          {users.data.users.map((account) => {
            const isOwner = account.user === users.data.owner
            return (
              <li key={`${account.user}@${account.host ?? ''}`} className="flex items-center gap-2 px-3 py-2">
                <span className="panel-mono min-w-0 flex-1 truncate text-[0.8125rem]">{account.user}</span>
                {isOwner ? <Badge tone="primary">{t('databases.admin.owner')}</Badge> : null}
                {account.host ? <span className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">{account.host}</span> : null}
                {!isOwner ? (
                  <IconButton label={t('common.delete')} tone="danger" onClick={() => void confirmDelete(account.user)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
