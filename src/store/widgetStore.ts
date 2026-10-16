import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PlacedWidget, WidgetConfig, WidgetType } from '@/types'
import { useMetricsStore } from '@/store/metricsStore'
import { isMobileLayoutNow } from '@/hooks/useIsMobileLayout'

export interface WidgetCatalogItem {
  type: WidgetType
  title: string
  subtitle: string
  badge: string
  category: 'system' | 'network' | 'utility'
}

// The network widget shows the host's network card and ping probes from the server: both are
// for administrators; an account's CPU, RAM and storage widgets show its own quota instead.
export function widgetAllowedFor(type: WidgetType, role?: string | null): boolean {
  if (type === 'network-traffic') return role === 'superadmin'
  if (type === 'ping') return role === 'superadmin' || role === 'admin'
  return true
}

export const WIDGET_CATALOG: WidgetCatalogItem[] = [
  {
    type: 'clock-uptime',
    title: 'Clock & Uptime',
    subtitle: 'Jam digital real-time, tanggal, dan status uptime server',
    badge: 'Time',
    category: 'system',
  },
  {
    type: 'system-vital',
    title: 'System Vitals',
    subtitle: 'Monitor real-time penggunaan CPU, Memori RAM, dan Storage',
    badge: 'Metrics',
    category: 'system',
  },
  {
    type: 'network-traffic',
    title: 'Network & Host',
    subtitle: 'Grafik bandwidth real-time, live transfer rate, dan interface jaringan',
    badge: 'Network',
    category: 'network',
  },
  {
    type: 'quick-note',
    title: 'Sticky Note',
    subtitle: 'Catatan tempel berwarna untuk perintah atau info server, bisa dibuat banyak',
    badge: 'Utility',
    category: 'utility',
  },
  {
    type: 'cpu-graph',
    title: 'CPU Live History',
    subtitle: 'Grafik garis pemakaian prosesor dengan riwayat tersimpan dan rentang waktu',
    badge: 'Graph',
    category: 'system',
  },
  {
    type: 'ping',
    title: 'Ping Monitor',
    subtitle: 'Pantau latensi dan ketersediaan host mana pun (ICMP atau TCP port), bisa lebih dari satu',
    badge: 'Ping',
    category: 'network',
  },
]

// Widget types that may be placed more than once (each keeps its own config + history)
export const MULTI_INSTANCE_WIDGETS: WidgetType[] = ['ping', 'quick-note']

export const DEFAULT_WIDGET_CONFIG: Partial<Record<WidgetType, WidgetConfig>> = {
  ping: { host: '1.1.1.1', port: 0, intervalSec: 10, range: '15m', label: '' },
  'quick-note': { text: '', color: 'yellow' },
  'cpu-graph': { range: '15m' },
  'system-vital': { mode: 'bars', range: '15m' },
  'network-traffic': { range: '15m' },
}

// Top of the widget area, just below the taskbar
export const WIDGET_TOP = 64

export const WIDGET_WIDTH = 280
export const WIDGET_GAP = 15
export const COLUMN_WIDTH = WIDGET_WIDTH + WIDGET_GAP // 295px

// Resting heights (header collapsed); a hovered card grows by the 28px header
export const WIDGET_HEIGHTS: Record<WidgetType, number> = {
  'clock-uptime': 120,
  'system-vital': 162,
  'quick-note': 140,
  'network-traffic': 208,
  'cpu-graph': 156,
  ping: 190,
}

// ── Measured heights ─────────────────────────────────────────────────────────
// Widgets differ from the nominal heights below (content wraps, notes grow), so layout
// decisions use what the DOM really renders. Containers report their resting height here.
const measuredHeights = new Map<string, number>()
let settleTimer: ReturnType<typeof setTimeout> | undefined

export function reportWidgetHeight(id: string, height: number): boolean {
  const h = Math.round(height)
  if (!(h > 0)) return false
  const prev = measuredHeights.get(id)
  if (prev !== undefined && Math.abs(prev - h) < 2) return false
  measuredHeights.set(id, h)
  return true
}

export function forgetWidgetHeight(id: string) {
  measuredHeights.delete(id)
}

export function widgetHeightOf(w: { id: string; type: WidgetType }): number {
  return measuredHeights.get(w.id) ?? WIDGET_HEIGHTS[w.type] ?? 165
}

