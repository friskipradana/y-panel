import { Play, Square } from 'lucide-react'
import type { UiTone } from '@/components/ui/IconBadge'
import type { Container, DockerEnvMode, EnvVarInput } from '@/types'

// ── State Styles ──────────────────────────────────────────────
export const STATE_STYLES: Record<Container['State'], { badge: UiTone; btn: string; btnText: string; actionIcon: typeof Play }> = {
  running: { badge: 'success', btn: 'panel-btn--ghost', btnText: 'Stop', actionIcon: Square },
  exited: { badge: 'danger', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
  paused: { badge: 'warning', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
  restarting: { badge: 'info', btn: 'panel-btn--ghost', btnText: 'Stop', actionIcon: Square },
  dead: { badge: 'neutral', btn: 'panel-btn--primary-soft', btnText: 'Start', actionIcon: Play },
}

export const EMPTY_ENV_ROW: EnvVarInput = { key: '', value: '' }

export const DEFAULT_COMPOSE_YAML = 'version: "3.8"\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n'

export function createEmptyRegistryAuth() {
  return { enabled: false, registry: '', usernameOrEmail: '', password: '' }
}

// Order of the tabs in the Docker window
export const DOCKER_TABS = ['containers', 'images', 'networks', 'volumes', 'templates'] as const
export type DockerTab = (typeof DOCKER_TABS)[number]

// A container the Database window runs for its own sake: the web client of the databases (Adminer).
// Older ones have no label, so the name counts too.
export function isDatabaseControl(container: { Names?: string[]; Labels?: Record<string, string> }): boolean {
  return container.Labels?.['reneo.kind'] === 'database-control' || (container.Names ?? []).some((n) => n.replace(/^\//, '') === 'reneo-adminer')
}

// "2026-10-13 03:12:57 +0700 WIB" (how docker writes a date) as "13 Okt 2026, 03.12"; anything else as it came
export function formatDockerDate(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(raw)
  if (!m) return raw
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

// An image counts as in use when a container names it as repo:tag, as a bare repo (latest), or by id
export function isImageInUse(image: { Id: string; Repository: string; Tag: string }, used: Set<string>): boolean {
  if (used.has(`${image.Repository}:${image.Tag}`)) return true
  if (image.Tag === 'latest' && used.has(image.Repository)) return true
  const id = image.Id.replace('sha256:', '')
  for (const name of used) {
    const wanted = name.replace('sha256:', '')
    if (wanted.length >= 8 && /^[0-9a-f]+$/.test(wanted) && id.startsWith(wanted)) return true
  }
  return false
}

// Networks Docker makes itself; they cannot be removed
export const BUILTIN_NETWORKS = ['bridge', 'host', 'none']

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
