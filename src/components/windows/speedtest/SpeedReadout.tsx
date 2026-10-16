import type { ReactNode } from 'react'
import { Activity, ArrowDown, ArrowUp, Timer } from 'lucide-react'
import { IconBadge } from '@/components/ui/IconBadge'
import { useI18n } from '@/lib/i18n'
import type { BrowserSpeedResult } from '@/api/speedtest'

function Stat({ icon, label, value, unit }: { icon: ReactNode; label: string; value: string; unit: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3">
      <IconBadge size="sm">{icon}</IconBadge>
      <div className="min-w-0">
        <div className="text-[0.75rem] text-[var(--text-secondary)]">{label}</div>
        <div className="panel-mono text-[1.125rem] font-semibold leading-tight">
          {value} <span className="text-[0.75rem] font-normal text-[var(--text-secondary)]">{unit}</span>
        </div>
      </div>
    </div>
  )
}

// Four result figures; "-" until a test has produced them
export function SpeedStats({ result }: { result: BrowserSpeedResult | null }) {
  const { t } = useI18n()
  const fmt = (n?: number) => (n === undefined ? '-' : n.toFixed(n < 10 ? 1 : 0))
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Stat icon={<ArrowDown />} label={t('speedtest.download')} value={fmt(result?.downloadMbps)} unit="Mbps" />
      <Stat icon={<ArrowUp />} label={t('speedtest.upload')} value={fmt(result?.uploadMbps)} unit="Mbps" />
      <Stat icon={<Timer />} label={t('speedtest.latency')} value={fmt(result?.latencyMs)} unit="ms" />
      <Stat icon={<Activity />} label={t('speedtest.jitter')} value={fmt(result?.jitterMs)} unit="ms" />
    </div>
  )
}