// Re-run the overlap cleanup shortly after sizes settle (many widgets report at once)
export function scheduleLayoutSettle() {
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => useWidgetStore.getState().settleLayout(), 250)
}

function getDefaultPositions(): PlacedWidget[] {
  const isBrowser = typeof window !== 'undefined'
  const screenWidth = isBrowser ? window.innerWidth : 1280
  const defaultX = Math.max(200, screenWidth - WIDGET_WIDTH - 24)

  return [
    {
      id: 'default-clock',
      type: 'clock-uptime',
      x: defaultX,
      y: WIDGET_TOP,
      isLocked: false,
    },
    {
      id: 'default-vital',
      type: 'system-vital',
      x: defaultX,
      y: WIDGET_TOP + WIDGET_HEIGHTS['clock-uptime'] + WIDGET_GAP,
      isLocked: false,
    },
  ]
}

export function autoSpaceWidgets(widgets: PlacedWidget[]): PlacedWidget[] {
  const topMargin = WIDGET_TOP

  // Group widgets by approximate column (within 140px horizontal distance)
  const columns: { colX: number; widgets: PlacedWidget[] }[] = []

  widgets.forEach((w) => {
    let col = columns.find((c) => Math.abs(c.colX - w.x) < 140)
    if (!col) {
      col = { colX: w.x, widgets: [] }
      columns.push(col)
    }
    col.widgets.push(w)
  })

  const result: PlacedWidget[] = []

  columns.forEach((col) => {
    col.widgets.sort((a, b) => a.y - b.y)
    let currentY = topMargin

    col.widgets.forEach((w) => {
      // a locked widget stays exactly where it was put
      if (w.isLocked) {
        result.push(w)
        currentY = Math.max(currentY, w.y + widgetHeightOf(w) + WIDGET_GAP)
        return
      }
      result.push({ ...w, x: col.colX, y: Math.round(currentY) })
      const h = widgetHeightOf(w)
      currentY += h + WIDGET_GAP
    })
  })

  return result
}

export function snapWidgetPosition(
  draggedId: string,
  draggedType: WidgetType,
  rawX: number,
  rawY: number,
  allWidgets: PlacedWidget[]
): { x: number; y: number } {
  const isBrowser = typeof window !== 'undefined'
  const screenW = isBrowser ? window.innerWidth : 1280
  const defaultColX = Math.max(200, screenW - 308)
  const SNAP_DISTANCE = 32

  let snappedX = rawX
  let snappedY = rawY

  // 1. Snap X to default right column
  if (Math.abs(rawX - defaultColX) < SNAP_DISTANCE) {
    snappedX = defaultColX
  } else {
    // Or snap X to alignment with any existing widget
    for (const other of allWidgets) {
      if (other.id === draggedId) continue
      if (Math.abs(rawX - other.x) < SNAP_DISTANCE) {
        snappedX = other.x
        break
      }
    }
  }

  // 2. Snap Y to top margin
  if (Math.abs(rawY - WIDGET_TOP) < 24) {
    snappedY = WIDGET_TOP
  }

  // 3. Snap Y to 15px gap relative to other widgets in the same column (X within 60px)
  const sameColWidgets = allWidgets.filter(
    (w) => w.id !== draggedId && Math.abs(w.x - snappedX) < 60
  )

  for (const other of sameColWidgets) {
    const otherH = widgetHeightOf(other)
    const thisH = widgetHeightOf({ id: draggedId, type: draggedType })

    // Gap 15px below 'other'
    const targetBelowY = other.y + otherH + WIDGET_GAP
    if (Math.abs(rawY - targetBelowY) < SNAP_DISTANCE) {
      snappedY = targetBelowY
      break
    }

    // Gap 15px above 'other'
    const targetAboveY = other.y - thisH - WIDGET_GAP
    if (Math.abs(rawY - targetAboveY) < SNAP_DISTANCE && targetAboveY >= WIDGET_TOP - 14) {
      snappedY = targetAboveY
      break
    }
  }

  return { x: Math.round(snappedX), y: Math.round(snappedY) }
}


