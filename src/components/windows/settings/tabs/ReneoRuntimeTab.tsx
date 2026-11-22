import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { getDatabaseStatus, getSystemSummary } from '@/api/agent'
import { Badge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/states'
import { TextInput } from '@/components/ui/Field'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'
import { useWindowStore } from '@/store/windowStore'
import { useLivePolling } from '@/hooks/useLivePolling'
import { SettingsGroup } from '../SettingsPrimitives'
import type { RuntimeDatabaseLog } from '@/types'

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
export function ReneoRuntimeTab({ authenticated, active = true }: { authenticated?: boolean; active?: boolean }) {
  const { t } = useI18n()
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin'
  const openWindow = useWindowStore((state) => state.openWindow)
  const summaryPolling = useLivePolling(15_000)
  const summary = useQuery({ queryKey: ['agent-system-summary'], queryFn: getSystemSummary, retry: 1, refetchInterval: active ? summaryPolling : false, enabled: authenticated !== false })
  const database = useQuery({ queryKey: ['database-status'], queryFn: getDatabaseStatus, retry: 1, refetchInterval: active ? 15_000 : false, enabled: isSuperadmin && authenticated !== false })

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

  if (summary.isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[260px] my-auto">
        <LoadingState>{t('system.loadingRuntime')}</LoadingState>
      </div>
    )
  }
  const data = summary.data

  return (
    <div className="space-y-6">
      {/* ── 1. Runtime State Directory Group ── */}
      <SettingsGroup
        title={t('settings.runtime.statePath')}
        description={t('settings.runtime.statePathMeta')}
      >
        <TextInput
          id="settings-state-dir"
          readOnly
          mono
          value={data?.stateDir || '-'}
          className="!h-8 px-2.5 text-[12px] opacity-90 font-mono"
        />
      </SettingsGroup>

      {/* ── 2. Recent Incidents & Reconcile Log Group ── */}
      <SettingsGroup
        title={t('system.recentIncidents')}
      >
        {incidents.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 px-3 text-[12px] text-[var(--text-secondary)]">
            <AlertTriangle className="h-4 w-4 opacity-50 shrink-0" />
            <span>{t('system.noRecentIncidents')}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
            {incidents.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => openProjectsAttention(entry)}
                className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] p-2.5 text-left transition-colors hover:bg-[var(--panel-surface-hover)] hover:border-[var(--panel-primary-border)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={entry.level === 'warning' ? 'warning' : entry.level === 'error' ? 'danger' : 'info'}>{entry.level}</Badge>
                  <span className="text-[12px] font-semibold text-[var(--win-text)]">{entry.message}</span>
                  <span className="ml-auto text-[11px] font-mono text-[var(--text-secondary)]">{new Date(entry.createdAt).toLocaleString('id-ID')}</span>
                </div>
                {entry.metadata && entry.metadata !== '{}' ? (
                  <p className="mt-1 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] truncate">
                    {entry.metadata}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--panel-primary-text)]">{t('system.openProjectsAttention')}</p>
              </button>
            ))}
          </div>
        )}
      </SettingsGroup>
    </div>
  )
}
