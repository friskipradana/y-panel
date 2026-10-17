import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { Z } from '@/lib/zLayers'
import { useCommandStore } from '@/store/commandStore'
import { useI18n } from '@/lib/i18n'
import { PaletteRow } from './palette/PaletteRow'
import { paletteScore } from './palette/score'
import { loadRecent, rememberRecent, usePaletteEntries, type PaletteEntry, type PaletteGroup } from './palette/usePaletteEntries'

const GROUP_ORDER: PaletteGroup[] = ['open', 'apps', 'account', 'settings', 'widgets', 'actions']

const GROUP_CLASS =
  'px-1 pb-2 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--text-secondary)] [&_[cmdk-group-items]]:space-y-0.5'

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border border-[var(--win-border)] bg-[var(--panel-surface-strong)] px-1.5 py-0.5 font-semibold text-[var(--win-text)]">{children}</kbd>
}

// Quick search (Ctrl+K, the magnifier of the taskbar and of the phone): apps, settings tabs, widgets
// and actions, limited to what the signed-in account may use. It is rendered only while open, so
// every opening starts with an empty search.
export function CommandPalette() {
  const isOpen = useCommandStore((s) => s.isOpen)
  const close = useCommandStore((s) => s.closeCommandPalette)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  return <AnimatePresence>{isOpen ? <PaletteDialog close={close} /> : null}</AnimatePresence>
}

function PaletteDialog({ close }: { close: () => void }) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [recent] = useState(loadRecent)
  const entries = usePaletteEntries(close, true)

  const run = (entry: PaletteEntry) => {
    if (entry.disabled) return
    if (entry.recordable) rememberRecent(entry.id)
    entry.run()
  }

  const byGroup = useMemo(() => {
    const map = new Map<PaletteGroup, PaletteEntry[]>()
    for (const entry of entries) map.set(entry.group, [...(map.get(entry.group) ?? []), entry])
    return map
  }, [entries])
  const recents = useMemo(() => recent.map((id) => entries.find((entry) => entry.id === id)).filter((entry): entry is PaletteEntry => !!entry && !entry.disabled), [entries, recent])

  return (
    <div className="fixed inset-0 flex select-none items-start justify-center p-4 pt-[12dvh]" style={{ zIndex: Z.commandPalette }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        onClick={close}
        className="fixed inset-0 bg-black/55 backdrop-blur-sm"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.label')}
        initial={{ opacity: 0, scale: 0.97, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -6 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--win-border)] bg-[var(--win-bg)] text-[var(--win-text)] shadow-2xl"
      >
        <Command loop filter={paletteScore} label={t('commandPalette.label')} className="flex w-full flex-col focus:outline-none">
          <div className="flex items-center gap-3 border-b border-[var(--win-border)] px-4 py-3.5">
            <Search size={18} className="shrink-0 text-[var(--panel-primary-text)]" aria-hidden="true" />
            <Command.Input
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder={t('commandPalette.placeholder')}
              className="w-full bg-transparent text-[14px] max-md:text-base text-[var(--win-text)] placeholder:text-[var(--text-secondary)]/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={close}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[var(--win-border)] bg-[var(--panel-surface-strong)] text-[var(--text-secondary)] transition-colors hover:text-[var(--win-text)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              title={t('commandPalette.closeHint')}
              aria-label={t('common.close')}
            >
              <X size={13} />
            </button>
          </div>

          <Command.List className="custom-widget-scrollbar max-h-[min(55dvh,420px)] overflow-y-auto p-2 focus:outline-none">
            <Command.Empty className="py-10 text-center text-xs text-[var(--text-secondary)]">{t('commandPalette.empty')}</Command.Empty>

            {search === '' && recents.length > 0 ? (
              <Command.Group heading={t('palette.group.recent')} className={GROUP_CLASS}>
                {recents.map((entry) => (
                  <PaletteRow key={entry.id} entry={entry} scope="recent" onRun={run} />
                ))}
              </Command.Group>
            ) : null}

            {GROUP_ORDER.map((group) => {
              const items = byGroup.get(group)
              if (!items?.length) return null
              return (
                <Command.Group key={group} heading={t(`palette.group.${group}`)} className={GROUP_CLASS}>
                  {items.map((entry) => (
                    <PaletteRow key={entry.id} entry={entry} scope={group} onRun={run} />
                  ))}
                </Command.Group>
              )
            })}
          </Command.List>

          <div className="flex items-center justify-between border-t border-[var(--win-border)] bg-[var(--panel-surface)] px-4 py-2 text-[11px] text-[var(--text-secondary)]">
            <div className="flex items-center gap-3 font-mono text-[10px]">
              <span className="flex items-center gap-1"><Kbd>↑↓</Kbd>{t('commandPalette.navigate')}</span>
              <span className="flex items-center gap-1"><Kbd>↵</Kbd>{t('commandPalette.select')}</span>
              <span className="flex items-center gap-1"><Kbd>Esc</Kbd>{t('commandPalette.close')}</span>
            </div>
            <span className="font-mono text-[10px] opacity-70 max-sm:hidden">Ctrl + K</span>
          </div>
        </Command>
      </motion.div>
    </div>
  )
}
