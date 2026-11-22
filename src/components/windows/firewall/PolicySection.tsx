import { Database, FileClock, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import type { LoggingLevel, Policy, PolicyDirection } from '@/api/firewall'
import { Badge } from '@/components/ui/Badge'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Select } from '@/components/ui/Select'
import { SettingRow } from '@/components/ui/SettingRow'
import { ErrorState, LoadingState } from '@/components/ui/states'
import type { FirewallWindowState } from './useFirewallWindow'

const DIRECTIONS: PolicyDirection[] = ['incoming', 'outgoing', 'routed']
const POLICIES: Policy[] = ['allow', 'deny', 'reject']
const LEVELS: LoggingLevel[] = ['off', 'low', 'medium', 'high']

// The defaults of ufw and its log, the ports the panel keeps open for you, and what the firewall does not cover
export function PolicySection({ fw }: { fw: FirewallWindowState }) {
  const { t, data, query, busy, setDefault, setLogging } = fw
  if (query.isLoading) return <div className="p-6"><LoadingState>{t('firewall.loading')}</LoadingState></div>
  if (query.isError || !data) return <div className="p-6"><ErrorState title={t('firewall.loadFailed')} hint={t('firewall.loadFailedHint')} /></div>
  const ufw = data.ufw
  const usable = ufw.installed && ufw.active

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5 sm:p-4">
      <div className="panel-shell-card settings-card flex flex-col !p-3.5 !gap-3">
        <SectionHeader icon={<SlidersHorizontal />} title={t('firewall.policy.title')} subtitle={usable ? t('firewall.policy.subtitle') : t('firewall.policy.needsActive')} tone="primary" className="mb-0" />
        {DIRECTIONS.map((direction) => (
          <SettingRow
            key={direction}
            title={t(`firewall.policy.${direction}`)}
            description={t(`firewall.policy.${direction}Hint`)}
            control={
              <Select
                size="sm"
                disabled={!usable || busy !== null}
                value={(ufw[direction] || 'deny') as Policy}
                onChange={(value) => void setDefault(direction, value as Policy)}
                options={POLICIES.map((p) => ({ value: p, label: t(`firewall.action.${p}`) }))}
              />
            }
          />
        ))}
        <SettingRow
          title={t('firewall.logging.title')}
          description={t('firewall.logging.hint')}
          icon={<FileClock />}
          control={
            <Select
              size="sm"
              disabled={!usable || busy !== null}
              value={(ufw.logging || 'off') as LoggingLevel}
              onChange={(value) => void setLogging(value as LoggingLevel)}
              options={LEVELS.map((l) => ({ value: l, label: t(`firewall.logging.${l}`) }))}
            />
          }
        />
      </div>

      <div className="panel-shell-card settings-card flex flex-col !p-3.5 !gap-3">
        <SectionHeader icon={<ShieldAlert />} title={t('firewall.protected.title')} subtitle={t('firewall.protected.subtitle')} tone="warning" className="mb-0" />
        <div className="flex flex-wrap gap-1.5">
          {data.protected.map((p) => (
            <Badge key={p.port} tone="info">
              <span className="panel-mono">{p.port}</span> · {t(`firewall.reason.${p.reason}`)}
            </Badge>
          ))}
        </div>
      </div>

      <div className="panel-shell-card settings-card flex flex-col !p-3.5 !gap-3">
        <SectionHeader icon={<Database />} title={t('firewall.databases.title')} subtitle={t('firewall.databases.subtitle')} tone="neutral" className="mb-0" />
        {data.databases.length === 0 ? (
          <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('firewall.databases.none')}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.databases.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[var(--win-border)] px-3 py-2 text-[0.8125rem]">
                <span className="font-semibold">{d.name}</span>
                <span className="panel-mono text-[var(--text-secondary)]">:{d.port}</span>
                <span className="text-[var(--text-secondary)]">{d.owner}</span>
                <span className="panel-mono ml-auto text-[0.75rem]">{d.ips.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('firewall.docker.note')}</p>
      </div>
    </div>
  )
}
