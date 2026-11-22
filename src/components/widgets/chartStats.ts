import { FAIL_VALUE, RANGE_MS, type MetricPoint, type MetricRange } from '@/store/metricsStore'

/** Summary stats over the visible window, ignoring failed probes */
export function summarize(points: MetricPoint[], range: MetricRange, now = Date.now()) {
  const from = now - RANGE_MS[range]
  const values = points.filter((p) => p.t >= from && p.v !== FAIL_VALUE).map((p) => p.v)
  const failed = points.filter((p) => p.t >= from && p.v === FAIL_VALUE).length
  if (!values.length) return { min: 0, max: 0, avg: 0, count: 0, failed }
  const sum = values.reduce((a, b) => a + b, 0)
  return { min: Math.min(...values), max: Math.max(...values), avg: sum / values.length, count: values.length, failed }
}
