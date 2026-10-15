import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { runDatabaseQuery } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { ErrorState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { ResultTable } from './ResultTable'

function apiError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

export function SqlPanel({ databaseId, engine }: { databaseId: number; engine: string }) {
  const { t } = useI18n()
  const isRedis = engine === 'redis'
  const [statement, setStatement] = useState(isRedis ? 'KEYS *' : 'SELECT 1')
  const mutation = useMutation({ mutationFn: () => runDatabaseQuery(databaseId, statement) })

  if (engine === 'mongodb') {
    return <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('databases.admin.consoleUnavailable')}</p>
  }

  return (
    <div className="space-y-3">
      <Textarea
        mono
        rows={6}
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        spellCheck={false}
        aria-label={isRedis ? t('databases.admin.redisCommand') : t('databases.admin.sqlStatement')}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && statement.trim()) mutation.mutate()
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.75rem] text-[var(--text-secondary)]">{t('databases.admin.runHint')}</span>
        <Button variant="primary" disabled={!statement.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          <Play className="h-3.5 w-3.5" />
          {t('databases.admin.run')}
        </Button>
      </div>
      {mutation.isError ? <ErrorState title={t('databases.admin.queryFailed')} hint={apiError(mutation.error, t('databases.actionFailed'))} /> : null}
      {mutation.data ? <ResultTable result={mutation.data} label={t('databases.admin.result')} /> : null}
    </div>
  )
}
