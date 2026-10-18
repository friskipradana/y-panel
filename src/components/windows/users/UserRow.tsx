import { apiError } from '@/components/windows/users/apiError'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Check, CircleUser, Crown, KeyRound, LoaderCircle, Network, Pencil, Settings2, Shield, ShieldOff, Trash2, X } from 'lucide-react'
import { updateUser, getUserQuota, updateUserQuota, type PanelUser, type UserHosting, type UserPlanState, type UserQuota } from '@/api/agent'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/IconButton'
import { ListRowIcon } from '@/components/ui/ListTable'
import { alertLib } from '@/lib/alert'
import { UserQuotaPanel } from '@/components/windows/users/UserQuotaPanel'
import { toast } from 'sonner'
import { setUserPlan } from '@/api/hosting'
import { formatDateID } from '@/lib/datetime'
import { useAuthStore } from '@/store/authStore'
import { usePublicSite } from '@/hooks/usePublicSite'
import { useI18n } from '@/lib/i18n'
import { ROLE_SELECT_OPTIONS, ROLE_TONES } from '@/components/windows/users/constants'

const ROLE_ICON: Record<string, ReactElement> = {
  superadmin: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  user: <CircleUser className="h-3 w-3" />,
}

// The pill of each state: the classes the list windows share
const STATUS_PILL: Record<string, string> = { active: 'running', suspended: 'dead', pending: 'paused' }
const PLAN_PILL: Record<UserPlanState, string> = { active: 'running', grace: 'paused', expired: 'dead', none: 'exited' }

// The line under the plan of an account: when it ends and how many subdomains are used
function hostingMeta(hosting: UserHosting, t: (key: string, params?: Record<string, string | number>) => string) {
  const parts: string[] = []
  if (hosting.planId) {
    if (!hosting.expiresAt) parts.push(t('hosting.userPlan.noEnd'))
    else if (hosting.state === 'grace' && hosting.graceEndsAt) parts.push(t('hosting.users.graceUntil', { end: formatDateID(hosting.graceEndsAt) }))
    else if (hosting.state === 'expired') parts.push(t('hosting.users.endedOn', { date: formatDateID(hosting.expiresAt) }))
    else parts.push(t('hosting.users.until', { date: formatDateID(hosting.expiresAt) }))
  }
  if (hosting.maxSubdomains > 0 || hosting.subdomains > 0) parts.push(t('hosting.users.subdomains', { used: hosting.subdomains, limit: hosting.maxSubdomains }))
  return parts.join(' \u00b7 ')
}

interface UserRowProps {
  user: PanelUser
  index: number
  /** Hosting mode: the plan and expiry columns show */
  hostingColumns: boolean
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
  busy: boolean
}

