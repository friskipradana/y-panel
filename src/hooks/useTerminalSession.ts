import { useCallback, useEffect, useRef, useState } from 'react'
import { closeTerminalSession, listTerminalSessions, startTerminalSession } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'

type TerminalSocketMessage = {
  type: 'ready' | 'output' | 'closed' | 'error' | 'resize' | 'pong'
  data?: string
  error?: string
  closed?: boolean
  sessionId?: string
  cols?: number
  rows?: number
}

const HEARTBEAT_MS = 20_000
const WATCHDOG_MS = 10_000
const STALE_AFTER_MS = 55_000
const RECONNECT_BASE_MS = 800
const RECONNECT_MAX_MS = 8_000
const RECONNECT_MAX_ATTEMPTS = 12
const MAX_PENDING_INPUT = 200

function resolveTerminalSocketUrl(sessionId: string, replay = false) {
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  const base = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${base}/terminal/sessions/${sessionId}/ws${replay ? '?replay=1' : ''}`
}

function filterInternalTerminalNoise(input: string) {
  return input
    .replace(/^.*stty cols \d+ rows \d+ 2>\/dev\/null; export COLUMNS=\d+ LINES=\d+\r?\n?/gm, '')
    .replace(/\u001b(?:\](?:633|133|[^\u0007\u001b]*)|P\$q.*?)(?:\u0007|\u001b\\)/g, '')
}

function mapKeyToTerminalInput(event: KeyboardEvent) {
  if (event.ctrlKey && event.key.toLowerCase() === 'c') return '\u0003'
  if (event.ctrlKey && event.key.toLowerCase() === 'd') return '\u0004'
  if (event.ctrlKey && event.key.toLowerCase() === 'l') return '\u000c'
  if (event.ctrlKey && event.key.toLowerCase() === 'z') return '\u001a'
  if (event.ctrlKey && event.key.toLowerCase() === 'a') return '\u0001'
  if (event.ctrlKey && event.key.toLowerCase() === 'e') return '\u0005'
  if (event.ctrlKey && event.key.toLowerCase() === 'k') return '\u000b'
  if (event.ctrlKey && event.key.toLowerCase() === 'u') return '\u0015'
  if (event.ctrlKey && event.key.toLowerCase() === 'w') return '\u0017'
  if (event.ctrlKey && event.key.toLowerCase() === 'r') return '\u0012'
  if (event.key === 'Enter') return '\r'
  if (event.key === 'Backspace') return '\u007f'
  if (event.key === 'Tab') return '\t'
  if (event.key === 'Escape') return '\u001b'
  if (event.key === 'ArrowUp') return '\u001b[A'
  if (event.key === 'ArrowDown') return '\u001b[B'
  if (event.key === 'ArrowRight') return '\u001b[C'
  if (event.key === 'ArrowLeft') return '\u001b[D'
  if (event.key === 'Home') return '\u001b[H'
  if (event.key === 'End') return '\u001b[F'
  if (event.key === 'PageUp') return '\u001b[5~'
  if (event.key === 'PageDown') return '\u001b[6~'
  if (event.key === 'Insert') return '\u001b[2~'
  if (event.key === 'Delete') return '\u001b[3~'
  if (event.key.length === 1 && !event.metaKey) return event.key
  return null
}

const reconnectDelay = (attempt: number) =>
  Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1), RECONNECT_MAX_MS) + Math.floor(Math.random() * 250)

export interface UseTerminalSessionOptions {
  initialSessionId?: string | null
  onSessionChange?: (sessionId: string | null) => void
  onSessionInvalid?: (sessionId: string) => void
}

export function useTerminalSession(options?: UseTerminalSessionOptions) {
  const [sessionId, setSessionId] = useState<string | null>(options?.initialSessionId ?? null)
  const [starting, setStarting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [closed, setClosed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closedByUser, setClosedByUser] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string | null>(options?.initialSessionId ?? null)
  const targetRef = useRef('local')
  const cwdRef = useRef<string | undefined>(undefined)
  const manualCloseRef = useRef(false)
  const backendClosedRef = useRef(false)
  const startInFlightRef = useRef(false)
  const sessionEpochRef = useRef(0)
  const attemptRef = useRef(0)
  const reconnectTimerRef = useRef<number | null>(null)
  const heartbeatRef = useRef<number | null>(null)
  const watchdogRef = useRef<number | null>(null)
  const lastRxRef = useRef(0)
  const pendingInputRef = useRef<string[]>([])
  const terminalSizeRef = useRef({ cols: 120, rows: 32 })
  const outputListenerRef = useRef<((chunk: string) => void) | null>(null)
  const connectSocketRef = useRef<(id: string, epoch: number, replay?: boolean) => void>(() => {})

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current)
    if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current)
    if (watchdogRef.current !== null) window.clearInterval(watchdogRef.current)
    reconnectTimerRef.current = heartbeatRef.current = watchdogRef.current = null
  }, [])

  const cleanupSocket = useCallback((closeActive = true) => {
    const socket = socketRef.current
    socketRef.current = null
    if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current)
    if (watchdogRef.current !== null) window.clearInterval(watchdogRef.current)
    heartbeatRef.current = watchdogRef.current = null

    if (!closeActive || !socket) return
    socket.onmessage = socket.onerror = socket.onclose = null
    if (socket.readyState === WebSocket.CONNECTING) socket.onopen = () => socket.close()
    else if (socket.readyState === WebSocket.OPEN) socket.close()
  }, [])

  const releaseSession = useCallback(async (id: string | null) => {
    if (!id) return
    try {
      await closeTerminalSession(id)
    } catch (err) {
      runtimeLogger.warn('terminal', 'release session failed', { sessionId: id, error: err })
    }
  }, [])

  const close = useCallback(async () => {
    manualCloseRef.current = true
    setClosedByUser(true)
    clearTimers()
    cleanupSocket(true)
    pendingInputRef.current = []

    const id = sessionIdRef.current
    sessionIdRef.current = null
    setSessionId(null)
    options?.onSessionChange?.(null)
    setConnected(false)
    setReconnecting(false)
    setClosed(true)

    await releaseSession(id)
  }, [cleanupSocket, clearTimers, releaseSession, options])

  const scheduleReconnect = useCallback((epoch: number, immediate = false) => {
    if (manualCloseRef.current || backendClosedRef.current) return
    if (sessionEpochRef.current !== epoch || !sessionIdRef.current) return
    if (reconnectTimerRef.current !== null) {
      if (!immediate) return
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    attemptRef.current += 1
    if (attemptRef.current > RECONNECT_MAX_ATTEMPTS) {
      setReconnecting(false)
      setClosed(true)
      setError('Koneksi terminal terputus. Klik Reconnect untuk memulai ulang.')
      return
    }

    setConnected(false)
    setReconnecting(true)
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null
      const id = sessionIdRef.current
      if (!id || manualCloseRef.current || sessionEpochRef.current !== epoch) return
      connectSocketRef.current(id, epoch, false)
    }, immediate ? 0 : reconnectDelay(attemptRef.current))
  }, [])

  const connectSocket = useCallback((nextId: string, epoch: number, replay = false) => {
    cleanupSocket(true)
    const socket = new WebSocket(resolveTerminalSocketUrl(nextId, replay))
    socketRef.current = socket
    const isCurrent = () => socketRef.current === socket && sessionIdRef.current === nextId && sessionEpochRef.current === epoch

    socket.onopen = () => {
      if (!isCurrent()) return
      attemptRef.current = 0
      lastRxRef.current = Date.now()
      setConnected(true)
      setReconnecting(false)
      setClosed(false)
      setError(null)

      socket.send(JSON.stringify({ type: 'resize', ...terminalSizeRef.current }))
      const pending = pendingInputRef.current
      pendingInputRef.current = []
      for (const data of pending) socket.send(JSON.stringify({ type: 'input', data }))

      heartbeatRef.current = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }))
      }, HEARTBEAT_MS)
      watchdogRef.current = window.setInterval(() => {
        if (Date.now() - lastRxRef.current > STALE_AFTER_MS) socket.close()
      }, WATCHDOG_MS)
    }

    socket.onmessage = (event) => {
      if (!isCurrent()) return
      lastRxRef.current = Date.now()
      try {
        const msg = JSON.parse(event.data) as TerminalSocketMessage
        if (msg.type === 'ready' || msg.type === 'pong') return
        if (msg.type === 'output' && msg.data) {
          const chunk = filterInternalTerminalNoise(msg.data)
          if (chunk) outputListenerRef.current?.(chunk)
          return
        }
        if (msg.type === 'closed') {
          backendClosedRef.current = true
          setConnected(false)
          setReconnecting(false)
          setClosed(true)
          options?.onSessionChange?.(null)
          return
        }
        if (msg.type === 'error') {
          const text = msg.error ?? 'Terminal error'
          if (/session not found/i.test(text)) {
            backendClosedRef.current = true
            setReconnecting(false)
            setClosed(true)
            setConnected(false)
            options?.onSessionInvalid?.(nextId)
            setError('Sesi terminal sudah berakhir. Klik Reconnect untuk sesi baru.')
            return
          }
          setError(text)
        }
      } catch {
        const chunk = filterInternalTerminalNoise(String(event.data ?? ''))
        if (chunk) outputListenerRef.current?.(chunk)
      }
    }

    socket.onerror = () => {}
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null
      if (sessionIdRef.current !== nextId || sessionEpochRef.current !== epoch) return
      clearTimers()
      setConnected(false)
      if (manualCloseRef.current || backendClosedRef.current) return
      scheduleReconnect(epoch)
    }
  }, [cleanupSocket, clearTimers, scheduleReconnect, options])

  useEffect(() => {
    connectSocketRef.current = connectSocket
  }, [connectSocket])

  const attach = useCallback((existingId: string) => {
    if (startInFlightRef.current || !existingId) return
    manualCloseRef.current = false
    backendClosedRef.current = false
    attemptRef.current = 0
    sessionEpochRef.current += 1
    const epoch = sessionEpochRef.current
    clearTimers()
    cleanupSocket(true)
    pendingInputRef.current = []
    setClosedByUser(false)
    setStarting(false)
    setError(null)
    setClosed(false)
    setConnected(false)
    setReconnecting(false)

    void listTerminalSessions().then((activeSessions) => {
      if (sessionEpochRef.current !== epoch) return
      const found = activeSessions.some((s) => s.sessionId === existingId)
      if (!found) {
        options?.onSessionInvalid?.(existingId)
        return
      }
      sessionIdRef.current = existingId
      setSessionId(existingId)
      options?.onSessionChange?.(existingId)
      connectSocket(existingId, epoch, true)
    }).catch(() => {
      if (sessionEpochRef.current !== epoch) return
      sessionIdRef.current = existingId
      setSessionId(existingId)
      options?.onSessionChange?.(existingId)
      connectSocket(existingId, epoch, true)
    })
  }, [cleanupSocket, clearTimers, connectSocket, options])

  const start = useCallback(async (target = 'local', cwd?: string) => {
    if (startInFlightRef.current) return
    startInFlightRef.current = true
    targetRef.current = target
    cwdRef.current = cwd
    manualCloseRef.current = false
    backendClosedRef.current = false
    attemptRef.current = 0
    sessionEpochRef.current += 1
    const epoch = sessionEpochRef.current
    clearTimers()
    cleanupSocket(true)
    pendingInputRef.current = []
    setClosedByUser(false)
    setStarting(true)
    setError(null)
    setClosed(false)
    setConnected(false)
    setReconnecting(false)

    const prev = sessionIdRef.current
    sessionIdRef.current = null
    setSessionId(null)
    await releaseSession(prev)

    try {
      const result = await startTerminalSession(target, cwd)
      if (sessionEpochRef.current !== epoch) {
        await releaseSession(result.sessionId)
        return
      }
      sessionIdRef.current = result.sessionId
      setSessionId(result.sessionId)
      options?.onSessionChange?.(result.sessionId)
      connectSocket(result.sessionId, epoch, false)
    } catch (err) {
      if (sessionEpochRef.current === epoch) {
        setError(err instanceof Error ? err.message : 'Gagal memulai terminal session')
      }
    } finally {
      if (sessionEpochRef.current === epoch) setStarting(false)
      startInFlightRef.current = false
    }
  }, [cleanupSocket, clearTimers, connectSocket, releaseSession, options])

  useEffect(() => {
    const kick = () => {
      if (manualCloseRef.current || backendClosedRef.current || !sessionIdRef.current) return
      if (socketRef.current?.readyState === WebSocket.OPEN) return
      attemptRef.current = 0
      scheduleReconnect(sessionEpochRef.current, true)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') kick() }
    window.addEventListener('online', kick)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', kick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [scheduleReconnect])

  const sendInput = useCallback(async (input: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'input', data: input }))
      return
    }
    if (sessionIdRef.current && !backendClosedRef.current && !manualCloseRef.current) {
      if (pendingInputRef.current.length < MAX_PENDING_INPUT) pendingInputRef.current.push(input)
    }
  }, [])

  const handleTerminalKey = useCallback((event: KeyboardEvent) => {
    const payload = mapKeyToTerminalInput(event)
    if (!payload) return false
    event.preventDefault()
    void sendInput(payload)
    return true
  }, [sendInput])

  const updateTerminalSize = useCallback((cols: number, rows: number) => {
    const next = { cols: Math.max(20, Math.floor(cols)), rows: Math.max(8, Math.floor(rows)) }
    if (next.cols === terminalSizeRef.current.cols && next.rows === terminalSizeRef.current.rows) return
    terminalSizeRef.current = next
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'resize', ...next }))
    }
  }, [])

  useEffect(() => {
    return () => {
      manualCloseRef.current = true
      clearTimers()
      cleanupSocket(true)
      // Detach cleanly without killing the backend session so refresh preserves it.
      sessionIdRef.current = null
    }
  }, [cleanupSocket, clearTimers])

  const setOutputListener = useCallback((listener: ((chunk: string) => void) | null) => {
    outputListenerRef.current = listener
  }, [])

  return {
    sessionId, starting, connected, reconnecting, closed, closedByUser, error,
    start, attach, sendInput, handleTerminalKey, updateTerminalSize, setOutputListener, close,
  }
}
