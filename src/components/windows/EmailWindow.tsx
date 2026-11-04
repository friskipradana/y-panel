import { useQuery } from '@tanstack/react-query'
import { Cloud, Mail, Plus, RefreshCw, Search, Server, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getEmailOverview, listEmailAccounts, listInboxMessages, type EmailAccount } from '@/api/email'
import { Button } from '@/components/ui/Button'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'
import { useSettingsNavStore } from '@/store/settingsNavStore'
import { useWindowStore } from '@/store/windowStore'
import type { WindowState } from '@/types'
import { EmailAccountModal } from './email/EmailAccountModal'
import { EmailAccountsView } from './email/EmailAccountsView'
import { EmailComposeView } from './email/EmailComposeView'
import { EmailConnectionView } from './email/EmailConnectionView'
import { EmailInboxView } from './email/EmailInboxView'
import { EmailLogsView } from './email/EmailLogsView'

type EmailTabKey = 'inbox' | 'accounts' | 'compose' | 'connection' | 'logs'
type ModeFilter = 'all' | 'mailbox' | 'forward'

export function EmailWindow({ win }: { win?: WindowState }) {
  const { t } = useI18n()
  const isMobile = useIsMobileLayout()
  const user = useAuthStore((s) => s.user)
  const isSuperadmin = user?.role === 'superadmin'
  const isDemo = user?.role === 'demo'
  const pollingActive = useWindowPollingActive(win)
  const openWindow = useWindowStore((s) => s.openWindow)

  const [tab, setTab] = useState<EmailTabKey>('inbox')
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<EmailAccount | null>(null)
  const [composePrefill, setComposePrefill] = useState<{ to?: string; subject?: string } | null>(null)

  const inboxQuery = useQuery({
    queryKey: ['email-inbox'],
    queryFn: () => listInboxMessages({ limit: 1 }),
    refetchInterval: pollingActive ? 15_000 : false,
  })

  const overviewQuery = useQuery({
    queryKey: ['email-overview'],
    queryFn: getEmailOverview,
    refetchInterval: pollingActive ? 30_000 : false,
  })

  const accountsQuery = useQuery({
    queryKey: ['email-accounts'],
    queryFn: listEmailAccounts,
    refetchInterval: pollingActive ? 20_000 : false,
  })

  const overview = overviewQuery.data
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data])

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts.filter((item) => {
      if (modeFilter !== 'all' && item.mode !== modeFilter) return false
      if (!q) return true
      return (
        item.address.toLowerCase().includes(q) ||
        item.displayName.toLowerCase().includes(q) ||
        item.forwardTo.toLowerCase().includes(q) ||
        item.note.toLowerCase().includes(q)
      )
    })
  }, [accounts, modeFilter, search])

  const handleOpenSettings = () => {
    useSettingsNavStore.getState().request('email_server')
    openWindow('settings')
  }

  const handleRefresh = () => {
    void inboxQuery.refetch()
    void overviewQuery.refetch()
    void accountsQuery.refetch()
  }

  const openCreateModal = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const isFetching =
    (overviewQuery.isFetching && !overviewQuery.isLoading) ||
    (accountsQuery.isFetching && !accountsQuery.isLoading) ||
    (inboxQuery.isFetching && !inboxQuery.isLoading)

  const unreadCount = inboxQuery.data?.unread ?? 0

  const tabItems = [
    { key: 'inbox', label: t('email.tabs.inbox'), count: unreadCount > 0 ? unreadCount : undefined },
    { key: 'accounts', label: t('email.tabs.accounts'), count: accounts.length },
    { key: 'compose', label: t('email.tabs.compose') },
    {
      key: 'connection',
      label: t('email.tabs.connection'),
      count: overview?.dnsRecords.length ?? 0,
    },
    { key: 'logs', label: t('email.tabs.logs') },
  ]

  const modeItems = [
    { key: 'all', label: t('email.filter.all'), count: accounts.length },
    {
      key: 'mailbox',
      label: t('email.mode.mailbox'),
      count: accounts.filter((a) => a.mode === 'mailbox').length,
    },
    {
      key: 'forward',
      label: t('email.mode.forward'),
      count: accounts.filter((a) => a.mode === 'forward').length,
    },
  ]

  const statusPill = overview ? (
    <span className={`docker-status-pill docker-status-pill--${overview.enabled ? 'running' : 'paused'}`}>
      <span className="docker-status-dot" />
      <span>
        {overview.enabled
          ? overview.method === 'ip'
            ? t('email.badge.ipActive')
            : t('email.badge.cfActive')
          : t('email.settings.statusInactive')}
      </span>
    </span>
  ) : null

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">
            <FilterMenu
              label={t('email.tabs.aria')}
              value={tab}
              onChange={(key) => setTab(key as EmailTabKey)}
              items={tabItems}
            />

            {tab === 'accounts' && (
              <FilterMenu
                label={t('email.filter.modeAria')}
                value={modeFilter}
                onChange={(key) => setModeFilter(key as ModeFilter)}
                items={modeItems}
              />
            )}

            {tab === 'inbox' && !isDemo ? (
              <button
                type="button"
                className="docker-primary-btn ml-auto"
                onClick={() => {
                  setComposePrefill(null)
                  setTab('compose')
                }}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('email.tabs.compose')}</span>
              </button>
            ) : tab === 'accounts' && !isDemo ? (
              <button type="button" className="docker-primary-btn ml-auto" onClick={openCreateModal}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('email.toolbar.addAccount')}</span>
              </button>
            ) : (
              <div className="ml-auto">{statusPill}</div>
            )}
          </div>

          <div className="docker-topbar__mobile-search">
            {tab === 'accounts' ? (
              <div className="docker-search-wrap docker-search-wrap--mobile">
                <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
                <input
                  id="email-toolbar-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label={t('email.accounts.search')}
                  placeholder={t('email.accounts.search')}
                  className="docker-search-input docker-search-input--mobile"
                />
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {overview?.domain ? (
                  <div className="docker-badge-running docker-badge-running--mobile ml-0">
                    <span>{overview.domain}</span>
                  </div>
                ) : null}
              </div>
            )}

            <button
              type="button"
              className="docker-icon-btn docker-icon-btn--mobile"
              title={t('common.refresh')}
              aria-label={t('common.refresh')}
              onClick={handleRefresh}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>

            {isSuperadmin && (
              <button
                type="button"
                className="docker-icon-btn docker-icon-btn--mobile shrink-0"
                title={t('email.toolbar.serverSettings')}
                aria-label={t('email.toolbar.serverSettings')}
                onClick={handleOpenSettings}
              >
                <Settings className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            <FilterMenu
              label={t('email.tabs.aria')}
              value={tab}
              onChange={(key) => setTab(key as EmailTabKey)}
              items={tabItems}
            />

            {tab === 'inbox' && !isDemo && (
              <button
                type="button"
                className="docker-primary-btn"
                onClick={() => {
                  setComposePrefill(null)
                  setTab('compose')
                }}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('email.tabs.compose')}</span>
              </button>
            )}

            {tab === 'accounts' && (
              <FilterMenu
                label={t('email.filter.modeAria')}
                value={modeFilter}
                onChange={(key) => setModeFilter(key as ModeFilter)}
                items={modeItems}
              />
            )}

            {tab === 'accounts' && !isDemo && (
              <button type="button" className="docker-primary-btn" onClick={openCreateModal}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('email.toolbar.addAccount')}</span>
              </button>
            )}
          </div>

          <div className="docker-topbar__right">
            {statusPill}

            {overview?.domain ? (
              <div className="docker-badge-running">
                <span>{overview.domain}</span>
              </div>
            ) : null}

            {tab === 'accounts' && (
              <div className="docker-search-wrap">
                <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
                <input
                  id="email-toolbar-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label={t('email.accounts.search')}
                  placeholder={t('email.accounts.search')}
                  className="docker-search-input"
                />
              </div>
            )}

            <button
              type="button"
              className="docker-icon-btn"
              title={t('common.refresh')}
              aria-label={t('common.refresh')}
              onClick={handleRefresh}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>

            {isSuperadmin && (
              <button
                type="button"
                className="docker-icon-btn shrink-0"
                title={t('email.toolbar.serverSettings')}
                aria-label={t('email.toolbar.serverSettings')}
                onClick={handleOpenSettings}
              >
                <Settings className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      )}

      {overview && !overview.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--win-border)] bg-[var(--panel-surface)] px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {overview.method === 'ip' ? (
              <Server className="h-4 w-4 shrink-0 text-[var(--panel-warning-text)]" strokeWidth={1.75} />
            ) : (
              <Cloud className="h-4 w-4 shrink-0 text-[var(--panel-warning-text)]" strokeWidth={1.75} />
            )}
            <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
              {t('email.banner.disabledHint')}
            </p>
          </div>
          {isSuperadmin && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<Mail className="h-3.5 w-3.5" />}
              onClick={handleOpenSettings}
            >
              {t('email.banner.activateInSettings')}
            </Button>
          )}
        </div>
      )}

      {tab === 'inbox' && (
        <EmailInboxView
          onReply={({ to, subject }) => {
            setComposePrefill({ to, subject })
            setTab('compose')
          }}
        />
      )}

      {tab === 'accounts' && (
        <EmailAccountsView
          items={filteredAccounts}
          loading={accountsQuery.isLoading}
          error={accountsQuery.isError}
          hasFilter={search.trim().length > 0 || modeFilter !== 'all'}
          isDemo={isDemo}
          onEdit={(acc) => {
            setEditing(acc)
            setModalOpen(true)
          }}
        />
      )}

      {tab === 'compose' && (
        <EmailComposeView
          overview={overview}
          accounts={accounts}
          isDemo={isDemo}
          prefill={composePrefill}
        />
      )}

      {tab === 'connection' && <EmailConnectionView overview={overview} />}

      {tab === 'logs' && <EmailLogsView />}

      <EmailAccountModal
        open={modalOpen}
        defaultDomain={overview?.domain ?? ''}
        editing={editing}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
      />
    </div>
  )
}
