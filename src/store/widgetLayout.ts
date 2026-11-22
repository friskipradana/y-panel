import type { PlacedWidget, WidgetConfig, WidgetType } from '@/types'
import { isMobileLayoutNow } from '@/hooks/useIsMobileLayout'
import { useDesktopIconStore } from '@/store/desktopIconStore'

export interface WidgetCatalogItem {
  type: WidgetType
  title: string
  subtitle: string
  badge: string
  category: 'system' | 'network' | 'utility'
}

// The network widget shows the host's own network card, so it is for the superadmin. Ping is open
// to every account; the agent only lets non-superadmins probe public addresses.
export function widgetAllowedFor(type: WidgetType, role?: string | null): boolean {
  if (type === 'network-traffic') return role === 'superadmin'
  if (type === 'ping') return role !== 'demo'
  return true
}

export const WIDGET_CATALOG: WidgetCatalogItem[] = [
  { type: 'clock-uptime', title: 'Clock & Uptime', subtitle: 'Jam digital real-time, tanggal, dan status uptime server', badge: 'Time', category: 'system' },
  { type: 'system-vital', title: 'System Vitals', subtitle: 'Monitor real-time penggunaan CPU, Memori RAM, dan Storage', badge: 'Metrics', category: 'system' },
  { type: 'network-traffic', title: 'Network & Host', subtitle: 'Grafik bandwidth real-time, live transfer rate, dan interface jaringan', badge: 'Network', category: 'network' },
  { type: 'quick-note', title: 'Sticky Note', subtitle: 'Catatan tempel berwarna untuk perintah atau info server, bisa dibuat banyak', badge: 'Utility', category: 'utility' },
  { type: 'cpu-graph', title: 'CPU Live History', subtitle: 'Grafik garis pemakaian prosesor dengan riwayat tersimpan dan rentang waktu', badge: 'Graph', category: 'system' },
  { type: 'ping', title: 'Ping Monitor', subtitle: 'Pantau latensi dan ketersediaan host mana pun (ICMP atau TCP port), bisa lebih dari satu', badge: 'Ping', category: 'network' },
]

// Widget types that may be placed more than once (each keeps its own config + history)
export const MULTI_INSTANCE_WIDGETS: WidgetType[] = ['ping', 'quick-note']

export const DEFAULT_WIDGET_CONFIG: Partial<Record<WidgetType, WidgetConfig>> = {
  ping: { host: '1.1.1.1', port: 0, intervalSec: 10, range: '15m', label: '' },
  'cpu-graph': { range: '15m' },
  'system-vital': { mode: 'bars', range: '15m' },
  'network-traffic': { range: '15m' },
}

export const WIDGET_TOP = 64
export const WIDGET_WIDTH = 280
export const WIDGET_GAP = 15
export const COLUMN_WIDTH = WIDGET_WIDTH + WIDGET_GAP // 295px

export const WIDGET_HEIGHTS: Record<WidgetType, number> = {
  'clock-uptime': 120,
  'system-vital': 162,
  'quick-note': 168,
  'network-traffic': 208,
  'cpu-graph': 156,
  ping: 190,
}

const measuredHeights = new Map<string, number>()

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

export function widgetHeightOf(w: { id: string; type: WidgetType; h?: number }): number {
  if (w.h && w.h > 0) return w.h
  return measuredHeights.get(w.id) ?? WIDGET_HEIGHTS[w.type] ?? 165
}

export function widgetWidthOf(w: { w?: number }): number {
  return w.w && w.w > 0 ? w.w : WIDGET_WIDTH
}

export const WIDGET_MIN_WIDTH = 200
export const WIDGET_MIN_HEIGHT = 96
export const WIDGET_MAX_WIDTH = 720
export const WIDGET_MAX_HEIGHT = 760

export function getDefaultPositions(): PlacedWidget[] {
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
  const defaultX = Math.max(200, screenWidth - WIDGET_WIDTH - 24)
  return [
    { id: 'default-clock', type: 'clock-uptime', x: defaultX, y: WIDGET_TOP, isLocked: false },
    { id: 'default-vital', type: 'system-vital', x: defaultX, y: WIDGET_TOP + WIDGET_HEIGHTS['clock-uptime'] + WIDGET_GAP, isLocked: false },
  ]
}

export function autoSpaceWidgets(widgets: PlacedWidget[]): PlacedWidget[] {
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
    let currentY = WIDGET_TOP
    col.widgets.forEach((w) => {
      if (w.isLocked) {
        result.push(w)
        currentY = Math.max(currentY, w.y + widgetHeightOf(w) + WIDGET_GAP)
        return
      }
      result.push({ ...w, x: col.colX, y: Math.round(currentY) })
      currentY += widgetHeightOf(w) + WIDGET_GAP
    })
  })
  return result
}

