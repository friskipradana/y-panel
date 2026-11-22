import { useEffect, useState } from 'react'
import { getMyWidgets, putMyWidgets } from '@/api/system'
import { useAuthStore } from '@/store/authStore'
import { useMetricsStore } from '@/store/metricsStore'
import { sanitizeLayout, sanitizeNotes, useWidgetStore, type MobileWidgetLayout } from '@/store/widgetStore'
import type { PlacedWidget, WidgetType } from '@/types'

const OWNER_KEY = 'reneo-widgets-owner'
const DIRTY_KEY = 'reneo-widgets-dirty'
const PUSH_DELAY_MS = 1_500
const KNOWN_TYPES: WidgetType[] = ['clock-uptime', 'system-vital', 'network-traffic', 'quick-note', 'cpu-graph', 'ping']

function sanitize(input: unknown): PlacedWidget[] {
  if (!Array.isArray(input)) return []
  return input.filter(
    (w): w is PlacedWidget =>
      !!w &&
      typeof w.id === 'string' &&
      KNOWN_TYPES.includes(w.type) &&
      Number.isFinite(w.x) &&
      Number.isFinite(w.y),
  )
}

function sanitizeMobile(input: unknown): MobileWidgetLayout | null {
  if (!input || typeof input !== 'object') return null
  const m = input as Record<string, unknown>
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return { order: ids(m.order), locked: ids(m.locked) }
}

function snapshot() {
  const { placedWidgets, mobile, notes } = useWidgetStore.getState()
  return { placedWidgets, mobile, notes }
}

function readOwner() {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

// A change that has not reached the server yet (page left or reloaded inside the push delay).
// On the next start this local copy wins, so a lock or a moved widget is not undone by the old server copy.
function readDirty() {
  try {
    return localStorage.getItem(DIRTY_KEY)
  } catch {
    return null
  }
}

function writeDirty(username: string | null) {
  try {
    if (username) localStorage.setItem(DIRTY_KEY, username)
    else localStorage.removeItem(DIRTY_KEY)
  } catch {
    // storage unavailable: the check is skipped
  }
}

function writeOwner(username: string) {
  try {
    localStorage.setItem(OWNER_KEY, username)
  } catch {
    // storage unavailable: owner check is skipped next time
  }
}

// Widget layout, notes and per-widget settings belong to the signed-in account.
// The server copy is the source of truth; localStorage is only a cache and is
// never carried over to a different account.
export function useWidgetSync(): boolean {
  const username = useAuthStore((s) => s.user?.username)
  const [syncedFor, setSyncedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!username) return
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    let timer: number | undefined
    let dirty = false

    const push = () => {
      window.clearTimeout(timer)
      if (!dirty) return
      dirty = false
      void putMyWidgets(snapshot())
        .then(() => {
          if (!dirty) writeDirty(null)
        })
        .catch(() => {
          dirty = true // retried on the next change or when the tab is hidden
        })
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') push()
    }

    void (async () => {
      let reachable = true
      let remote: PlacedWidget[] | null = null
      let remoteMobile: MobileWidgetLayout | null = null
      let remoteNotes: unknown = []
      try {
        const res = await getMyWidgets()
        if (res.data && Array.isArray(res.data.placedWidgets)) remote = sanitize(res.data.placedWidgets)
        remoteMobile = sanitizeMobile(res.data?.mobile)
        remoteNotes = res.data?.notes
      } catch {
        reachable = false
      }
      if (cancelled) return

      const store = useWidgetStore.getState()
      const owner = readOwner()
      const unsynced = readDirty() === username
      if (remote && unsynced) {
        // local edits never reached the server: keep them and send them now
        void putMyWidgets(snapshot())
          .then(() => writeDirty(null))
          .catch(() => undefined)
      } else if (remote) {
        store.setNotes(sanitizeNotes(remoteNotes))
        store.setLayout(sanitizeLayout(remote))
        store.normalizeNotes()
        if (remoteMobile) store.setMobileLayout(remoteMobile)
      } else if (owner && owner !== username) {
        // Another account used this browser: start clean instead of inheriting its widgets,
        // and drop the metric history so host figures never carry over to a limited account
        store.resetToDefault()
        store.setNotes([])
        useMetricsStore.setState({ series: {} })
      }
      writeOwner(username)

      if (reachable) {
        if (!remote) {
          // First sync for this account: promote the local layout to the server
          void putMyWidgets(snapshot()).catch(() => undefined)
        }
        let prev = useWidgetStore.getState().placedWidgets
        let prevMobile = useWidgetStore.getState().mobile
        let prevNotes = useWidgetStore.getState().notes
        unsubscribe = useWidgetStore.subscribe((state) => {
          if (state.placedWidgets === prev && state.mobile === prevMobile && state.notes === prevNotes) return
          prev = state.placedWidgets
          prevMobile = state.mobile
          prevNotes = state.notes
          dirty = true
          writeDirty(username)
          window.clearTimeout(timer)
          timer = window.setTimeout(push, PUSH_DELAY_MS)
        })
        document.addEventListener('visibilitychange', onHidden)
      }
      setSyncedFor(username)
    })()

    return () => {
      cancelled = true
      unsubscribe?.()
      document.removeEventListener('visibilitychange', onHidden)
      push()
    }
  }, [username])

  return !!username && syncedFor === username
}
