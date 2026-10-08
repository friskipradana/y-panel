import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PlacedWidget, WidgetType } from '@/types'

export interface WidgetCatalogItem {
  type: WidgetType
  title: string
  subtitle: string
  icon: string
  badge: string
  category: 'system' | 'network' | 'utility'
}

export const WIDGET_CATALOG: WidgetCatalogItem[] = [
  {
    type: 'clock-uptime',
    title: 'Clock & Uptime',
    subtitle: 'Jam digital real-time, tanggal, dan status uptime server',
    icon: '🕒',
    badge: 'Time',
    category: 'system',
  },
  {
    type: 'system-vital',
    title: 'System Vitals',
    subtitle: 'Monitor real-time penggunaan CPU, Memori RAM, dan Storage',
    icon: '⚡',
    badge: 'Metrics',
    category: 'system',
  },
  {
    type: 'network-traffic',
    title: 'Network & Host',
    subtitle: 'Alamat IP host, interface jaringan, dan latency status',
    icon: '🌐',
    badge: 'Network',
    category: 'network',
  },
  {
    type: 'quick-note',
    title: 'Sysadmin Memo',
    subtitle: 'Catatan cepat sticky note untuk menyimpan perintah atau info server',
    icon: '📝',
    badge: 'Utility',
    category: 'utility',
  },
]

export const WIDGET_HEIGHTS: Record<WidgetType, number> = {
  'clock-uptime': 175,
  'system-vital': 210,
  'quick-note': 200,
  'network-traffic': 225,
}

export const WIDGET_GAP = 20

function getDefaultPositions(): PlacedWidget[] {
  const isBrowser = typeof window !== 'undefined'
  const screenWidth = isBrowser ? window.innerWidth : 1280
  const defaultX = Math.max(340, screenWidth - 308)

  return [
    {
      id: 'default-clock',
      type: 'clock-uptime',
      x: defaultX,
      y: 64,
      isLocked: false,
    },
    {
      id: 'default-vital',
      type: 'system-vital',
      x: defaultX,
      y: 64 + WIDGET_HEIGHTS['clock-uptime'] + WIDGET_GAP, // 259
      isLocked: false,
    },
  ]
}

export function autoSpaceWidgets(widgets: PlacedWidget[]): PlacedWidget[] {
  const topMargin = 64

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
      const h = WIDGET_HEIGHTS[w.type] || 190
      const nextY = Math.max(w.y, currentY)
      result.push({ ...w, y: Math.round(nextY) })
      currentY = nextY + h + WIDGET_GAP
    })
  })

  return result
}

function findSmartSpawnPosition(existing: PlacedWidget[], newType: WidgetType): { x: number; y: number } {
  const isBrowser = typeof window !== 'undefined'
  const screenWidth = isBrowser ? window.innerWidth : 1280
  const screenHeight = isBrowser ? window.innerHeight : 800

  const newHeight = WIDGET_HEIGHTS[newType] || 190
  const topMargin = 64
  const bottomMargin = 90
  const maxBottom = screenHeight - bottomMargin

  // Check columns from right to left
  for (let col = 0; col < 4; col++) {
    const colX = Math.max(20, screenWidth - 308 - col * 296)

    const colWidgets = existing
      .filter((w) => Math.abs(w.x - colX) < 140)
      .sort((a, b) => a.y - b.y)

    if (colWidgets.length === 0) {
      return { x: colX, y: topMargin }
    }

    // Check after the lowest widget in column
    const lastWidget = colWidgets[colWidgets.length - 1]
    const lastHeight = WIDGET_HEIGHTS[lastWidget.type] || 190
    const nextY = lastWidget.y + lastHeight + WIDGET_GAP

    if (nextY + newHeight <= maxBottom) {
      return { x: colX, y: nextY }
    }
  }

  // Fallback: spawn in first column
  return { x: Math.max(20, screenWidth - 308), y: topMargin }
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
  hasWidget: (type: WidgetType) => boolean
}

export const useWidgetStore = create<WidgetState>()(
  persist(
    (set, get) => ({
      placedWidgets: getDefaultPositions(),

      addWidget: (type, pos) => {
        const id = `widget-${type}-${Date.now()}`
        const finalPos = pos ?? findSmartSpawnPosition(get().placedWidgets, type)

        const newWidget: PlacedWidget = {
          id,
          type,
          x: Math.round(finalPos.x),
          y: Math.round(finalPos.y),
          isLocked: false,
        }

        set((state) => ({
          placedWidgets: autoSpaceWidgets([...state.placedWidgets, newWidget]),
        }))

        return id
      },

      removeWidget: (id) => {
        set((state) => ({
          placedWidgets: state.placedWidgets.filter((w) => w.id !== id),
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
        const topMargin = 64
        const bottomMargin = 90
        const maxBottom = screenHeight - bottomMargin

        const rearranged: PlacedWidget[] = []
        let col = 0
        let currentY = topMargin

        current.forEach((w) => {
          const h = WIDGET_HEIGHTS[w.type] || 190
          if (currentY + h > maxBottom && currentY > topMargin) {
            col++
            currentY = topMargin
          }
          const colX = Math.max(20, screenWidth - 308 - col * 296)
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
