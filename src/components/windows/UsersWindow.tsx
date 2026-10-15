import { apiError } from '@/components/windows/users/apiError'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, UserPlus, RefreshCw, Eye, EyeOff, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { listUsers, createUser, suspendUser, activateUser, deleteUser, type PanelUser } from '@/api/agent'
import { Select } from '@/components/ui/Select'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/states'
import { Modal } from '@/components/ui/Modal'
import { Field, TextInput } from '@/components/ui/Field'
import { alertLib } from '@/lib/alert'
import { useAuthStore } from '@/store/authStore'
import { ResetPasswordModal } from '@/components/windows/users/ResetPasswordModal'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import type { WindowState } from '@/types'
import { UserRow } from '@/components/windows/users/UserRow'
import { canManageUser, grantableRoles } from '@/components/windows/users/permissions'
import { ROLE_SELECT_OPTIONS } from '@/components/windows/users/constants'

const PAGE_SIZE = 8

export default function UsersWindow({ win }: { win?: WindowState }) {
  const { t } = useI18n()
  const pollingActive = useWindowPollingActive(win)
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showQuota, setShowQuota] = useState<number | null>(null)
  const [resetTarget, setResetTarget] = useState<PanelUser | null>(null)
  const actor = useAuthStore((s) => s.user)
  const assignable = grantableRoles(actor?.role)
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
    onError: (e: unknown) => {
      const message = apiError(e, t('users.createFailed'))
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
    onError: (e: unknown) => alertLib.fire(t('users.suspendFailedTitle'), apiError(e, t('users.suspendFailedMessage')), 'error', 'users'),
  })

  const activateMut = useMutation({
    mutationFn: activateUser,
    onSuccess: () => {
      alertLib.fire(t('users.activatedTitle'), t('users.activatedMessage'), 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: unknown) => alertLib.fire(t('users.activateFailedTitle'), apiError(e, t('users.activateFailedMessage')), 'error', 'users'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      alertLib.fire(t('users.deletedTitle'), t('users.deletedMessage'), 'success', 'users')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: unknown) => {
      const message = apiError(e, t('users.deleteFailed'))
      toast.error(t('users.deleteFailed'), { description: message })
      alertLib.fire(t('users.deleteFailedTitle'), message, 'error', 'users')
    },
  })

  const users = useMemo(() => data?.items ?? [], [data?.items])
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
          <span className="font-semibold text-[var(--win-text)]">{t('users.countLabel', { count: total })}</span>
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
                value={form[key as keyof typeof form]}
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
              options={ROLE_SELECT_OPTIONS(t, assignable)}
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
                    canManage={canManageUser(actor, u)}
                    assignableRoles={assignable}
                    onResetPassword={() => setResetTarget(u)}
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
      <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  )
}
