import axios from 'axios'
import { agentApi } from './client'

export type SpeedPhase = 'idle' | 'ping' | 'download' | 'upload' | 'done'

export interface SpeedResult {
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  jitterMs: number
  at: number
  /** Hanya tes panel ke internet */
  server?: string
  durationMs?: number
}

// Everything the screen shows while a test runs; numbers are filled in as they are measured
export interface SpeedLive {
  phase: SpeedPhase
  /** Kecepatan saat ini pada fase download/upload (Mbps) */
  mbps: number
  /** 0-1 untuk fase yang sedang berjalan */
  fraction: number
  latencyMs: number | null
  jitterMs: number | null
  downloadMbps: number | null
  uploadMbps: number | null
  /** Sampel kecepatan per fase untuk grafik langsung */
  downSamples: number[]
  upSamples: number[]
}

export const IDLE_LIVE: SpeedLive = {
  phase: 'idle',
  mbps: 0,
  fraction: 0,
  latencyMs: null,
  jitterMs: null,
  downloadMbps: null,
  uploadMbps: null,
  downSamples: [],
  upSamples: [],
}

const DOWNLOAD_MS = 8000
const UPLOAD_MS = 6000
const STREAMS = 4
const DOWNLOAD_BYTES = 16 << 20
const UPLOAD_BYTES = 6 << 20
const PING_SAMPLES = 8
const WINDOW_MS = 1200
const MAX_SAMPLES = 80

const now = () => performance.now()
const round1 = (n: number) => Math.round(n * 10) / 10

// Bytes moved in the most recent window up to now, so the number follows the speed right now
// (and falls when the transfer stalls instead of freezing on the last good value)
class RateMeter {
  private samples: Array<{ t: number; bytes: number }> = []
  private total = 0
  private readonly started = now()

  add(bytes: number) {
    this.total += bytes
    this.samples.push({ t: now(), bytes: this.total })
    const cutoff = now() - WINDOW_MS
    // samples[0] stays as the last reading at or before the window start
    while (this.samples.length > 1 && this.samples[1].t <= cutoff) this.samples.shift()
  }

  current(): number {
    const t = now()
    // the first moments hold a few packets over a few milliseconds: not a speed yet
    if (t - this.started < 400) return 0
    const cutoff = Math.max(this.started, t - WINDOW_MS)
    let base = 0
    for (const s of this.samples) {
      if (s.t <= cutoff) base = s.bytes
      else break
    }
    return ((this.total - base) * 8) / ((t - cutoff) / 1000) / 1e6
  }

  average(): number {
    const dt = (now() - this.started) / 1000
    return dt > 0 ? (this.total * 8) / dt / 1e6 : 0
  }
}

const push = (list: number[], value: number) => [...list, round1(value)].slice(-MAX_SAMPLES)

// Folds one measurement into the live state; shared by the browser test and the server stream
export function applyLive(state: SpeedLive, event: Partial<SpeedLive> & { sample?: { kind: 'down' | 'up'; mbps: number } }): SpeedLive {
  const { sample, ...rest } = event
  const next = { ...state, ...rest }
  if (sample?.kind === 'down') next.downSamples = push(state.downSamples, sample.mbps)
  if (sample?.kind === 'up') next.upSamples = push(state.upSamples, sample.mbps)
  return next
}

async function measureLatency(signal: AbortSignal, onSample: (ms: number) => void) {
  const times: number[] = []
  for (let i = 0; i < PING_SAMPLES; i++) {
    const t0 = now()
    await agentApi.get('/api/v1/speedtest/ping', { params: { t: Math.random() }, signal })
    // the first request pays for the connection
    if (i > 0) {
      const ms = now() - t0
      times.push(ms)
      onSample(round1(ms))
    }
  }
  const ordered = [...times].sort((a, b) => a - b)
  const median = ordered[Math.floor(ordered.length / 2)] ?? 0
  let diff = 0
  for (let i = 1; i < times.length; i++) diff += Math.abs(times[i] - times[i - 1])
  return { latencyMs: round1(median), jitterMs: round1(times.length > 1 ? diff / (times.length - 1) : 0) }
}

// Runs the streams until the time is up; each stream restarts its transfer when one ends
async function runStreams(durationMs: number, signal: AbortSignal, onTick: (fraction: number) => void, work: (stop: AbortSignal) => Promise<void>) {
  const stop = new AbortController()
  const forward = () => stop.abort()
  signal.addEventListener('abort', forward)
  const started = now()
  const timer = window.setInterval(() => {
    const fraction = Math.min(1, (now() - started) / durationMs)
    onTick(fraction)
    if (fraction >= 1) stop.abort()
  }, 200)
  try {
    await Promise.all(
      Array.from({ length: STREAMS }, async () => {
        while (!stop.signal.aborted) {
          try {
            await work(stop.signal)
          } catch (error) {
            if (stop.signal.aborted || axios.isCancel(error)) return
            throw error
          }
        }
      }),
    )
  } finally {
    window.clearInterval(timer)
    signal.removeEventListener('abort', forward)
  }
}

