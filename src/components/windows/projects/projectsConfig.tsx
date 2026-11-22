import { type ReactElement } from 'react'
import { type Project } from '@/api/agent'
import { FolderCode, Globe, Server, Code, Box, Layers } from 'lucide-react'
import type { RouteSubject } from '@/components/windows/tunnels/RouteDomainModal'

export const TYPE_ICON: Record<string, ReactElement> = {
  static: <Globe className="h-3.5 w-3.5" />,
  nodejs: <Code className="h-3.5 w-3.5" />,
  python: <Code className="h-3.5 w-3.5" />,
  php: <Code className="h-3.5 w-3.5" />,
  docker: <Box className="h-3.5 w-3.5" />,
  proxy: <Server className="h-3.5 w-3.5" />,
  custom: <FolderCode className="h-3.5 w-3.5" />,
  stack: <Layers className="h-3.5 w-3.5" />,
}

// docker and proxy rows from older versions still render; new projects can only be runnable types
export const PROJECT_TYPES = ['static', 'nodejs', 'python', 'php', 'custom', 'stack']

// The most projects one list loads; the search narrows it when there are more
export const LIST_LIMIT = 100

// docker and proxy rows from older versions are not processes: there is nothing to start
export const isRunnableProject = (project: Project) => PROJECT_TYPES.includes(project.projectType)

export function isProjectRuntimeRunning(project: Project) {
  return project.runtime?.known ? project.runtime.running : project.running
}

export function shouldShowProjectStop(project: Project) {
  return project.status === 'active' && isProjectRuntimeRunning(project)
}

// The one state a project shows: what the runtime really does wins over what was asked for
export type ProjectStateKey = 'running' | 'stopped' | 'building' | 'error' | 'draft' | 'degraded' | 'drift'

export function projectState(project: Project): ProjectStateKey {
  if (project.runtime?.drift) return 'drift'
  if (project.status === 'error' || project.status === 'degraded' || project.status === 'building' || project.status === 'draft') return project.status
  return isProjectRuntimeRunning(project) ? 'running' : 'stopped'
}

// The look of each state: the pill classes the list windows share
export const STATE_PILL: Record<ProjectStateKey, string> = {
  running: 'running',
  stopped: 'exited',
  building: 'paused',
  error: 'dead',
  draft: 'exited',
  degraded: 'paused',
  drift: 'paused',
}

export type UploadPhase = 'uploading' | 'extracting' | 'installing' | 'building' | 'placing' | 'done' | 'error'

// The kinds of archive the agent unpacks
export const ARCHIVE_ACCEPT = '.zip,.rar,.tar.gz,.tgz,.tar'
export const isArchiveName = (name: string) => /\.(zip|rar|tar\.gz|tgz|tar)$/i.test(name)

export type StaticUploadState = {
  projectName: string
  fileName: string
  percent: number
  phase: UploadPhase
  // what the build prints, when the archive holds source
  log: string[]
}

export type UploadDraft = {
  project: Project
  file: File | null
  rootDir: string
  clean: boolean
}

// A project as what a domain can be pointed at: the port the panel gave it
export function projectSubject(project: Project): RouteSubject {
  const port = project.assignedPort
  return {
    id: `project-${project.id}`,
    name: project.name,
    kind: 'project',
    projectId: project.id,
    targets: port > 0 ? [{ key: `port:${port}`, host: 'localhost', port, label: `localhost:${port}` }] : [],
  }
}
