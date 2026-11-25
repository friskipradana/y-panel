import type { PlacedWidget } from '@/types'
import {
  WIDGET_GAP,
  WIDGET_MIN_WIDTH,
  WIDGET_TOP,
  widgetHeightOf,
  widgetWidthOf,
  widgetsAreFree,
} from './widgetLayout'

export interface ProjectedWidgetRect {
  x: number
  y: number
  w: number
}

// Projects saved widget positions onto any desktop viewport (smaller or larger) without mutating
// the saved layout: right-half widgets stay anchored to the right edge so columns shift smoothly
// together (e.g. when DevTools opens or on ultrawide monitors), left-half widgets scale
// proportionally, and an anti-overlap pass guarantees cards never stack on top of each other.
export function projectWidgetsToViewport(
  widgets: PlacedWidget[],
  refViewport: { w: number; h: number } | null,
  curW: number,
  curH: number,
): Map<string, ProjectedWidgetRect> {
  const EDGE = 12
  const out = new Map<string, ProjectedWidgetRect>()
  if (widgets.length === 0) return out

  const maxRight = widgets.reduce((m, w) => Math.max(m, w.x + widgetWidthOf(w) + 24), 0)
  const maxBottom = widgets.reduce((m, w) => Math.max(m, w.y + widgetHeightOf(w) + 24), 0)
  const refW = Math.max(refViewport?.w || curW, maxRight, 640)
  const refH = Math.max(refViewport?.h || curH, maxBottom, 480)

  const availRefH = Math.max(200, refH - WIDGET_TOP - 24)
  const availCurH = Math.max(200, curH - WIDGET_TOP - 24)
  const scaleY = curH < refH ? Math.max(0.65, availCurH / availRefH) : 1
  const widthScale = curW < refW ? Math.max(0.82, Math.min(1, curW / Math.max(refW * 0.72, 960))) : 1
  const free = widgetsAreFree()

  type PlacedRect = { id: string; x: number; y: number; w: number; h: number }
  const placed: PlacedRect[] = []
  const overlapsRect = (x: number, y: number, w: number, h: number) =>
    placed.some((o) => x < o.x + o.w + 4 && x + w + 4 > o.x && y < o.y + o.h + 4 && y + h + 4 > o.y)

  // Process rightmost/topmost widgets first so primary right-edge column keeps priority
  const ordered = [...widgets].sort((a, b) => b.x - a.x || a.y - b.y)

  for (const widget of ordered) {
    const baseW = widgetWidthOf(widget)
    const projW = Math.round(Math.min(curW - EDGE * 2, Math.max(WIDGET_MIN_WIDTH, baseW * widthScale)))
    const projH = widgetHeightOf(widget)
    const maxX = Math.max(EDGE, curW - projW - EDGE)
    const maxY = Math.max(WIDGET_TOP, curH - projH - 24)

    let projX: number
    if (Math.abs(curW - refW) <= 2) {
      projX = widget.x
    } else if (widget.x + baseW / 2 >= refW * 0.5) {
      // Right-anchored: preserve distance from right edge, scaling gap gently if width shrank
      const distRight = Math.max(EDGE, refW - (widget.x + baseW))
      const scaledDistRight = distRight * widthScale
      projX = Math.round(curW - projW - scaledDistRight)
    } else {
      // Left-half widget: scale position proportionally with screen width
      projX = Math.round(widget.x * (curW / refW))
    }

    let projY =
      Math.abs(curH - refH) <= 2
        ? widget.y
        : Math.round(WIDGET_TOP + Math.max(0, widget.y - WIDGET_TOP) * scaleY)

    projX = Math.max(EDGE, Math.min(maxX, projX))
    projY = Math.max(WIDGET_TOP, Math.min(maxY, projY))

    if (!free && overlapsRect(projX, projY, projW, projH)) {
      const candidates: Array<{ x: number; y: number }> = []
      for (const o of placed) {
        candidates.push(
          { x: o.x - projW - WIDGET_GAP, y: projY },
          { x: o.x - projW - WIDGET_GAP, y: o.y },
          { x: projX, y: o.y + o.h + WIDGET_GAP },
          { x: o.x, y: o.y + o.h + WIDGET_GAP },
          { x: o.x + o.w + WIDGET_GAP, y: projY },
          { x: projX, y: o.y - projH - WIDGET_GAP },
        )
      }
      let best: { x: number; y: number } | null = null
      let bestDist = Infinity
      for (const c of candidates) {
        if (c.x < EDGE || c.x > maxX || c.y < WIDGET_TOP || c.y > maxY) continue
        if (overlapsRect(c.x, c.y, projW, projH)) continue
        const dist = (c.x - projX) ** 2 + (c.y - projY) ** 2
        if (dist < bestDist) {
          bestDist = dist
          best = c
        }
      }
      if (best) {
        projX = Math.round(best.x)
        projY = Math.round(best.y)
      }
    }

    placed.push({ id: widget.id, x: projX, y: projY, w: projW, h: projH })
    out.set(widget.id, { x: projX, y: projY, w: projW })
  }

  return out
}
