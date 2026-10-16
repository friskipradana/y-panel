import axios from 'axios'
import { agentApi } from './client'

export type SpeedPhase = 'idle' | 'ping' | 'download' | 'upload' | 'done'

export interface BrowserSpeedResult {
  downloadMbps: number
  uploadMbps: number
  latencyMs: number
  jitterMs: number
  at: number
}

export interface ServerSpeedResult extends BrowserSpeedResult {
  server: string
  durationMs: number
}

export interface SpeedProgress {
  phase: SpeedPhase
  /** Kecepatan saat ini (Mbps) pada fase download/upload */
  mbps: number
  /** 0-1 untuk fase berjalan */
  fraction: number
}

const DOWNLOAD_MS = 8000
const UPLOAD_MS = 6000
const STREAMS = 4
const DOWNLOAD_BYTES = 16 << 20
const UPLOAD_BYTES = 6 << 20
const PING_SAMPLES = 8
const WINDOW_MS = 1200

const now = () => performance.now()
const round1 = (n: number) => Math.round(n * 10) / 10

// Ukuran byte dalam jendela waktu terakhir, supaya angka tampil mengikuti kecepatan sekarang
class RateMeter {
  private samples: Array<{ t: number; bytes: number }> = []
  private total = 0
  private readonly started = now()

  add(bytes: number) {
    this.total += bytes
    this.samples.push({ t: now(), bytes: this.total })
    const cutoff = now() - WINDOW_MS
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift()
  }

  current(): number {
    if (this.samples.length < 2) return 0
    const first = this.samples[0]
    const last = this.samples[this.samples.length - 1]
    const dt = (last.t - first.t) / 1000
    return dt > 0 ? ((last.bytes - first.bytes) * 8) / dt / 1e6 : 0
  }

  average(): number {
    const dt = (now() - this.started) / 1000
    return dt > 0 ? (this.total * 8) / dt / 1e6 : 0
  }
}

async function measureLatency(signal: AbortSignal) {
  const times: number[] = []
  for (let i = 0; i < PING_SAMPLES; i++) {
    const t0 = now()
    await agentApi.get('/api/v1/speedtest/ping', { params: { t: Math.random() }, signal })
    // the first request pays for the connection
    if (i > 0) times.push(now() - t0)
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)] ?? 0
  let diff = 0
  for (let i = 1; i < times.length; i++) diff += times[i] - times[i - 1]
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
  }, 150)
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
export async function runBrowserSpeedtest(onProgress: (p: SpeedProgress) => void, signal: AbortSignal): Promise<BrowserSpeedResult> {
  onProgress({ phase: 'ping', mbps: 0, fraction: 0 })
  const { latencyMs, jitterMs } = await measureLatency(signal)

  const down = new RateMeter()
  await runStreams(
    DOWNLOAD_MS,
    signal,
    (fraction) => onProgress({ phase: 'download', mbps: down.current(), fraction }),
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

  const up = new RateMeter()
  const body = randomBlob(UPLOAD_BYTES)
  await runStreams(
    UPLOAD_MS,
    signal,
    (fraction) => onProgress({ phase: 'upload', mbps: up.current(), fraction }),
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

  const result = { downloadMbps: round1(down.average()), uploadMbps: round1(up.average()), latencyMs, jitterMs, at: Date.now() }
  onProgress({ phase: 'done', mbps: 0, fraction: 1 })
  return result
}

// Panel <-> internet, measured by the agent (superadmin only)
export const runServerSpeedtest = (signal?: AbortSignal) =>
  agentApi.post<ServerSpeedResult>('/api/v1/speedtest/server', null, { timeout: 60_000, signal }).then((r) => r.data)
