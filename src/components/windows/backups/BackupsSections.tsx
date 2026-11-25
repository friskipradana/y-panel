import {
  Archive,
  Box,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  FolderCode,
  HardDrive,
  LoaderCircle,
  Play,
  RotateCcw,
  Settings,
  Trash2,
} from 'lucide-react'
import { backupRunDownloadUrl } from '@/api/backups'
import { Badge } from '@/components/ui/Badge'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
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

function statusPill(status: string): 'running' | 'dead' | 'paused' | 'exited' {
  if (status === 'success') return 'running'
  if (status === 'failed') return 'dead'
  if (status === 'running') return 'paused'
  return 'exited'
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
  } = bw

  const data = overviewQ.data
  const q = search.trim().toLowerCase()

  if (section === 'jobs') {
    const jobs = (data?.jobs ?? []).filter(
      (j) => !q || j.name.toLowerCase().includes(q) || j.resourceName.toLowerCase().includes(q) || j.targetName.toLowerCase().includes(q),
    )

    return (
      <ListTable
        variant="backups-jobs"
        empty={overviewQ.isLoading || overviewQ.isError || jobs.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('backups.col.job') },
          { label: t('backups.col.target') },
          { label: t('docker.colStatus') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={overviewQ.isLoading}
          error={overviewQ.isError}
          errorTitle={t('backups.loadFailed')}
          errorHint={(overviewQ.error as Error)?.message}
          loadingText={t('backups.loading')}
          empty={jobs.length === 0}
          emptyIcon={<Archive />}
          emptyTitle={t('backups.emptyJobs')}
        >
          {jobs.map((job, idx) => {
            const running = runningJobId === job.id
            const scheduleText = job.intervalHours > 0 ? t('backups.everyHours', { hours: job.intervalHours }) : t('backups.manualOnly')
            const retentionText = t('backups.keepCount', { count: job.retentionCount })
            return (
              <div key={job.id} className="docker-row">
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <ListRowIcon>{scopeIcon(job.scope)}</ListRowIcon>
                  <div className="docker-row__text">
                    <div className="docker-row__title">
                      <span className="docker-app-name" title={job.name}>{job.name}</span>
                      <Badge tone={job.scope === 'database' ? 'primary' : 'info'}>{job.scope}</Badge>
                    </div>
                    <span className="docker-row__sub panel-mono" title={job.resourceName}>{job.resourceName}</span>
                    <span className="docker-row__meta panel-mono">{`${job.targetName || '-'} · ${scheduleText} · ${retentionText}`}</span>
                  </div>
                </div>
                <div className="docker-cell" title={`${job.targetName || '-'} · ${scheduleText} · ${retentionText}`}>
                  <span className="docker-cell__strong">{job.targetName || '-'} ({job.targetKind || 'local'})</span>
                  <span className="panel-mono text-[0.6875rem]">{scheduleText} · {retentionText}</span>
                </div>
                <div className="docker-cell--keep">
                  <span className={`docker-status-pill docker-status-pill--${statusPill(job.lastStatus)}`}>
                    <span className="docker-status-dot" />
                    <span>{job.lastStatus}</span>
                  </span>
                </div>
                <div className="docker-action-btns">
                  <ToggleSwitch checked={job.enabled} onChange={() => toggleJobMut.mutate(job)} label={t('backups.toggleJob')} />
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--start"
                    title={t('backups.runNow')}
                    aria-label={t('backups.runNow')}
                    disabled={running}
                    aria-busy={running}
                    onClick={() => runJobMut.mutate(job)}
                  >
                    {running ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <Play className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  </button>
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--danger"
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    onClick={() => void confirmDeleteJob(job)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>
    )
  }

  if (section === 'runs') {
    const runs = (data?.runs ?? []).filter(
      (r) => !q || r.resourceName.toLowerCase().includes(q) || r.jobName.toLowerCase().includes(q) || r.storageKey.toLowerCase().includes(q),
    )

    return (
      <ListTable
        variant="backups-runs"
        empty={overviewQ.isLoading || overviewQ.isError || runs.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          { label: t('backups.col.run') },
          { label: t('docker.col.size') },
          { label: t('docker.colStatus') },
          { label: t('docker.colActions'), actions: true },
        ]}
      >
        <ListState
          loading={overviewQ.isLoading}
          error={overviewQ.isError}
          errorTitle={t('backups.loadFailed')}
          errorHint={(overviewQ.error as Error)?.message}
          loadingText={t('backups.loading')}
          empty={runs.length === 0}
          emptyIcon={<Archive />}
          emptyTitle={t('backups.emptyRuns')}
        >
          {runs.map((run, idx) => {
            const restoring = restoringRunId === run.id
            const started = new Date(run.startedAt).toLocaleString()
            return (
              <div key={run.id} className="docker-row">
                <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
                <div className="docker-row__app">
                  <ListRowIcon>
                    {run.storageKind === 's3' ? <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} /> : <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  </ListRowIcon>
                  <div className="docker-row__text">
                    <div className="docker-row__title">
                      <span className="docker-app-name" title={run.resourceName}>{run.resourceName}</span>
                      <Badge tone="neutral">{run.storageKind.toUpperCase()}</Badge>
                    </div>
                    <span className="docker-row__sub panel-mono" title={run.errorMessage || run.storageKey}>
                      {started}
                      {run.sha256 ? ` · sha256:${run.sha256.slice(0, 10)}` : ''}
                      {run.errorMessage ? ` · ${run.errorMessage}` : ''}
                    </span>
                    <span className="docker-row__meta panel-mono">{`${formatBytes(run.sizeBytes)} · ${started}`}</span>
                  </div>
                </div>
                <div className="docker-cell docker-cell--mono">{run.sizeBytes > 0 ? formatBytes(run.sizeBytes) : '-'}</div>
                <div className="docker-cell--keep">
                  <span className={`docker-status-pill docker-status-pill--${statusPill(run.status)}`}>
                    <span className="docker-status-dot" />
                    <span>{run.status}</span>
                  </span>
                </div>
                <div className="docker-action-btns">
                  {run.status === 'success' ? (
                    <>
                      <button
                        type="button"
                        className="docker-act-btn"
                        title={t('backups.download')}
                        aria-label={t('backups.download')}
                        onClick={() => window.open(backupRunDownloadUrl(run.id), '_blank', 'noopener')}
                      >
                        <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        className="docker-act-btn docker-act-btn--restart"
                        title={t('backups.restoreNow')}
                        aria-label={t('backups.restoreNow')}
                        disabled={restoring}
                        aria-busy={restoring}
                        onClick={() => void confirmRestoreRun(run)}
                      >
                        {restoring ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="docker-act-btn docker-act-btn--danger"
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    onClick={() => void confirmDeleteRun(run)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>
    )
  }

  // Storage targets
  const targets = (data?.targets ?? []).filter(
    (tg) => !q || tg.name.toLowerCase().includes(q) || (tg.s3Bucket ?? '').toLowerCase().includes(q) || (tg.localDir ?? '').toLowerCase().includes(q),
  )

  return (
    <ListTable
      variant="backups-targets"
      empty={overviewQ.isLoading || overviewQ.isError || targets.length === 0}
      columns={[
        { label: t('docker.colIndex') },
        { label: t('backups.col.storage') },
        { label: t('backups.col.type') },
        { label: t('backups.col.location') },
        { label: t('docker.colActions'), actions: true },
      ]}
    >
      <ListState
        loading={overviewQ.isLoading}
        error={overviewQ.isError}
        errorTitle={t('backups.loadFailed')}
        errorHint={(overviewQ.error as Error)?.message}
        loadingText={t('backups.loading')}
        empty={targets.length === 0}
        emptyIcon={<Cloud />}
        emptyTitle={t('backups.emptyTargets')}
      >
        {targets.map((tg, idx) => {
          const testing = testingTargetId === tg.id
          const loc = tg.kind === 's3'
            ? `${tg.s3Bucket}${tg.s3Prefix ? '/' + tg.s3Prefix : ''} · ${tg.s3Endpoint || tg.s3Region}`
            : tg.localDir || '-'
          return (
            <div key={tg.id} className="docker-row">
              <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <ListRowIcon>
                  {tg.kind === 's3' ? <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} /> : <HardDrive className="h-3.5 w-3.5" strokeWidth={1.75} />}
                </ListRowIcon>
                <div className="docker-row__text">
                  <span className="docker-app-name" title={tg.name}>{tg.name}</span>
                  <span className="docker-row__meta panel-mono">{loc}</span>
                </div>
              </div>
              <div className="docker-cell--keep">
                <Badge tone={tg.kind === 's3' ? 'primary' : 'neutral'}>
                  {tg.kind === 's3' ? 'S3 / R2' : t('backups.localStorage')}
                </Badge>
              </div>
              <div className="docker-cell docker-cell--mono" title={loc}>{loc}</div>
              <div className="docker-action-btns">
                <button
                  type="button"
                  className="docker-act-btn docker-act-btn--start"
                  title={t('backups.testConnection')}
                  aria-label={t('backups.testConnection')}
                  disabled={testing}
                  aria-busy={testing}
                  onClick={() => testTargetMut.mutate(tg)}
                >
                  {testing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} /> : <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
                </button>
                <button
                  type="button"
                  className="docker-act-btn docker-act-btn--danger"
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
                  onClick={() => void confirmDeleteTarget(tg)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          )
        })}
      </ListState>
    </ListTable>
  )
}
