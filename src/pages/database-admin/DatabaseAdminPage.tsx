import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Database, ExternalLink } from 'lucide-react'
import { listUserDatabases } from '@/api/agent'
import { ManageDatabaseContent } from '@/components/windows/database/ManageDatabaseContent'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconBadge } from '@/components/ui/IconBadge'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useI18n } from '@/lib/i18n'

const SQL_ENGINES = ['postgres', 'mysql', 'mariadb']

// Full page database manager at /database/{accessKey} (an opaque key, not the numeric ID): opens in its own tab, on the panel's own domain,
// behind the same login as the panel.
export function DatabaseAdminPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { key = '' } = useParams()
  const query = useQuery({ queryKey: ['user-databases'], queryFn: () => listUserDatabases().then((r) => r.items), refetchInterval: 15_000 })
  const target = query.data?.find((item) => item.accessKey === key)
  const isSql = target ? SQL_ENGINES.includes(target.engine) : false
  usePageMeta(target ? `${target.name} | ${t('databases.admin.title')}` : t('databases.admin.title'))

  return (
    <div className="flex h-full w-full flex-col bg-[var(--win-content-bg)] text-[var(--win-text)]">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--win-border)] bg-[var(--win-bar)] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Button variant="ghost" onClick={() => navigate('/home')}>
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('databases.admin.backToPanel')}
        </Button>
        <IconBadge size="md" tone="primary">
          <Database />
        </IconBadge>
        <div className="min-w-0">
          <h1 className="truncate text-[0.9375rem] font-semibold">{target ? target.name : t('databases.admin.title')}</h1>
          {target ? (
            <p className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">
              {target.engineLabel} · {target.host}:{target.port}
            </p>
          ) : null}
        </div>
        {target ? (
          <Badge tone={target.state === 'running' ? 'success' : 'warning'} dot>
            {t(`databases.state.${target.state}`)}
          </Badge>
        ) : null}
        {target && target.state === 'running' ? (
          <div className="ml-auto flex items-center gap-2">
            {isSql ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/v1/db-open/${target.accessKey}`, '_blank', 'noopener')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('databases.openAdminer')}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/v1/db-open-dbx/${target.accessKey}`, '_blank', 'noopener')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('databases.openDbx')}
            </Button>
          </div>
        ) : null}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto w-full max-w-5xl">
          {query.isLoading ? (
            <LoadingState>{t('databases.loading')}</LoadingState>
          ) : query.isError ? (
            <ErrorState title={t('databases.loadFailed')} hint={t('databases.loadFailedHint')} />
          ) : !target ? (
            <ErrorState title={t('databases.admin.notFound')} hint={t('databases.admin.notFoundHint')} />
          ) : target.state !== 'running' ? (
            <ErrorState title={t('databases.admin.notRunning')} hint={t('databases.admin.notRunningHint')} />
          ) : (
            <ManageDatabaseContent key={target.id} target={target} />
          )}
        </div>
      </main>
    </div>
  )
}