export function snapWidgetPosition(
  draggedId: string,
  draggedType: WidgetType,
  rawX: number,
  rawY: number,
  allWidgets: PlacedWidget[],
): { x: number; y: number } {
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280
  const defaultColX = Math.max(200, screenW - 308)
  const SNAP_DISTANCE = 32
  const SNAP_Y_DISTANCE = 12

  let snappedX = rawX
  let snappedY = rawY

  if (Math.abs(rawX - defaultColX) < SNAP_DISTANCE) {
    snappedX = defaultColX
  } else {
    for (const other of allWidgets) {
      if (other.id === draggedId) continue
      if (Math.abs(rawX - other.x) < SNAP_DISTANCE) {
        snappedX = other.x
        break
      }
    }
  }

  if (Math.abs(rawY - WIDGET_TOP) < 24) snappedY = WIDGET_TOP

  const sameColWidgets = allWidgets.filter((w) => w.id !== draggedId && Math.abs(w.x - snappedX) < 60)
  for (const other of sameColWidgets) {
    const otherH = widgetHeightOf(other)
    const thisH = widgetHeightOf(allWidgets.find((w) => w.id === draggedId) ?? { id: draggedId, type: draggedType })

    const targetBelowY = other.y + otherH + WIDGET_GAP
    if (Math.abs(rawY - targetBelowY) < SNAP_Y_DISTANCE) {
      snappedY = targetBelowY
      break
    }

    const targetAboveY = other.y - thisH - WIDGET_GAP
    if (Math.abs(rawY - targetAboveY) < SNAP_Y_DISTANCE && targetAboveY >= WIDGET_TOP - 14) {
      snappedY = targetAboveY
      break
    }
  }

  return { x: Math.round(snappedX), y: Math.round(snappedY) }
}

function overlapsWidget(x: number, y: number, width: number, height: number, other: PlacedWidget) {
  return (
    x < other.x + widgetWidthOf(other) + 2 &&
    x + width + 2 > other.x &&
    y < other.y + widgetHeightOf(other) + 2 &&
    y + height + 2 > other.y
  )
}

export function resolveWidgetOverlap(
  id: string,
  type: WidgetType,
  x: number,
  y: number,
  all: PlacedWidget[],
): { x: number; y: number } {
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
  const self = all.find((w) => w.id === id)
  const height = widgetHeightOf(self ?? { id, type })
  const width = widgetWidthOf(self ?? {})
  const minX = 12
  const maxX = Math.max(minX, screenW - width - 12)
  const minY = WIDGET_TOP
  const maxY = Math.max(minY, screenH - height - 24)

  const clampX = (v: number) => Math.min(Math.max(v, minX), maxX)
  const clampY = (v: number) => Math.min(Math.max(v, minY), maxY)
  const others = all.filter((w) => w.id !== id)
  const free = (cx: number, cy: number) => !others.some((w) => overlapsWidget(cx, cy, width, height, w))

  const wantedX = clampX(x)
  const wantedY = clampY(y)
  if (free(wantedX, wantedY)) return { x: Math.round(wantedX), y: Math.round(wantedY) }

  const candidates: Array<{ x: number; y: number }> = []
  for (const w of others) {
    const wh = widgetHeightOf(w)
    const below = w.y + wh + WIDGET_GAP
    const above = w.y - height - WIDGET_GAP
    candidates.push(
      { x: wantedX, y: below }, { x: wantedX, y: above },
      { x: w.x, y: below }, { x: w.x, y: above },
      { x: w.x - width - WIDGET_GAP, y: wantedY }, { x: w.x + widgetWidthOf(w) + WIDGET_GAP, y: wantedY },
      { x: w.x - width - WIDGET_GAP, y: w.y }, { x: w.x + widgetWidthOf(w) + WIDGET_GAP, y: w.y },
    )
  }

  let best: { x: number; y: number } | null = null
  let bestDist = Infinity
  for (const c of candidates) {
    if (c.x < minX || c.x > maxX || c.y < minY || c.y > maxY || !free(c.x, c.y)) continue
    const dist = (c.x - wantedX) ** 2 + (c.y - wantedY) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }

  const spot = best ?? { x: wantedX, y: wantedY }
  return { x: Math.round(spot.x), y: Math.round(spot.y) }
}

export function widgetsAreFree(): boolean {
  return useDesktopIconStore.getState().freeWidgets
}

