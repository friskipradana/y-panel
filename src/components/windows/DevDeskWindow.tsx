import {
  ArrowRightLeft,
  Bot,
  CheckSquare,
  ExternalLink,
  FileText,
  Link2,
  MessageSquare,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { WindowState } from '@/types'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { DevAiGenerateModal } from './devdesk/DevAiGenerateModal'
import { DevDocEditorModal } from './devdesk/DevDocEditorModal'
import { DevTodosView } from './devdesk/DevTodosView'
import { useDevDeskWindow, type DevDeskSection } from './devdesk/useDevDeskWindow'

interface DevDeskWindowProps {
  win: WindowState
  authenticated: boolean
}

function docStatusPill(status: string): 'running' | 'paused' | 'dead' | 'exited' {
  if (status === 'paid' || status === 'accepted') return 'running'
  if (status === 'sent' || status === 'dp_paid') return 'paused'
  if (status === 'cancelled') return 'dead'
  return 'exited'
}

export function DevDeskWindow({ win, authenticated }: DevDeskWindowProps) {
  const isMobile = useIsMobileLayout()
  const dd = useDevDeskWindow(win, authenticated)
  const {
    t,
    section,
    setSection,
    search,
    setSearch,
    overviewQ,
    refresh,
    quotations,
    invoices,
    todos,
    todoCountByDoc,
    setEditingDoc,
    setDraftSeed,
    setAiModalOpen,
    setTodoDocFilter,
    convertMut,
    rotateTokenMut,
    confirmDeleteDoc,
    publicUrlOf,
    copyPublicUrl,
  } = dd

  const filterItems = [
    { key: 'invoices', label: t('devdesk.tab.invoices'), count: invoices.length },
    { key: 'quotations', label: t('devdesk.tab.quotations'), count: quotations.length },
    { key: 'todos', label: t('devdesk.tab.todos'), count: todos.filter((x) => x.status !== 'done').length },
  ]

  const isSpinning = overviewQ.isFetching && !overviewQ.isLoading
  const activeDocs = section === 'invoices' ? invoices : quotations
  const q = search.trim().toLowerCase()
  const visibleDocs = activeDocs.filter(
    (d) =>
      !q ||
      d.docNumber.toLowerCase().includes(q) ||
      d.clientName.toLowerCase().includes(q) ||
      d.clientCompany.toLowerCase().includes(q) ||
      d.title.toLowerCase().includes(q),
  )
  const openNewDoc = () => setDraftSeed({ kind: section === 'quotations' ? 'quotation' : 'invoice' })

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__mobile-row">
            <FilterMenu label={t('devdesk.sections')} value={section} onChange={(v) => setSection(v as DevDeskSection)} items={filterItems} />
            <button type="button" className="docker-primary-btn" onClick={openNewDoc}>
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('devdesk.newDocShort')}</span>
            </button>
            <button type="button" className="docker-secondary-btn" onClick={() => setAiModalOpen(true)}>
              <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('devdesk.aiGenerateBtn')}</span>
            </button>
          </div>
          <div className="docker-topbar__mobile-search">
            <div className="docker-search-wrap docker-search-wrap--mobile">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input docker-search-input--mobile"
                aria-label={t('devdesk.searchPlaceholder')}
                placeholder={t('devdesk.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="docker-icon-btn docker-icon-btn--mobile" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={refresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            <FilterMenu label={t('devdesk.sections')} value={section} onChange={(v) => setSection(v as DevDeskSection)} items={filterItems} />
            <button type="button" className="docker-primary-btn" onClick={openNewDoc}>
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('devdesk.newDoc')}</span>
            </button>
            <button type="button" className="docker-secondary-btn" onClick={() => setAiModalOpen(true)}>
              <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="docker-secondary-btn__text">{t('devdesk.aiGenerateBtn')}</span>
            </button>
          </div>
          <div className="docker-topbar__right">
            <div className="docker-search-wrap">
              <Search className="docker-search-icon h-3.5 w-3.5" strokeWidth={1.75} />
              <input
                type="search"
                className="docker-search-input"
                aria-label={t('devdesk.searchPlaceholder')}
                placeholder={t('devdesk.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="docker-icon-btn" title={t('common.refresh')} aria-label={t('common.refresh')} onClick={refresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isSpinning ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            </button>
            <div className="docker-badge-running">
              <span>{t('docker.itemsBadge', { count: section === 'todos' ? todos.length : visibleDocs.length })}</span>
            </div>
          </div>
        </div>
      )}

      {section === 'todos' ? (
        <DevTodosView dd={dd} />
      ) : (
        <ListTable
          variant="devdesk-docs"
          empty={overviewQ.isLoading || overviewQ.isError || visibleDocs.length === 0}
          columns={[
            { label: t('docker.colIndex') },
            { label: t('devdesk.col.document') },
            { label: t('devdesk.col.client') },
            { label: t('devdesk.col.total') },
            { label: t('docker.colStatus') },
            { label: t('docker.colActions'), actions: true },
          ]}
        >
          <ListState
            loading={overviewQ.isLoading}
            error={overviewQ.isError}
            errorTitle={t('devdesk.loadFailed')}
            errorHint={(overviewQ.error as Error)?.message}
            loadingText={t('common.loading')}
            empty={visibleDocs.length === 0}
            emptyIcon={section === 'invoices' ? <Receipt /> : <FileText />}
            emptyTitle={section === 'invoices' ? t('devdesk.emptyInvoices') : t('devdesk.emptyQuotations')}
          >
            {visibleDocs.map((doc, idx) => {
              const todoStat = todoCountByDoc.get(doc.id)
              return (
                <div key={doc.id} className="docker-row">
                  <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                  <div className="docker-row__app">
                    <ListRowIcon>
                      {doc.kind === 'invoice' ? <Receipt className="h-3.5 w-3.5" strokeWidth={1.75} /> : <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    </ListRowIcon>
                    <div className="docker-row__text">
                      <span className="docker-app-name" title={doc.title || doc.docNumber}>{doc.title || doc.docNumber}</span>
                      <span className="docker-row__sub panel-mono">
                        {doc.docNumber}
                        {doc.issueDate ? ` · ${doc.issueDate}` : ''}
                        {todoStat ? ` · ${t('devdesk.checklistCount', { done: todoStat.done, total: todoStat.total })}` : ''}
                      </span>
                      <span className="docker-row__meta panel-mono">
                        {`${doc.clientName || '-'} · Rp ${doc.totalAmount.toLocaleString('id-ID')}`}
                      </span>
                    </div>
                  </div>
                  <div className="docker-cell" title={`${doc.clientName} ${doc.clientCompany}`}>
                    <span className="docker-cell__strong">{doc.clientName || '-'}</span>
                    {doc.clientCompany ? <span className="text-[0.6875rem]">{doc.clientCompany}</span> : null}
                  </div>
                  <div className="docker-cell docker-cell--mono">
                    <span className="docker-cell__strong">Rp {doc.totalAmount.toLocaleString('id-ID')}</span>
                    {doc.dpPercent > 0 && doc.dpPercent < 100 ? (
                      <span className="text-[0.6875rem]">DP {doc.dpPercent}%</span>
                    ) : null}
                  </div>
                  <div className="docker-cell--keep">
                    <span className={`docker-status-pill docker-status-pill--${docStatusPill(doc.status)}`}>
                      <span className="docker-status-dot" />
                      <span>{t(`devdesk.status.${doc.status}`)}</span>
                    </span>
                  </div>
                  <div className="docker-action-btns">
                    <button type="button" className="docker-act-btn" title={t('devdesk.copyPublicUrl')} aria-label={t('devdesk.copyPublicUrl')} onClick={() => copyPublicUrl(doc)}>
                      <Link2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    {doc.waMessage?.trim() ? (
                      <button
                        type="button"
                        className="docker-act-btn"
                        title={t('devdesk.copyWa')}
                        aria-label={t('devdesk.copyWa')}
                        onClick={() => void navigator.clipboard.writeText(doc.waMessage).then(() => toast.success(t('common.copied')))}
                      >
                        <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="docker-act-btn"
                      title={t('devdesk.openPublicPage')}
                      aria-label={t('devdesk.openPublicPage')}
                      onClick={() => window.open(publicUrlOf(doc), '_blank', 'noopener')}
                    >
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="docker-act-btn"
                      title={t('devdesk.viewChecklist')}
                      aria-label={t('devdesk.viewChecklist')}
                      onClick={() => {
                        setTodoDocFilter(String(doc.id))
                        setSection('todos')
                      }}
                    >
                      <CheckSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    {doc.kind === 'quotation' ? (
                      <button
                        type="button"
                        className="docker-act-btn docker-act-btn--start"
                        title={t('devdesk.convertToInvoice')}
                        aria-label={t('devdesk.convertToInvoice')}
                        disabled={convertMut.isPending}
                        onClick={() => convertMut.mutate(doc.id)}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    ) : null}
                    <button type="button" className="docker-act-btn" title={t('common.edit')} aria-label={t('common.edit')} onClick={() => setEditingDoc(doc)}>
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="docker-act-btn"
                      title={t('devdesk.rotateToken')}
                      aria-label={t('devdesk.rotateToken')}
                      onClick={() => rotateTokenMut.mutate(doc.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="docker-act-btn docker-act-btn--danger"
                      title={t('common.delete')}
                      aria-label={t('common.delete')}
                      onClick={() => void confirmDeleteDoc(doc)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              )
            })}
          </ListState>
        </ListTable>
      )}

      <DevDocEditorModal dd={dd} />
      <DevAiGenerateModal dd={dd} />
    </div>
  )
}