function overlapsWidget(x: number, y: number, height: number, other: PlacedWidget) {
  return (
    x < other.x + WIDGET_WIDTH + 2 &&
    x + WIDGET_WIDTH + 2 > other.x &&
    y < other.y + widgetHeightOf(other) + 2 &&
    y + height + 2 > other.y
  )
}

// Finds the free spot closest to where the widget was wanted. Candidates sit directly
// beside, above or below the existing widgets (or at the wanted spot itself), so a
// widget moves as little as possible and never teleports to another column.
export function resolveWidgetOverlap(
  id: string,
  type: WidgetType,
  x: number,
  y: number,
  all: PlacedWidget[]
): { x: number; y: number } {
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
  const height = widgetHeightOf({ id, type })
  const minX = 12
  const maxX = Math.max(minX, screenW - WIDGET_WIDTH - 12)
  const minY = WIDGET_TOP
  const maxY = Math.max(minY, screenH - height - 24)

  const clampX = (v: number) => Math.min(Math.max(v, minX), maxX)
  const clampY = (v: number) => Math.min(Math.max(v, minY), maxY)
  const others = all.filter((w) => w.id !== id)
  const free = (cx: number, cy: number) => !others.some((w) => overlapsWidget(cx, cy, height, w))

  const wantedX = clampX(x)
  const wantedY = clampY(y)
  if (free(wantedX, wantedY)) return { x: Math.round(wantedX), y: Math.round(wantedY) }

  const candidates: Array<{ x: number; y: number }> = []
  for (const w of others) {
    const wh = widgetHeightOf(w)
    const below = w.y + wh + WIDGET_GAP
    const above = w.y - height - WIDGET_GAP
    candidates.push(
      { x: wantedX, y: below },
      { x: wantedX, y: above },
      { x: w.x, y: below },
      { x: w.x, y: above },
      { x: w.x - WIDGET_WIDTH - WIDGET_GAP, y: wantedY },
      { x: w.x + WIDGET_WIDTH + WIDGET_GAP, y: wantedY },
      { x: w.x - WIDGET_WIDTH - WIDGET_GAP, y: w.y },
      { x: w.x + WIDGET_WIDTH + WIDGET_GAP, y: w.y }
    )
  }

  let best: { x: number; y: number } | null = null
  let bestDist = Infinity
  for (const c of candidates) {
    if (c.x < minX || c.x > maxX || c.y < minY || c.y > maxY) continue
    if (!free(c.x, c.y)) continue
    const dist = (c.x - wantedX) ** 2 + (c.y - wantedY) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }

  // No free spot on this screen: keep the wanted position instead of jumping elsewhere
  const spot = best ?? { x: wantedX, y: wantedY }
  return { x: Math.round(spot.x), y: Math.round(spot.y) }
}

// Non-destructive cleanup for stored layouts: keeps every widget where the user put it and
// only pulls strays back into the viewport and out of overlaps.
export function sanitizeLayout(widgets: PlacedWidget[]): PlacedWidget[] {
  // The phone viewport is far narrower than the desktop the layout was arranged on:
  // clamping here would squeeze the stored positions and sync them back over the desktop layout
  if (typeof window !== 'undefined' && isMobileLayoutNow()) return widgets
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
  const placed: PlacedWidget[] = []

  // locked widgets keep their coordinates; the others are fitted around them
  const ordered = [...widgets].sort((a, b) => Number(!!b.isLocked) - Number(!!a.isLocked) || a.y - b.y || a.x - b.x)
  for (const w of ordered) {
    if (w.isLocked) {
      placed.push(w)
      continue
    }
    const height = widgetHeightOf(w)
    const x = Math.min(Math.max(w.x, 12), Math.max(12, screenW - WIDGET_WIDTH - 12))
    const y = Math.min(Math.max(w.y, WIDGET_TOP), Math.max(WIDGET_TOP, screenH - height - 24))
    const spot = resolveWidgetOverlap(w.id, w.type, x, y, placed)
    placed.push({ ...w, x: spot.x, y: spot.y })
  }
  const byId = new Map(placed.map((w) => [w.id, w]))
  return widgets.map((w) => byId.get(w.id) ?? w)
}