export function placeDroppedWidget(
  id: string,
  type: WidgetType,
  rawX: number,
  rawY: number,
  all: PlacedWidget[],
  original: { x: number; y: number },
): { x: number; y: number } {
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800
  const self = all.find((w) => w.id === id)
  const width = widgetWidthOf(self ?? {})
  const height = widgetHeightOf(self ?? { id, type })
  const others = all.filter((w) => w.id !== id)
  const minX = 12
  const maxX = Math.max(minX, screenW - width - 12)
  const minY = WIDGET_TOP
  const maxY = Math.max(minY, screenH - height - 24)
  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY
  const free = (x: number, y: number) => !others.some((w) => overlapsWidget(x, y, width, height, w))
  const clampX = (v: number) => Math.min(Math.max(v, minX), maxX)
  const clampY = (v: number) => Math.min(Math.max(v, minY), maxY)

  let x = clampX(rawX)
  let y = clampY(rawY)

  if (widgetsAreFree()) {
    const fx = Math.min(Math.max(rawX, 0), Math.max(0, screenW - width))
    return { x: Math.round(fx), y: Math.round(clampY(rawY)) }
  }

  const ALIGN = 8
  let ax = x
  let ay = y
  for (const o of others) {
    if (Math.abs(x - o.x) <= ALIGN) ax = o.x
    const belowY = o.y + widgetHeightOf(o) + WIDGET_GAP
    if (Math.abs(y - belowY) <= ALIGN) ay = belowY
    if (Math.abs(y - o.y) <= ALIGN) ay = o.y
  }
  if (free(ax, ay) && inside(ax, ay)) {
    x = ax
    y = ay
  }

  if (free(x, y)) return { x: Math.round(x), y: Math.round(y) }

  const candidates: Array<{ x: number; y: number }> = []
  for (const o of others) {
    if (!overlapsWidget(x, y, width, height, o)) continue
    candidates.push(
      { x, y: o.y + widgetHeightOf(o) + WIDGET_GAP },
      { x, y: o.y - height - WIDGET_GAP },
      { x: o.x + widgetWidthOf(o) + WIDGET_GAP, y },
      { x: o.x - width - WIDGET_GAP, y },
    )
  }
  let best: { x: number; y: number } | null = null
  let bestDist = Infinity
  for (const c of candidates) {
    if (!inside(c.x, c.y) || !free(c.x, c.y)) continue
    const dist = (c.x - x) ** 2 + (c.y - y) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }
  if (best) return { x: Math.round(best.x), y: Math.round(best.y) }

  return { x: Math.round(original.x), y: Math.round(original.y) }
}

export function sanitizeLayout(widgets: PlacedWidget[]): PlacedWidget[] {
  if (typeof window !== 'undefined' && isMobileLayoutNow()) return widgets
  const placed: PlacedWidget[] = []
  const ordered = [...widgets].sort((a, b) => Number(!!b.isLocked) - Number(!!a.isLocked) || a.y - b.y || a.x - b.x)
  for (const w of ordered) {
    if (w.isLocked) {
      placed.push(w)
      continue
    }
    const height = widgetHeightOf(w)
    const free = widgetsAreFree()
    const x = free ? Math.max(w.x, 0) : Math.max(w.x, 12)
    let y = Math.max(w.y, WIDGET_TOP)
    for (let guard = 0; !free && guard < 20; guard++) {
      const blocker = placed.find((o) => overlapsWidget(x, y, widgetWidthOf(w), height, o))
      if (!blocker) break
      y = blocker.y + widgetHeightOf(blocker) + WIDGET_GAP
    }
    placed.push({ ...w, x: Math.round(x), y: Math.round(y) })
  }
  const byId = new Map(placed.map((w) => [w.id, w]))
  return widgets.map((w) => byId.get(w.id) ?? w)
}

export function findSmartSpawnPosition(existing: PlacedWidget[], newType?: WidgetType): { x: number; y: number } {
  const isBrowser = typeof window !== 'undefined'
  const onPhone = isBrowser && isMobileLayoutNow()
  const screenWidth = onPhone ? 1440 : isBrowser ? window.innerWidth : 1280
  const screenHeight = onPhone ? 900 : isBrowser ? window.innerHeight : 800

  const topMargin = WIDGET_TOP
  const maxBottom = screenHeight - 90
  const thisHeight = newType ? WIDGET_HEIGHTS[newType] || 195 : 195

  for (let col = 0; col < 4; col++) {
    const colX = Math.max(200, screenWidth - WIDGET_WIDTH - 24 - col * COLUMN_WIDTH)
    const colWidgets = existing.filter((w) => Math.abs(w.x - colX) < 140).sort((a, b) => a.y - b.y)
    if (colWidgets.length === 0) return { x: colX, y: topMargin }

    const lastWidget = colWidgets[colWidgets.length - 1]
    const nextY = lastWidget.y + widgetHeightOf(lastWidget) + WIDGET_GAP
    if (nextY + thisHeight <= maxBottom) return { x: colX, y: nextY }
  }
  return { x: Math.max(200, screenWidth - WIDGET_WIDTH - 24), y: topMargin }
}
