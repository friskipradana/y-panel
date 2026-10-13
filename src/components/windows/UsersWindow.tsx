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
import { Select } from '@/components/ui/Select'
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
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/states'
import { Modal } from '@/components/ui/Modal'
import { Field, TextInput } from '@/components/ui/Field'
import { EntityRow } from '@/components/ui/EntityRow'

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

  const closeCreate = () => {
    setShowCreate(false)
    setForm({ username: '', email: '', password: '', role: 'user', displayName: '' })
  }

  return (
    <div className="panel-window">
      {/* ── Compact Toolbar ── */}
      <div className="flex items-center justify-between border-b border-[var(--win-border)] px-3 py-1 bg-[var(--win-bar)] shrink-0 min-h-[40px]">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--win-text)]">{total} {t('users.title')}</span>
          <span>•</span>
          <span className="text-[var(--panel-success-text)] font-medium">{activeUsers} active</span>
        </div>

        <div className="flex items-center gap-2">
          <IconButton onClick={() => refetch()} label={t('users.refresh')}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </IconButton>
          <Button onClick={() => setShowCreate(true)} variant="primary-soft" className="text-xs py-1 px-2.5">
            <UserPlus className="h-3.5 w-3.5" />
            {t('users.createUser')}
          </Button>
        </div>
      </div>

      <Modal
        open={showCreate}
        onClose={closeCreate}
        title={t('users.createNewUser')}
        icon={<UserPlus />}
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={createMut.isPending} onClick={() => createMut.mutate(form)}>
              {createMut.isPending ? t('users.creating') : t('users.createUser')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {[
            { key: 'username', label: t('users.username'), type: 'text', placeholder: 'john_doe' },
            { key: 'email', label: t('users.email'), type: 'email', placeholder: 'john@example.com' },
            { key: 'displayName', label: t('users.displayName'), type: 'text', placeholder: 'John Doe' },
          ].map(({ key, label, type, placeholder }) => (
            <Field key={key} label={label}>
              <TextInput
                type={type}
                placeholder={placeholder}
                value={(form as any)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </Field>
          ))}
          <Field label={t('users.password')}>
            <div className="relative">
              <TextInput
                type={showPwd ? 'text' : 'password'}
                placeholder={t('users.passwordPlaceholder')}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="pr-10"
              />
              <IconButton
                label={showPwd ? t('users.hidePassword') : t('users.showPassword')}
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </IconButton>
            </div>
          </Field>
          <Field label={t('users.role')}>
            <Select
              id="users-create-role-select"
              value={form.role}
              onChange={(nextValue) => setForm((current) => ({ ...current, role: nextValue }))}
              options={ROLE_SELECT_OPTIONS(t)}
              buttonClassName="h-[42px]"
              searchable
              searchPlaceholder={t('users.searchRole')}
            />
          </Field>
        </div>
      </Modal>

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
                <Button type="submit" variant="primary-soft">{t('users.search')}</Button>
              </form>
              <div className="panel-pagination-summary">{t('users.pageSummary', { current: currentPage, total: totalPages })}</div>
            </div>

            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">{t('users.loading')}</div>
            ) : users.length === 0 ? (
              <EmptyState icon={<Users />}>{t('users.empty')}</EmptyState>
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
              <Button id="users-prev-page" variant="ghost" disabled={offset <= 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>
                <ChevronLeft className="h-3.5 w-3.5" />
                {t('users.previous')}
              </Button>
              <Button id="users-next-page" variant="ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((value) => value + PAGE_SIZE)}>
                {t('users.next')}
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
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
                options={ROLE_SELECT_OPTIONS(t)}
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
        </>
      }
      subtitle={user.email}
      actions={
        <div className="flex items-center gap-1">
          <IconButton onClick={onQuota} tone="primary" label={t('users.manageQuota')}>
            <Settings2 className="h-3.5 w-3.5" />
          </IconButton>
          {user.status === 'active' ? (
            <IconButton onClick={onSuspend} tone="warning" label={t('users.suspend')}>
              <ShieldOff className="h-3.5 w-3.5" />
            </IconButton>
          ) : (
            <IconButton onClick={onActivate} tone="success" label={t('users.activate')}>
              <Shield className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton onClick={onDelete} tone="danger" label={t('common.delete')}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      }
      expanded={
        showQuota && quota ? (
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
                  <TextInput
                    type="number"
                    defaultValue={val}
                    onChange={(e) => setEditQuota((q) => ({ ...q, [key]: Number(e.target.value) }))}
                  />
                </div>
              ))}
            </div>
            <Button onClick={() => updateQuotaMut.mutate(editQuota)} disabled={updateQuotaMut.isPending} variant="primary-soft" className="mt-3 w-full">
              {t('users.saveQuota')}
            </Button>
          </div>
        ) : null
      }
    />
  )
}




