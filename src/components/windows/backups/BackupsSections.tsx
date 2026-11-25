import {
  Archive,
  Box,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  FolderCode,
  HardDrive,
  Play,
  RotateCcw,
  Settings,
  Trash2,
} from 'lucide-react'
import { backupRunDownloadUrl } from '@/api/backups'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { IconButton } from '@/components/ui/IconButton'
import { ListRowIcon } from '@/components/ui/ListTable'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
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

function scopeIcon(scope: string) {
  if (scope === 'database') return <Database className="h-3.5 w-3.5" strokeWidth={1.75} />
  if (scope === 'docker-volume') return <Box className="h-3.5 w-3.5" strokeWidth={1.75} />
  if (scope === 'panel-config') return <Settings className="h-3.5 w-3.5" strokeWidth={1.75} />
  return <FolderCode className="h-3.5 w-3.5" strokeWidth={1.75} />
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
      <div className="p-6 flex-1">
        <LoadingState>{t('backups.loading')}</LoadingState>
      </div>
    )
  }

  if (overviewQ.isError) {
    return (
      <div className="p-6 flex-1">
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
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <EmptyState icon={<Archive />}>{t('backups.emptyJobs')}</EmptyState>
          {(data?.targets.length ?? 0) === 0 ? (
            <Button variant="primary" onClick={() => setAddTargetOpen(true)}>
              {t('backups.addTarget')}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setAddJobOpen(true)}>
              {t('backups.addJob')}
            </Button>
          )}
        </div>
      )
    }

    return (
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {jobs.map((job) => (
          <EntityRow
            key={job.id}
            centered
            leading={<ListRowIcon>{scopeIcon(job.scope)}</ListRowIcon>}
            title={job.name}
            badges={
              <>
                <Badge tone={job.scope === 'database' ? 'primary' : 'info'}>{job.scope}</Badge>
                <Badge tone={job.lastStatus === 'success' ? 'success' : job.lastStatus === 'failed' ? 'danger' : 'neutral'} dot>
                  {job.lastStatus}
                </Badge>
              </>
            }
            subtitle={
              <span className="panel-mono">
                {job.resourceName} · {job.targetName || '-'} ({job.targetKind || 'local'}) ·{' '}
                {job.intervalHours > 0 ? t('backups.everyHours', { hours: job.intervalHours }) : t('backups.manualOnly')} ·{' '}
                {t('backups.keepCount', { count: job.retentionCount })}
              </span>
            }
            actions={
              <>
                <ToggleSwitch
                  checked={job.enabled}
                  onChange={() => toggleJobMut.mutate(job)}
                  label={t('backups.toggleJob')}
                />
                <Button
                  size="sm"
                  variant="primary-soft"
                  icon={<Play className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  loading={runningJobId === job.id}
                  onClick={() => runJobMut.mutate(job)}
                >
                  {t('backups.runNow')}
                </Button>
                <IconButton size="sm" variant="ghost" tone="danger" label={t('common.delete')} onClick={() => void confirmDeleteJob(job)}>
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
              </>
            }
          />
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
        <div className="p-6 flex-1">
          <EmptyState icon={<Archive />}>{t('backups.emptyRuns')}</EmptyState>
        </div>
      )
    }

    return (
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {runs.map((run) => (
          <EntityRow
            key={run.id}
            centered
            leading={
              <ListRowIcon>
                {run.storageKind === 's3' ? (
                  <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </ListRowIcon>
            }
            title={run.resourceName}
            badges={
              <>
                <Badge tone={run.status === 'success' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'} dot>
                  {run.status}
                </Badge>
                <Badge tone="neutral">{run.storageKind.toUpperCase()}</Badge>
                {run.sizeBytes > 0 ? <Badge tone="info">{formatBytes(run.sizeBytes)}</Badge> : null}
              </>
            }
            subtitle={
              <span className="panel-mono">
                {new Date(run.startedAt).toLocaleString()}
                {run.sha256 ? ` · sha256:${run.sha256.slice(0, 12)}` : ''}
              </span>
            }
            description={
              run.errorMessage ? (
                <p className="mt-1 text-[0.75rem] text-[var(--panel-danger-text)] break-words">{run.errorMessage}</p>
              ) : undefined
            }
            actions={
              <>
                {run.status === 'success' ? (
                  <>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={t('backups.download')}
                      onClick={() => window.open(backupRunDownloadUrl(run.id), '_blank', 'noopener')}
                    >
                      <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </IconButton>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />}
                      loading={restoringRunId === run.id}
                      onClick={() => void confirmRestoreRun(run)}
                    >
                      {t('backups.restoreNow')}
                    </Button>
                  </>
                ) : null}
                <IconButton size="sm" variant="ghost" tone="danger" label={t('common.delete')} onClick={() => void confirmDeleteRun(run)}>
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </IconButton>
              </>
            }
          />
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
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <EmptyState icon={<Cloud />}>{t('backups.emptyTargets')}</EmptyState>
        <Button variant="primary" onClick={() => setAddTargetOpen(true)}>
          {t('backups.addTarget')}
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
      {targets.map((tg) => (
        <EntityRow
          key={tg.id}
          centered
          leading={
            <ListRowIcon>
              {tg.kind === 's3' ? (
                <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />
              ) : (
                <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
            </ListRowIcon>
          }
          title={tg.name}
          badges={
            <Badge tone={tg.kind === 's3' ? 'primary' : 'neutral'}>
              {tg.kind === 's3' ? 'S3 / R2' : t('backups.localStorage')}
            </Badge>
          }
          subtitle={
            <span className="panel-mono">
              {tg.kind === 's3'
                ? `${tg.s3Bucket}${tg.s3Prefix ? '/' + tg.s3Prefix : ''} · ${tg.s3Endpoint || tg.s3Region}`
                : tg.localDir}
            </span>
          }
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                icon={<CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
                loading={testingTargetId === tg.id}
                onClick={() => testTargetMut.mutate(tg)}
              >
                {t('backups.testConnection')}
              </Button>
              <IconButton size="sm" variant="ghost" tone="danger" label={t('common.delete')} onClick={() => void confirmDeleteTarget(tg)}>
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
            </>
          }
        />
      ))}
    </div>
  )
}
