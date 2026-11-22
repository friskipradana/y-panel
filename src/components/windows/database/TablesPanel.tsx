import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, Table2, Trash2 } from 'lucide-react'
import { browseDatabaseTable, dropDatabaseTable, listDatabaseTables } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { IconButton } from '@/components/ui/IconButton'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { CreateTableModal } from './CreateTableModal'
import { ResultTable } from './ResultTable'

const PAGE = 50

function apiError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

export function TablesPanel({ databaseId }: { databaseId: number }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [designer, setDesigner] = useState(false)

  const tables = useQuery({ queryKey: ['db-tables', databaseId], queryFn: () => listDatabaseTables(databaseId), retry: 0 })
  const rows = useQuery({
    queryKey: ['db-rows', databaseId, selected, offset],
    queryFn: () => browseDatabaseTable(databaseId, selected!, offset, PAGE),
    enabled: !!selected && !!tables.data?.sql,
    retry: 0,
  })

  const dropMut = useMutation({
    mutationFn: (name: string) => dropDatabaseTable(databaseId, name),
    onSuccess: () => {
      setSelected(null)
      void qc.invalidateQueries({ queryKey: ['db-tables', databaseId] })
    },
    onError: (e: unknown) => alertLib.fire(t('databases.admin.dropFailed'), apiError(e, t('databases.actionFailed')), 'error', 'database'),
  })

  const confirmDrop = async (name: string) => {
    const ok = await alertLib.confirm(
      t('databases.admin.dropQuestion'),
      t('databases.admin.dropMessage', { name }),
      t('databases.admin.dropConfirm'),
      t('common.cancel'),
      'warning',
      'database',
    )
    if (ok) dropMut.mutate(name)
  }

  if (tables.isLoading) return <LoadingState>{t('databases.admin.loading')}</LoadingState>
  if (tables.isError || !tables.data) {
    return <ErrorState title={t('databases.admin.loadFailed')} hint={apiError(tables.error, t('databases.admin.loadFailedHint'))} action={<Button variant="primary" size="sm" onClick={() => void tables.refetch()}>{t('common.retry')}</Button>} />
  }
  const data = tables.data

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.8125rem] text-[var(--text-secondary)]">{t(data.sql ? 'databases.admin.tableCount' : 'databases.admin.keyCount', { count: data.tables.length })}</span>
        {data.sql ? (
          <Button variant="primary-soft" onClick={() => setDesigner(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('databases.admin.createTable')}
          </Button>
        ) : null}
      </div>

      {data.tables.length === 0 ? (
        <EmptyState icon={<Table2 />}>{t(data.sql ? 'databases.admin.noTables' : 'databases.admin.noKeys')}</EmptyState>
      ) : (
        <ul className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
          {data.tables.map((name) => (
            <li key={name} className="flex items-center gap-1 pr-1">
              <button
                type="button"
                disabled={!data.sql}
                onClick={() => {
                  setSelected(selected === name ? null : name)
                  setOffset(0)
                }}
                aria-expanded={selected === name}
                className="panel-mono min-h-11 min-w-0 flex-1 truncate px-3 text-left text-[0.8125rem] hover:bg-[var(--panel-surface-hover)] disabled:cursor-default"
              >
                {name}
              </button>
              {data.sql ? (
                <IconButton label={t('databases.admin.dropTable')} tone="danger" onClick={() => void confirmDrop(name)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {selected && data.sql ? (
        <section className="space-y-2" aria-label={selected}>
          <h3 className="panel-mono text-[0.8125rem] font-semibold">{selected}</h3>
          {rows.isLoading ? (
            <LoadingState>{t('databases.admin.loading')}</LoadingState>
          ) : rows.isError || !rows.data ? (
            <ErrorState title={t('databases.admin.loadFailed')} hint={apiError(rows.error, t('databases.admin.loadFailedHint'))} />
          ) : (
            <>
              <ResultTable result={rows.data} label={selected} />
              <div className="flex items-center justify-between">
                <Button variant="ghost" disabled={offset === 0} onClick={() => setOffset((v) => Math.max(0, v - PAGE))}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t('docs.previous')}
                </Button>
                <Button variant="ghost" disabled={(rows.data.rows?.length ?? 0) < PAGE} onClick={() => setOffset((v) => v + PAGE)}>
                  {t('docs.next')}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}

      <CreateTableModal
        databaseId={databaseId}
        open={designer}
        columnTypes={data.columnTypes}
        onClose={() => setDesigner(false)}
        onCreated={() => {
          setDesigner(false)
          void qc.invalidateQueries({ queryKey: ['db-tables', databaseId] })
        }}
      />
    </div>
  )
}
