import { useMemo, useState } from 'react'
import { Activity, ArrowDown, ArrowUp, Server, Terminal } from 'lucide-react'
import { IconBadge } from '@/components/ui/IconBadge'
import { useSystemSummary } from '@/hooks/useSystemSampler'
import { asRange } from '@/store/metricsStore'
import { useRangeSeries } from '@/store/liveStore'
import { useWidgetStore } from '@/store/widgetStore'
import { useI18n } from '@/lib/i18n'
import { LineChart, RangeSwitch } from './LineChart'
import type { WidgetProps } from './types'

const TAB_STORAGE_KEY = 'reneo-widget-network-active-tab'

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s'
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

type Tab = 'speed' | 'interfaces'

interface HostAddress {
  iface: string
  ip: string
  v6: boolean
}

// The agent reports "ip (iface)"; split it and put IPv4 first, link-local last
function parseAddresses(list: string[] | undefined): HostAddress[] {
  const out: HostAddress[] = []
  for (const raw of list ?? []) {
    const m = raw.match(/^(.+?)\s*\(([^)]+)\)$/)
    const ip = (m ? m[1] : raw).trim()
    if (!ip) continue
    out.push({ ip, iface: m ? m[2] : '', v6: ip.includes(':') })
  }
  const rank = (a: HostAddress) => (a.v6 ? (a.ip.toLowerCase().startsWith('fe80') ? 2 : 1) : 0)
  return out.sort((a, b) => rank(a) - rank(b))
}

export function NetworkTrafficWidget({ widget }: WidgetProps) {
  const { t } = useI18n()
  const { data: summary } = useSystemSummary()
  const updateConfig = useWidgetStore((s) => s.updateWidgetConfig)
  const range = asRange(widget.config?.range)

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    try {
      return localStorage.getItem(TAB_STORAGE_KEY) === 'interfaces' ? 'interfaces' : 'speed'
    } catch {
      return 'speed'
    }
  })

  const changeTab = (tab: Tab) => {
    setActiveTab(tab)
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab)
    } catch {
      // storage unavailable: tab choice is not persisted
    }
  }

  const rx = useRangeSeries('net-rx', range)
  const tx = useRangeSeries('net-tx', range)
  const rxNow = rx[rx.length - 1]?.v ?? 0
  const txNow = tx[tx.length - 1]?.v ?? 0

  const series = useMemo(
    () => [
      { key: 'net-rx', label: 'DL', color: 'var(--panel-success-text)', points: rx },
      { key: 'net-tx', label: 'UP', color: 'var(--panel-info-text)', points: tx },
    ],
    [rx, tx],
  )

  const addresses = useMemo(() => parseAddresses(summary?.ipAddresses), [summary?.ipAddresses])
  const visibleAddresses = addresses.slice(0, 4)

  const tabButton = (tab: Tab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === tab}
      onClick={() => changeTab(tab)}
      className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
        activeTab === tab
          ? 'border border-[var(--panel-primary-text)]/30 bg-[var(--panel-primary-bg)] font-semibold text-[var(--panel-primary-text)]'
          : 'border border-transparent text-[var(--text-secondary)] hover:text-[var(--win-text)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="flex flex-1 select-none flex-col gap-2.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="hidden min-w-0 truncate font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)] @[300px]:block">{t('widget.net.title')}</span>
        <div
          role="tablist"
          aria-label={t('widget.net.title')}
          className="mx-auto inline-flex shrink-0 items-center rounded-full border p-[2px] @[300px]:mx-0"
          style={{ backgroundColor: 'var(--panel-surface-strong)', borderColor: 'var(--win-border)' }}
        >
          {tabButton('speed', <Activity size={10} />, t('widget.net.tabSpeed'))}
          {tabButton('interfaces', <Terminal size={10} />, t('widget.net.tabHost'))}
        </div>
      </div>

      {activeTab === 'speed' ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div className="flex flex-col rounded-lg border p-1.5" style={{ backgroundColor: 'var(--panel-surface-strong)', borderColor: 'var(--win-border)' }}>
              <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                <span className="flex items-center gap-1 font-semibold text-[var(--panel-success-text)]">
                  <ArrowDown size={11} />
                  DL
                </span>
                <span className="font-mono text-[9px]">{summary?.networkIO?.bytesRecv ? formatBytes(summary.networkIO.bytesRecv) : '-'}</span>
              </div>
              <div className="mt-0.5 truncate font-mono text-[13px] font-bold text-[var(--panel-success-text)]">{formatSpeed(rxNow)}</div>
            </div>
            <div className="flex flex-col rounded-lg border p-1.5" style={{ backgroundColor: 'var(--panel-surface-strong)', borderColor: 'var(--win-border)' }}>
              <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                <span className="flex items-center gap-1 font-semibold text-[var(--panel-info-text)]">
                  <ArrowUp size={11} />
                  UP
                </span>
                <span className="font-mono text-[9px]">{summary?.networkIO?.bytesSent ? formatBytes(summary.networkIO.bytesSent) : '-'}</span>
              </div>
              <div className="mt-0.5 truncate font-mono text-[13px] font-bold text-[var(--panel-info-text)]">{formatSpeed(txNow)}</div>
            </div>
          </div>

          <LineChart ariaLabel={t('widget.net.aria')} range={range} height={58} format={formatSpeed} series={series} />

          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-3 font-mono text-[9px] text-[var(--text-secondary)]">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--panel-success-text)' }} />
                RX
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--panel-info-text)' }} />
                TX
              </span>
            </div>
            <RangeSwitch label={t('widget.graph.range')} value={range} onChange={(r) => updateConfig(widget.id, { range: r })} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2" style={{ backgroundColor: 'var(--panel-surface-strong)', borderColor: 'var(--win-border)' }}>
            <IconBadge size="sm" tone="info">
              <Server />
            </IconBadge>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[0.8125rem] font-semibold text-[var(--win-text)]" title={summary?.hostname}>
                {summary?.hostname || '-'}
              </div>
              <div className="truncate text-[10.5px] text-[var(--text-secondary)]" title={`${summary?.osName ?? ''} ${summary?.kernel ?? ''}`}>
                {[summary?.osName, summary?.kernel].filter(Boolean).join(' · ') || '-'}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-0.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{t('widget.net.addresses')}</span>
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">{addresses.length}</span>
            </div>
            {visibleAddresses.length === 0 ? (
              <div className="rounded-lg border px-2.5 py-2 text-[11px] text-[var(--text-secondary)]" style={{ borderColor: 'var(--win-border)' }}>
                {t('widget.net.noAddress')}
              </div>
            ) : (
              visibleAddresses.map((addr) => (
                <div
                  key={`${addr.iface}-${addr.ip}`}
                  className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1 font-mono text-[11px]"
                  style={{ backgroundColor: 'var(--panel-surface-strong)', borderColor: 'var(--win-border)' }}
                >
                  <span className="shrink-0 text-[10px] text-[var(--text-secondary)]">{addr.iface || (addr.v6 ? 'IPv6' : 'IPv4')}</span>
                  <span className="min-w-0 truncate font-semibold text-[var(--panel-info-text)]" title={addr.ip}>
                    {addr.ip}
                  </span>
                </div>
              ))
            )}
            {addresses.length > visibleAddresses.length ? (
              <span className="px-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                {t('widget.net.more', { count: addresses.length - visibleAddresses.length })}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
