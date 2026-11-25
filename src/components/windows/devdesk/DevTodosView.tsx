import { useState } from 'react'
import { CheckCircle2, Circle, Clock, Plus, Trash2 } from 'lucide-react'
import type { DevTodoPriority, DevTodoStatus } from '@/api/devdesk'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { Select } from '@/components/ui/Select'
import type { DevDeskWindowState } from './useDevDeskWindow'

const NEXT_STATUS: Record<DevTodoStatus, DevTodoStatus> = {
  todo: 'doing',
  doing: 'done',
  done: 'todo',
}

export function DevTodosView({ dd }: { dd: DevDeskWindowState }) {
  const { t, docs, todos, search, todoDocFilter, setTodoDocFilter, overviewQ, createTodoMut, updateTodoMut, deleteTodoMut } = dd
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<DevTodoPriority>('medium')

  const docMap = new Map(docs.map((d) => [d.id, d]))
  const q = search.trim().toLowerCase()
  const filtered = todos.filter((td) => {
    if (todoDocFilter !== 'all' && String(td.docId) !== todoDocFilter) return false
    return !q || td.title.toLowerCase().includes(q) || td.notes.toLowerCase().includes(q)
  })

  const docOptions = [
    { value: 'all', label: t('devdesk.allProjects') },
    { value: '0', label: t('devdesk.generalTodos') },
    ...docs.map((d) => ({ value: String(d.id), label: `${d.docNumber} · ${d.clientName || d.title}` })),
  ]

  const addTodo = () => {
    if (!newTitle.trim()) return
    const docId = todoDocFilter === 'all' ? 0 : Number(todoDocFilter) || 0
    createTodoMut.mutate(
      { docId, title: newTitle.trim(), priority: newPriority },
      { onSuccess: () => setNewTitle('') },
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--win-border)] bg-[var(--panel-surface)] px-4 py-2">
        <Select size="sm" className="panel-toolbar-select" value={todoDocFilter} onChange={setTodoDocFilter} options={docOptions} />
        <div className="min-w-[180px] flex-1">
          <TextInput
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTodo()
            }}
            placeholder={t('devdesk.addTodoPlaceholder')}
          />
        </div>
        <Select
          size="sm"
          className="panel-toolbar-select"
          value={newPriority}
          onChange={(v) => setNewPriority(v as DevTodoPriority)}
          options={[
            { value: 'high', label: t('devdesk.priority.high') },
            { value: 'medium', label: t('devdesk.priority.medium') },
            { value: 'low', label: t('devdesk.priority.low') },
          ]}
        />
        <Button
          variant="primary"
          icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />}
          disabled={!newTitle.trim()}
          loading={createTodoMut.isPending}
          onClick={addTodo}
        >
          {t('devdesk.addTodoBtn')}
        </Button>
      </div>

      <ListTable
        variant="devdesk-todos"
        empty={overviewQ.isLoading || overviewQ.isError || filtered.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('devdesk.col.task') },
          { label: t('devdesk.col.project') },
          { label: t('devdesk.col.priority') },
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
          empty={filtered.length === 0}
          emptyIcon={<CheckCircle2 />}
          emptyTitle={t('devdesk.emptyTodos')}
        >
          {filtered.map((td, idx) => {
            const parent = docMap.get(td.docId)
            const pill = td.status === 'done' ? 'running' : td.status === 'doing' ? 'paused' : 'exited'
            return (
              <div key={td.id} className="docker-row">
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <ListRowIcon>
                    {td.status === 'done' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--panel-success-text)]" strokeWidth={1.75} />
                    ) : td.status === 'doing' ? (
                      <Clock className="h-3.5 w-3.5 text-[var(--panel-warning-text)]" strokeWidth={1.75} />
                    ) : (
                      <Circle className="h-3.5 w-3.5" strokeWidth={1.75} />
                    )}
                  </ListRowIcon>
                  <div className="docker-row__text">
                    <span className={`docker-app-name ${td.status === 'done' ? 'line-through opacity-65' : ''}`} title={td.title}>
                      {td.title}
                    </span>
                    {td.notes ? <span className="docker-row__sub">{td.notes}</span> : null}
                    <span className="docker-row__meta">{parent ? parent.docNumber : t('devdesk.generalTodos')}</span>
                  </div>
                </div>
                <div className="docker-cell docker-cell--mono" title={parent?.title || ''}>
                  {parent ? parent.docNumber : t('devdesk.generalTodos')}
                </div>
                <div className="docker-cell">
                  <Badge tone={td.priority === 'high' ? 'danger' : td.priority === 'medium' ? 'warning' : 'neutral'}>
                    {t(`devdesk.priority.${td.priority}`)}
                  </Badge>
                </div>
                <div className="docker-cell--keep">
                  <button
                    type="button"
                    className={`docker-status-pill docker-status-pill--${pill} cursor-pointer`}
                    title={t('devdesk.cycleStatus')}
                    onClick={() => updateTodoMut.mutate({ id: td.id, patch: { status: NEXT_STATUS[td.status] } })}
                  >
                    <span className="docker-status-dot" />
                    <span>{t(`devdesk.todoStatus.${td.status}`)}</span>
                  </button>
                </div>
                <div className="docker-action-btns">
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--danger"
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    onClick={() => deleteTodoMut.mutate(td.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>
    </div>
  )
}
