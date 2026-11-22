import { create } from 'zustand'
import type { IconPoint } from '@/lib/desktopIconLayout'
import type { DesktopIconSize } from '@/store/themeStore'

// How the icons of the desktop are laid out. Kept in this browser, like the theme.

export type IconSort = 'name' | 'type' | 'default'

const STORAGE_KEY = 'reneo-desktop-icons'

interface Stored {
  show: boolean
  autoArrange: boolean
  alignToGrid: boolean
  // widgets go exactly where they are dropped: anywhere on the screen, over each other if need be
  freeWidgets: boolean
  order: string[]
  positions: Record<string, IconPoint>
  // the phone home: size of the tiles and order of the apps, apart from the desktop
  mobileSize: DesktopIconSize
  mobileOrder: string[]
}

const DEFAULTS: Stored = { show: true, autoArrange: true, alignToGrid: false, freeWidgets: true, order: [], positions: {}, mobileSize: 'medium', mobileOrder: [] }

function load(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Stored>
    return {
      show: parsed.show ?? DEFAULTS.show,
      autoArrange: parsed.autoArrange ?? DEFAULTS.autoArrange,
      alignToGrid: parsed.alignToGrid ?? DEFAULTS.alignToGrid,
      freeWidgets: parsed.freeWidgets ?? DEFAULTS.freeWidgets,
      order: Array.isArray(parsed.order) ? parsed.order.filter((id) => typeof id === 'string') : [],
      positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
      mobileSize: parsed.mobileSize === 'large' || parsed.mobileSize === 'small' ? parsed.mobileSize : 'medium',
      mobileOrder: Array.isArray(parsed.mobileOrder) ? parsed.mobileOrder.filter((id) => typeof id === 'string') : [],
    }
  } catch {
    return DEFAULTS
  }
}

function save(next: Stored) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // storage unavailable: the layout lasts until the page is closed
  }
}

interface DesktopIconState extends Stored {
  // the mode in which icons can be dragged; not kept
  editing: boolean
  setShow: (show: boolean) => void
  setAutoArrange: (autoArrange: boolean) => void
  setAlignToGrid: (alignToGrid: boolean) => void
  setFreeWidgets: (freeWidgets: boolean) => void
  setEditing: (editing: boolean) => void
  /** Applies an order (and drops free positions: the grid arranges the icons again) */
  sort: (order: string[]) => void
  /** Moves one icon to a place in the order (auto arrange) */
  reorder: (order: string[]) => void
  place: (id: string, point: IconPoint) => void
  /** The desktop back to its defaults; the phone is not touched */
  reset: () => void
  setMobileSize: (size: DesktopIconSize) => void
  setMobileOrder: (order: string[]) => void
  resetMobile: () => void
}

export const useDesktopIconStore = create<DesktopIconState>((set, get) => {
  const commit = (patch: Partial<Stored>) => {
    const { show, autoArrange, alignToGrid, freeWidgets, order, positions, mobileSize, mobileOrder } = get()
    const next = { show, autoArrange, alignToGrid, freeWidgets, order, positions, mobileSize, mobileOrder, ...patch }
    save(next)
    set(patch)
  }
  return {
    ...load(),
    editing: false,
    setShow: (show) => commit({ show }),
    setAutoArrange: (autoArrange) => commit({ autoArrange }),
    setAlignToGrid: (alignToGrid) => commit({ alignToGrid }),
    setFreeWidgets: (freeWidgets) => commit({ freeWidgets }),
    setEditing: (editing) => set({ editing }),
    sort: (order) => commit({ order, positions: {} }),
    reorder: (order) => commit({ order }),
    place: (id, point) => commit({ positions: { ...get().positions, [id]: point } }),
    reset: () => commit({ show: true, autoArrange: true, alignToGrid: false, freeWidgets: true, order: [], positions: {} }),
    setMobileSize: (mobileSize) => commit({ mobileSize }),
    setMobileOrder: (mobileOrder) => commit({ mobileOrder }),
    resetMobile: () => commit({ mobileSize: DEFAULTS.mobileSize, mobileOrder: [] }),
  }
})
