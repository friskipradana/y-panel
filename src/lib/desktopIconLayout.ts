import type { DesktopIconSize } from '@/store/themeStore'

// Where the desktop icons sit: a grid that fills column by column from the top left, like a
// desktop of an operating system. The cell is the size of an icon plus the gap around it.

export interface IconPoint {
  x: number
  y: number
}

export const GRID_LEFT = 16
export const GRID_TOP = 56
const GRID_BOTTOM = 24

const CELL: Record<DesktopIconSize, { w: number; h: number }> = {
  small: { w: 74, h: 80 },
  medium: { w: 84, h: 90 },
  large: { w: 96, h: 100 },
}

export function cellSize(size: DesktopIconSize) {
  return CELL[size] ?? CELL.small
}

export function gridRows(size: DesktopIconSize, viewportHeight: number) {
  return Math.max(1, Math.floor((viewportHeight - GRID_TOP - GRID_BOTTOM) / cellSize(size).h))
}

export function gridColumns(size: DesktopIconSize, viewportWidth: number) {
  return Math.max(1, Math.floor((viewportWidth - GRID_LEFT) / cellSize(size).w))
}

// The nth slot of the grid
export function slotPoint(index: number, size: DesktopIconSize, viewportHeight: number): IconPoint {
  const rows = gridRows(size, viewportHeight)
  const cell = cellSize(size)
  return { x: GRID_LEFT + Math.floor(index / rows) * cell.w, y: GRID_TOP + (index % rows) * cell.h }
}

// The slot nearest to a point (it may be past the last icon: that is an empty slot)
export function nearestSlot(point: IconPoint, size: DesktopIconSize, viewport: { width: number; height: number }) {
  const cell = cellSize(size)
  const rows = gridRows(size, viewport.height)
  const cols = gridColumns(size, viewport.width)
  const col = Math.min(cols - 1, Math.max(0, Math.round((point.x - GRID_LEFT) / cell.w)))
  const row = Math.min(rows - 1, Math.max(0, Math.round((point.y - GRID_TOP) / cell.h)))
  return { col, row, index: col * rows + row }
}

// Keeps a free position on the screen: anywhere below the taskbar, as far as the edges
export function clampPoint(point: IconPoint, size: DesktopIconSize, viewport: { width: number; height: number }): IconPoint {
  const cell = cellSize(size)
  return {
    x: Math.round(Math.min(Math.max(0, point.x), Math.max(0, viewport.width - (cell.w - 8)))),
    y: Math.round(Math.min(Math.max(46, point.y), Math.max(46, viewport.height - (cell.h - 8)))),
  }
}

// The nearest slot that nobody sits on, searching outward from the wanted one
export function freeSlotNear(wanted: number, taken: Set<number>, size: DesktopIconSize, viewport: { width: number; height: number }) {
  const rows = gridRows(size, viewport.height)
  const total = gridColumns(size, viewport.width) * rows
  for (let step = 0; step < total; step += 1) {
    for (const candidate of [wanted + step, wanted - step]) {
      if (candidate >= 0 && candidate < total && !taken.has(candidate)) return candidate
    }
  }
  return wanted
}

// The slot a free position belongs to, to tell which slots are taken
export function slotOf(point: IconPoint, size: DesktopIconSize, viewport: { width: number; height: number }) {
  return nearestSlot(point, size, viewport).index
}
