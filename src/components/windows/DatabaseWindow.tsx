import { Database, ExternalLink, KeyRound, LoaderCircle, Play, Plus, RefreshCw, Search, Settings2, Square, Trash2 } from 'lucide-react'
import type { UserDatabase } from '@/api/agent'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import type { WindowState } from '@/types'
import { ConnectionModal } from './database/ConnectionModal'
import { CreateDatabaseModal } from './database/CreateDatabaseModal'
import { ManageDatabaseModal } from './database/ManageDatabaseModal'
import { OpenClientModal } from './database/OpenClientModal'
import { useDatabasesWindow } from './database/useDatabasesWindow'

// The pill of each state: the classes the list windows share
function statePill(item: UserDatabase) {
  if (item.state === 'running') return 'running'
  if (item.state === 'creating' || item.state === 'restarting') return 'restarting'
  if (item.state === 'error' || item.state === 'missing') return 'dead'
  return 'exited'
}

// Databases the signed-in user created (PostgreSQL, MySQL, MariaDB, MongoDB, Redis).
// The panel's own database lives in Settings and is for the superadmin only.
export function DatabaseWindow({ win }: { win?: WindowState; authenticated?: boolean }) {
  const dbw = useDatabasesWindow(win)
  const { t, query, list, items, all, facets, narrowed, startMut, stopMut, deleteBusy, confirmDelete, setShowCreate, setConnectionTarget, setManageTarget, setOpenClientTarget } = dbw

  return (
    <div className="panel-window docker-window-root relative overflow-hidden">
      <div className="docker-topbar">
        <div className="docker-topbar__left">
          <button type="button" className="docker-primary-btn" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('databases.create')}</span>
          </button>
        </div>
        <div className="docker-topbar__right">
          <div className="docker-search-wrap">
            <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
            <input
              id="databases-search-input"
              type="search"
              className="docker-search-input"
              aria-label={t('databases.search')}
              placeholder={t('databases.search')}
              value={list.text}
              onChange={(e) => list.setText(e.target.value)}
            />
          </div>
          <button type="button" className="docker-icon-btn" title={t('common.refresh')} aria-label={t('common.refresh')} disabled={query.isFetching} onClick={() => void query.refetch()}>
            <RefreshCw className={`h-3.5 w-3.5 ${(query.isFetching && !query.isLoading) ? 'animate-spin' : ''}`} strokeWidth={1.75} />
          </button>
          <div className="docker-badge-running">{t('databases.count', { count: all })}</div>
        </div>
      </div>

      <ListTable
        variant="databases"
        empty={query.isLoading || query.isError || items.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          list.column('name', t('databases.col.database'), facets?.name, { filterable: false }),
          list.column('engine', t('databases.engine'), facets?.engine),
          list.column('port', t('databases.col.address'), facets?.port),
          list.column('state', t('databases.col.status'), facets?.state, { labelOf: (v) => t(`databases.state.${v}`) }),
          { label: t('databases.col.actions'), actions: true },
        ]}
      >
        <ListState
          loading={query.isLoading}
          error={query.isError}
          errorTitle={t('databases.loadFailed')}
          errorHint={t('databases.loadFailedHint')}
          loadingText={t('databases.loading')}
          empty={items.length === 0}
          emptyIcon={<Database />}
          emptyTitle={narrowed ? t('docker.noResults') : t('databases.empty')}
        >
          {items.map((item, index) => {
            const running = item.state === 'running'
            const pending = item.status === 'creating'
            const broken = item.status === 'error'
            const address = `${item.host}:${item.port}`
            const starting = startMut.isPending && startMut.variables === item.id
            const stopping = stopMut.isPending && stopMut.variables === item.id
            return (
              <div key={item.id} className="docker-row">
                <div className="docker-row__num">{String(index + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <ListRowIcon><Database className="h-3.5 w-3.5" /></ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name" title={item.name}>{item.name}</span>
                    <span className="docker-row__sub" title={broken && item.lastError ? item.lastError : undefined}>
                      {broken && item.lastError ? <span className="docker-row__warn">{item.lastError}</span> : [item.version, item.ownerName].filter(Boolean).join(' \u00b7 ')}
                    </span>
                    <span className="docker-row__meta">{`${item.engineLabel} \u00b7 ${address}`}</span>
                  </div>
                </div>
                <div className="docker-cell">{item.engineLabel}</div>
                <div className="docker-cell docker-cell--mono">{address}</div>
                <div className="docker-cell--keep">
                  <span className={`docker-status-pill docker-status-pill--${statePill(item)}`}>
                    <span className="docker-status-dot" />
                    <span>{t(`databases.state.${item.state}`)}</span>
                  </span>
                </div>
                <div className="docker-action-btns">
                  <button
                    type="button"
                    className="docker-act-btn"
                    title={t('databases.chooseClientTitle')}
                    aria-label={t('databases.chooseClientTitle')}
                    disabled={pending || broken || !running}
                    onClick={() => setOpenClientTarget(item)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button type="button" className="docker-act-btn" title={t('databases.admin.manage')} aria-label={t('databases.admin.manage')} disabled={pending || broken || !running} onClick={() => setManageTarget(item)}>
                    <Settings2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  <button type="button" className="docker-act-btn" title={t('databases.showConnection')} aria-label={t('databases.showConnection')} disabled={pending || broken} onClick={() => setConnectionTarget(item)}>
                    <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                  {starting || stopping ? (
                    <button type="button" className="docker-act-btn" disabled aria-busy="true" title={t('databases.working')} aria-label={t('databases.working')}>
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                    </button>
                  ) : running ? (
                    <button type="button" className="docker-act-btn docker-act-btn--stop" title={t('databases.stop')} aria-label={t('databases.stop')} onClick={() => stopMut.mutate(item.id)}>
                      <Square className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} />
                    </button>
                  ) : (
                    <button type="button" className="docker-act-btn docker-act-btn--start" title={t('databases.start')} aria-label={t('databases.start')} disabled={pending || broken} onClick={() => startMut.mutate(item.id)}>
                      <Play className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} />
                    </button>
                  )}
                  <button type="button" className="docker-act-btn docker-act-btn--danger" title={t('common.delete')} aria-label={t('common.delete')} disabled={pending || deleteBusy(item.id)} onClick={() => void confirmDelete(item)}>
                    {deleteBusy(item.id) ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  </button>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>

      <CreateDatabaseModal dbw={dbw} />
      <ConnectionModal dbw={dbw} />
      <ManageDatabaseModal dbw={dbw} />
      <OpenClientModal dbw={dbw} />
    </div>
  )
}