function findSmartSpawnPosition(existing: PlacedWidget[], newType?: WidgetType): { x: number; y: number } {
  const isBrowser = typeof window !== 'undefined'
  // a phone adds widgets for the desktop too: place them on a desktop-sized canvas
  const onPhone = isBrowser && isMobileLayoutNow()
  const screenWidth = onPhone ? 1440 : isBrowser ? window.innerWidth : 1280
  const screenHeight = onPhone ? 900 : isBrowser ? window.innerHeight : 800

  const topMargin = WIDGET_TOP
  const bottomMargin = 90
  const maxBottom = screenHeight - bottomMargin
  const thisHeight = newType ? (WIDGET_HEIGHTS[newType] || 195) : 195

  // Check columns from right to left with exact 15px column spacing
  for (let col = 0; col < 4; col++) {
    const colX = Math.max(200, screenWidth - WIDGET_WIDTH - 24 - col * COLUMN_WIDTH)

    const colWidgets = existing
      .filter((w) => Math.abs(w.x - colX) < 140)
      .sort((a, b) => a.y - b.y)

    if (colWidgets.length === 0) {
      return { x: colX, y: topMargin }
    }

    // Check after the lowest widget in column
    const lastWidget = colWidgets[colWidgets.length - 1]
    const lastWidgetH = widgetHeightOf(lastWidget)
    const nextY = lastWidget.y + lastWidgetH + WIDGET_GAP

    if (nextY + thisHeight <= maxBottom) {
      return { x: colX, y: nextY }
    }
  }

  // Fallback: spawn in first column
  return { x: Math.max(200, screenWidth - WIDGET_WIDTH - 24), y: topMargin }
}

// Phone-only arrangement: order and locks never touch the desktop coordinates
export interface MobileWidgetLayout {
  order: string[]
  locked: string[]
}

const EMPTY_MOBILE: MobileWidgetLayout = { order: [], locked: [] }

