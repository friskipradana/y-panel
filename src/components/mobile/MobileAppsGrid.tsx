import { useMemo, useState } from 'react'
import { ArrowDownAZ, Check, ChevronLeft, ChevronRight, LayoutGrid, Move, RotateCcw, Rows3 } from 'lucide-react'
import { AppIcon } from '@/components/common/AppIcon'
import { CATEGORIES, MENU_ITEMS } from '@/components/taskbar/appCatalog'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { useI18n, windowTitleKey } from '@/lib/i18n'
import { useDesktopIconStore } from '@/store/desktopIconStore'
import type { DesktopIconSize } from '@/store/themeStore'
import type { WindowKind } from '@/types'

// How many tiles a row holds, and how big the icon in a tile is
const SIZES: Record<DesktopIconSize, { cols: string; icon: number; label: string }> = {
  large: { cols: 'grid-cols-2', icon: 36, label: 'text-[0.8125rem]' },
  medium: { cols: 'grid-cols-3', icon: 28, label: 'text-[0.75rem]' },
  small: { cols: 'grid-cols-4', icon: 24, label: 'text-[0.6875rem]' },
}

const SIZE_KEYS: DesktopIconSize[] = ['large', 'medium', 'small']
const SIZE_LABEL: Record<DesktopIconSize, string> = {
  large: 'desktop.view.sizeLarge',
  medium: 'desktop.view.sizeMedium',
  small: 'desktop.view.sizeSmall',
}

// The apps of the phone home, with the same choices as the View menu of the desktop: size of the
// tiles, order (by name, by type or the default), and a mode to move an app earlier or later.
// The order belongs to the phone: it never changes the arrangement of the desktop.
export function MobileAppsGrid({ apps, onLaunch }: { apps: WindowKind[]; onLaunch: (kind: WindowKind) => void }) {
  const { t } = useI18n()
  const { mobileSize, mobileOrder, setMobileSize, setMobileOrder, resetMobile } = useDesktopIconStore()
  const [viewOpen, setViewOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const ordered = useMemo(() => {
    const known = mobileOrder.filter((kind): kind is WindowKind => apps.includes(kind as WindowKind)) as WindowKind[]
    return [...known, ...apps.filter((kind) => !known.includes(kind))]
  }, [apps, mobileOrder])

  const size = SIZES[mobileSize] ?? SIZES.medium

  const sortBy = (kind: 'name' | 'type' | 'default') => {
    const title = (app: WindowKind) => t(windowTitleKey(app))
    const category = (app: WindowKind) => {
      const at = CATEGORIES.findIndex((c) => c.key === MENU_ITEMS.find((m) => m.kind === app)?.category)
      return at < 0 ? CATEGORIES.length : at
    }
    const next = [...apps]
    if (kind === 'name') next.sort((a, b) => title(a).localeCompare(title(b)))
    else if (kind === 'type') next.sort((a, b) => category(a) - category(b) || title(a).localeCompare(title(b)))
    setMobileOrder(kind === 'default' ? [] : next)
  }

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta
    if (to < 0 || to >= ordered.length) return
    const next = [...ordered]
    ;[next[index], next[to]] = [next[to], next[index]]
    setMobileOrder(next)
  }

  return (
    <section aria-label={t('mobile.apps')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[0.75rem] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">{t('mobile.apps')}</h2>
        {editing ? (
          <Button size="sm" variant="primary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setEditing(false)}>
            {t('desktop.view.done')}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" icon={<LayoutGrid className="h-3.5 w-3.5" />} onClick={() => setViewOpen(true)} aria-haspopup="dialog">
            {t('desktop.view.title')}
          </Button>
        )}
      </div>
      {editing ? <p className="mb-2 text-[0.75rem] text-[var(--text-secondary)]" role="status">{t('mobile.view.editHint')}</p> : null}

      <ul className={`grid ${size.cols} gap-2`}>
        {ordered.map((app, index) =>
          editing ? (
            <li key={app} className="flex min-h-[5.25rem] flex-col items-center justify-between gap-1 rounded-xl border border-dashed border-[var(--win-border-focus)] bg-[var(--panel-surface)] px-1 py-2 text-center">
              <AppIcon kind={app} size={size.icon} />
              <span className={`line-clamp-2 w-full break-words ${size.label} font-medium leading-tight`}>{t(windowTitleKey(app))}</span>
              <div className="flex items-center gap-0.5">
                <IconButton label={t('mobile.view.moveEarlier')} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ChevronLeft className="h-4 w-4" />
                </IconButton>
                <IconButton label={t('mobile.view.moveLater')} disabled={index === ordered.length - 1} onClick={() => move(index, 1)}>
                  <ChevronRight className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          ) : (
            <li key={app}>
              <button
                type="button"
                onClick={() => onLaunch(app)}
                className="flex min-h-[5.25rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-1 py-3 text-center transition-colors active:bg-[var(--panel-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <AppIcon kind={app} size={size.icon} />
                <span className={`line-clamp-2 w-full break-words ${size.label} font-medium leading-tight`}>{t(windowTitleKey(app))}</span>
              </button>
            </li>
          ),
        )}
      </ul>

      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={t('desktop.view.title')}
        icon={<LayoutGrid />}
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setViewOpen(false)}>
            {t('desktop.view.done')}
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[0.75rem] font-medium text-[var(--text-secondary)]">{t('mobile.view.size')}</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('mobile.view.size')}>
              {SIZE_KEYS.map((key) => (
                <Button key={key} role="radio" aria-checked={mobileSize === key} variant={mobileSize === key ? 'primary-soft' : 'default'} onClick={() => setMobileSize(key)}>
                  {t(SIZE_LABEL[key])}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[0.75rem] font-medium text-[var(--text-secondary)]">{t('desktop.view.sortBy')}</p>
            <div className="grid grid-cols-3 gap-2">
              <Button icon={<ArrowDownAZ className="h-3.5 w-3.5" />} onClick={() => sortBy('name')}>{t('desktop.view.sortName')}</Button>
              <Button icon={<Rows3 className="h-3.5 w-3.5" />} onClick={() => sortBy('type')}>{t('desktop.view.sortType')}</Button>
              <Button icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => sortBy('default')}>{t('desktop.view.sortDefault')}</Button>
            </div>
          </div>

          <div className="space-y-2">
            <Button block icon={<Move className="h-3.5 w-3.5" />} onClick={() => { setViewOpen(false); setEditing(true) }}>
              {t('mobile.view.editMode')}
            </Button>
            <Button block variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetMobile}>
              {t('mobile.view.reset')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
