import { useMemo, useState, type ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listUsers,
  createUser,
  updateUser,
  suspendUser,
  activateUser,
  deleteUser,
  getUserQuota,
  updateUserQuota,
  type PanelUser,
  type UserQuota,
} from '@/api/agent'
import { PanelSelectMenu } from '@/components/system/PanelSelectMenu'
import { alertLib } from '@/lib/alert'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import type { WindowState } from '@/types'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import {
  Users,
  UserPlus,
  Shield,
  ShieldOff,
  Trash2,
  Crown,
  CircleUser,
  Settings2,
  RefreshCw,
  Eye,
  EyeOff,
  Pencil,
  Check,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  // Sparkles,
} from 'lucide-react'

const ROLE_VARIANTS: Record<string, string> = {
  superadmin: 'panel-badge--warning',
  admin: 'panel-badge--info',
  user: 'panel-badge--neutral',
}

const STATUS_VARIANTS: Record<string, string> = {
  active: 'panel-badge--success',
  suspended: 'panel-badge--danger',
  pending: 'panel-badge--warning',
}

const ROLE_ICON: Record<string, ReactElement> = {
  superadmin: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  user: <CircleUser className="h-3 w-3" />,
}

const ROLE_OPTIONS = [
  { value: 'user', labelKey: 'users.roleUser' },
  { value: 'admin', labelKey: 'users.roleAdmin' },
  { value: 'superadmin', labelKey: 'users.roleSuperadmin' },
]

const ROLE_SELECT_OPTIONS = (t: (key: string) => string) => ROLE_OPTIONS.map((role) => ({
  value: role.value,
  label: t(role.labelKey),
  description: role.value,
}))

const PAGE_SIZE = 8

