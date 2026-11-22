import { Command } from 'cmdk'
import { CornerDownLeft } from 'lucide-react'
import type { PaletteEntry } from './usePaletteEntries'

interface PaletteRowProps {
  entry: PaletteEntry
  /** Prefix of the cmdk value, so the same entry can appear in "recent" and in its own group */
  scope: string
  onRun: (entry: PaletteEntry) => void
}

// One result: icon, title, description, and the shortcut or tag on the right
export function PaletteRow({ entry, scope, onRun }: PaletteRowProps) {
  return (
    <Command.Item
      value={`${scope}:${entry.id}`}
      keywords={[entry.title, entry.description ?? '', ...entry.keywords]}
      disabled={entry.disabled}
      onSelect={() => onRun(entry)}
      className="group flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2 text-xs transition-colors data-[selected=true]:border-[var(--panel-primary-text)]/25 data-[selected=true]:bg-[var(--panel-primary-bg)] data-[disabled=true]:cursor-default data-[disabled=true]:opacity-55"
    >
      <div className="flex min-w-0 items-center gap-3">
        {entry.icon}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold leading-snug text-[var(--win-text)]">{entry.title}</span>
          {entry.description ? <span className="truncate text-[11px] leading-snug text-[var(--text-secondary)]">{entry.description}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {entry.hint ? (
          <kbd className="rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] max-sm:hidden">{entry.hint}</kbd>
        ) : null}
        <CornerDownLeft size={13} className="text-[var(--panel-primary-text)] opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
      </div>
    </Command.Item>
  )
}
