import { useCallback, useEffect, useRef, useState } from 'react'
import { getK8sPodLogs } from '@/api/k8s'

export type K8sPodLogStatus = 'connecting' | 'live' | 'ended' | 'error'

const LOG_CAP = 5000

function resolvePodLogSocketUrl(clusterId: string, namespace: string, podName: string, container: string, tail: number) {
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  const normalizedBase = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ tail: String(tail) })
  if (container) params.set('container', container)
  return `${protocol}//${window.location.host}${normalizedBase}/k8s/clusters/${encodeURIComponent(clusterId)}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(podName)}/logs/ws?${params.toString()}`
}

interface LogMessage {
  type: 'lines' | 'end' | 'error'
  lines?: string[]
  error?: string
}

export function useK8sPodLogs(
  clusterId: string,
  namespace: string | null,
  podName: string | null,
  container: string,
  tail: number,
) {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<K8sPodLogStatus>('connecting')
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
    if (!clusterId || !namespace || !podName) return
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
        getK8sPodLogs(clusterId, namespace, podName, container, tail)
          .then((text) => {
            if (!finished) {
              const split = text ? text.split(/\r?\n/) : []
              setLines(split.slice(-LOG_CAP))
            }
          })
          .catch(() => {
            if (!finished) setStatus('error')
          })
      }
      tick()
      poll = window.setInterval(tick, 2500)
    }

    const socket = new WebSocket(resolvePodLogSocketUrl(clusterId, namespace, podName, container, tail))

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
      if (!opened) startPolling()
      else setStatus((current) => (current === 'live' || current === 'connecting' ? 'error' : current))
    }

    return () => {
      finished = true
      window.clearInterval(poll)
      socket.onmessage = null
      socket.onclose = null
      socket.onerror = null
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => socket.close()
      } else if (socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
    }
  }, [clusterId, namespace, podName, container, tail, attempt, append])

  const setPaused = useCallback(
    (next: boolean) => {
      pausedRef.current = next
      setPausedState(next)
      if (!next && waitingRef.current.length > 0) {
        const flushed = waitingRef.current
        waitingRef.current = []
        append(flushed)
      }
    },
    [append],
  )

  const clear = useCallback(() => {
    waitingRef.current = []
    setLines([])
  }, [])

  const reconnect = useCallback(() => {
    setAttempt((n) => n + 1)
  }, [])

  return { lines, status, transport, detail, paused, setPaused, clear, reconnect }
}
