import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'

interface IpEntry {
  address: string
  iface: string
}

// The agent sends "address (interface)"
function parseEntry(raw: string): IpEntry {
  const match = raw.match(/^(.*?)\s*\((.+)\)$/)
  return match ? { address: match[1], iface: match[2] } : { address: raw, iface: '' }
}

function Row({ entry, copyLabel, copiedLabel }: { entry: IpEntry; copyLabel: string; copiedLabel: string }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-[var(--panel-surface-hover)] px-3 py-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <code className="panel-mono break-all text-[12px] text-[var(--win-text)] font-semibold select-all" title={entry.address}>
          {entry.address}
        </code>
        {entry.iface ? <Badge tone="neutral" size="sm">{entry.iface}</Badge> : null}
      </div>
      <button
        type="button"
        className="docker-icon-btn h-6 w-6 shrink-0"
        title={copyLabel}
        aria-label={copyLabel}
        onClick={() => {
          navigator.clipboard.writeText(entry.address).then(() => {
            toast.success(copiedLabel)
          })
        }}
      >
        <Copy className="h-3 w-3" />
      </button>
    </li>
  )
}

// Addresses of the host: IPv4 first, IPv6 behind a button, and a list that scrolls instead of growing the card
export function IpAddressList({ addresses }: { addresses: string[] }) {
  const { t } = useI18n()
  const [showV6, setShowV6] = useState(false)
  const { v4, v6 } = useMemo(() => {
    const entries = addresses.map(parseEntry)
    return { v4: entries.filter((e) => !e.address.includes(':')), v6: entries.filter((e) => e.address.includes(':')) }
  }, [addresses])

  const copyLabel = t('common.copy')
  const copiedLabel = t('common.copied')

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex max-h-[240px] flex-col gap-1.5 overflow-y-auto pr-0.5">
        {v4.map((entry) => <Row key={`${entry.address}-${entry.iface}`} entry={entry} copyLabel={copyLabel} copiedLabel={copiedLabel} />)}
        {showV6 ? v6.map((entry) => <Row key={`${entry.address}-${entry.iface}`} entry={entry} copyLabel={copyLabel} copiedLabel={copiedLabel} />) : null}
      </ul>
      {v6.length > 0 ? (
        <Button variant="ghost" size="sm" icon={showV6 ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} onClick={() => setShowV6((v) => !v)} className="self-start">
          {showV6 ? t('system.ipHideV6') : t('system.ipShowV6', { count: v6.length })}
        </Button>
      ) : null}
    </div>
  )
}
