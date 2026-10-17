import { apiError } from '@/components/windows/users/apiError'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, UserPlus, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { listUsers, getUsersSummary, suspendUser, activateUser, deleteUser, type PanelUser } from '@/api/agent'
import { listHostingPlans } from '@/api/hosting'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useAuthStore } from '@/store/authStore'
import { ResetPasswordModal } from '@/components/windows/users/ResetPasswordModal'
import { MoveAccountModal } from '@/components/windows/users/MoveAccountModal'
import { CreateUserModal } from '@/components/windows/users/CreateUserModal'
import { NO_FILTERS, UsersFilters, type UsersFilterState } from '@/components/windows/users/UsersFilters'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { usePublicSite } from '@/hooks/usePublicSite'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import type { WindowState } from '@/types'
import { UserRow } from '@/components/windows/users/UserRow'
import { canManageUser, grantableRoles } from '@/components/windows/users/permissions'

const PAGE_SIZE = 8

export default function UsersWindow({ win }: { win?: WindowState }) {
  const { t } = useI18n()
  const pollingActive = useWindowPollingActive(win)
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showQuota, setShowQuota] = useState<number | null>(null)
  const [resetTarget, setResetTarget] = useState<PanelUser | null>(null)
  const [moveTarget, setMoveTarget] = useState<PanelUser | null>(null)
  const actor = useAuthStore((s) => s.user)
  const assignable = grantableRoles(actor?.role)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState<UsersFilterState>(NO_FILTERS)

  // plans belong to the superadmin and exist only while hosting mode is on
  const { hosting: hostingOn } = usePublicSite()
  const hosting = actor?.role === 'superadmin' && hostingOn

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['users', { search, offset, filters }],
    queryFn: () =>
      listUsers({
        q: search,
        limit: PAGE_SIZE,
        offset,
        status: filters.status || undefined,
        plan: filters.plan || undefined,
        planState: filters.planState || undefined,
      }),
    refetchInterval: pollingActive ? 30_000 : false,
  })
  const summary = useQuery({ queryKey: ['users-summary'], queryFn: getUsersSummary, refetchInterval: pollingActive ? 30_000 : false, retry: 0 })
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, enabled: hosting, staleTime: 30_000, retry: 0 })

  const refreshUsers = () => {
    void qc.invalidateQueries({ queryKey: ['users'] })
    void qc.invalidateQueries({ queryKey: ['users-summary'] })
  }

  const suspendMut = useMutation({
    mutationFn: suspendUser,
    onSuccess: () => {
      alertLib.fire(t('users.suspendedTitle'), t('users.suspendedMessage'), 'warning', 'users')
      refreshUsers()
    },
    onError: (e: unknown) => alertLib.fire(t('users.suspendFailedTitle'), apiError(e, t('users.suspendFailedMessage')), 'error', 'users'),
  })

  const activateMut = useMutation({
    mutationFn: activateUser,
    onSuccess: () => {
      alertLib.fire(t('users.activatedTitle'), t('users.activatedMessage'), 'success', 'users')
      refreshUsers()
    },
    onError: (e: unknown) => alertLib.fire(t('users.activateFailedTitle'), apiError(e, t('users.activateFailedMessage')), 'error', 'users'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      alertLib.fire(t('users.deletedTitle'), t('users.deletedMessage'), 'success', 'users')
      refreshUsers()
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
  const counts = summary.data?.summary
  const filtered = filters.planState !== '' || filters.status !== '' || filters.plan !== ''

  const changeFilters = (next: UsersFilterState) => {
    setOffset(0)
    setFilters(next)
  }

  return (
    <div className="panel-window">
      {/* ── Compact Toolbar ── */}
      <div className="flex items-center justify-between border-b border-[var(--win-border)] px-3 py-1 bg-[var(--win-bar)] shrink-0 min-h-[40px]">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--win-text)]">{t('users.countLabel', { count: counts?.total ?? total })}</span>
          <span>•</span>
          <span className="text-[var(--panel-success-text)] font-medium">{t('users.activeCount', { count: counts?.active ?? 0 })}</span>
          {counts && counts.suspended > 0 ? (
            <>
              <span>•</span>
              <span className="text-[var(--panel-danger-text)] font-medium">{t('users.suspendedCount', { count: counts.suspended })}</span>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <IconButton onClick={() => { void refetch(); void summary.refetch() }} label={t('users.refresh')}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </IconButton>
          <Button onClick={() => setShowCreate(true)} variant="primary-soft" className="text-xs py-1 px-2.5">
            <UserPlus className="h-3.5 w-3.5" />
            {t('users.createUser')}
          </Button>
        </div>
      </div>

      <CreateUserModal open={showCreate} onClose={() => setShowCreate(false)} assignable={assignable} canGivePlan={hosting} />

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

            <UsersFilters value={filters} onChange={changeFilters} hosting={hosting} summary={counts} plans={plans.data ?? []} />

            {isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-[var(--text-secondary)]">{t('users.loading')}</div>
            ) : users.length === 0 ? (
              <EmptyState icon={<Users />}>
                {filtered ? (
                  <span className="flex flex-col items-center gap-2">
                    {t('hosting.users.emptyFiltered')}
                    <Button variant="ghost" onClick={() => changeFilters(NO_FILTERS)}>{t('hosting.users.clearFilters')}</Button>
                  </span>
                ) : (
                  t('users.empty')
                )}
              </EmptyState>
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
                        u.hosting && u.hosting.subdomains > 0
                          ? `${t('users.deleteMessage', { username: u.username })}\n\n${t('hosting.users.deleteSubdomains', { count: u.hosting.subdomains })}`
                          : t('users.deleteMessage', { username: u.username }),
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
                    onMove={actor?.role === 'superadmin' && u.role !== 'superadmin' ? () => setMoveTarget(u) : undefined}
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
      <MoveAccountModal user={moveTarget} onClose={() => setMoveTarget(null)} />
    </div>
  )
}
