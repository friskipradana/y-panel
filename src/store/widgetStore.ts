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
      y: 224,
      isLocked: false,
    },
  ]
}

interface WidgetState {
  placedWidgets: PlacedWidget[]
  addWidget: (type: WidgetType, pos?: { x: number; y: number }) => string
  removeWidget: (id: string) => void
  updateWidgetPosition: (id: string, x: number, y: number) => void
  toggleWidgetLock: (id: string) => void
  resetToDefault: () => void
  hasWidget: (type: WidgetType) => boolean
}

export const useWidgetStore = create<WidgetState>()(
  persist(
    (set, get) => ({
      placedWidgets: getDefaultPositions(),

      addWidget: (type, pos) => {
        const id = `widget-${type}-${Date.now()}`
        const isBrowser = typeof window !== 'undefined'
        const screenWidth = isBrowser ? window.innerWidth : 1280
        const screenHeight = isBrowser ? window.innerHeight : 800

        const defaultX = pos?.x ?? Math.max(200, Math.min(screenWidth - 320, 360 + Math.random() * 180))
        const defaultY = pos?.y ?? Math.max(80, Math.min(screenHeight - 250, 100 + Math.random() * 120))

        set((state) => ({
          placedWidgets: [
            ...state.placedWidgets,
            {
              id,
              type,
              x: Math.round(defaultX),
              y: Math.round(defaultY),
              isLocked: false,
            },
          ],
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

      hasWidget: (type) => {
        return get().placedWidgets.some((w) => w.type === type)
      },
    }),
    {
      name: 'ypanel-desktop-widgets-v1',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
