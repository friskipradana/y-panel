import { useCallback, useEffect, useRef, useState } from 'react'
import { closeTerminalSession, startTerminalSession } from '@/api/agent'
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

// Heartbeat and reconnect tuning
const HEARTBEAT_MS = 20_000
const WATCHDOG_MS = 10_000
const STALE_AFTER_MS = 55_000
const RECONNECT_BASE_MS = 800
const RECONNECT_MAX_MS = 8_000
const RECONNECT_MAX_ATTEMPTS = 12
const MAX_PENDING_INPUT = 200

function resolveTerminalSocketUrl(sessionId: string) {
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  const normalizedBase = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${normalizedBase}/terminal/sessions/${sessionId}/ws`
}

function filterInternalTerminalNoise(input: string) {
  return input
    .replace(/^.*stty cols \d+ rows \d+ 2>\/dev\/null; export COLUMNS=\d+ LINES=\d+\r?\n?/gm, '')
    .replace(/\u001b\]633;.*?(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\]133;.*?(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001bP\$q.*?\u001b\\/g, '')
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
}

function mapKeyToTerminalInput(event: KeyboardEvent) {
  if (event.ctrlKey && event.key.toLowerCase() === 'c') return '\u0003'
  if (event.ctrlKey && event.key.toLowerCase() === 'd') return '\u0004'
  if (event.ctrlKey && event.key.toLowerCase() === 'l') return '\u000c'
  if (event.key === 'Enter') return '\r'
  if (event.key === 'Backspace') return '\u007f'
  if (event.key === 'Tab') return '\t'
  if (event.key === 'Escape') return '\u001b'
  if (event.key === 'ArrowUp') return '\u001b[A'
  if (event.key === 'ArrowDown') return '\u001b[B'
  if (event.key === 'ArrowRight') return '\u001b[C'
  if (event.key === 'ArrowLeft') return '\u001b[D'
  if (event.key.length === 1 && !event.metaKey) return event.key
  return null
}

function reconnectDelay(attempt: number) {
  const base = Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1), RECONNECT_MAX_MS)
  return base + Math.floor(Math.random() * 250)
}

export function useTerminalSession() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [closed, setClosed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closedByUser, setClosedByUser] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const targetRef = useRef('local')
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
  const connectSocketRef = useRef<(id: string, epoch: number) => void>(() => {})

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current)
    if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current)
    if (watchdogRef.current !== null) window.clearInterval(watchdogRef.current)
    reconnectTimerRef.current = null
    heartbeatRef.current = null
    watchdogRef.current = null
  }, [])

  const cleanupSocket = useCallback((closeActiveSocket = true) => {
    const socket = socketRef.current
    socketRef.current = null
    if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current)
    if (watchdogRef.current !== null) window.clearInterval(watchdogRef.current)
    heartbeatRef.current = null
    watchdogRef.current = null

    if (!closeActiveSocket || !socket) return
    // Detach handlers so a late close event cannot trigger a reconnect loop
    socket.onopen = null
    socket.onmessage = null
    socket.onerror = null
    socket.onclose = null
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      runtimeLogger.info('terminal', 'closing websocket connection', { sessionId: sessionIdRef.current })
      socket.close()
    }
  }, [])

  const releaseSession = useCallback(async (id: string | null) => {
    if (!id) return
    try {
      runtimeLogger.info('terminal', 'releasing terminal session', { sessionId: id })
      await closeTerminalSession(id)
    } catch (err) {
      runtimeLogger.warn('terminal', 'release session request failed', { sessionId: id, error: err })
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
    setConnected(false)
    setReconnecting(false)
    setClosed(true)

    await releaseSession(id)
  }, [cleanupSocket, clearTimers, releaseSession])

  // Re-attach the websocket to the same backend session (the shell keeps running)
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
      runtimeLogger.warn('terminal', 'reconnect attempts exhausted', { sessionId: sessionIdRef.current })
      setReconnecting(false)
      setClosed(true)
      setError('Koneksi terminal terputus. Klik Reconnect untuk memulai ulang.')
      return
    }

    setConnected(false)
    setReconnecting(true)
    const delay = immediate ? 0 : reconnectDelay(attemptRef.current)
    runtimeLogger.info('terminal', 'scheduling websocket reconnect', { attempt: attemptRef.current, delay })

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null
      const id = sessionIdRef.current
      if (!id || manualCloseRef.current || sessionEpochRef.current !== epoch) return
      connectSocketRef.current(id, epoch)
    }, delay)
  }, [])

  const connectSocket = useCallback((nextSessionId: string, epoch: number) => {
    cleanupSocket(true)

    runtimeLogger.info('terminal', 'opening websocket', { sessionId: nextSessionId, epoch, attempt: attemptRef.current })
    const socket = new WebSocket(resolveTerminalSocketUrl(nextSessionId))
    socketRef.current = socket
    const isCurrent = () => socketRef.current === socket && sessionIdRef.current === nextSessionId && sessionEpochRef.current === epoch

    socket.onopen = () => {
      if (!isCurrent()) return
      runtimeLogger.info('terminal', 'websocket connected', { sessionId: nextSessionId, epoch })
      attemptRef.current = 0
      lastRxRef.current = Date.now()
      setConnected(true)
      setReconnecting(false)
      setClosed(false)
      setError(null)

      // Latest size: the ResizeObserver may have updated it while connecting
      const size = terminalSizeRef.current
      socket.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }))

      // Flush input typed while the link was down
      const pending = pendingInputRef.current
      pendingInputRef.current = []
      for (const data of pending) socket.send(JSON.stringify({ type: 'input', data }))

      heartbeatRef.current = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }))
      }, HEARTBEAT_MS)
      // Half-open connections never fire onclose; force it ourselves
      watchdogRef.current = window.setInterval(() => {
        if (Date.now() - lastRxRef.current > STALE_AFTER_MS) {
          runtimeLogger.warn('terminal', 'websocket stale, forcing reconnect', { sessionId: nextSessionId })
          socket.close()
        }
      }, WATCHDOG_MS)
    }

    socket.onmessage = (event) => {
      if (!isCurrent()) return
      lastRxRef.current = Date.now()

      try {
        const message = JSON.parse(event.data) as TerminalSocketMessage
        if (message.type === 'ready' || message.type === 'pong') return
        if (message.type === 'output' && message.data) {
          const chunk = filterInternalTerminalNoise(message.data)
          if (chunk) outputListenerRef.current?.(chunk)
          return
        }
        if (message.type === 'closed') {
          runtimeLogger.info('terminal', 'terminal closed by backend', { sessionId: nextSessionId, epoch })
          backendClosedRef.current = true
          setConnected(false)
          setReconnecting(false)
          setClosed(true)
          return
        }
        if (message.type === 'error') {
          runtimeLogger.error('terminal', 'terminal websocket error payload', { sessionId: nextSessionId, epoch, error: message.error })
          const text = message.error ?? 'Terminal websocket error'
          // The shell is gone (finished or reaped): reconnecting cannot help
          if (/session not found/i.test(text)) {
            backendClosedRef.current = true
            setReconnecting(false)
            setClosed(true)
            setConnected(false)
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

    socket.onerror = () => {
      if (!isCurrent()) return
      runtimeLogger.warn('terminal', 'websocket low-level error', { sessionId: nextSessionId, epoch })
    }

    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null
      if (sessionIdRef.current !== nextSessionId || sessionEpochRef.current !== epoch) return
      if (heartbeatRef.current !== null) window.clearInterval(heartbeatRef.current)
      if (watchdogRef.current !== null) window.clearInterval(watchdogRef.current)
      heartbeatRef.current = null
      watchdogRef.current = null
      runtimeLogger.info('terminal', 'websocket closed', { sessionId: nextSessionId, epoch, manualClose: manualCloseRef.current })
      setConnected(false)
      if (manualCloseRef.current || backendClosedRef.current) return
      scheduleReconnect(epoch)
    }
  }, [cleanupSocket, scheduleReconnect])

  useEffect(() => {
    connectSocketRef.current = connectSocket
  }, [connectSocket])

  const start = useCallback(async (target = 'local', cwd?: string) => {
    if (startInFlightRef.current) return

    startInFlightRef.current = true
    targetRef.current = target
    manualCloseRef.current = false
    backendClosedRef.current = false
    attemptRef.current = 0
    sessionEpochRef.current += 1
    const epoch = sessionEpochRef.current
    clearTimers()
    pendingInputRef.current = []
    setClosedByUser(false)
    setStarting(true)
    setError(null)
    setClosed(false)
    setConnected(false)
    setReconnecting(false)

    const previousSessionId = sessionIdRef.current
    cleanupSocket(true)
    sessionIdRef.current = null
    setSessionId(null)

    await releaseSession(previousSessionId)

    try {
      runtimeLogger.info('terminal', 'starting terminal session', { epoch, target })
      const result = await startTerminalSession(target, cwd)
      if (sessionEpochRef.current !== epoch) {
        runtimeLogger.warn('terminal', 'discarding stale terminal session result', { epoch, sessionId: result.sessionId })
        await releaseSession(result.sessionId)
        return
      }
      runtimeLogger.info('terminal', 'terminal session started', { epoch, sessionId: result.sessionId })
      sessionIdRef.current = result.sessionId
      setSessionId(result.sessionId)
      connectSocket(result.sessionId, epoch)
    } catch (err) {
      runtimeLogger.error('terminal', 'failed to start terminal session', { epoch, error: err })
      if (sessionEpochRef.current === epoch) {
        setError(err instanceof Error ? err.message : 'Gagal memulai terminal session')
      }
    } finally {
      if (sessionEpochRef.current === epoch) setStarting(false)
      startInFlightRef.current = false
    }
  }, [cleanupSocket, clearTimers, connectSocket, releaseSession])

  // Network back / tab visible again: re-attach immediately instead of waiting for backoff
  useEffect(() => {
    const kick = () => {
      if (manualCloseRef.current || backendClosedRef.current) return
      if (!sessionIdRef.current) return
      const socket = socketRef.current
      if (socket && socket.readyState === WebSocket.OPEN) return
      attemptRef.current = 0
      scheduleReconnect(sessionEpochRef.current, true)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') kick()
    }
    window.addEventListener('online', kick)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', kick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [scheduleReconnect])

  const sendInput = useCallback(async (input: string) => {
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'input', data: input }))
      return
    }
    // Link is down but the shell is alive: keep keystrokes and send after re-attach
    if (sessionIdRef.current && !backendClosedRef.current && !manualCloseRef.current) {
      const queue = pendingInputRef.current
      if (queue.length < MAX_PENDING_INPUT) queue.push(input)
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
    const next = {
      cols: Math.max(20, Math.floor(cols)),
      rows: Math.max(8, Math.floor(rows)),
    }

    if (next.cols === terminalSizeRef.current.cols && next.rows === terminalSizeRef.current.rows) return
    terminalSizeRef.current = next

    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'resize', ...next }))
  }, [])

  useEffect(() => {
    return () => {
      manualCloseRef.current = true
      clearTimers()
      cleanupSocket(true)
      void releaseSession(sessionIdRef.current)
      sessionIdRef.current = null
    }
  }, [cleanupSocket, clearTimers, releaseSession])

  const setOutputListener = useCallback((listener: ((chunk: string) => void) | null) => {
    outputListenerRef.current = listener
  }, [])

  return {
    sessionId,
    starting,
    connected,
    reconnecting,
    closed,
    closedByUser,
    error,
    start,
    sendInput,
    handleTerminalKey,
    updateTerminalSize,
    setOutputListener,
    close,
  }
}
