import { apiError } from '@/components/windows/users/apiError'
import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, UserPlus, RefreshCw, Search } from 'lucide-react'
import { listUsersTable, getUsersSummary, suspendUser, activateUser, deleteUser, type PanelUser } from '@/api/agent'
import { ListState, ListTable } from '@/components/ui/ListTable'
import { Pagination } from '@/components/ui/Pagination'
import { alertLib } from '@/lib/alert'
import { listQueryKey } from '@/lib/listQuery'
import { useAuthStore } from '@/store/authStore'
import { ResetPasswordModal } from '@/components/windows/users/ResetPasswordModal'
import { MoveAccountModal } from '@/components/windows/users/MoveAccountModal'
import { CreateUserModal } from '@/components/windows/users/CreateUserModal'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { useListQuery } from '@/hooks/useListQuery'
import { usePublicSite } from '@/hooks/usePublicSite'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import type { WindowState } from '@/types'
import { UserRow } from '@/components/windows/users/UserRow'
import { ChangeRoleModal } from '@/components/windows/users/ChangeRoleModal'
import { canManageUser, grantableRoles } from '@/components/windows/users/permissions'

const PAGE_SIZE = 50

export default function UsersWindow({ win }: { win?: WindowState }) {
  const isMobile = useIsMobileLayout()
  const { t } = useI18n()
  const pollingActive = useWindowPollingActive(win)
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showQuota, setShowQuota] = useState<number | null>(null)
  const [resetTarget, setResetTarget] = useState<PanelUser | null>(null)
  const [roleTarget, setRoleTarget] = useState<PanelUser | null>(null)
  const [moveTarget, setMoveTarget] = useState<PanelUser | null>(null)
  const actor = useAuthStore((s) => s.user)
  const assignable = grantableRoles(actor?.role)
  const [page, setPage] = useState(1)
  // the search, the order and the column filters; the agent applies them to every account of the viewer's scope
  const list = useListQuery()

  // plans belong to the superadmin and exist only while hosting mode is on
  const { hosting: hostingOn } = usePublicSite()
  const hosting = actor?.role === 'superadmin' && hostingOn

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['users', listQueryKey(list.query), page],
    queryFn: () => listUsersTable(list.query, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: pollingActive ? 30_000 : false,
  })
  const summary = useQuery({ queryKey: ['users-summary'], queryFn: getUsersSummary, refetchInterval: pollingActive ? 30_000 : false, retry: 0 })

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

  const users = data?.items ?? []
  const total = data?.total ?? 0
  const facets = data?.facets
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const counts = summary.data?.summary
  const narrowed = !!list.query.q || Object.keys(list.filters).length > 0
  const busyId = (id: number) => (suspendMut.isPending && suspendMut.variables === id) || (activateMut.isPending && activateMut.variables === id) || (deleteMut.isPending && deleteMut.variables === id)

  const columns = [
    { label: t('docker.colIndex') },
    list.column('name', t('users.col.user'), facets?.name, { filterable: false }),
    list.column('role', t('users.col.role'), facets?.role),
    list.column('status', t('users.col.status'), facets?.status),
    ...(hosting
      ? [
          list.column('plan', t('users.col.plan'), facets?.plan, { labelOf: (v) => (v === 'none' ? t('hosting.userPlan.none') : v) }),
          list.column('expires', t('users.col.expires'), facets?.expires, { filterable: false }),
        ]
      : [list.column('login', t('users.col.lastLogin'), facets?.login, { filterable: false })]),
    { label: t('users.col.actions'), actions: true },
  ]

  return (
    <div className="panel-window docker-window-root relative overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">
            <button type="button" className="docker-primary-btn" onClick={() => setShowCreate(true)}>
              <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('users.createUser')}</span>
            </button>

            <div className="docker-badge-running docker-badge-running--mobile">
              {(counts?.active ?? 0) > 0 ? <span className="docker-badge-running__dot" aria-hidden="true" /> : null}
              <span>{t('users.activeCount', { count: counts?.active ?? 0 })}</span>
            </div>
          </div>

          <div className="docker-topbar__mobile-search">
            <div className="docker-search-wrap docker-search-wrap--mobile">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                id="users-search-input"
                type="search"
                className="docker-search-input docker-search-input--mobile"
                aria-label={t('users.searchShort')}
                placeholder={t('users.searchShort')}
                value={list.text}
                onChange={(e) => {
                  setPage(1)
                  list.setText(e.target.value)
                }}
              />
            </div>

            <button
              type="button"
              className="docker-icon-btn docker-icon-btn--mobile"
              title={t('users.refresh')}
              aria-label={t('users.refresh')}
              onClick={() => { void refetch(); void summary.refetch() }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching && !isLoading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            <button type="button" className="docker-primary-btn" onClick={() => setShowCreate(true)}>
              <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('users.createUser')}</span>
            </button>
            <div className="docker-topbar__meta">
              <span>{t('users.countLabel', { count: counts?.total ?? data?.all ?? 0 })}</span>
              <span className="text-[var(--panel-success-text)]">{t('users.activeCount', { count: counts?.active ?? 0 })}</span>
              {counts && counts.suspended > 0 ? <span className="text-[var(--panel-danger-text)]">{t('users.suspendedCount', { count: counts.suspended })}</span> : null}
            </div>
          </div>
          <div className="docker-topbar__right">
            <div className="docker-search-wrap">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                id="users-search-input"
                type="search"
                className="docker-search-input"
                aria-label={t('users.searchShort')}
                placeholder={t('users.searchShort')}
                value={list.text}
                onChange={(e) => {
                  setPage(1)
                  list.setText(e.target.value)
                }}
              />
            </div>
            <button type="button" className="docker-icon-btn" title={t('users.refresh')} aria-label={t('users.refresh')} onClick={() => { void refetch(); void summary.refetch() }}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching && !isLoading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}

      <CreateUserModal open={showCreate} onClose={() => setShowCreate(false)} assignable={assignable} canGivePlan={hosting} />

      <ListTable variant={hosting ? 'users' : 'users-plain'} empty={isLoading || isError || users.length === 0} columns={columns}>
        <ListState
          loading={isLoading}
          error={isError}
          errorTitle={t('users.loadFailed')}
          errorHint={t('users.loadFailedHint')}
          loadingText={t('users.loading')}
          empty={users.length === 0}
          emptyIcon={<Users />}
          emptyTitle={narrowed ? t('docker.noResults') : t('users.empty')}
        >
          {users.map((u, index) => (
            <UserRow
              key={u.id}
              user={u}
              index={(page - 1) * PAGE_SIZE + index}
              hostingColumns={hosting}
              busy={busyId(u.id)}
              onSuspend={async () => {
                const confirmed = await alertLib.confirm(t('users.suspendQuestion'), t('users.suspendMessage', { username: u.username }), t('users.suspendUser'), t('common.cancel'), 'warning', 'users')
                if (confirmed) suspendMut.mutate(u.id)
              }}
              onActivate={async () => {
                const confirmed = await alertLib.confirm(t('users.activateQuestion'), t('users.activateMessage', { username: u.username }), t('users.activateUser'), t('common.cancel'), 'question', 'users')
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
              onEditRole={() => setRoleTarget(u)}
              onMove={actor?.role === 'superadmin' && u.role !== 'superadmin' ? () => setMoveTarget(u) : undefined}
            />
          ))}
        </ListState>
      </ListTable>

      {totalPages > 1 ? (
        <div className="docker-statusbar">
          <span>{narrowed ? t('users.countOf', { shown: total, total: data?.all ?? total }) : t('users.pageSummary', { current: page, total: totalPages })}</span>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      ) : null}

      <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      <ChangeRoleModal user={roleTarget} assignableRoles={assignable} onClose={() => setRoleTarget(null)} />
      <MoveAccountModal user={moveTarget} onClose={() => setMoveTarget(null)} />
    </div>
  )
}
