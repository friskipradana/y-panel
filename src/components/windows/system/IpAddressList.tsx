import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
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

function Row({ entry }: { entry: IpEntry }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-[var(--panel-surface-hover)] px-3 py-2">
      <code className="panel-mono break-all text-[12px] text-[var(--win-text)]" title={entry.address}>{entry.address}</code>
      {entry.iface ? <Badge tone="neutral">{entry.iface}</Badge> : null}
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

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex max-h-[240px] flex-col gap-1.5 overflow-y-auto pr-0.5">
        {v4.map((entry) => <Row key={`${entry.address}-${entry.iface}`} entry={entry} />)}
        {showV6 ? v6.map((entry) => <Row key={`${entry.address}-${entry.iface}`} entry={entry} />) : null}
      </ul>
      {v6.length > 0 ? (
        <Button variant="ghost" size="sm" icon={showV6 ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} onClick={() => setShowV6((v) => !v)} className="self-start">
          {showV6 ? t('system.ipHideV6') : t('system.ipShowV6', { count: v6.length })}
        </Button>
      ) : null}
    </div>
  )
}
