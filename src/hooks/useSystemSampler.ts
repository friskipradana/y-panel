import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSystemHistory, getSystemSummary } from '@/api/system'
import { SAMPLE_INTERVAL_MS, useMetricsStore } from '@/store/metricsStore'

// One shared poll for every system widget (CPU, RAM, disk, network)
export function useSystemSummary() {
  return useQuery({
    queryKey: ['system', 'summary', 'widgets'],
    queryFn: getSystemSummary,
    refetchInterval: SAMPLE_INTERVAL_MS,
    staleTime: SAMPLE_INTERVAL_MS / 2,
  })
}

const HISTORY_KEYS = ['cpu', 'ram', 'disk', 'temp', 'net-rx', 'net-tx']

function lastSeen() {
  const series = useMetricsStore.getState().series
  let latest = 0
  for (const key of HISTORY_KEYS) {
    const pts = series[key]
    if (pts?.length) latest = Math.max(latest, pts[pts.length - 1].t)
  }
  return latest
}

// Pulls the agent's recorded history (it keeps sampling while no browser is open).
// Falls back to sampling in the browser when the agent has no history endpoint.
export function useSystemSampler() {
  const { data, dataUpdatedAt } = useSystemSummary()
  const prevNet = useRef<{ rx: number; tx: number; t: number } | null>(null)

  const history = useQuery({
    queryKey: ['system', 'history'],
    queryFn: async () => {
      // Overlap by one interval so a slow poll never leaves a hole
      const since = Math.max(0, lastSeen() - SAMPLE_INTERVAL_MS)
      const series = await getSystemHistory(since)
      useMetricsStore.getState().merge(series)
      return true
    },
    refetchInterval: SAMPLE_INTERVAL_MS,
    retry: false,
  })
  const serverHistory = history.isSuccess

  useEffect(() => {
    if (serverHistory) return
    if (!data || !dataUpdatedAt) return
    const t = dataUpdatedAt
    const entries: Array<[string, number]> = [['cpu', Math.min(100, Math.max(0, data.cpuUsagePercent ?? 0))]]

    const ramTotal = data.memory?.total ?? 0
    if (ramTotal > 0) entries.push(['ram', Math.min(100, ((data.memory?.used ?? 0) / ramTotal) * 100)])
    const diskTotal = data.storage?.total ?? 0
    if (diskTotal > 0) entries.push(['disk', Math.min(100, ((data.storage?.used ?? 0) / diskTotal) * 100)])
    if (typeof data.cpuTemp === 'number' && data.cpuTemp > 0) entries.push(['temp', data.cpuTemp])

    const rx = data.networkIO?.bytesRecv ?? 0
    const tx = data.networkIO?.bytesSent ?? 0
    const prev = prevNet.current
    if (prev && (rx > 0 || tx > 0)) {
      const elapsed = (t - prev.t) / 1000
      if (elapsed > 0.5) {
        entries.push(['net-rx', Math.max(0, (rx - prev.rx) / elapsed)])
        entries.push(['net-tx', Math.max(0, (tx - prev.tx) / elapsed)])
      }
    }
    prevNet.current = { rx, tx, t }

    useMetricsStore.getState().push(entries, t)
  }, [data, dataUpdatedAt, serverHistory])
}
