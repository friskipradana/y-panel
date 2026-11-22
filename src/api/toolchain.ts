import { agentApi } from './client'
import { streamJsonLines } from './ndjson'

// The development tools of the signed-in account, installed in its own home

export interface ToolStatus {
  id: string
  name: string
  description: string
  binary: string
  requires?: string[]
  versioned: boolean
  installed: boolean
  version?: string
  path?: string
  /** personal: in the home of the account (can be removed here); system: came with the server */
  source?: 'personal' | 'system'
}

export interface ToolCheck {
  binary: string
  installed: boolean
  version?: string
}

export interface ToolchainPrefs {
  path: string[]
  env: Record<string, string>
  shell: string
}

export interface ToolchainInfo {
  supported: boolean
  home: string
  tools: ToolStatus[]
  checks: ToolCheck[]
  prefs: ToolchainPrefs
}

export interface ToolchainEvent {
  type: 'log' | 'done' | 'error'
  line?: string
  error?: string
}

export const getToolchain = () => agentApi.get<ToolchainInfo>('/api/v1/me/toolchain').then((r) => r.data)

export const saveToolchainPrefs = (prefs: ToolchainPrefs) =>
  agentApi.put<{ ok: boolean; prefs: ToolchainPrefs }>('/api/v1/me/toolchain/prefs', prefs).then((r) => r.data)

export const streamToolchain = (action: 'install' | 'remove', tool: string, version: string, onEvent: (event: ToolchainEvent) => void, signal: AbortSignal) =>
  streamJsonLines<ToolchainEvent>(`/api/v1/me/toolchain/${action}`, { body: { tool, version } }, onEvent, signal)