export default function UsersWindow({ win }: { win?: WindowState }) {
  const { t } = useI18n()
  const pollingActive = useWindowPollingActive(win)
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showQuota, setShowQuota] = useState<number | null>(null)
  const [showPwd, setShowPwd] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user',
    displayName: '',
  })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['users', { search, offset }],
    queryFn: () => listUsers({ q: search, limit: PAGE_SIZE, offset }),
    refetchInterval: pollingActive ? 30_000 : false,
  })

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: (u) => {
      alertLib.fire(t('users.createdTitle'), t('users.createdMessage', { username: u.username }), 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowCreate(false)
      setForm({ username: '', email: '', password: '', role: 'user', displayName: '' })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? t('users.createFailed')
      toast.error(t('users.createFailed'), { description: message })
      alertLib.fire(t('users.createFailedTitle'), message, 'error', 'users')
    },
  })

  const suspendMut = useMutation({
    mutationFn: suspendUser,
    onSuccess: () => {
      alertLib.fire(t('users.suspendedTitle'), t('users.suspendedMessage'), 'warning', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: any) => alertLib.fire(t('users.suspendFailedTitle'), e.response?.data?.error ?? t('users.suspendFailedMessage'), 'error', 'users'),
  })

  const activateMut = useMutation({
    mutationFn: activateUser,
    onSuccess: () => {
      alertLib.fire(t('users.activatedTitle'), t('users.activatedMessage'), 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: any) => alertLib.fire(t('users.activateFailedTitle'), e.response?.data?.error ?? t('users.activateFailedMessage'), 'error', 'users'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      alertLib.fire(t('users.deletedTitle'), t('users.deletedMessage'), 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? t('users.deleteFailed')
      toast.error(t('users.deleteFailed'), { description: message })
      alertLib.fire(t('users.deleteFailedTitle'), message, 'error', 'users')
    },
  })

  const users = data?.items ?? []
  const total = data?.total ?? 0
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const activeUsers = useMemo(() => users.filter((user) => user.status === 'active').length, [users])

  return (
    <div className="panel-window">
      <div className="panel-window__header">
        <div className="panel-window__title">
          <Users className="panel-window__icon h-4 w-4" />
          <div>
            <div className="panel-window__title-text">{t('users.title')}</div>
            <div className="panel-window__meta">{t('users.meta', { total, active: activeUsers })}</div>
          </div>
        </div>
        <div className="panel-window__actions">
          <button onClick={() => refetch()} className="panel-icon-btn" aria-label={t('users.refresh')}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowCreate(true)} className="panel-btn panel-btn--primary-soft">
            <UserPlus className="h-3.5 w-3.5" />
            {t('users.createUser')}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="panel-modal-overlay">
          <div className="panel-modal-card">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--win-text)]">
              <UserPlus className="panel-window__icon h-4 w-4" />
              {t('users.createNewUser')}
            </h3>
            <div className="space-y-3">
              {[
                { key: 'username', label: t('users.username'), type: 'text', placeholder: 'john_doe' },
                { key: 'email', label: t('users.email'), type: 'email', placeholder: 'john@example.com' },
                { key: 'displayName', label: t('users.displayName'), type: 'text', placeholder: 'John Doe' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="panel-section-label">{label}</label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="panel-input"
                  />
                </div>
              ))}
              <div>
                <label className="panel-section-label">{t('users.password')}</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    placeholder={t('users.passwordPlaceholder')}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="panel-input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] transition hover:text-[var(--win-text)]"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="panel-section-label">{t('users.role')}</label>
                <PanelSelectMenu
                  id="users-create-role-select"
                  value={form.role}
                  onChange={(nextValue) => setForm((current) => ({ ...current, role: nextValue }))}
                  options={ROLE_SELECT_OPTIONS(t)}
                  buttonClassName="h-[42px]"
                  searchable
                  searchPlaceholder={t('users.searchRole')}
                />

              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  setShowCreate(false)
                  setForm({ username: '', email: '', password: '', role: 'user', displayName: '' })
                }}
                className="panel-btn panel-btn--ghost flex-1"
              >
                {t('common.cancel')}
              </button>
              <button onClick={() => createMut.mutate(form)} disabled={createMut.isPending} className="panel-btn panel-btn--primary flex-1">
                {createMut.isPending ? t('users.creating') : t('users.createUser')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-window__body">
        <div className="panel-window__stack">
          <div className="panel-table-container">
            <div className="panel-toolbar panel-toolbar--search">
              <form
                className="panel-search"
                onSubmit={(e) => {
                  e.preventDefault()
                  setOffset(0)
                  setSearch(query.trim())
                }}
              >
                <Search className="h-4 w-4" />
                <input
                  id="users-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="panel-search__input"
                  placeholder={t('users.searchPlaceholder')}
                />
                <button type="submit" className="panel-btn panel-btn--primary-soft">{t('users.search')}</button>
              </form>
              <div className="panel-pagination-summary">{t('users.pageSummary', { current: currentPage, total: totalPages })}</div>
            </div>

            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">{t('users.loading')}</div>
            ) : users.length === 0 ? (
              <div className="panel-empty">
                <Users className="h-8 w-8" />
                <span>{t('users.empty')}</span>
              </div>
            ) : (
              <>
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    onSuspend={async () => {
                      const confirmed = await alertLib.confirm(
                        t('users.suspendQuestion'),
                        t('users.suspendMessage', { username: u.username }),
                        t('users.suspendUser'),
                        t('common.cancel'),
                        'warning',
                        'users',
                      )
                      if (confirmed) suspendMut.mutate(u.id)
                    }}
                    onActivate={async () => {
                      const confirmed = await alertLib.confirm(
                        t('users.activateQuestion'),
                        t('users.activateMessage', { username: u.username }),
                        t('users.activateUser'),
                        t('common.cancel'),
                        'question',
                        'users',
                      )
                      if (confirmed) activateMut.mutate(u.id)
                    }}
                    onDelete={async () => {
                      const confirmed = await alertLib.confirm(
                        t('users.deleteQuestion'),
                        t('users.deleteMessage', { username: u.username }),
                        t('users.deletePermanent'),
                        t('common.cancel'),
                        'warning',
                        'users',
                      )
                      if (confirmed) deleteMut.mutate(u.id)
                    }}
                    onQuota={() => setShowQuota(showQuota === u.id ? null : u.id)}
                    showQuota={showQuota === u.id}
                  />
                ))}
              </>
            )}

            <div className="panel-pagination">
              <button id="users-prev-page" className="panel-btn panel-btn--ghost" disabled={offset <= 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>
                <ChevronLeft className="h-3.5 w-3.5" />
                {t('users.previous')}
              </button>
              <button id="users-next-page" className="panel-btn panel-btn--ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((value) => value + PAGE_SIZE)}>
                {t('users.next')}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function UserRow({
  user,
  onSuspend,
  onActivate,
  onDelete,
  onQuota,
  showQuota,
}: {
  user: PanelUser
  onSuspend: () => void
  onActivate: () => void
  onDelete: () => void
  onQuota: () => void
  showQuota: boolean
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
    onError: (e: any) => alertLib.fire(t('users.quotaUpdateFailedTitle'), e.response?.data?.error ?? t('users.quotaUpdateFailedMessage'), 'error', 'users'),
  })

  const changeRoleMut = useMutation({
    mutationFn: (role: string) => updateUser(user.id, { role } as any),
    onSuccess: (updated) => {
      alertLib.fire(t('users.roleChangedTitle'), t('users.roleChangedMessage', { username: user.username, role: updated.role }), 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditingRole(false)
    },
    onError: (e: any) => {
      const message = e.response?.data?.error ?? t('users.roleChangeFailed')
      toast.error(t('users.roleChangeFailed'), { description: message })
      alertLib.fire(t('users.roleChangeFailedTitle'), message, 'error', 'users')
      setEditingRole(false)
    },
  })

  const [editQuota, setEditQuota] = useState<Partial<UserQuota>>({})
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
    <div className="panel-table-row overflow-visible">
      <div className="flex items-center gap-3 overflow-visible">
        <div className="panel-avatar rounded-full text-sm">{user.username[0]?.toUpperCase()}</div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--win-text)]">{user.username}</span>

            {editingRole ? (
              <div className="flex items-center gap-1 overflow-visible">
                <PanelSelectMenu
                  value={selectedRole}
                  onChange={setSelectedRole}
                  options={ROLE_SELECT_OPTIONS(t)}
                  className="min-w-[150px]"
                  buttonClassName="h-8 rounded-full border-[var(--win-border)] bg-[var(--panel-surface)] pl-3 pr-10 text-[12px] font-medium"
                  dropdownClassName="min-w-[180px]"
                  searchable
                  searchPlaceholder={t('users.searchRole')}
                />

                <button onClick={handleRoleSave} disabled={changeRoleMut.isPending} title={t('users.saveRole')} className="panel-icon-btn panel-icon-btn--success h-6 w-6 rounded-md">
                  <Check className="h-3 w-3" />
                </button>
                <button onClick={() => { setEditingRole(false); setSelectedRole(user.role) }} title={t('common.cancel')} className="panel-icon-btn h-6 w-6 rounded-md">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setEditingRole(true); setSelectedRole(user.role) }}
                className={`panel-badge ${ROLE_VARIANTS[user.role] ?? 'panel-badge--neutral'} cursor-pointer transition-opacity hover:opacity-75`}
                title={t('users.clickChangeRole')}
              >
                {ROLE_ICON[user.role]} {user.role}
                <Pencil className="h-2.5 w-2.5 opacity-60" />
              </button>
            )}

            <span className={`panel-badge ${STATUS_VARIANTS[user.status] ?? 'panel-badge--neutral'}`}>{user.status}</span>
          </div>
          <div className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">{user.email}</div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={onQuota} title={t('users.manageQuota')} className="panel-icon-btn panel-icon-btn--primary">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          {user.status === 'active' ? (
            <button onClick={onSuspend} title={t('users.suspend')} className="panel-icon-btn panel-icon-btn--warning">
              <ShieldOff className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button onClick={onActivate} title={t('users.activate')} className="panel-icon-btn panel-icon-btn--success">
              <Shield className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={onDelete} title={t('common.delete')} className="panel-icon-btn panel-icon-btn--danger">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showQuota && quota && (
        <div className="border-t border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-3.5">
          <p className="mb-3 text-[12px] font-medium text-[var(--text-secondary)]">{t('users.resourceQuota')}</p>
          <div className="panel-grid-compact panel-grid-compact--3">
            {[
              { key: 'maxProjects', label: t('users.maxProjects'), val: quota.maxProjects },
              { key: 'maxTunnels', label: t('users.maxTunnels'), val: quota.maxTunnels },
              { key: 'diskQuotaMb', label: t('users.diskMb'), val: quota.diskQuotaMb },
              { key: 'cpuLimitPct', label: t('users.cpuLimitPct'), val: quota.cpuLimitPct },
              { key: 'memoryLimitMb', label: t('users.ramMb'), val: quota.memoryLimitMb },
            ].map(({ key, label, val }) => (
              <div key={key}>
                <label className="panel-section-label mb-1">{label}</label>
                <input
                  type="number"
                  defaultValue={val}
                  onChange={(e) => setEditQuota((q) => ({ ...q, [key]: Number(e.target.value) }))}
                  className="panel-input"
                />
              </div>
            ))}
          </div>
          <button onClick={() => updateQuotaMut.mutate(editQuota)} disabled={updateQuotaMut.isPending} className="panel-btn panel-btn--primary-soft mt-3 w-full">
            {t('users.saveQuota')}
          </button>
        </div>
      )}
    </div>
  )
}




