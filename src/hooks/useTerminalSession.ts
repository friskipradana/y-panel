import { useCallback, useEffect, useRef, useState } from 'react'
import { closeTerminalSession, startTerminalSession } from '@/api/agent'

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

function mapKeyToTerminalInput(event: KeyboardEvent) {
  if (event.ctrlKey && event.key.toLowerCase() === 'c') return '\u0003'
  if (event.ctrlKey && event.key.toLowerCase() === 'd') return '\u0004'
  if (event.ctrlKey && event.key.toLowerCase() === 'l') return '\u000c'
  if (event.key === 'Enter') return '\n'
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

function normalizeTerminalOutput(input: string) {
  const stripped = input
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B[@-_]/g, '')

  let result = ''
  let lineStart = 0

  for (let index = 0; index < stripped.length; index += 1) {
    const char = stripped[index]

    if (char === '\r') {
      if (stripped[index + 1] === '\n') {
        continue
      }
      result = result.slice(0, lineStart)
      continue
    }

    if (char === '\b' || char === '\u007f') {
      if (result.length > lineStart) {
        result = result.slice(0, -1)
      }
      continue
    }

    if (char === '\n') {
      result += char
      lineStart = result.length
      continue
    }

    if (char === '\t') {
      result += char
      continue
    }

    if (char < ' ' || char === '\u009b') {
      continue
    }

    result += char
  }

  return result
    .replace(/^.*stty cols \d+ rows \d+ 2>\/dev\/null; export COLUMNS=\d+ LINES=\d+\r?\n?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
}

export function useTerminalSession() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [starting, setStarting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [closed, setClosed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closedByUser, setClosedByUser] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const manualCloseRef = useRef(false)
  const startInFlightRef = useRef(false)
  const terminalSizeRef = useRef({ cols: 120, rows: 32 })

  const cleanupSocket = useCallback((closeActiveSocket = true) => {
    const socket = socketRef.current
    socketRef.current = null

    if (!closeActiveSocket || !socket) return
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close()
    }
  }, [])

  const releaseSession = useCallback(async (id: string | null) => {
    if (!id) return
    try {
      await closeTerminalSession(id)
    } catch {
      // noop
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

  const connectSocket = useCallback((nextSessionId: string) => {
    cleanupSocket(true)

    const socket = new WebSocket(resolveTerminalSocketUrl(nextSessionId))
    socketRef.current = socket

    socket.onopen = () => {
      if (sessionIdRef.current !== nextSessionId) return
      setConnected(true)
      setClosed(false)
      setError(null)
      socket.send(JSON.stringify({
        type: 'resize',
        cols: terminalSizeRef.current.cols,
        rows: terminalSizeRef.current.rows,
      }))
    }

    socket.onmessage = (event) => {
      if (sessionIdRef.current !== nextSessionId) return

      try {
        const message = JSON.parse(event.data) as TerminalSocketMessage
        if (message.type === 'output' && message.data) {
          setOutput((prev) => normalizeTerminalOutput(prev + message.data))
          return
        }
        if (message.type === 'closed') {
          setConnected(false)
          setClosed(true)
          return
        }
        if (message.type === 'error') {
          setError(message.error ?? 'Terminal websocket error')
          return
        }
      } catch {
        setOutput((prev) => normalizeTerminalOutput(prev + String(event.data ?? '')))
      }
    }

    socket.onerror = () => {
      if (sessionIdRef.current !== nextSessionId) return
      setError('Koneksi websocket terminal gagal')
    }

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null
      }
      if (sessionIdRef.current !== nextSessionId) return
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
    setClosedByUser(false)
    setStarting(true)
    setError(null)
    setOutput('')
    setClosed(false)
    setConnected(false)

    const previousSessionId = sessionIdRef.current
    cleanupSocket(true)
    sessionIdRef.current = null
    setSessionId(null)

    await releaseSession(previousSessionId)

    try {
      const result = await startTerminalSession()
      sessionIdRef.current = result.sessionId
      setSessionId(result.sessionId)
      connectSocket(result.sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memulai terminal session')
    } finally {
      startInFlightRef.current = false
      setStarting(false)
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

  return {
    sessionId,
    output,
    starting,
    connected,
    closed,
    closedByUser,
    error,
    start,
    sendInput,
    handleTerminalKey,
    updateTerminalSize,
    close,
  }
}
