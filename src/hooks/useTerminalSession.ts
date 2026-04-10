import { useCallback, useEffect, useRef, useState } from 'react'
import { closeTerminalSession, startTerminalSession } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'

type TerminalSocketMessage = {
  type: 'ready' | 'output' | 'closed' | 'error' | 'resize'
  data?: string
  error?: string
  closed?: boolean
  sessionId?: string
  cols?: number
  rows?: number
}

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

export function useTerminalSession() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [closed, setClosed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closedByUser, setClosedByUser] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const manualCloseRef = useRef(false)
  const startInFlightRef = useRef(false)
  const sessionEpochRef = useRef(0)
  const terminalSizeRef = useRef({ cols: 120, rows: 32 })
  const outputListenerRef = useRef<((chunk: string) => void) | null>(null)

  const cleanupSocket = useCallback((closeActiveSocket = true) => {
    const socket = socketRef.current
    socketRef.current = null

    if (!closeActiveSocket || !socket) return
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
    cleanupSocket(true)

    const id = sessionIdRef.current
    sessionIdRef.current = null
    setSessionId(null)
    setConnected(false)
    setClosed(true)

    await releaseSession(id)
  }, [cleanupSocket, releaseSession])

  const connectSocket = useCallback((nextSessionId: string, epoch: number) => {
    cleanupSocket(true)

    runtimeLogger.info('terminal', 'opening websocket', { sessionId: nextSessionId, epoch })
    const socket = new WebSocket(resolveTerminalSocketUrl(nextSessionId))
    socketRef.current = socket

    socket.onopen = () => {
      if (sessionIdRef.current !== nextSessionId || sessionEpochRef.current !== epoch) return
      runtimeLogger.info('terminal', 'websocket connected', { sessionId: nextSessionId, epoch })
      setConnected(true)
      setClosed(false)
      setError(null)
      
      // Send the latest known terminal size immediately upon connection
      // because ResizeObservers might have updated the ref while WS was connecting
      const size = terminalSizeRef.current
      socket.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }))
    }

    socket.onmessage = (event) => {
      if (sessionIdRef.current !== nextSessionId || sessionEpochRef.current !== epoch) return

      try {
        const message = JSON.parse(event.data) as TerminalSocketMessage
        if (message.type === 'ready') {
          runtimeLogger.info('terminal', 'terminal ready', { sessionId: nextSessionId, epoch })
          return
        }
        if (message.type === 'output' && message.data) {
          const chunk = filterInternalTerminalNoise(message.data)
          if (!chunk) return
          outputListenerRef.current?.(chunk)
          return
        }
        if (message.type === 'closed') {
          runtimeLogger.info('terminal', 'terminal closed by backend', { sessionId: nextSessionId, epoch })
          setConnected(false)
          setClosed(true)
          return
        }
        if (message.type === 'error') {
          runtimeLogger.error('terminal', 'terminal websocket error payload', { sessionId: nextSessionId, epoch, error: message.error })
          setError(message.error ?? 'Terminal websocket error')
          return
        }
      } catch {
        const chunk = filterInternalTerminalNoise(String(event.data ?? ''))
        if (!chunk) return
        outputListenerRef.current?.(chunk)
      }
    }

    socket.onerror = () => {
      if (sessionIdRef.current !== nextSessionId || sessionEpochRef.current !== epoch) return
      runtimeLogger.error('terminal', 'websocket low-level error', { sessionId: nextSessionId, epoch })
      setError('Koneksi websocket terminal gagal')
    }

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null
      }
      if (sessionIdRef.current !== nextSessionId || sessionEpochRef.current !== epoch) return
      runtimeLogger.info('terminal', 'websocket closed', { sessionId: nextSessionId, epoch, manualClose: manualCloseRef.current })
      setConnected(false)
      if (!manualCloseRef.current) {
        setClosed(true)
      }
    }
  }, [cleanupSocket])

  const start = useCallback(async () => {
    if (startInFlightRef.current) return

    startInFlightRef.current = true
    manualCloseRef.current = false
    sessionEpochRef.current += 1
    const epoch = sessionEpochRef.current
    setClosedByUser(false)
    setStarting(true)
    setError(null)
    setClosed(false)
    setConnected(false)

    const previousSessionId = sessionIdRef.current
    cleanupSocket(true)
    sessionIdRef.current = null
    setSessionId(null)

    await releaseSession(previousSessionId)

    try {
      runtimeLogger.info('terminal', 'starting terminal session', { epoch })
      const result = await startTerminalSession()
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
      if (sessionEpochRef.current === epoch) {
        setStarting(false)
      }
      startInFlightRef.current = false
    }
  }, [cleanupSocket, connectSocket, releaseSession])

  const sendInput = useCallback(async (input: string) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'input', data: input }))
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

    if (next.cols === terminalSizeRef.current.cols && next.rows === terminalSizeRef.current.rows) {
      return
    }

    terminalSizeRef.current = next

    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    runtimeLogger.info('terminal', 'sending resize event', { sessionId: sessionIdRef.current, ...next })
    socket.send(JSON.stringify({ type: 'resize', ...next }))
  }, [])

  useEffect(() => {
    return () => {
      manualCloseRef.current = true
      cleanupSocket(true)
      void releaseSession(sessionIdRef.current)
      sessionIdRef.current = null
    }
  }, [cleanupSocket, releaseSession])

  const setOutputListener = useCallback((listener: ((chunk: string) => void) | null) => {
    outputListenerRef.current = listener
  }, [])

  return {
    sessionId,
    starting,
    connected,
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
