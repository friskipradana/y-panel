import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, FolderCog } from 'lucide-react'
import { getDatabaseStatus, getSystemSummary } from '@/api/agent'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { useWindowStore } from '@/store/windowStore'
import type { RuntimeDatabaseLog } from '@/types'

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <article className="panel-shell-card">
      <div className="mb-2.5 flex items-center gap-2 text-[var(--text-secondary)]">
        {icon}
        <span className="text-[13px] font-semibold text-[var(--win-text)]">{title}</span>
      </div>
      {children}
    </article>
  )
}

function extractProjectId(metadata: string) {
  if (!metadata || metadata === '{}') return null
  try {
    const parsed = JSON.parse(metadata) as { projectId?: number; projectID?: number }
    const raw = parsed.projectId ?? parsed.projectID
    const nextId = Number(raw ?? 0)
    return Number.isFinite(nextId) && nextId > 0 ? nextId : null
  } catch {
    const match = metadata.match(/"project(?:Id|ID)"\s*:\s*(\d+)/)
    if (!match) return null
    const nextId = Number(match[1])
    return Number.isFinite(nextId) && nextId > 0 ? nextId : null
  }
}

function extractAttentionType(message: string, metadata: string) {
  const haystack = `${message} ${metadata}`.toLowerCase()
  if (haystack.includes('drift')) return 'drift'
  if (haystack.includes('degraded') || haystack.includes('project status reconciled')) return 'degraded'
  return 'all'
}

// Reneo's own runtime: paths, integrations and project reconcile incidents. Superadmin only.
export function ReneoRuntimeTab({ authenticated }: { authenticated?: boolean }) {
  const { t } = useI18n()
  const openWindow = useWindowStore((state) => state.openWindow)
  const summary = useQuery({ queryKey: ['agent-system-summary'], queryFn: getSystemSummary, retry: 1, refetchInterval: 15_000, enabled: authenticated !== false })
  const database = useQuery({ queryKey: ['database-status'], queryFn: getDatabaseStatus, retry: 1, refetchInterval: 15_000, enabled: authenticated !== false })

  const incidents = useMemo(() => {
    const logs = database.data?.runtimeLogs ?? []
    return logs
      .filter((entry) => {
        const message = entry.message.toLowerCase()
        return message.includes('reconcile') || message.includes('drift') || message.includes('degraded')
      })
      .slice(0, 8)
  }, [database.data?.runtimeLogs])

  const openProjectsAttention = (entry: RuntimeDatabaseLog) => {
    const projectId = extractProjectId(entry.metadata)
    openWindow('projects', {
      attentionOnly: true,
      attentionType: extractAttentionType(entry.message, entry.metadata),
      highlightProjectId: projectId ?? undefined,
      incidentMessage: entry.message,
      incidentMetadata: entry.metadata,
      incidentAt: entry.createdAt,
    })
  }

  if (summary.isLoading) return <LoadingState>{t('system.loadingRuntime')}</LoadingState>
  const data = summary.data

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <InfoCard icon={<FolderCog size={15} />} title={t('settings.runtime.statePath')}>
          <code className="panel-mono block break-all text-[12px] leading-relaxed text-[var(--win-text)]">{data?.stateDir || '-'}</code>
          <p className="panel-shell-card__meta">{t('settings.runtime.statePathMeta')}</p>
        </InfoCard>

        <InfoCard icon={<Activity size={15} />} title={t('system.portainerIntegration')}>
          <p className="panel-section-label">{t('system.endpoint')}</p>
          <code className="panel-mono block break-all text-[12px] leading-relaxed text-[var(--win-text)]">{data?.portainerUrl || '-'}</code>
          <p className="panel-shell-card__meta">{t('system.portainerMeta')}</p>
        </InfoCard>
      </div>

      <InfoCard icon={<AlertTriangle size={15} />} title={t('system.recentIncidents')}>
        {incidents.length === 0 ? (
          <EmptyState icon={<AlertTriangle />}>{t('system.noRecentIncidents')}</EmptyState>
        ) : (
          <div className="flex flex-col gap-2.5">
            {incidents.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => openProjectsAttention(entry)}
                className="panel-muted-block rounded-[16px] px-3.5 py-3 text-left transition-colors hover:bg-[var(--panel-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={entry.level === 'warning' ? 'warning' : entry.level === 'error' ? 'danger' : 'info'}>{entry.level}</Badge>
                  <span className="text-[12px] font-semibold text-[var(--win-text)]">{entry.message}</span>
                  <span className="ml-auto text-[12px] text-[var(--text-secondary)]">{new Date(entry.createdAt).toLocaleString('id-ID')}</span>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                  {entry.metadata && entry.metadata !== '{}' ? entry.metadata : t('system.noIncidentMetadata')}
                </p>
                <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--panel-primary-text)]">{t('system.openProjectsAttention')}</p>
              </button>
            ))}
          </div>
        )}
      </InfoCard>
    </div>
  )
}
