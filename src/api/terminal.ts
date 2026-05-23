import { agentApi } from './client'

export interface TerminalPreset {
  id: number
  label: string
  command: string
  sortOrder: number
  createdAt: string
}

export const startTerminalSession = (target = 'local') =>
  agentApi.post<import('@/types').TerminalSessionStartResponse>('/api/v1/terminal/sessions', { target }).then((r) => r.data)

export const closeTerminalSession = (sessionId: string) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/terminal/sessions/${sessionId}`).then((r) => r.data)

export const listTerminalPresets = () =>
  agentApi.get<{ presets: TerminalPreset[] }>('/api/v1/terminal/presets').then((r) => r.data.presets)

export const createTerminalPreset = (label: string, command: string) =>
  agentApi.post<{ preset: TerminalPreset }>('/api/v1/terminal/presets', { label, command }).then((r) => r.data.preset)

export const deleteTerminalPreset = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/terminal/presets/${id}`).then((r) => r.data)

export const resetTerminalPresets = () =>
  agentApi.post<{ ok: boolean; presets: TerminalPreset[] }>('/api/v1/terminal/presets/reset').then((r) => r.data)
