import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowDownAZ, Check, ChevronDown, Grid2x2, LayoutGrid, Move, RotateCcw, Rows3, Eye, Magnet, PanelsTopLeft } from 'lucide-react'
import { DESKTOP_SHORTCUTS, canAccessWindow } from '@/components/desktop/windowRegistry'
import { MENU_ITEMS, CATEGORIES } from '@/components/taskbar/appCatalog'
import { useI18n, windowTitleKey } from '@/lib/i18n'
import { useDesktopIconStore, type IconSort } from '@/store/desktopIconStore'
import { useThemeStore, type DesktopIconSize } from '@/store/themeStore'
import { useWidgetStore } from '@/store/widgetStore'

const SIZES: Array<{ key: DesktopIconSize; label: string; shortcut: string }> = [
  { key: 'large', label: 'desktop.view.sizeLarge', shortcut: 'Ctrl+Shift+2' },
  { key: 'medium', label: 'desktop.view.sizeMedium', shortcut: 'Ctrl+Shift+3' },
  { key: 'small', label: 'desktop.view.sizeSmall', shortcut: 'Ctrl+Shift+4' },
]

function Item({
  icon,
  label,
  hint,
  checked,
  radio,
  disabled,
  onClick,
}: {
  icon?: ReactNode
  label: string
  hint?: string
  checked?: boolean
  radio?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const role = radio ? 'menuitemradio' : checked !== undefined ? 'menuitemcheckbox' : 'menuitem'
  return (
    <button type="button" role={role} aria-checked={radio || checked !== undefined ? Boolean(checked) : undefined} disabled={disabled} className="taskbar-view-item" onClick={onClick}>
      <span className="taskbar-view-item__mark" aria-hidden="true">
        {radio ? checked ? <span className="taskbar-view-item__dot" /> : null : checked ? <Check size={13} /> : null}
      </span>
      {icon ? <span className="taskbar-view-item__icon">{icon}</span> : null}
      <span className="taskbar-view-item__label">{label}</span>
      {hint ? <span className="taskbar-view-item__hint">{hint}</span> : null}
    </button>
  )
}

// "View" of the taskbar, next to Applications: size, order and place of the icons of the desktop
export function ViewMenu({ role }: { role?: string | null }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const size = useThemeStore((s) => s.desktopIconSize)
  const setSize = useThemeStore((s) => s.setDesktopIconSize)
  const { show, autoArrange, alignToGrid, freeWidgets, editing, setShow, setAutoArrange, setAlignToGrid, setFreeWidgets, setEditing, sort, reset } = useDesktopIconStore()

  const resetLayout = useWidgetStore((s) => s.resetLayout)
  const lockedWidgets = useWidgetStore((s) => s.placedWidgets.filter((w) => w.isLocked).length)

  // icons back on the grid in their default order, widgets back in the default columns
  // (a locked widget stays where it was locked)
  const resetAll = () => {
    reset()
    resetLayout()
    toast.success(t('desktop.view.resetDone'), lockedWidgets > 0 ? { description: t('desktop.view.resetLocked', { count: lockedWidgets }) } : undefined)
    setOpen(false)
  }

  const apps = useMemo(() => DESKTOP_SHORTCUTS.filter((app) => canAccessWindow(app.windowId, role)), [role])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const sortBy = (kind: IconSort) => {
    const title = (id: string) => t(windowTitleKey(apps.find((a) => a.id === id)?.windowId ?? id))
    const category = (id: string) => {
      const item = MENU_ITEMS.find((m) => m.kind === apps.find((a) => a.id === id)?.windowId)
      const at = CATEGORIES.findIndex((c) => c.key === item?.category)
      return at < 0 ? CATEGORIES.length : at
    }
    const ids = apps.map((a) => a.id)
    if (kind === 'name') ids.sort((a, b) => title(a).localeCompare(title(b)))
    else if (kind === 'type') ids.sort((a, b) => category(a) - category(b) || title(a).localeCompare(title(b)))
    sort(kind === 'default' ? [] : ids)
    setOpen(false)
  }

  return (
    <div className="taskbar-view-wrapper" ref={ref}>
      <button
        type="button"
        id="taskbar-view-btn"
        className="group flex h-7 select-none items-center gap-1.5 border-0 bg-transparent px-1.5 opacity-55 shadow-none outline-none ring-0 transition-opacity duration-150 hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] aria-expanded:opacity-100"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <PanelsTopLeft size={15} strokeWidth={1.75} className="shrink-0 text-[var(--tb-text)]" aria-hidden="true" />
        <span className="font-sans text-[13px] font-medium tracking-normal text-[var(--tb-text)]">{t('desktop.view.title')}</span>
        <ChevronDown size={12} className={`text-[var(--tb-text)] opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open ? (
          <div className="taskbar-view-drawer">
            <motion.div
              initial={{ opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="taskbar-view-menu"
              role="menu"
              aria-label={t('desktop.view.title')}
            >
              <div className="taskbar-view-menu__group">
                {SIZES.map((item) => (
                  <Item
                    key={item.key}
                    radio
                    checked={size === item.key}
                    icon={item.key === 'small' ? <Grid2x2 size={15} /> : <LayoutGrid size={item.key === 'large' ? 17 : 15} />}
                    label={t(item.label)}
                    hint={item.shortcut}
                    onClick={() => setSize(item.key)}
                  />
                ))}
              </div>

              <div className="taskbar-view-menu__group">
                <p className="taskbar-view-menu__label">{t('desktop.view.sortBy')}</p>
                <Item icon={<ArrowDownAZ size={15} />} label={t('desktop.view.sortName')} onClick={() => sortBy('name')} />
                <Item icon={<Rows3 size={15} />} label={t('desktop.view.sortType')} onClick={() => sortBy('type')} />
                <Item icon={<RotateCcw size={15} />} label={t('desktop.view.sortDefault')} onClick={() => sortBy('default')} />
              </div>

              <div className="taskbar-view-menu__group">
                <Item icon={<Rows3 size={15} />} label={t('desktop.view.autoArrange')} checked={autoArrange} onClick={() => setAutoArrange(!autoArrange)} />
                <Item icon={<Magnet size={15} />} label={t('desktop.view.alignGrid')} checked={alignToGrid} onClick={() => setAlignToGrid(!alignToGrid)} />
                <Item icon={<Move size={15} />} label={t('desktop.view.freeWidgets')} checked={freeWidgets} onClick={() => setFreeWidgets(!freeWidgets)} />
                <Item icon={<Eye size={15} />} label={t('desktop.view.showIcons')} checked={show} onClick={() => setShow(!show)} />
              </div>

              <div className="taskbar-view-menu__group">
                <Item
                  icon={<Move size={15} />}
                  label={t('desktop.view.editMode')}
                  checked={editing}
                  disabled={!show}
                  onClick={() => {
                    setEditing(!editing)
                    setOpen(false)
                  }}
                />
                <Item icon={<RotateCcw size={15} />} label={t('desktop.view.reset')} onClick={resetAll} />
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
