import { useMemo } from 'react'
import { create } from 'zustand'
import { useMetricsStore, type MetricPoint, type MetricRange } from './metricsStore'

// One sample per second from the live socket, kept in memory for the last five minutes
const LIVE_POINTS = 300
const EMPTY: MetricPoint[] = []

interface LiveSample {
  t: number
  values: Record<string, number>
}

interface LiveState {
  connected: boolean
  // true once the agent has pushed the slower state (summary, history, revision) on this connection;
  // an older agent only sends samples, and then the pages keep polling
  statePush: boolean
  markStatePush: () => void
  // the revision of the installed panel, as the agent last pushed it
  revision: { revision: string; version: string } | null
  series: Record<string, MetricPoint[]>
  setConnected: (connected: boolean) => void
  setRevision: (revision: { revision: string; version: string }) => void
  pushSample: (sample: LiveSample) => void
}

export const useLiveStore = create<LiveState>((set) => ({
  connected: false,
  statePush: false,
  markStatePush: () => set((state) => (state.statePush ? state : { statePush: true })),
  revision: null,
  series: {},
  setConnected: (connected) => set(connected ? { connected } : { connected, statePush: false }),
  setRevision: (revision) => set({ revision }),
  pushSample: ({ t, values }) =>
    set((state) => {
      const next = { ...state.series }
      for (const [key, value] of Object.entries(values)) {
        if (!Number.isFinite(value)) continue
        const prev = next[key] ?? EMPTY
        if (prev.length && prev[prev.length - 1].t >= t) continue
        const grown = [...prev, { t, v: value }]
        next[key] = grown.length > LIVE_POINTS ? grown.slice(grown.length - LIVE_POINTS) : grown
      }
      return { series: next }
    }),
}))

// Series for a chart. The 5 minute view is the live one-second series; longer views keep the
// recorded history and end on the newest live value, so the current number is never stale.
export function useRangeSeries(key: string, range: MetricRange): MetricPoint[] {
  const stored = useMetricsStore((s) => s.series[key] ?? EMPTY)
  const live = useLiveStore((s) => s.series[key] ?? EMPTY)
  return useMemo(() => {
    if (live.length === 0) return stored
    if (range === '5m' && live.length >= 3) return live
    const newest = live[live.length - 1]
    const lastStored = stored[stored.length - 1]
    if (lastStored && lastStored.t >= newest.t) return stored
    return [...stored, newest]
  }, [stored, live, range])
}
