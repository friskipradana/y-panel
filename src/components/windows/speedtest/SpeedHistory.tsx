import { History } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { formatDateTimeID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import type { HistoryItem } from './useSpeedtestWindow'

// Last results, kept in this browser only
export function SpeedHistory({ items }: { items: HistoryItem[] }) {
  const { t } = useI18n()
  if (items.length === 0) return null
  return (
    <div className="panel-shell-card space-y-3 p-4">
      <SectionHeader icon={<History />} title={t('speedtest.history')} subtitle={t('speedtest.historyHint')} />
      <ul className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)]">
        {items.map((item) => (
          <li key={`${item.kind}-${item.at}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[0.8125rem]">
            <Badge tone={item.kind === 'server' ? 'info' : 'neutral'}>
              {item.kind === 'server' ? t('speedtest.tab.server') : t('speedtest.tab.browser')}
            </Badge>
            {item.kind === 'server' && item.server ? <span className="panel-mono text-[0.75rem] text-[var(--text-secondary)]">{item.server}</span> : null}
            <span className="panel-mono">
              {t('speedtest.historyLine', { down: item.downloadMbps, up: item.canUpload === false ? '-' : item.uploadMbps, ping: item.latencyMs })}
            </span>
            <span className="ml-auto text-[0.75rem] text-[var(--text-secondary)]">{formatDateTimeID(new Date(item.at))}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
