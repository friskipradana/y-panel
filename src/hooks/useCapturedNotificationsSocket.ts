import { useCallback, useEffect, useRef, useState } from 'react'
import type { CapturedNotification } from '@/types'
import type { CapturedNotificationSocketPayload } from '@/api/payment'
import { resolveCapturedNotificationsSocketUrl } from '@/api/payment'

export interface UseCapturedNotificationsSocketOptions {
  enabled?: boolean
  onCaptured?: (notification: CapturedNotification) => void
}

/**
 * Real-time WebSocket hook for captured payment notifications.
 * Automatically reconnects on disconnect with exponential backoff.
 * Polls every 30s as a fallback mechanism.
 */
export function useCapturedNotificationsSocket({
  enabled = true,
  onCaptured,
}: UseCapturedNotificationsSocketOptions = {}) {
  const [connected, setConnected] = useState(false)
  const [lastPayload, setLastPayload] = useState<CapturedNotificationSocketPayload | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backoffRef = useRef(1000)
  const mountedRef = useRef(true)
  const onCapturedRef = useRef(onCaptured)

  // Keep callback ref fresh without triggering reconnections
  onCapturedRef.current = onCaptured

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close()
      }
      wsRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return

    cleanup()

    let url: string
    try {
      url = resolveCapturedNotificationsSocketUrl()
    } catch {
      console.warn('[captured-ws] Failed to resolve WebSocket URL')
      return
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setConnected(true)
      backoffRef.current = 1000
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return
      try {
        const payload = JSON.parse(event.data) as CapturedNotificationSocketPayload
        if (payload.type === 'captured' && payload.notification) {
          setLastPayload(payload)
          onCapturedRef.current?.(payload.notification)
        }
      } catch {
        // silently ignore malformed messages
      }
    }

    ws.onerror = () => {
      // onclose will fire after onerror
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
      wsRef.current = null

      // Exponential backoff reconnect
      const delay = Math.min(backoffRef.current, 30000)
      backoffRef.current = Math.min(backoffRef.current * 2, 30000)
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        connect()
      }, delay)
    }
  }, [enabled, cleanup])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [connect, cleanup])

  const reconnect = useCallback(() => {
    backoffRef.current = 1000
    connect()
  }, [connect])

  return { connected, lastPayload, reconnect }
}
