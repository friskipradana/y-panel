import { type ReactElement } from 'react'
import { type Project } from '@/api/agent'
import { FolderCode, Globe, Server, Code, Box } from 'lucide-react'

export const TYPE_ICON: Record<string, ReactElement> = {
  static: <Globe className="h-3.5 w-3.5" />,
  nodejs: <Code className="h-3.5 w-3.5" />,
  python: <Code className="h-3.5 w-3.5" />,
  php: <Code className="h-3.5 w-3.5" />,
  docker: <Box className="h-3.5 w-3.5" />,
  proxy: <Server className="h-3.5 w-3.5" />,
  custom: <FolderCode className="h-3.5 w-3.5" />,
}

export const STATUS_PILL: Record<string, string> = {
  active: 'panel-badge--success',
  stopped: 'panel-badge--neutral',
  building: 'panel-badge--warning',
  error: 'panel-badge--danger',
  draft: 'panel-badge--info',
  degraded: 'panel-badge--warning',
}

export const PROJECT_TYPES = ['static', 'nodejs', 'python', 'php', 'docker', 'proxy', 'custom']

export const PAGE_SIZE = 8

export function isProjectRuntimeRunning(project: Project) {
  return project.runtime?.known ? project.runtime.running : project.running
}

export function shouldShowProjectStop(project: Project) {
  return project.status === 'active' && isProjectRuntimeRunning(project)
}

export type AttentionFilter = 'all' | 'drift' | 'degraded'

export type UploadPhase = 'uploading' | 'extracting' | 'done' | 'error'

export type StaticUploadState = {
  projectName: string
  fileName: string
  percent: number
  phase: UploadPhase
}

export type UploadDraft = {
  project: Project
  file: File | null
  rootDir: string
  clean: boolean
}
