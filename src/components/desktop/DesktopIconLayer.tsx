import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { DesktopIcon } from '@/components/desktop/DesktopIcon'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import {
  cellSize,
  clampPoint,
  freeSlotNear,
  nearestSlot,
  slotOf,
  slotPoint,
  type IconPoint,
} from '@/lib/desktopIconLayout'
import { useDesktopIconStore } from '@/store/desktopIconStore'
import { useThemeStore } from '@/store/themeStore'
import type { AppShortcut } from '@/types'

interface DragState {
  id: string
  /** where the pointer grabbed the icon, relative to its corner */
  grab: IconPoint
  point: IconPoint
}

function useViewport() {
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return viewport
}

// The icons of the desktop: on the grid in order (auto arrange) or where they were put. While the
// arrange mode is on they can be dragged; a press otherwise opens the app.
export function DesktopIconLayer({ apps }: { apps: AppShortcut[] }) {
  const { t } = useI18n()
  const size = useThemeStore((s) => s.desktopIconSize)
  const { show, autoArrange, alignToGrid, order, positions, editing, setEditing, reorder, place } = useDesktopIconStore()
  const viewport = useViewport()
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)

  // the saved order first, then whatever the saved order does not know
  const ordered = useMemo(() => {
    const byId = new Map(apps.map((app) => [app.id, app]))
    const known = order.filter((id) => byId.has(id)).map((id) => byId.get(id)!)
    const rest = apps.filter((app) => !order.includes(app.id))
    return [...known, ...rest]
  }, [apps, order])

  const pointOf = useCallback(
    (app: AppShortcut, index: number): IconPoint => {
      if (autoArrange) return slotPoint(index, size, viewport.height)
      return positions[app.id] ?? slotPoint(index, size, viewport.height)
    },
    [autoArrange, positions, size, viewport.height],
  )

  // Esc ends the arrange mode
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, setEditing])

  // leaving the mode (or hiding the icons) drops a drag that was under way
  useEffect(() => {
    if (!editing) {
      dragRef.current = null
      setDrag(null)
    }
  }, [editing])

  const begin = (e: React.PointerEvent<HTMLDivElement>, app: AppShortcut, index: number) => {
    if (!editing || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const at = pointOf(app, index)
    const next = { id: app.id, grab: { x: e.clientX - at.x, y: e.clientY - at.y }, point: at }
    dragRef.current = next
    setDrag(next)
  }

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current
    if (!current) return
    const next = { ...current, point: { x: e.clientX - current.grab.x, y: e.clientY - current.grab.y } }
    dragRef.current = next
    setDrag(next)
  }

  const end = () => {
    const current = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!current) return
    const wanted = nearestSlot(current.point, size, viewport)

    if (autoArrange) {
      // dropped on a slot: the icon takes that place in the order and the rest close up around it
      const ids = ordered.map((app) => app.id).filter((id) => id !== current.id)
      ids.splice(Math.min(wanted.index, ids.length), 0, current.id)
      reorder(ids)
      return
    }

    if (alignToGrid) {
      // snapped to a slot; a slot somebody sits on gives way to the nearest free one
      const taken = new Set<number>()
      ordered.forEach((app, i) => {
        if (app.id !== current.id) taken.add(slotOf(pointOf(app, i), size, viewport))
      })
      const slot = freeSlotNear(wanted.index, taken, size, viewport)
      place(current.id, slotPoint(slot, size, viewport.height))
      return
    }
    place(current.id, clampPoint(current.point, size, viewport))
  }

  if (!show) return null

  const cell = cellSize(size)
  // where the dragged icon would land, drawn as an outline
  const target = drag && (autoArrange || alignToGrid) ? slotPoint(nearestSlot(drag.point, size, viewport).index, size, viewport.height) : null

  return (
    <>
      <div className="absolute inset-0 z-[10] select-none pointer-events-none">
        {target && drag ? (
          <div
            aria-hidden="true"
            className="absolute rounded-xl border-2 border-dashed"
            style={{
              left: target.x,
              top: target.y,
              width: cell.w - 8,
              height: cell.h - 8,
              borderColor: 'var(--win-border-focus)',
              background: 'var(--panel-primary-bg)',
            }}
          />
        ) : null}
        {ordered.map((app, index) => {
          const dragging = drag?.id === app.id
          const at = dragging && drag ? drag.point : pointOf(app, index)
          return (
            <div
              key={app.id}
              className="pointer-events-auto absolute"
              style={{
                left: at.x,
                top: at.y,
                zIndex: dragging ? 5 : undefined,
                opacity: dragging ? 0.85 : 1,
                touchAction: editing ? 'none' : undefined,
                transition: dragging || !editing ? 'none' : 'left 160ms ease, top 160ms ease',
              }}
              onPointerDown={(e) => begin(e, app, index)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              <DesktopIcon app={app} editing={editing} />
            </div>
          )
        })}
      </div>

      {editing ? (
        <div className="pointer-events-none absolute left-1/2 top-14 z-[60] -translate-x-1/2" role="status">
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-[var(--menu-border)] bg-[var(--menu-bg)] px-3.5 py-2 text-[12px] text-[var(--win-text)] shadow-[var(--menu-shadow)] backdrop-blur-2xl">
            <span>{autoArrange ? t('desktop.view.editHintAuto') : t('desktop.view.editHintFree')}</span>
            <Button variant="primary" size="sm" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setEditing(false)}>
              {t('desktop.view.done')}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
