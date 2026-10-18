import { agentApi } from './client'

// Notices outside the panel: the channels, where the superadmin wants them, the queue and the thresholds of the alerts

export interface NotifyChannel {
  kind: string
  enabled: boolean
  /** A token is saved; the token itself never comes back */
  configured: boolean
  status: 'unconfigured' | 'active' | 'error' | string
  lastError: string
  checkedAt: string | null
  botUsername?: string
  botName?: string
}

export interface NotifyRecipient {
  linked: boolean
  /** Masked: enough to recognise the chat, not to use it */
  address: string
  verifiedAt: string | null
  blocked: boolean
  mutedEvents: string[]
  pendingUntil: string | null
}

export interface NotifyOverview {
  channels: NotifyChannel[]
  telegram: NotifyRecipient
  pending: number
  failed: number
}

export interface NotifyLink {
  code: string
  url: string
  expiresAt: string
}

export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'

export interface OutboxItem {
  id: number
  event: string
  username: string
  kind: string
  address: string
  status: OutboxStatus
  priority: number
  attempts: number
  nextAttemptAt: string
  error: string
  createdAt: string
  sentAt: string | null
  /** What the message said, with its few HTML tags */
  text: string
}

export interface Detector {
  event: string
  levels: number[]
  windowSec: number
  cooldownSec: number
  quietSec: number
  countDistinct: boolean
  minDistinct: number
  recovery: boolean
}

export const getNotifyOverview = () => agentApi.get<NotifyOverview>('/api/v1/notify/overview').then((r) => r.data)

export const saveTelegramChannel = (body: { enabled: boolean; botToken?: string }) =>
  agentApi.put<NotifyOverview>('/api/v1/notify/channels/telegram', body).then((r) => r.data)

export const testTelegram = () => agentApi.post<{ id: number }>('/api/v1/notify/channels/telegram/test').then((r) => r.data)

export const startTelegramLink = () => agentApi.post<NotifyLink>('/api/v1/notify/recipients/telegram/link').then((r) => r.data)

export const checkTelegramLink = () =>
  agentApi.post<{ linked: boolean; telegram: NotifyRecipient }>('/api/v1/notify/recipients/telegram/link/check').then((r) => r.data)

export const setTelegramMuted = (mutedEvents: string[]) =>
  agentApi.put<NotifyRecipient>('/api/v1/notify/recipients/telegram', { mutedEvents }).then((r) => r.data)

export const unlinkTelegram = () => agentApi.delete<{ ok: boolean }>('/api/v1/notify/recipients/telegram').then((r) => r.data)

export const listOutbox = (status: string) =>
  agentApi
    .get<{ items: OutboxItem[]; pending: number; failed: number }>('/api/v1/notify/outbox', { params: { status: status || undefined, limit: 50 } })
    .then((r) => r.data)

export const retryOutbox = (id: number) => agentApi.post<{ ok: boolean }>(`/api/v1/notify/outbox/${id}/retry`).then((r) => r.data)

export const getThresholds = () =>
  agentApi.get<{ detectors: Detector[]; defaults: Detector[] }>('/api/v1/notify/thresholds').then((r) => r.data)

export const saveThresholds = (detectors: Detector[]) =>
  agentApi.put<{ detectors: Detector[]; defaults: Detector[] }>('/api/v1/notify/thresholds', { detectors }).then((r) => r.data)

export const resetThresholds = () =>
  agentApi.delete<{ detectors: Detector[]; defaults: Detector[] }>('/api/v1/notify/thresholds').then((r) => r.data)
