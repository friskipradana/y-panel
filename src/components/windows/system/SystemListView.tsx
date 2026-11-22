import { useMemo, type ReactNode } from 'react'
import {
  Activity,
  Boxes,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  Globe2,
  HardDriveDownload,
  MemoryStick,
  Network,
  Server,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import type { SystemCounts, SystemSummary } from '@/types'
import { Badge } from '@/components/ui/Badge'

interface SystemListViewProps {
  data: SystemSummary
  counts?: SystemCounts
  memoryPercent: number
  storagePercent: number
  formatBytes: (bytes: number) => string
  formatUptime: (seconds: number) => string
  t: (key: string, params?: Record<string, string | number>) => string
}

function ListSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="panel-section-label">{title}</p>
      <div className="rounded-[6px] border border-[var(--win-border)] bg-[var(--panel-surface)] divide-y divide-[var(--win-border)] overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function ListRow({
  icon,
  label,
  value,
  meta,
  progress,
  action,
}: {
  icon?: ReactNode
  label: ReactNode
  value: ReactNode
  meta?: ReactNode
  progress?: { percent: number; level?: 'ok' | 'warn' | 'crit' }
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4 px-3 py-2 text-xs transition-colors hover:bg-[var(--panel-surface-hover)]">
      {/* Top tier (Mobile) / Left side (Desktop) */}
      <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {icon ? <span className="text-[var(--text-secondary)] shrink-0">{icon}</span> : null}
          <span className="font-medium text-[var(--win-text)] truncate">{label}</span>
        </div>
        <div className="sm:hidden flex items-center gap-2 shrink-0">
          {value ? <span className="font-semibold text-[var(--win-text)]">{value}</span> : null}
          {action}
        </div>
      </div>

      {/* Bottom tier (Mobile) / Right side (Desktop) */}
      <div className="flex items-center gap-3 sm:ml-auto flex-wrap sm:flex-nowrap justify-between sm:justify-end min-w-0 w-full sm:w-auto">
        {progress ? (
          <div className="flex items-center gap-2 flex-1 sm:flex-initial sm:w-40 min-w-0">
            <div className="h-1.5 w-full rounded-[2px] bg-[color-mix(in_srgb,var(--text-secondary)_15%,transparent)] overflow-hidden">
              <div
                className={`h-full rounded-[2px] transition-all ${
                  progress.level === 'crit'
                    ? 'bg-[var(--panel-danger-text)]'
                    : progress.level === 'warn'
                    ? 'bg-[var(--panel-warning-text)]'
                    : 'bg-[var(--panel-primary-text)]'
                }`}
                style={{ width: `${Math.min(progress.percent, 100)}%` }}
              />
            </div>
            <span className="panel-mono text-[11px] font-semibold text-[var(--win-text)] w-10 text-right shrink-0">
              {progress.percent.toFixed(1)}%
            </span>
          </div>
        ) : null}

        <div className="hidden sm:flex items-center gap-2">
          {value ? <span className="font-semibold text-[var(--win-text)]">{value}</span> : null}
          {meta ? <span className="text-[11px] text-[var(--text-secondary)]">{meta}</span> : null}
          {action}
        </div>

        {meta ? (
          <div className="sm:hidden text-[11px] text-[var(--text-secondary)] break-words w-full">
            {meta}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function SystemListView({
  data,
  counts,
  memoryPercent,
  storagePercent,
  formatBytes,
  formatUptime,
  t,
}: SystemListViewProps) {
  const ipList = useMemo(() => {
    return (data.ipAddresses ?? []).map((raw: string) => {
      const match = raw.match(/^(.*?)\s*\((.+)\)$/)
      return match ? { address: match[1], iface: match[2] } : { address: raw, iface: '' }
    })
  }, [data.ipAddresses])

  const cpuLevel = data.cpuUsagePercent >= 90 ? 'crit' : data.cpuUsagePercent >= 75 ? 'warn' : 'ok'
  const memLevel = memoryPercent >= 90 ? 'crit' : memoryPercent >= 75 ? 'warn' : 'ok'
  const diskLevel = storagePercent >= 90 ? 'crit' : storagePercent >= 75 ? 'warn' : 'ok'

  return (
    <div className="space-y-4">
      {/* 1. Host & Platform */}
      <ListSection title={t('system.hostRuntime')}>
        <ListRow
          icon={<Server size={14} />}
          label="OS & Kernel"
          value={data.osName}
          meta={<span className="panel-mono text-[11px] opacity-80">{data.hostname} &middot; Linux {data.kernel}</span>}
        />
        <ListRow
          icon={<Activity size={14} />}
          label={t('system.uptime')}
          value={<span className="panel-mono font-medium text-[var(--panel-primary-text)]">{formatUptime(data.uptimeSeconds)}</span>}
        />
        <ListRow
          icon={<Boxes size={14} />}
          label="Docker Engine"
          value={
            <div className="flex items-center gap-1.5">
              <Badge tone={data.dockerInstalled ? 'success' : 'danger'}>
                {data.dockerInstalled ? <CheckCircle2 size={12} /> : <ShieldAlert size={12} />}
                {data.dockerInstalled ? t('system.dockerInstalled') : t('system.dockerMissing')}
              </Badge>
              <Badge tone={data.dockerReachable ? 'success' : 'danger'}>
                {data.dockerReachable ? <CheckCircle2 size={12} /> : <ShieldAlert size={12} />}
                {data.dockerReachable ? t('system.dockerReachable') : t('system.dockerUnreachable')}
              </Badge>
            </div>
          }
        />
      </ListSection>

      {/* 2. Resources */}
      <ListSection title={t('system.sectionResources')}>
        <ListRow
          icon={<Cpu size={14} />}
          label={t('system.cpuUsage')}
          value=""
          progress={{ percent: data.cpuUsagePercent, level: cpuLevel }}
        />
        <ListRow
          icon={<MemoryStick size={14} />}
          label={t('system.memoryRam')}
          value={<span className="panel-mono">{formatBytes(data.memory.used)} / {formatBytes(data.memory.total)}</span>}
          progress={{ percent: memoryPercent, level: memLevel }}
        />
        <ListRow
          icon={<HardDriveDownload size={14} />}
          label={t('system.storage')}
          value={<span className="panel-mono">{formatBytes(data.storage.used)} / {formatBytes(data.storage.total)}</span>}
          progress={{ percent: storagePercent, level: diskLevel }}
        />
      </ListSection>

      {/* 3. Workloads & Infrastructure */}
      <ListSection title={t('system.sectionWorkloads')}>
        <ListRow
          icon={<Activity size={14} />}
          label={t('system.projectsTotal')}
          value={`${data.projects?.total ?? 0}`}
          meta={
            <span>
              {data.projects?.active ?? 0} {t('system.projectsActive').toLowerCase()}
              {data.projects?.attention ? (
                <span className="text-[var(--panel-danger-text)] font-semibold ml-1.5">
                  &middot; {data.projects.attention} {t('system.needAttention').toLowerCase()}
                </span>
              ) : null}
            </span>
          }
        />
        {counts?.docker ? (
          <ListRow
            icon={<Boxes size={14} />}
            label="Docker Workloads"
            value={`${counts.docker.running} / ${counts.docker.containers} containers`}
            meta={
              <span className="panel-mono">
                {counts.docker.images} images &middot; {counts.docker.volumes} vol &middot; {counts.docker.networks} net
              </span>
            }
          />
        ) : null}
        {counts?.databases ? (
          <ListRow
            icon={<Database size={14} />}
            label={t('system.count.databases')}
            value={`${counts.databases.running} / ${counts.databases.total}`}
            meta={<span>{t('system.count.databasesHint')}</span>}
          />
        ) : null}
        {counts?.routes ? (
          <ListRow
            icon={<Network size={14} />}
            label={t('system.count.routes')}
            value={`${counts.routes.active} / ${counts.routes.total}`}
            meta={<span>{t('system.count.routesHint')}</span>}
          />
        ) : null}
        {counts?.cloudflare && counts.cloudflare.configured ? (
          <ListRow
            icon={<Globe2 size={14} />}
            label="Cloudflare Zones & Tunnels"
            value={`${counts.cloudflare.zonesActive} / ${counts.cloudflare.zones} zones`}
            meta={<span className="panel-mono">{counts.cloudflare.profilesLive} / {counts.cloudflare.profiles} tunnels</span>}
          />
        ) : null}
        {counts?.users ? (
          <ListRow
            icon={<Users size={14} />}
            label={t('system.count.users')}
            value={`${counts.users.active} / ${counts.users.total}`}
            meta={counts.users.suspended ? <span className="text-[var(--panel-warning-text)]">({counts.users.suspended} suspended)</span> : null}
          />
        ) : null}
      </ListSection>

      {/* 4. Active Network Interfaces */}
      {ipList.length > 0 ? (
        <ListSection title={t('system.ipAddress')}>
          {ipList.map((entry: { address: string; iface: string }) => (
            <div
              key={`${entry.address}-${entry.iface}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-xs transition-colors hover:bg-[var(--panel-surface-hover)]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Network size={14} className="text-[var(--text-secondary)] shrink-0" />
                <Badge tone="neutral" size="sm">{entry.iface || 'eth'}</Badge>
                <code className="panel-mono text-[12px] text-[var(--win-text)] font-semibold select-all truncate" title={entry.address}>
                  {entry.address}
                </code>
              </div>
              <button
                type="button"
                className="docker-icon-btn h-6 w-6 shrink-0"
                title={t('common.copy')}
                aria-label={t('common.copy')}
                onClick={() => {
                  navigator.clipboard.writeText(entry.address).then(() => {
                    toast.success(t('common.copied'))
                  })
                }}
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          ))}
        </ListSection>
      ) : null}
    </div>
  )
}
