// A request whose answer is one JSON line per event, read as it arrives (updates, installs: things that take a while)
export async function streamJsonLines<T>(
  path: string,
  init: { body?: unknown },
  onEvent: (event: T) => void,
  signal: AbortSignal,
): Promise<void> {
  const base = (import.meta.env.VITE_AGENT_BASE as string | undefined) ?? ''
  const request: RequestInit = { method: 'POST', credentials: 'include', signal }
  if (init.body !== undefined) {
    request.headers = { 'Content-Type': 'application/json' }
    request.body = JSON.stringify(init.body)
  }
  const response = await fetch(`${base}${path}`, request)
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? `HTTP ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) onEvent(JSON.parse(line) as T)
      newline = buffer.indexOf('\n')
    }
  }
}
