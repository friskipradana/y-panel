import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getUserUsage, type PanelUser, type UserQuota } from '@/api/agent'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'

interface UserQuotaPanelProps {
  user: PanelUser
  quota: UserQuota
  saving: boolean
  onSave: (patch: Partial<UserQuota>) => void
}

const FIELDS: { key: keyof UserQuota; labelKey: string }[] = [
  { key: 'maxProjects', labelKey: 'users.maxProjects' },
  { key: 'maxTunnels', labelKey: 'users.maxTunnels' },
  { key: 'maxDatabases', labelKey: 'users.maxDatabases' },
  { key: 'diskQuotaMb', labelKey: 'users.diskMb' },
  { key: 'cpuLimitPct', labelKey: 'users.cpuLimitPct' },
  { key: 'memoryLimitMb', labelKey: 'users.ramMb' },
]

function UsageMeter({ label, used, limit, unit }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const over = limit > 0 && used >= limit
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className={`panel-mono ${over ? 'text-[var(--panel-danger-text)]' : ''}`}>
          {used}
          {unit ? ` ${unit}` : ''} / {limit}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--panel-surface)]"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: over ? 'var(--panel-danger-text)' : 'var(--panel-info-text)' }}
        />
      </div>
    </div>
  )
}

// Quota editor with live usage next to the limits
export function UserQuotaPanel({ user, quota, saving, onSave }: UserQuotaPanelProps) {
  const { t } = useI18n()
  const [edit, setEdit] = useState<Partial<UserQuota>>({})
  const usage = useQuery({ queryKey: ['usage', user.id], queryFn: () => getUserUsage(user.id), staleTime: 15_000 })
  const dirty = Object.keys(edit).length > 0

  return (
    <div className="space-y-4 border-t border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-3.5">
      <section aria-label={t('users.usage')}>
        <p className="mb-2 text-[12px] font-medium text-[var(--text-secondary)]">{t('users.usage')}</p>
        {usage.isLoading ? (
          <LoadingState>{t('users.usageLoading')}</LoadingState>
        ) : usage.data ? (
          <div className="space-y-2.5">
            <UsageMeter label={t('users.usageProjects')} used={usage.data.projects} limit={quota.maxProjects} />
            <UsageMeter label={t('users.usageTunnels')} used={usage.data.tunnels} limit={quota.maxTunnels} />
            <UsageMeter label={t('users.usageDatabases')} used={usage.data.databases} limit={quota.maxDatabases} />
            <UsageMeter label={t('users.usageDisk')} used={usage.data.diskUsedMb} limit={quota.diskQuotaMb} unit="MB" />
            <p className="text-[12px] text-[var(--text-secondary)]">
              {t('users.usageRunning', { count: usage.data.projectsActive })}
              {usage.data.diskScanPartial ? ` · ${t('users.usagePartial')}` : ''}
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-[var(--text-secondary)]">{t('users.usageFailed')}</p>
        )}
      </section>

      <section aria-label={t('users.resourceQuota')}>
        <p className="mb-2 text-[12px] font-medium text-[var(--text-secondary)]">{t('users.resourceQuota')}</p>
        <div className="panel-grid-compact panel-grid-compact--3">
          {FIELDS.map(({ key, labelKey }) => (
            <Field key={key} label={t(labelKey)}>
              <TextInput
                type="number"
                min={0}
                defaultValue={quota[key]}
                onChange={(e) => setEdit((q) => ({ ...q, [key]: Number(e.target.value) }))}
              />
            </Field>
          ))}
        </div>
        <Button
          onClick={() => onSave(edit)}
          disabled={!dirty}
          loading={saving}
          variant="primary-soft"
          className="mt-3 w-full"
        >
          {t('users.saveQuota')}
        </Button>
      </section>
    </div>
  )
}
