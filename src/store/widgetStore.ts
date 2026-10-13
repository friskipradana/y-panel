import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PlacedWidget, WidgetConfig, WidgetType } from '@/types'
import { useMetricsStore } from '@/store/metricsStore'

export interface WidgetCatalogItem {
  type: WidgetType
  title: string
  subtitle: string
  badge: string
  category: 'system' | 'network' | 'utility'
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
  ping: 168,
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
      result.push({ ...w, x: col.colX, y: Math.round(currentY) })
      const h = WIDGET_HEIGHTS[w.type] || 195
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
    const otherH = WIDGET_HEIGHTS[other.type] || 195
    const thisH = WIDGET_HEIGHTS[draggedType] || 195

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

function findSmartSpawnPosition(existing: PlacedWidget[], newType?: WidgetType): { x: number; y: number } {
  const isBrowser = typeof window !== 'undefined'
  const screenWidth = isBrowser ? window.innerWidth : 1280
  const screenHeight = isBrowser ? window.innerHeight : 800

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
    const lastWidgetH = WIDGET_HEIGHTS[lastWidget.type] || 195
    const nextY = lastWidget.y + lastWidgetH + WIDGET_GAP

    if (nextY + thisHeight <= maxBottom) {
      return { x: colX, y: nextY }
    }
  }

  // Fallback: spawn in first column
  return { x: Math.max(200, screenWidth - WIDGET_WIDTH - 24), y: topMargin }
}

interface WidgetState {
  placedWidgets: PlacedWidget[]
  addWidget: (type: WidgetType, pos?: { x: number; y: number }) => string
  removeWidget: (id: string) => void
  updateWidgetPosition: (id: string, x: number, y: number) => void
  toggleWidgetLock: (id: string) => void
  resetToDefault: () => void
  resetLayout: () => void
  tidyUpWidgets: () => void
  updateWidgetConfig: (id: string, patch: WidgetConfig) => void
  setLayout: (widgets: PlacedWidget[]) => void
  hasWidget: (type: WidgetType) => boolean
}

export const useWidgetStore = create<WidgetState>()(
  persist(
    (set, get) => ({
      placedWidgets: getDefaultPositions(),

      addWidget: (type, pos) => {
        // Single-instance widgets: return the one already on the desktop
        if (!MULTI_INSTANCE_WIDGETS.includes(type)) {
          const existing = get().placedWidgets.find((w) => w.type === type)
          if (existing) {
            return existing.id
          }
        }

        const id = `widget-${type}-${Date.now()}`
        const finalPos = pos ?? findSmartSpawnPosition(get().placedWidgets, type)

        const newWidget: PlacedWidget = {
          id,
          type,
          x: Math.round(finalPos.x),
          y: Math.round(finalPos.y),
          isLocked: false,
          config: DEFAULT_WIDGET_CONFIG[type] ? { ...DEFAULT_WIDGET_CONFIG[type] } : undefined,
        }

        set((state) => ({
          placedWidgets: autoSpaceWidgets([...state.placedWidgets, newWidget]),
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
          const h = WIDGET_HEIGHTS[w.type] || 195
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

        set({ placedWidgets: rearranged })
      },

      tidyUpWidgets: () => {
        set({ placedWidgets: autoSpaceWidgets(get().placedWidgets) })
      },

      hasWidget: (type) => {
        if (MULTI_INSTANCE_WIDGETS.includes(type)) return false
        return get().placedWidgets.some((w) => w.type === type)
      },
    }),
    {
      name: 'ypanel-desktop-widgets-v2',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.placedWidgets)) {
          state.placedWidgets = autoSpaceWidgets(state.placedWidgets)
        }
      },
    }
  )
)
