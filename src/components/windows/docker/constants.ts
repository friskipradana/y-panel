import { Play, Square } from 'lucide-react'
import type { Container, DockerEnvMode, EnvVarInput } from '@/types'

// ── State Styles ──────────────────────────────────────────────
export const STATE_STYLES: Record<Container['State'], { badge: string; btn: string; btnText: string; actionIcon: typeof Play }> = {
  running: { badge: 'panel-badge--success', btn: 'panel-btn--ghost', btnText: 'Stop', actionIcon: Square },
  exited: { badge: 'panel-badge--danger', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
  paused: { badge: 'panel-badge--warning', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
  restarting: { badge: 'panel-badge--info', btn: 'panel-btn--ghost', btnText: 'Stop', actionIcon: Square },
  dead: { badge: 'panel-badge--neutral', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
}

export const EMPTY_ENV_ROW: EnvVarInput = { key: '', value: '' }

export const DEFAULT_COMPOSE_YAML = 'version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n'

export function createEmptyRegistryAuth() {
  return { enabled: false, registry: '', usernameOrEmail: '', password: '' }
}

export function createDefaultDeployForm() {
  return {
    ownerUserId: 0,
    network: '',
    name: '',
    image: '',
    ports: [{ hostPort: '', containerPort: '' }] as Array<{ hostPort: string; containerPort: string }>,
    env: [EMPTY_ENV_ROW] as EnvVarInput[],
    envMode: 'form' as DockerEnvMode,
    envRaw: '',
    registryAuth: createEmptyRegistryAuth(),
    volumes: [{ hostPath: '', containerPath: '' }],
    composeYaml: DEFAULT_COMPOSE_YAML,
  }
}

export function createDefaultPullImageForm() {
  return { image: '', registryAuth: createEmptyRegistryAuth() }
}

export function toRawEnv(env: EnvVarInput[]) {
  return env
    .filter((item) => item.key.trim())
    .map((item) => `${item.key}=${item.value}`)
    .join('\n')
}

export function toEnvRows(raw: string) {
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=')
      if (idx === -1) return { key: line, value: '' }
      return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1) }
    })
    .filter((item) => item.key)
  return rows.length > 0 ? rows : [EMPTY_ENV_ROW]
}

export function getContainerRuntimeIssues(container: Container) {
  const issues: Array<{ key: string; label: string; tone: 'warning' | 'danger' }> = []
  const restartCount = container.RestartCount ?? 0
  const exitCode = container.ExitCode ?? 0
  const health = container.Health?.trim().toLowerCase()

  if (restartCount > 0) {
    issues.push({ key: 'restart', label: `restart ${restartCount}x`, tone: restartCount >= 3 ? 'danger' : 'warning' })
  }
  if (health && health !== 'healthy') {
    issues.push({ key: 'health', label: `health ${health}`, tone: 'danger' })
  }
  if (exitCode !== 0) {
    issues.push({ key: 'exit', label: `last exit ${exitCode}`, tone: 'danger' })
  }
  return issues
}

export function isContainerAttention(container: Container) {
  return ['paused', 'restarting'].includes(container.State) || getContainerRuntimeIssues(container).length > 0
}

export function getContainerPorts(container: Container) {
  const ports = Array.isArray(container.Ports) ? container.Ports : []
  const published = Array.from(
    new Set(
      ports
        .filter((port) => port.PublicPort)
        .map((port) => `${port.PublicPort}->${port.PrivatePort}/${port.Type}`),
    ),
  )
  const internal = Array.from(new Set(ports.map((port) => `${port.PrivatePort}/${port.Type}`)))
  return {
    published,
    internal,
    primaryPublished: published[0] ?? '',
    primaryInternal: internal[0] ?? '',
  }
}
