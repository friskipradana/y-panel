import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PlacedWidget, WidgetConfig, WidgetType } from '@/types'
import { useMetricsStore } from '@/store/metricsStore'
import { isMobileLayoutNow } from '@/hooks/useIsMobileLayout'
import {
  MULTI_INSTANCE_WIDGETS, DEFAULT_WIDGET_CONFIG, WIDGET_TOP, WIDGET_WIDTH, WIDGET_GAP, COLUMN_WIDTH,
  widgetHeightOf, WIDGET_MIN_WIDTH, WIDGET_MIN_HEIGHT, WIDGET_MAX_WIDTH, WIDGET_MAX_HEIGHT,
  getDefaultPositions, autoSpaceWidgets, snapWidgetPosition, resolveWidgetOverlap, widgetsAreFree,
  sanitizeLayout, findSmartSpawnPosition,
} from './widgetLayout'

export * from './widgetLayout'

export interface MobileWidgetLayout {
  order: string[]
  locked: string[]
}

const EMPTY_MOBILE: MobileWidgetLayout = { order: [], locked: [] }

export function orderWidgetsForMobile(widgets: PlacedWidget[], order: string[]): PlacedWidget[] {
  const rank = new Map(order.map((id, i) => [id, i]))
  const known = widgets.filter((w) => rank.has(w.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  const rest = widgets.filter((w) => !rank.has(w.id)).sort((a, b) => a.y - b.y || a.x - b.x)
  return [...known, ...rest]
}

export interface StickyNote {
  id: string
  text: string
  color: string
}

export const MAX_NOTES = 50
export const MAX_NOTE_CHARS = 4000

export function newNoteId() {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function sanitizeNotes(input: unknown): StickyNote[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: StickyNote[] = []
  for (const n of input) {
    if (!n || typeof n.id !== 'string' || typeof n.text !== 'string' || seen.has(n.id)) continue
    seen.add(n.id)
    out.push({ id: n.id, text: n.text.slice(0, MAX_NOTE_CHARS), color: typeof n.color === 'string' ? n.color : 'yellow' })
    if (out.length >= MAX_NOTES) break
  }
  return out
}

export function migrateNotes(widgets: PlacedWidget[], notes: StickyNote[]): { widgets: PlacedWidget[]; notes: StickyNote[] } {
  const known = new Set(notes.map((n) => n.id))
  const nextNotes = [...notes]
  let changed = false
  const add = (note: StickyNote) => {
    if (nextNotes.length >= MAX_NOTES) return
    nextNotes.push(note)
    known.add(note.id)
  }
  const next = widgets.map((w) => {
    if (w.type !== 'quick-note') return w
    const noteId = typeof w.config?.noteId === 'string' ? w.config.noteId : ''
    if (noteId && known.has(noteId)) return w
    changed = true
    const color = typeof w.config?.color === 'string' ? w.config.color : 'yellow'
    let memos: { id: string; text: string }[] = []
    try {
      const parsed: unknown = JSON.parse(String(w.config?.notes ?? '[]'))
      if (Array.isArray(parsed)) memos = parsed.filter((m) => m && typeof m.id === 'string' && typeof m.text === 'string')
    } catch {
      // damaged value: the single text below is used
    }
    if (memos.length === 0) memos = [{ id: newNoteId(), text: typeof w.config?.text === 'string' ? w.config.text : '' }]
    const activeId = typeof w.config?.active === 'string' ? w.config.active : memos[0].id
    const open = memos.find((m) => m.id === activeId) ?? memos[0]
    const id = known.has(open.id) ? newNoteId() : open.id
    add({ id, text: open.text.slice(0, MAX_NOTE_CHARS), color })
    memos.filter((m) => m !== open).forEach((m) => add({ id: known.has(m.id) ? newNoteId() : m.id, text: m.text.slice(0, MAX_NOTE_CHARS), color }))
    return { ...w, config: { noteId: id } }
  })
  return changed ? { widgets: next, notes: nextNotes } : { widgets, notes }
}

let settleTimer: ReturnType<typeof setTimeout> | undefined

export function scheduleLayoutSettle() {
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => useWidgetStore.getState().settleLayout(), 250)
}

export const useNoteListStore = create<{ openFor: string | null; setOpenFor: (id: string | null) => void }>((set) => ({
  openFor: null,
  setOpenFor: (openFor) => set({ openFor }),
}))

interface WidgetState {
  placedWidgets: PlacedWidget[]
  notes: StickyNote[]
  setNotes: (notes: StickyNote[]) => void
  normalizeNotes: () => void
  updateNote: (id: string, patch: Partial<Pick<StickyNote, 'text' | 'color'>>) => void
  deleteNote: (id: string) => void
  openNote: (id: string) => string
  newStickyNote: () => string
  mobile: MobileWidgetLayout
  moveMobileWidget: (id: string, delta: -1 | 1) => void
  toggleMobileLock: (id: string) => void
  setMobileLayout: (layout: MobileWidgetLayout) => void
  resetMobileLayout: () => void
  addWidget: (type: WidgetType, pos?: { x: number; y: number }, config?: WidgetConfig) => string
  removeWidget: (id: string) => void
  updateWidgetPosition: (id: string, x: number, y: number) => void
  resizeWidget: (id: string, rect: { x: number; y: number; w: number; h: number }) => void
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
      notes: [],
      mobile: EMPTY_MOBILE,

      setNotes: (notes) => set({ notes }),

      normalizeNotes: () => {
        const { placedWidgets, notes } = get()
        const next = migrateNotes(placedWidgets, notes)
        if (next.widgets !== placedWidgets || next.notes !== notes) set({ placedWidgets: next.widgets, notes: next.notes })
      },

      updateNote: (id, patch) =>
        set((state) => ({
          notes: state.notes.map((n) => (n.id === id ? { ...n, ...patch, text: (patch.text ?? n.text).slice(0, MAX_NOTE_CHARS) } : n)),
        })),

      deleteNote: (id) =>
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
          placedWidgets: state.placedWidgets.filter((w) => !(w.type === 'quick-note' && w.config?.noteId === id)),
        })),

      openNote: (id) => {
        const shown = get().placedWidgets.find((w) => w.type === 'quick-note' && w.config?.noteId === id)
        return shown ? shown.id : get().addWidget('quick-note', undefined, { noteId: id })
      },

      newStickyNote: () => {
        if (get().notes.length >= MAX_NOTES) return ''
        return get().addWidget('quick-note')
      },

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

      addWidget: (type, pos, extra) => {
        if (!MULTI_INSTANCE_WIDGETS.includes(type)) {
          const existing = get().placedWidgets.find((w) => w.type === type)
          if (existing) return existing.id
        }

        const id = `widget-${type}-${Date.now()}`
        const current = get().placedWidgets
        const wanted = pos
          ? widgetsAreFree()
            ? { x: Math.max(0, Math.round(pos.x)), y: Math.max(WIDGET_TOP, Math.round(pos.y)) }
            : snapWidgetPosition(id, type, pos.x, pos.y, current)
          : findSmartSpawnPosition(current, type)
        const finalPos = pos && widgetsAreFree() ? wanted : resolveWidgetOverlap(id, type, wanted.x, wanted.y, current)

        let noteId = typeof extra?.noteId === 'string' ? extra.noteId : ''
        const created: StickyNote[] = []
        if (type === 'quick-note' && !noteId) {
          noteId = newNoteId()
          created.push({ id: noteId, text: '', color: 'yellow' })
        }
        const base = DEFAULT_WIDGET_CONFIG[type] ? { ...DEFAULT_WIDGET_CONFIG[type] } : undefined
        const newWidget: PlacedWidget = {
          id,
          type,
          x: Math.round(finalPos.x),
          y: Math.round(finalPos.y),
          isLocked: false,
          config: type === 'quick-note' ? { noteId } : base || extra ? { ...base, ...extra } : undefined,
        }

        set((state) => ({
          placedWidgets: [...state.placedWidgets, newWidget],
          notes: created.length ? [...state.notes, ...created] : state.notes,
        }))

        return id
      },

      removeWidget: (id) => {
        useMetricsStore.getState().clear(`ping:${id}`)
        set((state) => {
          const closed = state.placedWidgets.find((w) => w.id === id)
          const noteId = closed?.type === 'quick-note' ? String(closed.config?.noteId ?? '') : ''
          const empty = noteId && state.notes.some((n) => n.id === noteId && !n.text.trim())
          return {
            placedWidgets: state.placedWidgets.filter((w) => w.id !== id),
            notes: empty ? state.notes.filter((n) => n.id !== noteId) : state.notes,
          }
        })
      },

      setLayout: (widgets) => set({ placedWidgets: widgets }),

      settleLayout: () => {
        const current = get().placedWidgets
        const next = sanitizeLayout(current)
        const changed = next.some((w, i) => w.x !== current[i].x || w.y !== current[i].y)
        if (changed) set({ placedWidgets: next })
      },

      updateWidgetConfig: (id, patch) => {
        set((state) => ({
          placedWidgets: state.placedWidgets.map((w) => (w.id === id ? { ...w, config: { ...(w.config ?? {}), ...patch } } : w)),
        }))
      },

      updateWidgetPosition: (id, x, y) => {
        set((state) => ({
          placedWidgets: state.placedWidgets.map((w) => (w.id === id ? { ...w, x: Math.round(x), y: Math.round(y) } : w)),
        }))
      },

      resizeWidget: (id, rect) => {
        set((state) => ({
          placedWidgets: state.placedWidgets.map((w) =>
            w.id === id && !w.isLocked
              ? {
                  ...w,
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  w: Math.round(Math.min(WIDGET_MAX_WIDTH, Math.max(WIDGET_MIN_WIDTH, rect.w))),
                  h: Math.round(Math.min(WIDGET_MAX_HEIGHT, Math.max(WIDGET_MIN_HEIGHT, rect.h))),
                }
              : w,
          ),
        }))
      },

      toggleWidgetLock: (id) => {
        set((state) => ({
          placedWidgets: state.placedWidgets.map((w) => (w.id === id ? { ...w, isLocked: !w.isLocked } : w)),
        }))
      },

      resetToDefault: () => set({ placedWidgets: getDefaultPositions() }),

      resetLayout: () => {
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
        const maxBottom = screenHeight - 90

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
          rearranged.push({ ...w, x: colX, y: currentY })
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
          const next = migrateNotes(sanitizeLayout(state.placedWidgets), sanitizeNotes(state.notes))
          state.placedWidgets = next.widgets
          state.notes = next.notes
        }
      },
    },
  ),
)
