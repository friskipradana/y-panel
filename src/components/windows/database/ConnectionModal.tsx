import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info, KeyRound } from 'lucide-react'
import { getDatabaseCredentials } from '@/api/agent'
import { CopyBlock } from '@/components/public/CopyBlock'
import { Modal } from '@/components/ui/Modal'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { Tabs } from '@/components/ui/Tabs'
import type { DatabasesWindowState } from './useDatabasesWindow'

type From = 'local' | 'outside'

// Credentials are fetched only while this dialog is open and never cached. A database open to listed addresses shows how to reach it from
// outside too: the host follows the address the panel itself is opened at, which is the one the owner already has.
export function ConnectionModal({ dbw }: { dbw: DatabasesWindowState }) {
  const { t, connectionTarget, setConnectionTarget } = dbw
  const target = connectionTarget
  const [from, setFrom] = useState<From>('outside')
  const [hint, setHint] = useState(false)
  const query = useQuery({
    queryKey: ['database-credentials', target?.id],
    queryFn: () => getDatabaseCredentials(target!.id),
    enabled: !!target,
    gcTime: 0,
    staleTime: 0,
  })
  const data = query.data
  const outside = data?.accessMode === 'ips' && from === 'outside'
  const host = outside ? window.location.hostname : (data?.host ?? '')
  const url = data ? (outside ? data.url.replace(data.host, window.location.hostname) : data.url) : ''
  const hintText = t('databases.access.hostHint', { port: data?.port ?? '' })

  return (
    <Modal
      open={!!target}
      onClose={() => {
        setConnectionTarget(null)
        setHint(false)
      }}
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
          {data.accessMode === 'ips' ? (
            <Tabs
              label={t('databases.access.fromOutside')}
              value={from}
              onChange={setFrom}
              items={[
                { key: 'outside', label: t('databases.access.fromOutside') },
                { key: 'local', label: t('databases.access.fromServer') },
              ]}
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <div className="mb-1.5 flex items-center gap-1 text-[0.75rem] font-medium text-[var(--text-secondary)]">
                {t('databases.host')}
                {outside ? (
                  <button
                    type="button"
                    title={hintText}
                    aria-label={hintText}
                    aria-expanded={hint}
                    onClick={() => setHint((v) => !v)}
                    className="grid h-5 w-5 place-items-center rounded text-[var(--text-secondary)] hover:text-[var(--win-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <Info size={13} strokeWidth={1.75} />
                  </button>
                ) : null}
              </div>
              <CopyBlock text={host} />
            </div>
            <CopyBlock label={t('databases.port')} text={String(data.port)} />
          </div>
          {outside && hint ? <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{hintText}</p> : null}
          {data.database ? <CopyBlock label={t('databases.databaseName')} text={data.database} /> : null}
          {data.username ? <CopyBlock label={t('databases.username')} text={data.username} /> : null}
          <CopyBlock label={t('databases.password')} text={data.password} />
          <CopyBlock label={t('databases.url')} text={url} wrap />
          <p className="text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
            {data.accessMode === 'ips' ? t('databases.access.allowedNote', { ips: data.allowedIps.join(', ') }) : t('databases.localOnlyNote')}
          </p>
        </div>
      )}
    </Modal>
  )
}
