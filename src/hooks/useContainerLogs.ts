import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchContainerLogs } from '@/api/agent'

export type ContainerLogStatus = 'connecting' | 'live' | 'ended' | 'error'

// Most lines kept in the browser; older ones fall off the top
export const LOG_CAP = 5000

function resolveLogSocketUrl(containerId: string, tail: number) {
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  const normalizedBase = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${normalizedBase}/containers/${encodeURIComponent(containerId)}/logs/ws?tail=${tail}`
}

interface LogMessage {
  type: 'lines' | 'end' | 'error'
  lines?: string[]
  error?: string
}

// Follows a container's logs over one WebSocket: the agent pushes new lines as they appear. While paused the
// lines keep arriving and wait aside, so resuming loses nothing.
export function useContainerLogs(containerId: string | null, tail: number) {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<ContainerLogStatus>('connecting')
  const [detail, setDetail] = useState('')
  const [paused, setPausedState] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [transport, setTransport] = useState<'socket' | 'polling'>('socket')
  const pausedRef = useRef(false)
  const waitingRef = useRef<string[]>([])

  const append = useCallback((batch: string[]) => {
    setLines((prev) => {
      const merged = prev.length + batch.length > LOG_CAP ? prev.concat(batch).slice(-LOG_CAP) : prev.concat(batch)
      return merged
    })
  }, [])

  useEffect(() => {
    if (!containerId) return
    setLines([])
    setDetail('')
    setStatus('connecting')
    waitingRef.current = []
    setTransport('socket')
    let finished = false
    let opened = false
    let poll: number | undefined
    const startPolling = () => {
      if (poll !== undefined || finished) return
      setTransport('polling')
      setStatus('live')
      const tick = () => {
        if (pausedRef.current) return
        fetchContainerLogs(containerId, tail)
          .then((res) => {
            if (!finished) setLines(res.lines.slice(-LOG_CAP))
          })
          .catch(() => {
            if (!finished) setStatus('error')
          })
      }
      tick()
      poll = window.setInterval(tick, 2000)
    }
    const socket = new WebSocket(resolveLogSocketUrl(containerId, tail))

    socket.onopen = () => {
      opened = true
      setStatus('live')
    }
    socket.onmessage = (event) => {
      let msg: LogMessage
      try {
        msg = JSON.parse(String(event.data)) as LogMessage
      } catch {
        return
      }
      if (msg.type === 'lines' && msg.lines?.length) {
        if (pausedRef.current) waitingRef.current = waitingRef.current.concat(msg.lines).slice(-LOG_CAP)
        else append(msg.lines)
      } else if (msg.type === 'end') {
        finished = true
        setDetail(msg.error ?? '')
        setStatus('ended')
      }
    }
    socket.onerror = () => {
      if (finished) return
      if (opened) setStatus('error')
      else startPolling()
    }
    socket.onclose = () => {
      if (finished) return
      // never opened: poll instead; opened and then lost: the connection dropped
      if (!opened) startPolling()
      else setStatus((current) => (current === 'live' || current === 'connecting' ? 'error' : current))
    }

    // closed on the way out; StrictMode runs this once before the real connection too
    return () => {
      finished = true
      window.clearInterval(poll)
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      socket.close()
    }
  }, [containerId, tail, attempt, append])

  const setPaused = useCallback(
    (next: boolean) => {
      pausedRef.current = next
      setPausedState(next)
      if (!next && waitingRef.current.length > 0) {
        const waiting = waitingRef.current
        waitingRef.current = []
        append(waiting)
      }
    },
    [append],
  )

  return {
    lines,
    status,
    transport,
    detail,
    paused,
    setPaused,
    clear: () => {
      setLines([])
      waitingRef.current = []
    },
    reconnect: () => setAttempt((n) => n + 1),
  }
}