// One account, in the same row as a container: who, role, status, plan and expiry, and what can be done to it
export function UserRow({ user, index, hostingColumns, onSuspend, onActivate, onDelete, onQuota, showQuota, canManage, assignableRoles, onResetPassword, onMove, busy }: UserRowProps) {
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

  const roleEditable = canManage && assignableRoles.length >= 2
  const planLine = plan ? hostingMeta(plan, t) : ''
  const planLabel = plan ? (plan.planId ? plan.planName : t('hosting.userPlan.none')) : ''
  const summary = [user.role, user.email, planLabel].filter(Boolean).join(' \u00b7 ')

  return (
    <>
      <div className="docker-row">
        <div className="docker-row__num">{String(index + 1).padStart(2, '0')}</div>
        <div className="docker-row__app">
          <ListRowIcon><span className="text-[0.75rem] font-bold">{user.username[0]?.toUpperCase()}</span></ListRowIcon>
          <div className="docker-row__text">
            <span className="docker-app-name" title={user.username}>{user.username}</span>
            <span className="docker-row__sub" title={user.email}>{user.email}</span>
            <span className="docker-row__meta">{summary}</span>
          </div>
        </div>

        <div className="docker-cell docker-cell--wide !overflow-visible">
          {editingRole ? (
            <div className="flex items-center gap-1">
              <Select
                value={selectedRole}
                onChange={setSelectedRole}
                options={ROLE_SELECT_OPTIONS(t, assignableRoles)}
                className="min-w-[120px]"
                buttonClassName="h-7 text-[12px]"
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
          ) : (
            <Badge
              tone={ROLE_TONES[user.role] ?? 'neutral'}
              onClick={roleEditable ? () => { setEditingRole(true); setSelectedRole(user.role) } : undefined}
              title={roleEditable ? t('users.clickChangeRole') : undefined}
            >
              {ROLE_ICON[user.role]} {t(`users.role.${user.role}`)}
              {roleEditable ? <Pencil className="h-2.5 w-2.5 opacity-60" /> : null}
            </Badge>
          )}
        </div>

        <div className="docker-cell--keep">
          <span className={`docker-status-pill docker-status-pill--${STATUS_PILL[user.status] ?? 'exited'}`}>
            <span className="docker-status-dot" />
            <span>{t(`users.status.${user.status}`)}</span>
          </span>
        </div>

        {hostingColumns ? (
          <>
            <div className="docker-cell">
              {plan ? (
                <>
                  <span className={`docker-status-pill docker-status-pill--${PLAN_PILL[plan.state]}`} title={plan.planId && plan.state !== 'active' ? t(`hosting.userPlan.state.${plan.state}`) : undefined}>
                    <span className="docker-status-dot" />
                    <span className="truncate">{planLabel}</span>
                  </span>
                  {planLine ? <span className="truncate text-[0.6875rem]" title={planLine}>{planLine}</span> : null}
                </>
              ) : (
                '-'
              )}
            </div>
            <div className="docker-cell docker-cell--mono">{plan?.expiresAt ? formatDateID(plan.expiresAt) : '-'}</div>
          </>
        ) : (
          <div className="docker-cell">{user.lastLoginAt ? formatDateID(user.lastLoginAt) : '-'}</div>
        )}

        <div className="docker-action-btns">
          {plan?.planId ? (
            <button type="button" className="docker-act-btn docker-act-btn--start" title={t('hosting.users.renewOne')} aria-label={t('hosting.users.renewOne')} disabled={renewMut.isPending} onClick={() => void confirmRenew()}>
              <CalendarPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
          <button type="button" className="docker-act-btn" title={plan ? t('hosting.users.planAndQuota') : t('users.manageQuota')} aria-label={plan ? t('hosting.users.planAndQuota') : t('users.manageQuota')} aria-expanded={showQuota} onClick={onQuota}>
            <Settings2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          {canManage ? (
            <button type="button" className="docker-act-btn" title={t('users.resetPassword')} aria-label={t('users.resetPassword')} onClick={onResetPassword}>
              <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
          {onMove ? (
            <button type="button" className="docker-act-btn" title={t('users.moveTitle')} aria-label={t('users.moveTitle')} onClick={onMove}>
              <Network className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
          {!canManage ? null : user.status === 'active' ? (
            <button type="button" className="docker-act-btn docker-act-btn--stop" title={t('users.suspend')} aria-label={t('users.suspend')} disabled={busy} aria-busy={busy || undefined} onClick={onSuspend}>
              {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <ShieldOff className="h-3.5 w-3.5" strokeWidth={1.75} />}
            </button>
          ) : (
            <button type="button" className="docker-act-btn docker-act-btn--start" title={t('users.activate')} aria-label={t('users.activate')} disabled={busy} aria-busy={busy || undefined} onClick={onActivate}>
              {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Shield className="h-3.5 w-3.5" strokeWidth={1.75} />}
            </button>
          )}
          {canManage ? (
            <button type="button" className="docker-act-btn docker-act-btn--danger" title={t('common.delete')} aria-label={t('common.delete')} disabled={busy} onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </div>
      {showQuota && quota ? (
        <div className="users-expand">
          <UserQuotaPanel user={user} quota={quota} saving={updateQuotaMut.isPending} showPlan={viewerIsSuperadmin && hosting && user.role !== 'superadmin'} onSave={(patch) => updateQuotaMut.mutate(patch)} />
        </div>
      ) : null}
    </>
  )
}
