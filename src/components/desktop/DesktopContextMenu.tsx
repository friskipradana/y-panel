import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownAZ,
  Check,
  Grid2x2,
  LayoutGrid,
  Move,
  RotateCcw,
  Rows3,
  Eye,
  Magnet,
} from 'lucide-react'
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

function MenuItem({
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
  return (
    <button
      type="button"
      role={radio ? 'menuitemradio' : checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={radio || checked !== undefined ? Boolean(checked) : undefined}
      disabled={disabled}
      className="group flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-[var(--win-text)] transition hover:bg-[var(--panel-surface-hover)] focus:bg-[var(--panel-surface-hover)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      onClick={onClick}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--panel-primary-text)]" aria-hidden="true">
        {radio ? (
          checked ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--panel-primary-solid)]" /> : null
        ) : checked ? (
          <Check size={12} strokeWidth={2.5} />
        ) : null}
      </span>
      {icon ? <span className="shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--win-text)]">{icon}</span> : null}
      <span className="flex-1 truncate">{label}</span>
      {hint ? <span className="text-[10px] text-[var(--text-secondary)] opacity-60 font-mono">{hint}</span> : null}
    </button>
  )
}

interface DesktopContextMenuProps {
  x: number
  y: number
  onClose: () => void
  role?: string | null
}

export function DesktopContextMenu({ x, y, onClose, role }: DesktopContextMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const size = useThemeStore((s) => s.desktopIconSize)
  const setSize = useThemeStore((s) => s.setDesktopIconSize)
  const {
    show,
    autoArrange,
    alignToGrid,
    freeWidgets,
    editing,
    setShow,
    setAutoArrange,
    setAlignToGrid,
    setFreeWidgets,
    setEditing,
    sort,
    reset,
  } = useDesktopIconStore()

  const resetLayout = useWidgetStore((s) => s.resetLayout)
  const lockedWidgets = useWidgetStore((s) => s.placedWidgets.filter((w) => w.isLocked).length)

  const apps = useMemo(() => DESKTOP_SHORTCUTS.filter((app) => canAccessWindow(app.windowId, role)), [role])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

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
    onClose()
  }

  const resetAll = () => {
    reset()
    resetLayout()
    toast.success(
      t('desktop.view.resetDone'),
      lockedWidgets > 0 ? { description: t('desktop.view.resetLocked', { count: lockedWidgets }) } : undefined,
    )
    onClose()
  }

  // Initial estimate to avoid flicker, flipping upwards if near bottom
  const [coords, setCoords] = useState<{ left: number; top: number }>(() => {
    const MENU_HEIGHT = 440
    const MENU_WIDTH = 230
    const padding = 12
    const flipY = y + MENU_HEIGHT + padding > window.innerHeight
    const flipX = x + MENU_WIDTH + padding > window.innerWidth
    return {
      left: flipX ? Math.max(padding, x - MENU_WIDTH) : x,
      top: flipY ? Math.max(padding, y - MENU_HEIGHT) : y,
    }
  })

  // Measure exact rendered dimensions and adjust position
  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const padding = 12

    let left = x
    if (x + rect.width + padding > window.innerWidth) {
      left = Math.max(padding, x - rect.width)
    }

    let top = y
    // If not enough room below, flip upwards so the bottom of the menu aligns with the cursor
    if (y + rect.height + padding > window.innerHeight) {
      top = Math.max(padding, y - rect.height)
    }

    setCoords({ left, top })
  }, [x, y])

  return (
    <div
      ref={menuRef}
      className="fixed z-[63000] w-[230px] max-h-[calc(100vh-24px)] overflow-y-auto rounded-xl border border-[var(--menu-border)] bg-[var(--menu-bg)] p-1.5 shadow-[var(--menu-shadow)] backdrop-blur-2xl"
      style={{ left: coords.left, top: coords.top }}
      role="menu"
      aria-label="Desktop context menu"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Icon size group */}
      <div className="border-b border-[var(--win-border)] pb-1 mb-1">
        <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-70">
          {t('desktop.view.title')}
        </p>
        {SIZES.map((item) => (
          <MenuItem
            key={item.key}
            radio
            checked={size === item.key}
            icon={item.key === 'small' ? <Grid2x2 size={13} /> : <LayoutGrid size={item.key === 'large' ? 14 : 13} />}
            label={t(item.label)}
            hint={item.shortcut}
            onClick={() => setSize(item.key)}
          />
        ))}
      </div>

      {/* Sort group */}
      <div className="border-b border-[var(--win-border)] pb-1 mb-1">
        <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] opacity-70">
          {t('desktop.view.sortBy')}
        </p>
        <MenuItem icon={<ArrowDownAZ size={13} />} label={t('desktop.view.sortName')} onClick={() => sortBy('name')} />
        <MenuItem icon={<Rows3 size={13} />} label={t('desktop.view.sortType')} onClick={() => sortBy('type')} />
        <MenuItem icon={<RotateCcw size={13} />} label={t('desktop.view.sortDefault')} onClick={() => sortBy('default')} />
      </div>

      {/* Placement toggles */}
      <div className="border-b border-[var(--win-border)] pb-1 mb-1">
        <MenuItem icon={<Rows3 size={13} />} label={t('desktop.view.autoArrange')} checked={autoArrange} onClick={() => setAutoArrange(!autoArrange)} />
        <MenuItem icon={<Magnet size={13} />} label={t('desktop.view.alignGrid')} checked={alignToGrid} onClick={() => setAlignToGrid(!alignToGrid)} />
        <MenuItem icon={<Move size={13} />} label={t('desktop.view.freeWidgets')} checked={freeWidgets} onClick={() => setFreeWidgets(!freeWidgets)} />
        <MenuItem icon={<Eye size={13} />} label={t('desktop.view.showIcons')} checked={show} onClick={() => setShow(!show)} />
      </div>

      {/* Action group */}
      <div>
        <MenuItem
          icon={<Move size={13} />}
          label={t('desktop.view.editMode')}
          checked={editing}
          disabled={!show}
          onClick={() => {
            setEditing(!editing)
            onClose()
          }}
        />
        <MenuItem icon={<RotateCcw size={13} />} label={t('desktop.view.reset')} onClick={resetAll} />
      </div>
    </div>
  )
}