function randomBlob(size: number) {
  const data = new Uint8Array(size)
  for (let i = 0; i < size; i += 65536) crypto.getRandomValues(data.subarray(i, Math.min(i + 65536, size)))
  return new Blob([data], { type: 'application/octet-stream' })
}

// Browser <-> panel: the link between this device and the server
export async function runBrowserSpeedtest(onLive: (live: SpeedLive) => void, signal: AbortSignal): Promise<SpeedResult> {
  let live: SpeedLive = { ...IDLE_LIVE, phase: 'ping' }
  const emit = (event: Parameters<typeof applyLive>[1]) => {
    live = applyLive(live, event)
    onLive(live)
  }
  emit({})

  const { latencyMs, jitterMs } = await measureLatency(signal, (ms) => emit({ latencyMs: ms }))
  emit({ latencyMs, jitterMs, phase: 'download' })

  const down = new RateMeter()
  await runStreams(
    DOWNLOAD_MS,
    signal,
    (fraction) => {
      const mbps = down.current()
      emit({ mbps, fraction, downloadMbps: mbps, sample: { kind: 'down', mbps } })
    },
    async (stop) => {
      let last = 0
      await agentApi.get('/api/v1/speedtest/download', {
        params: { bytes: DOWNLOAD_BYTES, t: Math.random() },
        responseType: 'arraybuffer',
        signal: stop,
        onDownloadProgress: (e) => {
          down.add(e.loaded - last)
          last = e.loaded
        },
      })
    },
  )
  const downloadMbps = round1(down.average())
  emit({ downloadMbps, phase: 'upload', mbps: 0, fraction: 0 })

  const up = new RateMeter()
  const body = randomBlob(UPLOAD_BYTES)
  await runStreams(
    UPLOAD_MS,
    signal,
    (fraction) => {
      const mbps = up.current()
      emit({ mbps, fraction, uploadMbps: mbps, sample: { kind: 'up', mbps } })
    },
    async (stop) => {
      let last = 0
      await agentApi.post('/api/v1/speedtest/upload', body, {
        headers: { 'Content-Type': 'application/octet-stream' },
        signal: stop,
        onUploadProgress: (e) => {
          up.add(e.loaded - last)
          last = e.loaded
        },
      })
    },
  )
  const uploadMbps = round1(up.average())
  emit({ uploadMbps, phase: 'done', mbps: 0, fraction: 1 })
  return { downloadMbps, uploadMbps, latencyMs, jitterMs, at: Date.now() }
}

interface ServerEvent {
  type: 'phase' | 'ping' | 'latency' | 'download' | 'upload' | 'done' | 'error'
  phase?: SpeedPhase
  mbps?: number
  fraction?: number
  latencyMs?: number
  jitterMs?: number
  result?: SpeedResult
  error?: string
}

// Panel <-> internet: the agent measures and streams one JSON line per update (superadmin only)
export async function runServerSpeedtest(onLive: (live: SpeedLive) => void, signal: AbortSignal): Promise<SpeedResult> {
  let live: SpeedLive = { ...IDLE_LIVE, phase: 'ping' }
  const emit = (event: Parameters<typeof applyLive>[1]) => {
    live = applyLive(live, event)
    onLive(live)
  }
  emit({})

  const base = (import.meta.env.VITE_AGENT_BASE as string | undefined) ?? ''
  const response = await fetch(`${base}/api/v1/speedtest/server`, { method: 'POST', credentials: 'include', signal })
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? `HTTP ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = null as SpeedResult | null

  const handle = (event: ServerEvent) => {
    switch (event.type) {
      case 'phase':
        // the previous phase ends at its final figure
        emit({ phase: event.phase ?? live.phase, mbps: 0, fraction: 0 })
        break
      case 'ping':
        emit({ latencyMs: event.latencyMs ?? null })
        break
      case 'latency':
        emit({ latencyMs: event.latencyMs ?? null, jitterMs: event.jitterMs ?? null })
        break
      case 'download':
        emit({ mbps: event.mbps ?? 0, fraction: event.fraction ?? 0, downloadMbps: event.mbps ?? 0, sample: { kind: 'down', mbps: event.mbps ?? 0 } })
        break
      case 'upload':
        emit({ mbps: event.mbps ?? 0, fraction: event.fraction ?? 0, uploadMbps: event.mbps ?? 0, sample: { kind: 'up', mbps: event.mbps ?? 0 } })
        break
      case 'done':
        result = event.result ?? null
        if (result) emit({ phase: 'done', mbps: 0, fraction: 1, downloadMbps: result.downloadMbps, uploadMbps: result.uploadMbps, latencyMs: result.latencyMs, jitterMs: result.jitterMs })
        break
      case 'error':
        throw new Error(event.error ?? 'speed test failed')
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) handle(JSON.parse(line) as ServerEvent)
      newline = buffer.indexOf('\n')
    }
  }
  if (!result) throw new Error('the speed test ended without a result')
  return result
}
