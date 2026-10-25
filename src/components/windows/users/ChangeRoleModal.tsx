import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { updateUser, type PanelUser } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { ROLE_SELECT_OPTIONS } from '@/components/windows/users/constants'
import { apiError } from '@/components/windows/users/apiError'

interface ChangeRoleModalProps {
  user: PanelUser | null
  assignableRoles: string[]
  onClose: () => void
}

export function ChangeRoleModal({ user, assignableRoles, onClose }: ChangeRoleModalProps) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [selectedRole, setSelectedRole] = useState<string>('user')

  useEffect(() => {
    if (user) {
      setSelectedRole(user.role)
    }
  }, [user])

  const mutation = useMutation({
    mutationFn: (newRole: string) => updateUser(user!.id, { role: newRole }),
    onSuccess: (updated) => {
      alertLib.fire(
        t('users.roleChangedTitle'),
        t('users.roleChangedMessage', { username: user!.username, role: updated.role }),
        'success',
        'users',
      )
      void qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (e: unknown) => {
      const message = apiError(e, t('users.roleChangeFailed'))
      toast.error(t('users.roleChangeFailed'), { description: message })
      alertLib.fire(t('users.roleChangeFailedTitle'), message, 'error', 'users')
    },
  })

  if (!user) return null

  const unchanged = selectedRole === user.role

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={t('users.changeRoleQuestion')}
      subtitle={user.username}
      icon={<UserCog />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={unchanged || mutation.isPending}
            loading={mutation.isPending}
            onClick={() => mutation.mutate(selectedRole)}
          >
            {t('users.saveRole')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[0.8125rem] text-[var(--text-secondary)]">
          {t('users.changeRoleMessage', {
            username: user.username,
            currentRole: t(`users.role.${user.role}`),
            nextRole: t(`users.role.${selectedRole}`),
          }).replace(/<\/?strong>/g, '')}
        </p>
        <Field label={t('users.col.role')}>
          <Select
            value={selectedRole}
            onChange={setSelectedRole}
            options={ROLE_SELECT_OPTIONS(t, assignableRoles)}
            searchable={false}
          />
        </Field>
      </div>
    </Modal>
  )
}
