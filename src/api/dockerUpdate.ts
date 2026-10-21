import { streamJsonLines } from './ndjson'

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

export function streamDockerUpdate(request: DockerUpdateRequest, onEvent: (event: DockerUpdateEvent) => void, signal: AbortSignal): Promise<void> {
  if (request.kind === 'container') return streamJsonLines(`/api/v1/containers/${encodeURIComponent(request.id)}/update`, {}, onEvent, signal)
  return streamJsonLines('/api/v1/docker/images/update', { body: { image: request.image, registryAuth: request.registryAuth } }, onEvent, signal)
}
