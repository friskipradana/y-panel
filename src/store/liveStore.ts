import { useMemo } from 'react'
import { create } from 'zustand'
import { useMetricsStore, type MetricPoint, type MetricRange } from './metricsStore'

// One sample per second from the live socket, kept in memory for the last five minutes
const LIVE_POINTS = 300
const EMPTY: MetricPoint[] = []

interface LiveSample {
  t: number
  values: Record<string, number>
  netTotals?: { rx: number; tx: number }
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
  netTotals: { rx: number; tx: number; t: number } | null
  clockOffsetMs: number
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
  netTotals: null,
  clockOffsetMs: 0,
  setConnected: (connected) => set(connected ? { connected } : { connected, statePush: false }),
  setRevision: (revision) => set({ revision }),
  pushSample: ({ t, values, netTotals }) =>
    set((state) => {
      const next = { ...state.series }
      for (const [key, value] of Object.entries(values)) {
        if (!Number.isFinite(value)) continue
        const prev = next[key] ?? EMPTY
        if (prev.length && prev[prev.length - 1].t >= t) continue
        const grown = [...prev, { t, v: value }]
        next[key] = grown.length > LIVE_POINTS ? grown.slice(grown.length - LIVE_POINTS) : grown
      }
      const nextTotals = netTotals
        ? { rx: netTotals.rx, tx: netTotals.tx, t }
        : state.netTotals
      return {
        series: next,
        netTotals: nextTotals,
        clockOffsetMs: t - Date.now(),
      }
    }),
}))

// Series for a chart: stitches stored 5s history with the live 1s stream so short windows never lose context.
export function useRangeSeries(key: string, range: MetricRange): MetricPoint[] {
  const stored = useMetricsStore((s) => s.series[key] ?? EMPTY)
  const live = useLiveStore((s) => s.series[key] ?? EMPTY)
  return useMemo(() => {
    if (live.length === 0) return stored
    if (range === '5m') {
      const firstLiveT = live[0].t
      const lastLiveT = live[live.length - 1].t
      const prefix = stored.filter((p) => p.t < firstLiveT - 500)
      const suffix = stored.filter((p) => p.t > lastLiveT)
      return [...prefix, ...live, ...suffix]
    }
    const lastStoredT = stored.length ? stored[stored.length - 1].t : 0
    const tail = live.filter((p) => p.t > lastStoredT)
    if (tail.length === 0) return stored
    return [...stored, ...tail]
  }, [stored, live, range])
}

export function useLatestMetric(key: string): number | null {
  const stored = useMetricsStore((s) => s.series[key] ?? EMPTY)
  const live = useLiveStore((s) => s.series[key] ?? EMPTY)
  return useMemo(() => {
    const lastLive = live[live.length - 1]
    const lastStored = stored[stored.length - 1]
    if (!lastLive && !lastStored) return null
    if (lastLive && (!lastStored || lastLive.t >= lastStored.t)) return lastLive.v
    return lastStored.v
  }, [stored, live])
}
