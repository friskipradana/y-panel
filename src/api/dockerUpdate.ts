// Updating an image or a container: the agent sends what docker prints, one JSON line at a time

export interface DockerUpdateContainer {
  id: string
  name: string
  image: string
  state: string
  status: string
  /** made by compose, so it can be made again from a new image */
  compose: boolean
}

export interface DockerUpdateEvent {
  type: 'log' | 'step' | 'status' | 'containers' | 'done' | 'error'
  line?: string
  step?: 'pull' | 'recreate'
  container?: DockerUpdateContainer
  containers?: DockerUpdateContainer[]
  changed?: boolean
  recreated?: boolean
  error?: string
}

export type DockerUpdateRequest =
  | { kind: 'container'; id: string }
  | { kind: 'image'; image: string; registryAuth?: { enabled: boolean; registry?: string; usernameOrEmail: string; password: string } }

export async function streamDockerUpdate(request: DockerUpdateRequest, onEvent: (event: DockerUpdateEvent) => void, signal: AbortSignal): Promise<void> {
  const base = (import.meta.env.VITE_AGENT_BASE as string | undefined) ?? ''
  const path = request.kind === 'container' ? `/api/v1/containers/${encodeURIComponent(request.id)}/update` : '/api/v1/docker/images/update'
  const init: RequestInit = { method: 'POST', credentials: 'include', signal }
  if (request.kind === 'image') {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify({ image: request.image, registryAuth: request.registryAuth })
  }
  const response = await fetch(`${base}${path}`, init)
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
      if (line) onEvent(JSON.parse(line) as DockerUpdateEvent)
      newline = buffer.indexOf('\n')
    }
  }
}
