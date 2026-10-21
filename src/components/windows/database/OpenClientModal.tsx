import { useQuery } from '@tanstack/react-query'
import { Database, ExternalLink, Layers, Settings2, Table2 } from 'lucide-react'
import { getDatabaseCredentials } from '@/api/agent'
import { CopyBlock } from '@/components/public/CopyBlock'
import { Button } from '@/components/ui/Button'
import { IconBadge } from '@/components/ui/IconBadge'
import { Modal } from '@/components/ui/Modal'
import { ErrorState, LoadingState } from '@/components/ui/states'
import type { DatabasesWindowState } from './useDatabasesWindow'

const SQL_ENGINES = ['postgres', 'mysql', 'mariadb']

export function OpenClientModal({ dbw }: { dbw: DatabasesWindowState }) {
  const { t, openClientTarget, setOpenClientTarget, setManageTarget } = dbw
  const target = openClientTarget

  const query = useQuery({
    queryKey: ['database-credentials', target?.id],
    queryFn: () => getDatabaseCredentials(target!.id),
    enabled: !!target,
    gcTime: 0,
    staleTime: 0,
  })

  const isSql = target ? SQL_ENGINES.includes(target.engine) : false

  const handleOpenAdminer = () => {
    if (!target || !isSql) return
    window.open(`/api/v1/db-open/${target.accessKey}`, '_blank', 'noopener')
    setOpenClientTarget(null)
  }

  const handleOpenDbx = () => {
    if (!target) return
    window.open(`/api/v1/db-open-dbx/${target.accessKey}`, '_blank', 'noopener')
    setOpenClientTarget(null)
  }

  const handleOpenManager = () => {
    if (!target) return
    setOpenClientTarget(null)
    setManageTarget(target)
  }

  return (
    <Modal
      open={!!target}
      onClose={() => setOpenClientTarget(null)}
      title={t('databases.chooseClientTitle')}
      subtitle={target ? `${target.engineLabel} · ${target.name}` : undefined}
      icon={<Database />}
      size="md"
      width={560}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={handleOpenManager}>
            <Settings2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('databases.openReneoManager')}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpenClientTarget(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-[var(--win-text)]">
        <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
          {t('databases.chooseClientDesc')}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Adminer Option */}
          <div
            className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
              isSql
                ? 'border-[var(--win-border)] bg-[var(--panel-surface)] hover:border-[var(--panel-primary-solid)]/40 hover:bg-[var(--panel-surface-hover)]'
                : 'border-[var(--win-border)] bg-[var(--panel-surface)] opacity-55'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IconBadge size="md" tone="primary">
                    <Table2 />
                  </IconBadge>
                  <span className="text-[0.875rem] font-semibold">Adminer</span>
                </div>
                <span className="rounded px-1.5 py-0.5 text-[0.6875rem] font-medium bg-[var(--panel-surface-strong)] text-[var(--text-secondary)]">
                  {t('databases.clientAdminerTag')}
                </span>
              </div>
              <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
                {isSql ? t('databases.clientAdminerDesc') : t('databases.adminerSqlOnly')}
              </p>
            </div>
            <div className="mt-4 pt-2">
              <Button
                variant={isSql ? 'primary' : 'outline'}
                size="sm"
                className="w-full"
                disabled={!isSql}
                onClick={handleOpenAdminer}
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('databases.openAdminer')}</span>
              </Button>
            </div>
          </div>

          {/* DBX Option */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4 transition-colors hover:border-[var(--panel-primary-solid)]/40 hover:bg-[var(--panel-surface-hover)]">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IconBadge size="md" tone="info">
                    <Layers />
                  </IconBadge>
                  <span className="text-[0.875rem] font-semibold">DBX</span>
                </div>
                <span className="rounded px-1.5 py-0.5 text-[0.6875rem] font-medium bg-[var(--panel-surface-strong)] text-[var(--text-secondary)]">
                  {t('databases.clientDbxTag')}
                </span>
              </div>
              <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
                {t('databases.clientDbxDesc')}
              </p>
            </div>
            <div className="mt-4 pt-2">
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={handleOpenDbx}
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('databases.openDbx')}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Credentials / Quick URI for copy */}
        <div className="pt-2">
          {query.isLoading ? (
            <LoadingState>{t('databases.loadingCredentials')}</LoadingState>
          ) : query.isError || !query.data ? (
            <ErrorState title={t('databases.credentialsFailed')} hint={t('databases.credentialsFailedHint')} />
          ) : (
            <CopyBlock label={t('databases.connectionUri')} text={query.data.url} wrap />
          )}
        </div>
      </div>
    </Modal>
  )
}
