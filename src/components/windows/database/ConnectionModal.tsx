import { useQuery } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { getDatabaseCredentials } from '@/api/agent'
import { CopyBlock } from '@/components/public/CopyBlock'
import { Modal } from '@/components/ui/Modal'
import { ErrorState, LoadingState } from '@/components/ui/states'
import type { DatabasesWindowState } from './useDatabasesWindow'

// Credentials are fetched only while this dialog is open and never cached.
export function ConnectionModal({ dbw }: { dbw: DatabasesWindowState }) {
  const { t, connectionTarget, setConnectionTarget } = dbw
  const target = connectionTarget
  const query = useQuery({
    queryKey: ['database-credentials', target?.id],
    queryFn: () => getDatabaseCredentials(target!.id),
    enabled: !!target,
    gcTime: 0,
    staleTime: 0,
  })
  const data = query.data

  return (
    <Modal
      open={!!target}
      onClose={() => setConnectionTarget(null)}
      title={t('databases.connectionTitle')}
      subtitle={target ? `${target.engineLabel} · ${target.name}` : undefined}
      icon={<KeyRound />}
      size="md"
    >
      {query.isLoading ? (
        <LoadingState>{t('databases.loadingCredentials')}</LoadingState>
      ) : query.isError || !data ? (
        <ErrorState title={t('databases.credentialsFailed')} hint={t('databases.credentialsFailedHint')} />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyBlock label={t('databases.host')} text={data.host} />
            <CopyBlock label={t('databases.port')} text={String(data.port)} />
          </div>
          {data.database ? <CopyBlock label={t('databases.databaseName')} text={data.database} /> : null}
          {data.username ? <CopyBlock label={t('databases.username')} text={data.username} /> : null}
          <CopyBlock label={t('databases.password')} text={data.password} />
          <CopyBlock label={t('databases.url')} text={data.url} wrap />
          {data.accessMode === 'ips' && data.publicHost ? (
            <div className="space-y-3 rounded-lg border border-[var(--win-border)] p-3">
              <p className="text-[0.75rem] font-semibold text-[var(--text-secondary)]">{t('databases.access.fromOutside')}</p>
              <CopyBlock label={t('databases.host')} text={data.publicHost} />
              <CopyBlock label={t('databases.url')} text={data.publicUrl} wrap />
            </div>
          ) : null}
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {data.accessMode === 'ips' ? t('databases.access.remoteNote', { port: data.port, ips: data.allowedIps.join(', ') }) : t('databases.localOnlyNote')}
          </p>
        </div>
      )}
    </Modal>
  )
}
