import { Database, ExternalLink, KeyRound, Play, Plus, RefreshCw, Settings2, Square, Trash2 } from 'lucide-react'
import type { UserDatabase } from '@/api/agent'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { IconBadge } from '@/components/ui/IconBadge'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import type { WindowState } from '@/types'
import { ConnectionModal } from './database/ConnectionModal'
import { CreateDatabaseModal } from './database/CreateDatabaseModal'
import { ManageDatabaseModal } from './database/ManageDatabaseModal'
import { useDatabasesWindow } from './database/useDatabasesWindow'

type Tone = 'success' | 'warning' | 'danger' | 'neutral'

function stateTone(item: UserDatabase): Tone {
  if (item.state === 'running') return 'success'
  if (item.state === 'creating' || item.state === 'restarting') return 'warning'
  if (item.state === 'error' || item.state === 'missing') return 'danger'
  return 'neutral'
}

// Databases the signed-in user created (PostgreSQL, MySQL, MariaDB, MongoDB, Redis).
// The panel's own database lives in Settings and is for the superadmin only.
export function DatabaseWindow({ win }: { win?: WindowState; authenticated?: boolean }) {
  const dbw = useDatabasesWindow(win)
  const { t, query, items, startMut, stopMut, confirmDelete, setShowCreate, setConnectionTarget, setManageTarget } = dbw

  return (
    <div className="panel-window flex h-full flex-col">
      <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--win-border)] bg-[var(--win-bar)] px-3 py-1">
        <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Database className="h-4 w-4 shrink-0" />
          <span className="font-semibold text-[var(--win-text)]">{t('databases.title')}</span>
          <span>•</span>
          <span>{t('databases.count', { count: items.length })}</span>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label={t('common.refresh')} onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
          </IconButton>
          <Button variant="primary-soft" className="px-2.5 py-1 text-xs" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('databases.create')}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {query.isLoading ? (
          <LoadingState>{t('databases.loading')}</LoadingState>
        ) : query.isError ? (
          <ErrorState
            title={t('databases.loadFailed')}
            hint={t('databases.loadFailedHint')}
            action={
              <Button variant="ghost" loading={query.isFetching} onClick={() => void query.refetch()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState icon={<Database />}>{t('databases.empty')}</EmptyState>
        ) : (
          <div className="panel-table-container">
            {items.map((item) => {
              const running = item.state === 'running'
              const pending = item.status === 'creating'
              const broken = item.status === 'error'
              return (
                <EntityRow
                  key={item.id}
                  centered
                  className="p-4"
                  leading={
                    <IconBadge size="md" tone="primary">
                      <Database />
                    </IconBadge>
                  }
                  title={item.name}
                  badges={
                    <>
                      <Badge tone="info">{item.engineLabel}</Badge>
                      <Badge tone={stateTone(item)} dot>
                        {t(`databases.state.${item.state}`)}
                      </Badge>
                    </>
                  }
                  subtitle={<span className="panel-mono">{`${item.host}:${item.port}`}</span>}
                  meta={
                    broken && item.lastError ? (
                      <span className="text-[var(--panel-danger-text)]">{item.lastError}</span>
                    ) : item.ownerName ? (
                      <span>{item.ownerName}</span>
                    ) : undefined
                  }
                  actions={
                    <div className="flex items-center gap-1">
                      <IconButton label={t('databases.admin.openTab')} disabled={pending || broken || !running} onClick={() => window.open(`/database/${item.id}`, '_blank', 'noopener')}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label={t('databases.admin.manage')} tone="primary" disabled={pending || broken || !running} onClick={() => setManageTarget(item)}>
                        <Settings2 className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label={t('databases.showConnection')} tone="primary" disabled={pending || broken} onClick={() => setConnectionTarget(item)}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </IconButton>
                      {running ? (
                        <IconButton label={t('databases.stop')} tone="warning" disabled={stopMut.isPending} onClick={() => stopMut.mutate(item.id)}>
                          <Square className="h-3.5 w-3.5" />
                        </IconButton>
                      ) : (
                        <IconButton label={t('databases.start')} tone="success" disabled={pending || broken || startMut.isPending} onClick={() => startMut.mutate(item.id)}>
                          <Play className="h-3.5 w-3.5" />
                        </IconButton>
                      )}
                      <IconButton label={t('common.delete')} tone="danger" disabled={pending} onClick={() => void confirmDelete(item)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  }
                />
              )
            })}
          </div>
        )}
      </div>

      <CreateDatabaseModal dbw={dbw} />
      <ConnectionModal dbw={dbw} />
      <ManageDatabaseModal dbw={dbw} />
    </div>
  )
}
