import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Network } from 'lucide-react'
import { listUsers, updateUser, type PanelUser } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { apiError } from '@/components/windows/users/apiError'

// Superadmin: place an account under another admin. That admin (and the accounts below it) then
// sees it; no other admin does.
export function MoveAccountModal({ user, onClose }: { user: PanelUser | null; onClose: () => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [parentId, setParentId] = useState('')

  const people = useQuery({
    queryKey: ['users', 'managers'],
    queryFn: () => listUsers({ limit: 200 }),
    enabled: !!user,
  })
  const managers = useMemo(
    () => (people.data?.items ?? []).filter((u) => (u.role === 'admin' || u.role === 'superadmin') && u.id !== user?.id),
    [people.data, user?.id],
  )
  const currentParent = people.data?.items.find((u) => u.id === user?.parentId)

  useEffect(() => {
    setParentId(user?.parentId ? String(user.parentId) : '')
  }, [user])

  const mutation = useMutation({
    mutationFn: () => updateUser(user!.id, { parentId: Number(parentId) } as Partial<PanelUser>),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] })
      alertLib.fire(t('users.moveDoneTitle'), t('users.moveDoneMessage', { username: user!.username }), 'success', 'users')
      onClose()
    },
    onError: (e: unknown) => alertLib.fire(t('users.moveFailedTitle'), apiError(e, t('users.moveFailedMessage')), 'error', 'users'),
  })

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={t('users.moveTitle')}
      subtitle={user?.username}
      icon={<Network />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!parentId || Number(parentId) === user?.parentId} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t('users.moveConfirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('users.moveHint')}</p>
        {currentParent ? (
          <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('users.moveCurrent', { username: currentParent.username })}</p>
        ) : null}
        <Field label={t('users.moveTo')}>
          <Select
            value={parentId}
            onChange={setParentId}
            options={managers.map((m) => ({ value: String(m.id), label: `${m.username} (${m.role})` }))}
            searchable={managers.length > 8}
          />
        </Field>
      </div>
    </Modal>
  )
}
