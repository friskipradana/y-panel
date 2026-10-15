import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'

export interface MetricPoint {
  /** epoch ms */
  t: number
  /** metric value; FAIL_VALUE marks a failed probe (ping) */
  v: number
}

export const FAIL_VALUE = -1
export const SAMPLE_INTERVAL_MS = 5_000
/** 1 hour of history at the sampling interval */
export const MAX_POINTS = 720
const MAX_AGE_MS = 60 * 60 * 1000 + 60_000
const STORAGE_KEY = 'reneo-metrics-v1'

// Coalesce writes: the sampler ticks every few seconds, localStorage only needs the latest snapshot
function createDebouncedStorage(delayMs: number): StateStorage {
  let pending: { name: string; value: string } | null = null
  let timer: number | null = null

  const flush = () => {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    if (!pending) return
    try {
      localStorage.setItem(pending.name, pending.value)
    } catch {
      // quota or private mode: history stays in memory only
    }
    pending = null
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name)
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      pending = { name, value }
      if (timer === null) timer = window.setTimeout(flush, delayMs)
    },
    removeItem: (name) => {
      pending = null
      try {
        localStorage.removeItem(name)
      } catch {
        // ignore
      }
    },
  }
}

interface MetricsState {
  series: Record<string, MetricPoint[]>
  push: (entries: Array<[key: string, value: number]>, t?: number) => void
  /** Merge server-recorded points (ascending) into the local series */
  merge: (incoming: Record<string, MetricPoint[]>) => void
  clear: (key: string) => void
}

function trim(points: MetricPoint[], now: number) {
  const cutoff = now - MAX_AGE_MS
  let start = 0
  while (start < points.length && points[start].t < cutoff) start++
  const over = points.length - start - MAX_POINTS
  if (over > 0) start += over
  return start > 0 ? points.slice(start) : points
}

export const useMetricsStore = create<MetricsState>()(
  persist(
    (set) => ({
      series: {},

      push: (entries, t = Date.now()) => {
        set((state) => {
          const next = { ...state.series }
          for (const [key, value] of entries) {
            if (!Number.isFinite(value)) continue
            const prev = next[key] ?? []
            // Never go back in time (multiple tabs / clock jumps)
            if (prev.length && prev[prev.length - 1].t >= t) continue
            next[key] = trim([...prev, { t, v: value }], t)
          }
          return { series: next }
        })
      },

      merge: (incoming) => {
        set((state) => {
          const next = { ...state.series }
          const now = Date.now()
          for (const [key, points] of Object.entries(incoming)) {
            if (!Array.isArray(points) || points.length === 0) continue
            const prev = next[key] ?? []
            const lastT = prev.length ? prev[prev.length - 1].t : 0
            const fresh = points.filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.v) && p.t > lastT)
            if (fresh.length === 0) continue
            // Server data is authoritative: drop local points it already covers
            const kept = prev.filter((p) => p.t < fresh[0].t)
            next[key] = trim([...kept, ...fresh], now)
          }
          return { series: next }
        })
      },

      clear: (key) => {
        set((state) => {
          if (!(key in state.series)) return state
          const next = { ...state.series }
          delete next[key]
          return { series: next }
        })
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => createDebouncedStorage(8_000)),
      partialize: (state) => ({ series: state.series }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const now = Date.now()
        const cleaned: Record<string, MetricPoint[]> = {}
        for (const [key, points] of Object.entries(state.series ?? {})) {
          if (!Array.isArray(points)) continue
          const valid = points.filter((p) => p && Number.isFinite(p.t) && Number.isFinite(p.v))
          const trimmed = trim(valid, now)
          if (trimmed.length) cleaned[key] = trimmed
        }
        state.series = cleaned
      },
    },
  ),
)

const EMPTY: MetricPoint[] = []

export function useMetricSeries(key: string): MetricPoint[] {
  return useMetricsStore((s) => s.series[key] ?? EMPTY)
}

export const RANGE_MS = {
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
} as const

export type MetricRange = keyof typeof RANGE_MS

export function asRange(value: unknown): MetricRange {
  return value === '5m' || value === '1h' ? value : '15m'
}
