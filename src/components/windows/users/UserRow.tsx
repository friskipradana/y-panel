import { apiError } from '@/components/windows/users/apiError'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CircleUser, Crown, KeyRound, Network, Pencil, Settings2, Shield, ShieldOff, Trash2, X } from 'lucide-react'
import { updateUser, getUserQuota, updateUserQuota, type PanelUser, type UserQuota } from '@/api/agent'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { EntityRow } from '@/components/ui/EntityRow'
import { alertLib } from '@/lib/alert'
import { UserQuotaPanel } from '@/components/windows/users/UserQuotaPanel'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { ROLE_SELECT_OPTIONS, ROLE_TONES, STATUS_TONES } from '@/components/windows/users/constants'

const ROLE_ICON: Record<string, ReactElement> = {
  superadmin: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  user: <CircleUser className="h-3 w-3" />,
}

export function UserRow({
  user,
  onSuspend,
  onActivate,
  onDelete,
  onQuota,
  showQuota,
  canManage,
  assignableRoles,
  onResetPassword,
  onMove,
}: {
  user: PanelUser
  onSuspend: () => void
  onActivate: () => void
  onDelete: () => void
  onQuota: () => void
  showQuota: boolean
  canManage: boolean
  assignableRoles: string[]
  onResetPassword: () => void
  /** superadmin only: place the account under another admin */
  onMove?: () => void
}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { data: quota } = useQuery({
    queryKey: ['quota', user.id],
    queryFn: () => getUserQuota(user.id),
    enabled: showQuota,
  })

  const updateQuotaMut = useMutation({
    mutationFn: (q: Partial<UserQuota>) => updateUserQuota(user.id, q),
    onSuccess: () => {
      alertLib.fire(t('users.quotaUpdatedTitle'), t('users.quotaUpdatedMessage', { username: user.username }), 'success', 'users')
      qc.invalidateQueries({ queryKey: ['quota', user.id] })
    },
    onError: (e: unknown) => alertLib.fire(t('users.quotaUpdateFailedTitle'), apiError(e, t('users.quotaUpdateFailedMessage')), 'error', 'users'),
  })

  const changeRoleMut = useMutation({
    mutationFn: (role: string) => updateUser(user.id, { role }),
    onSuccess: (updated) => {
      alertLib.fire(t('users.roleChangedTitle'), t('users.roleChangedMessage', { username: user.username, role: updated.role }), 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditingRole(false)
    },
    onError: (e: unknown) => {
      const message = apiError(e, t('users.roleChangeFailed'))
      toast.error(t('users.roleChangeFailed'), { description: message })
      alertLib.fire(t('users.roleChangeFailedTitle'), message, 'error', 'users')
      setEditingRole(false)
    },
  })

  const [editingRole, setEditingRole] = useState(false)
  const [selectedRole, setSelectedRole] = useState(user.role)

  const handleRoleSave = async () => {
    if (selectedRole === user.role) {
      setEditingRole(false)
      return
    }
    const confirmed = await alertLib.confirm(
      t('users.changeRoleQuestion'),
      t('users.changeRoleMessage', { username: user.username, currentRole: user.role, nextRole: selectedRole }),
      t('users.confirmChangeRole'),
      t('common.cancel'),
      'warning',
      'users',
    )
    if (confirmed) {
      changeRoleMut.mutate(selectedRole)
    } else {
      setSelectedRole(user.role)
      setEditingRole(false)
    }
  }

  return (
    <EntityRow
      overflowVisible
      centered
      leading={<div className="panel-avatar rounded-full text-sm">{user.username[0]?.toUpperCase()}</div>}
      title={user.username}
      badges={
        <>
          {editingRole ? (
            <div className="flex items-center gap-1 overflow-visible">
              <Select
                value={selectedRole}
                onChange={setSelectedRole}
                options={ROLE_SELECT_OPTIONS(t, assignableRoles)}
                className="min-w-[150px]"
                buttonClassName="h-8 rounded-full border-[var(--win-border)] bg-[var(--panel-surface)] pl-3 pr-10 text-[12px] font-medium"
                dropdownClassName="min-w-[180px]"
                searchable
                searchPlaceholder={t('users.searchRole')}
              />
  
              <IconButton onClick={handleRoleSave} disabled={changeRoleMut.isPending} tone="success" label={t('users.saveRole')} className="h-6 w-6 rounded-md">
                <Check className="h-3 w-3" />
              </IconButton>
              <IconButton onClick={() => { setEditingRole(false); setSelectedRole(user.role) }} label={t('common.cancel')} className="h-6 w-6 rounded-md">
                <X className="h-3 w-3" />
              </IconButton>
            </div>
          ) : !canManage || assignableRoles.length < 2 ? (
            <Badge tone={ROLE_TONES[user.role] ?? 'neutral'}>
              {ROLE_ICON[user.role]} {user.role}
            </Badge>
          ) : (
            <Badge
              tone={ROLE_TONES[user.role] ?? 'neutral'}
              onClick={() => { setEditingRole(true); setSelectedRole(user.role) }}
              title={t('users.clickChangeRole')}
            >
              {ROLE_ICON[user.role]} {user.role}
              <Pencil className="h-2.5 w-2.5 opacity-60" />
            </Badge>
          )}
          <Badge tone={STATUS_TONES[user.status] ?? 'neutral'}>{user.status}</Badge>
        </>
      }
      subtitle={user.email}
      actions={
        <div className="flex items-center gap-1">
          <IconButton onClick={onQuota} tone="primary" label={t('users.manageQuota')}>
            <Settings2 className="h-3.5 w-3.5" />
          </IconButton>
          {canManage ? (
            <IconButton onClick={onResetPassword} label={t('users.resetPassword')}>
              <KeyRound className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          {onMove ? (
            <IconButton onClick={onMove} label={t('users.moveTitle')}>
              <Network className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          {!canManage ? null : user.status === 'active' ? (
            <IconButton onClick={onSuspend} tone="warning" label={t('users.suspend')}>
              <ShieldOff className="h-3.5 w-3.5" />
            </IconButton>
          ) : (
            <IconButton onClick={onActivate} tone="success" label={t('users.activate')}>
              <Shield className="h-3.5 w-3.5" />
            </IconButton>
          )}
          {canManage ? (
            <IconButton onClick={onDelete} tone="danger" label={t('common.delete')}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
        </div>
      }
      expanded={
        showQuota && quota ? (
          <UserQuotaPanel user={user} quota={quota} saving={updateQuotaMut.isPending} onSave={(patch) => updateQuotaMut.mutate(patch)} />
        ) : null
      }
    />
  )
}
