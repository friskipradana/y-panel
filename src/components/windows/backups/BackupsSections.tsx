import {
  Archive,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  FolderCode,
  HardDrive,
  Play,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { backupRunDownloadUrl } from '@/api/backups'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { IconButton } from '@/components/ui/IconButton'
import { ListRowIcon } from '@/components/ui/ListTable'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import type { BackupsWindowState } from './useBackupsWindow'

function formatBytes(n: number) {
  if (!n || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function BackupsSections({ bw }: { bw: BackupsWindowState }) {
  const {
    t,
    section,
    search,
    overviewQ,
    runningJobId,
    restoringRunId,
    testingTargetId,
    runJobMut,
    toggleJobMut,
    testTargetMut,
    confirmDeleteTarget,
    confirmDeleteJob,
    confirmRestoreRun,
    confirmDeleteRun,
    setAddTargetOpen,
    setAddJobOpen,
  } = bw

  if (overviewQ.isLoading) {
    return (
      <div className="p-4 flex-1">
        <LoadingState>{t('backups.loading')}</LoadingState>
      </div>
    )
  }

  if (overviewQ.isError) {
    return (
      <div className="p-4 flex-1">
        <ErrorState
          title={t('backups.loadFailed')}
          hint={(overviewQ.error as Error)?.message}
          action={
            <Button size="sm" variant="ghost" onClick={() => void overviewQ.refetch()}>
              {t('common.refresh')}
            </Button>
          }
        />
      </div>
    )
  }

  const data = overviewQ.data
  const q = search.trim().toLowerCase()

  if (section === 'jobs') {
    const jobs = (data?.jobs ?? []).filter(
      (j) => !q || j.name.toLowerCase().includes(q) || j.resourceName.toLowerCase().includes(q) || j.targetName.toLowerCase().includes(q),
    )
    if (jobs.length === 0) {
      return (
        <div className="p-4 flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <EmptyState icon={<Archive />}>{t('backups.emptyJobs')}</EmptyState>
          {(data?.targets.length ?? 0) === 0 ? (
            <Button size="sm" variant="primary" onClick={() => setAddTargetOpen(true)}>
              {t('backups.addTarget')}
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setAddJobOpen(true)}>
              {t('backups.addJob')}
            </Button>
          )}
        </div>
      )
    }

    return (
      <div className="p-3 space-y-2 overflow-y-auto flex-1">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <ListRowIcon>
                {job.scope === 'database' ? (
                  <Database className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <FolderCode className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </ListRowIcon>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-[var(--win-text)] truncate">{job.name}</span>
                  <Badge tone={job.scope === 'database' ? 'primary' : 'info'}>{job.scope}</Badge>
                  <Badge tone={job.lastStatus === 'success' ? 'success' : job.lastStatus === 'failed' ? 'danger' : 'neutral'}>
                    {job.lastStatus}
                  </Badge>
                </div>
                <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">
                  {job.resourceName} · {job.targetName || '-'} ({job.targetKind || 'local'}) ·{' '}
                  {job.intervalHours > 0 ? t('backups.everyHours', { hours: job.intervalHours }) : t('backups.manualOnly')} ·{' '}
                  {t('backups.keepCount', { count: job.retentionCount })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Checkbox
                checked={job.enabled}
                onChange={() => toggleJobMut.mutate(job)}
                aria-label={t('backups.toggleJob')}
              />
              <Button
                size="sm"
                variant="primary-soft"
                loading={runningJobId === job.id}
                onClick={() => runJobMut.mutate(job)}
              >
                <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>{t('backups.runNow')}</span>
              </Button>
              <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => void confirmDeleteJob(job)}>
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (section === 'runs') {
    const runs = (data?.runs ?? []).filter(
      (r) => !q || r.resourceName.toLowerCase().includes(q) || r.jobName.toLowerCase().includes(q) || r.storageKey.toLowerCase().includes(q),
    )
    if (runs.length === 0) {
      return (
        <div className="p-4 flex-1">
          <EmptyState icon={<Archive />}>{t('backups.emptyRuns')}</EmptyState>
        </div>
      )
    }

    return (
      <div className="p-3 space-y-2 overflow-y-auto flex-1">
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <ListRowIcon>
                {run.storageKind === 's3' ? (
                  <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </ListRowIcon>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-[var(--win-text)] truncate">{run.resourceName}</span>
                  <Badge tone={run.status === 'success' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}>
                    {run.status}
                  </Badge>
                  <Badge tone="neutral">{run.storageKind.toUpperCase()}</Badge>
                  {run.sizeBytes > 0 ? <span className="panel-mono text-[11.5px] text-[var(--text-secondary)]">{formatBytes(run.sizeBytes)}</span> : null}
                </div>
                <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">
                  {new Date(run.startedAt).toLocaleString()}
                  {run.sha256 ? ` · sha256:${run.sha256.slice(0, 12)}` : ''}
                </p>
                {run.errorMessage ? (
                  <p className="mt-0.5 text-[11.5px] text-[var(--panel-danger-text)] break-words">{run.errorMessage}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {run.status === 'success' ? (
                <>
                  <a
                    href={backupRunDownloadUrl(run.id)}
                    download
                    className="panel-btn panel-btn--ghost panel-btn--sm inline-flex items-center gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>{t('backups.download')}</span>
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={restoringRunId === run.id}
                    onClick={() => void confirmRestoreRun(run)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>{t('backups.restoreNow')}</span>
                  </Button>
                </>
              ) : null}
              <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => void confirmDeleteRun(run)}>
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Storage targets
  const targets = (data?.targets ?? []).filter(
    (tg) => !q || tg.name.toLowerCase().includes(q) || (tg.s3Bucket ?? '').toLowerCase().includes(q) || (tg.localDir ?? '').toLowerCase().includes(q),
  )
  if (targets.length === 0) {
    return (
      <div className="p-4 flex-1 flex flex-col items-center justify-center gap-3 text-center">
        <EmptyState icon={<Cloud />}>{t('backups.emptyTargets')}</EmptyState>
        <Button size="sm" variant="primary" onClick={() => setAddTargetOpen(true)}>
          {t('backups.addTarget')}
        </Button>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto flex-1">
      {targets.map((tg) => (
        <div
          key={tg.id}
          className="flex flex-wrap items-center justify-between gap-2.5 rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2.5"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <ListRowIcon>
              {tg.kind === 's3' ? (
                <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />
              ) : (
                <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
            </ListRowIcon>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-semibold text-[var(--win-text)] truncate">{tg.name}</span>
                <Badge tone={tg.kind === 's3' ? 'primary' : 'neutral'}>{tg.kind === 's3' ? 'S3 / R2' : t('backups.localStorage')}</Badge>
              </div>
              <p className="panel-mono text-[11.5px] text-[var(--text-secondary)] truncate">
                {tg.kind === 's3'
                  ? `${tg.s3Bucket}${tg.s3Prefix ? '/' + tg.s3Prefix : ''} · ${tg.s3Endpoint || tg.s3Region}`
                  : tg.localDir}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              loading={testingTargetId === tg.id}
              onClick={() => testTargetMut.mutate(tg)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('backups.testConnection')}</span>
            </Button>
            <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => void confirmDeleteTarget(tg)}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
      ))}
    </div>
  )
}
