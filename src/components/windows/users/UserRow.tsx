import { apiError } from '@/components/windows/users/apiError'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Check, CircleUser, Crown, KeyRound, Network, Pencil, Settings2, Shield, ShieldOff, Trash2, X } from 'lucide-react'
import { updateUser, getUserQuota, updateUserQuota, type PanelUser, type UserHosting, type UserPlanState, type UserQuota } from '@/api/agent'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { EntityRow } from '@/components/ui/EntityRow'
import { alertLib } from '@/lib/alert'
import { UserQuotaPanel } from '@/components/windows/users/UserQuotaPanel'
import { toast } from 'sonner'
import { setUserPlan } from '@/api/hosting'
import { formatDateID } from '@/lib/datetime'
import { useAuthStore } from '@/store/authStore'
import { usePublicSite } from '@/hooks/usePublicSite'
import { useI18n } from '@/lib/i18n'
import { ROLE_SELECT_OPTIONS, ROLE_TONES, STATUS_TONES } from '@/components/windows/users/constants'

const ROLE_ICON: Record<string, ReactElement> = {
  superadmin: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  user: <CircleUser className="h-3 w-3" />,
}

const PLAN_TONES: Record<UserPlanState, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', grace: 'warning', expired: 'danger', none: 'neutral' }

// The line under an account in hosting mode: when the plan ends and how many subdomains are used
function HostingMeta({ hosting }: { hosting: UserHosting }) {
  const { t } = useI18n()
  const parts: string[] = []
  if (hosting.planId) {
    if (!hosting.expiresAt) parts.push(t('hosting.userPlan.noEnd'))
    else if (hosting.state === 'grace' && hosting.graceEndsAt) parts.push(t('hosting.users.graceUntil', { end: formatDateID(hosting.graceEndsAt) }))
    else if (hosting.state === 'expired') parts.push(t('hosting.users.endedOn', { date: formatDateID(hosting.expiresAt) }))
    else parts.push(t('hosting.users.until', { date: formatDateID(hosting.expiresAt) }))
  }
  if (hosting.maxSubdomains > 0 || hosting.subdomains > 0) parts.push(t('hosting.users.subdomains', { used: hosting.subdomains, limit: hosting.maxSubdomains }))
  if (parts.length === 0) return null
  return <span className="text-[11.5px] text-[var(--text-secondary)]">{parts.join(' · ')}</span>
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
  // plans are the superadmin's, and only exist while hosting mode is on
  const viewerIsSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin'
  const { hosting } = usePublicSite()
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

  // renewing the plan of an account for one more period of that plan
  const renewMut = useMutation({
    mutationFn: (planId: number) => setUserPlan(user.id, { planId }),
    onSuccess: () => {
      alertLib.fire(t('hosting.userPlan.savedTitle'), t('hosting.userPlan.savedMessage', { username: user.username }), 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['users-summary'] })
      qc.invalidateQueries({ queryKey: ['user-plan', user.id] })
    },
    onError: (e: unknown) => alertLib.fire(t('hosting.userPlan.failedTitle'), apiError(e, t('hosting.userPlan.failedMessage')), 'error', 'users'),
  })
  const plan = user.hosting
  const confirmRenew = async () => {
    if (!plan?.planId) return
    const ok = await alertLib.confirm(
      t('hosting.users.renewQuestion'),
      t('hosting.users.renewMessage', { username: user.username, plan: plan.planName }),
      t('hosting.userPlan.renew'),
      t('common.cancel'),
      'question',
      'users',
    )
    if (ok) renewMut.mutate(plan.planId)
  }

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
          {plan ? (
            plan.planId ? (
              <Badge tone={PLAN_TONES[plan.state]} dot>
                {plan.planName}
                {plan.state !== 'active' ? ` · ${t(`hosting.userPlan.state.${plan.state}`)}` : ''}
              </Badge>
            ) : (
              <Badge tone="neutral">{t('hosting.userPlan.none')}</Badge>
            )
          ) : null}
        </>
      }
      subtitle={user.email}
      meta={plan ? <HostingMeta hosting={plan} /> : undefined}
      actions={
        <div className="flex items-center gap-1">
          {plan?.planId ? (
            <IconButton onClick={() => void confirmRenew()} tone="success" disabled={renewMut.isPending} label={t('hosting.users.renewOne')}>
              <CalendarPlus className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          <IconButton onClick={onQuota} tone="primary" label={plan ? t('hosting.users.planAndQuota') : t('users.manageQuota')}>
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
          <UserQuotaPanel user={user} quota={quota} saving={updateQuotaMut.isPending} showPlan={viewerIsSuperadmin && hosting && user.role !== 'superadmin'} onSave={(patch) => updateQuotaMut.mutate(patch)} />
        ) : null
      }
    />
  )
}