// Widgets in the order the phone shows them: saved order first, the rest by desktop position
export function orderWidgetsForMobile(widgets: PlacedWidget[], order: string[]): PlacedWidget[] {
  const rank = new Map(order.map((id, i) => [id, i]))
  const known = widgets.filter((w) => rank.has(w.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  const rest = widgets.filter((w) => !rank.has(w.id)).sort((a, b) => a.y - b.y || a.x - b.x)
  return [...known, ...rest]
}

interface WidgetState {
  placedWidgets: PlacedWidget[]
  mobile: MobileWidgetLayout
  moveMobileWidget: (id: string, delta: -1 | 1) => void
  toggleMobileLock: (id: string) => void
  setMobileLayout: (layout: MobileWidgetLayout) => void
  resetMobileLayout: () => void
  addWidget: (type: WidgetType, pos?: { x: number; y: number }) => string
  removeWidget: (id: string) => void
  updateWidgetPosition: (id: string, x: number, y: number) => void
  toggleWidgetLock: (id: string) => void
  resetToDefault: () => void
  resetLayout: () => void
  tidyUpWidgets: () => void
  updateWidgetConfig: (id: string, patch: WidgetConfig) => void
  setLayout: (widgets: PlacedWidget[]) => void
  settleLayout: () => void
  hasWidget: (type: WidgetType) => boolean
}

export const useWidgetStore = create<WidgetState>()(
  persist(
    (set, get) => ({
      placedWidgets: getDefaultPositions(),
      mobile: EMPTY_MOBILE,

      moveMobileWidget: (id, delta) => {
        const { placedWidgets, mobile } = get()
        if (mobile.locked.includes(id)) return
        const ids = orderWidgetsForMobile(placedWidgets, mobile.order).map((w) => w.id)
        const from = ids.indexOf(id)
        const to = from + delta
        if (from < 0 || to < 0 || to >= ids.length) return
        ;[ids[from], ids[to]] = [ids[to], ids[from]]
        set({ mobile: { ...mobile, order: ids } })
      },

      toggleMobileLock: (id) => {
        const { mobile } = get()
        const locked = mobile.locked.includes(id) ? mobile.locked.filter((x) => x !== id) : [...mobile.locked, id]
        set({ mobile: { ...mobile, locked } })
      },

      setMobileLayout: (layout) => set({ mobile: layout }),

      resetMobileLayout: () => set({ mobile: EMPTY_MOBILE }),

      addWidget: (type, pos) => {
        // Single-instance widgets: return the one already on the desktop
        if (!MULTI_INSTANCE_WIDGETS.includes(type)) {
          const existing = get().placedWidgets.find((w) => w.type === type)
          if (existing) {
            return existing.id
          }
        }

        const id = `widget-${type}-${Date.now()}`
        const current = get().placedWidgets
        // A drop keeps the spot the user chose (snapped to neighbours); only overlaps are resolved
        const wanted = pos
          ? snapWidgetPosition(id, type, pos.x, pos.y, current)
          : findSmartSpawnPosition(current, type)
        const finalPos = resolveWidgetOverlap(id, type, wanted.x, wanted.y, current)

        const newWidget: PlacedWidget = {
          id,
          type,
          x: Math.round(finalPos.x),
          y: Math.round(finalPos.y),
          isLocked: false,
          config: DEFAULT_WIDGET_CONFIG[type] ? { ...DEFAULT_WIDGET_CONFIG[type] } : undefined,
        }

        set((state) => ({
          placedWidgets: [...state.placedWidgets, newWidget],
        }))

        return id
      },

      removeWidget: (id) => {
        useMetricsStore.getState().clear(`ping:${id}`)
        set((state) => ({
          placedWidgets: state.placedWidgets.filter((w) => w.id !== id),
        }))
      },

      setLayout: (widgets) => set({ placedWidgets: widgets }),

      // Separates widgets that overlap once real sizes are known (no-op when already clean)
      settleLayout: () => {
        const current = get().placedWidgets
        const next = sanitizeLayout(current)
        const changed = next.some((w, i) => w.x !== current[i].x || w.y !== current[i].y)
        if (changed) set({ placedWidgets: next })
      },

      updateWidgetConfig: (id, patch) => {
        set((state) => ({
          placedWidgets: state.placedWidgets.map((w) =>
            w.id === id ? { ...w, config: { ...(w.config ?? {}), ...patch } } : w
          ),
        }))
      },

      updateWidgetPosition: (id, x, y) => {
        set((state) => ({
          placedWidgets: state.placedWidgets.map((w) =>
            w.id === id ? { ...w, x: Math.round(x), y: Math.round(y) } : w
          ),
        }))
      },

      toggleWidgetLock: (id) => {
        set((state) => ({
          placedWidgets: state.placedWidgets.map((w) =>
            w.id === id ? { ...w, isLocked: !w.isLocked } : w
          ),
        }))
      },

      resetToDefault: () => {
        set({ placedWidgets: getDefaultPositions() })
      },

      resetLayout: () => {
        // On a phone "reset" means the phone order; desktop coordinates stay as arranged
        if (isMobileLayoutNow()) {
          set({ mobile: EMPTY_MOBILE })
          return
        }
        const current = get().placedWidgets
        if (current.length === 0) return

        const isBrowser = typeof window !== 'undefined'
        const screenWidth = isBrowser ? window.innerWidth : 1280
        const screenHeight = isBrowser ? window.innerHeight : 800
        const topMargin = WIDGET_TOP
        const bottomMargin = 90
        const maxBottom = screenHeight - bottomMargin

        const rearranged: PlacedWidget[] = []
        let col = 0
        let currentY = topMargin

        current.forEach((w) => {
          if (w.isLocked) {
            rearranged.push(w)
            return
          }
          const h = widgetHeightOf(w)
          if (currentY + h > maxBottom && currentY > topMargin) {
            col++
            currentY = topMargin
          }
          const colX = Math.max(200, screenWidth - WIDGET_WIDTH - 24 - col * COLUMN_WIDTH)
          rearranged.push({
            ...w,
            x: colX,
            y: currentY,
          })
          currentY += h + WIDGET_GAP
        })

        set({ placedWidgets: sanitizeLayout(rearranged) })
      },

      tidyUpWidgets: () => {
        if (isMobileLayoutNow()) return
        set({ placedWidgets: sanitizeLayout(autoSpaceWidgets(get().placedWidgets)) })
      },

      hasWidget: (type) => {
        if (MULTI_INSTANCE_WIDGETS.includes(type)) return false
        return get().placedWidgets.some((w) => w.type === type)
      },
    }),
    {
      name: 'reneo-desktop-widgets-v2',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.placedWidgets)) {
          state.placedWidgets = sanitizeLayout(state.placedWidgets)
        }
      },
    }
  )
)
