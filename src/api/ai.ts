import { agentApi } from './client'

export interface AIProviderPreset {
  id: string
  label: string
  defaultBaseUrl: string
  defaultModel: string
  keyRequired: boolean
}

export interface AISettings {
  provider: string
  baseUrl: string
  model: string
  hasApiKey: boolean
  temperature: number
  enabled: boolean
  presets: AIProviderPreset[]
}

export interface UpdateAISettingsInput {
  provider: string
  baseUrl: string
  model: string
  apiKey?: string
  clearApiKey?: boolean
  temperature: number
  enabled: boolean
}

export const getAISettings = () =>
  agentApi.get<AISettings>('/api/v1/settings/ai').then((r) => r.data)

export const saveAISettings = (payload: UpdateAISettingsInput) =>
  agentApi.put<AISettings>('/api/v1/settings/ai', payload).then((r) => r.data)

export const testAISettings = (payload: Partial<UpdateAISettingsInput>) =>
  agentApi.post<{ ok: boolean; reply: string }>('/api/v1/settings/ai/test', payload).then((r) => r.data)
