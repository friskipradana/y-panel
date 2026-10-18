import { queryClient } from '@/lib/queryClient'
import { useLiveStore } from '@/store/liveStore'
import { useMetricsStore, type MetricPoint } from '@/store/metricsStore'

// One shared WebSocket for the panel: a system sample every second, ping results, and the slower
// state the pages used to poll for (summary, recorded history, installed revision).
// It opens with the first user, closes with the last, and reconnects with backoff.

export interface LivePingResult {
  ok: boolean
  latencyMs: number
  mode: string
  resolved?: string
  error?: string
  at: number
}

interface PingSub {
  host: string
  port: number
  intervalSec: number
  onResult: (result: LivePingResult) => void
}

const RECONNECT_MAX_MS = 8_000
const pingSubs = new Map<string, PingSub>()
let socket: WebSocket | null = null
let users = 0
let attempts = 0
let reconnectTimer: number | null = null

function socketUrl() {
  const base = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  const path = base.startsWith('/') ? base : `/${base}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}/system/live/ws`
}

function sendSub(id: string, sub: PingSub) {
  if (socket?.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({ op: 'ping', id, host: sub.host, port: sub.port, intervalSec: sub.intervalSec }))
}

// The slower state the agent pushes: the summary, the recorded history and the installed revision
function handleState(message: Record<string, unknown>) {
  if (message.type === 'summary') {
    // the same payload GET /system/summary returns, for every screen that shows it
    queryClient.setQueryData(['system', 'summary', 'widgets'], message.data)
    queryClient.setQueryData(['agent-system-summary'], message.data)
  } else if (message.type === 'history') {
    useMetricsStore.getState().merge(message.series as Record<string, MetricPoint[]>)
  } else if (message.type === 'revision') {
    useLiveStore.getState().setRevision({ revision: String(message.revision ?? ''), version: String(message.version ?? '') })
  }
}

function handleMessage(raw: string) {
  let message: Record<string, unknown>
  try {
    message = JSON.parse(raw)
  } catch {
    return
  }
  if (message.type === 'stats') {
    const values: Record<string, number> = {
      cpu: Number(message.cpu),
      ram: Number(message.ram),
      disk: Number(message.disk),
      'net-rx': Number(message.netRx),
      'net-tx': Number(message.netTx),
    }
    if (typeof message.temp === 'number') values.temp = message.temp
    useLiveStore.getState().pushSample({ t: Number(message.t) || Date.now(), values })
  } else if (message.type === 'summary' || message.type === 'history' || message.type === 'revision') {
    useLiveStore.getState().markStatePush()
    handleState(message)
  } else if (message.type === 'ping') {
    pingSubs.get(String(message.id))?.onResult({
      ok: Boolean(message.ok),
      latencyMs: Number(message.latencyMs) || 0,
      mode: String(message.mode ?? ''),
      resolved: typeof message.resolved === 'string' ? message.resolved : undefined,
      error: typeof message.error === 'string' ? message.error : undefined,
      at: Number(message.at) || Date.now(),
    })
  }
}

function connect() {
  if (socket || users === 0) return
  const ws = new WebSocket(socketUrl())
  socket = ws
  ws.onopen = () => {
    attempts = 0
    useLiveStore.getState().setConnected(true)
    pingSubs.forEach((sub, id) => sendSub(id, sub))
  }
  ws.onmessage = (event) => {
    if (typeof event.data === 'string') handleMessage(event.data)
  }
  ws.onclose = () => {
    if (socket === ws) socket = null
    useLiveStore.getState().setConnected(false)
    if (users === 0) return
    attempts += 1
    const delay = Math.min(RECONNECT_MAX_MS, 500 * 2 ** Math.min(attempts, 5))
    reconnectTimer = window.setTimeout(connect, delay)
  }
  ws.onerror = () => ws.close()
}

// Call from an effect; the returned function releases the socket
export function acquireLiveSocket(): () => void {
  users += 1
  connect()
  return () => {
    users = Math.max(0, users - 1)
    if (users > 0) return
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    const ws = socket
    socket = null
    ws?.close()
    useLiveStore.getState().setConnected(false)
  }
}

export function subscribeLivePing(id: string, params: Omit<PingSub, 'onResult'>, onResult: PingSub['onResult']): () => void {
  const sub: PingSub = { ...params, onResult }
  pingSubs.set(id, sub)
  sendSub(id, sub)
  return () => {
    pingSubs.delete(id)
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 'unping', id }))
  }
}
