import type { QueryResult } from '@/api/agent'
import { DataTable } from '@/components/ui/DataTable'
import { useI18n } from '@/lib/i18n'

const COLUMN_WIDTH_REM = 10

// Query / table rows. Wide results scroll sideways instead of squeezing the columns.
export function ResultTable({ result, label }: { result: QueryResult; label: string }) {
  const { t } = useI18n()
  if (result.columns.length === 0) {
    return <p className="text-[0.8125rem] text-[var(--text-secondary)]">{result.message ?? t('databases.admin.noRows')}</p>
  }
  const columns = result.columns.map((header, index) => ({
    key: `c${index}`,
    header,
    width: `${COLUMN_WIDTH_REM}rem`,
    render: (row: string[]) => <span className="panel-mono truncate text-[12px]" title={row[index]}>{row[index]}</span>,
  }))
  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${result.columns.length * (COLUMN_WIDTH_REM + 0.75)}rem` }}>
          <DataTable
            label={label}
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.join('\u0001') + result.rows.indexOf(row)}
            emptyText={t('databases.admin.noRows')}
          />
        </div>
      </div>
      <p className="text-[0.75rem] text-[var(--text-secondary)]">
        {t('databases.admin.rowCount', { count: result.rows.length })}
        {result.truncated ? ` · ${t('databases.admin.truncated')}` : ''}
        {result.durationMs ? ` · ${result.durationMs} ms` : ''}
      </p>
    </div>
  )
}
