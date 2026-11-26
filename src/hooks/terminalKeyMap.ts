export type TerminalSocketMessage = {
  type: 'ready' | 'output' | 'closed' | 'error' | 'resize' | 'pong'
  data?: string
  error?: string
  closed?: boolean
  sessionId?: string
  cols?: number
  rows?: number
}

export const HEARTBEAT_MS = 20_000
export const WATCHDOG_MS = 10_000
export const STALE_AFTER_MS = 90_000
export const RECONNECT_BASE_MS = 800
export const RECONNECT_MAX_MS = 8_000
export const RECONNECT_MAX_ATTEMPTS = 12
export const MAX_PENDING_INPUT = 200

export function resolveTerminalSocketUrl(sessionId: string, replay = false) {
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  const base = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${base}/terminal/sessions/${sessionId}/ws${replay ? '?replay=1' : ''}`
}

export function mapKeyToTerminalInput(event: KeyboardEvent) {
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

export const reconnectDelay = (attempt: number) =>
  Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1), RECONNECT_MAX_MS) + Math.floor(Math.random() * 250)
