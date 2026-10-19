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
  /** WhatsApp Cloud: the number it sends from, the name Meta verified for it, and the ids typed by the owner */
  phone?: string
  phoneName?: string
  phoneId?: string
  wabaId?: string
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
  whatsappCloud: NotifyRecipient
  /** What the owner pastes into the webhook settings of the Meta app */
  cloudWebhook?: { verifyToken: string; secretSet: boolean } | null
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
  /** What the channel said after it left: delivered, read, failed */
  providerStatus?: string
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

export const testTelegram = () => agentApi.post<{ id: number }>('/api/v1/me/telegram/test').then((r) => r.data)

export const startTelegramLink = () => agentApi.post<NotifyLink>('/api/v1/me/telegram/link').then((r) => r.data)

export const checkTelegramLink = () =>
  agentApi.post<{ linked: boolean; telegram: NotifyRecipient }>('/api/v1/me/telegram/link/check').then((r) => r.data)

export const setTelegramMuted = (mutedEvents: string[]) =>
  agentApi.put<NotifyRecipient>('/api/v1/me/telegram', { mutedEvents }).then((r) => r.data)

export const unlinkTelegram = () => agentApi.delete<{ ok: boolean }>('/api/v1/me/telegram').then((r) => r.data)

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

export type WahaState = 'off' | 'starting' | 'running' | 'stopped' | 'error'

export interface WahaStatus {
  state: WahaState
  enabled: boolean
  image: string
  engine: string
  version: string
  sessions: number
  lastError: string
  /** Only reachable from the server itself: the container listens on the loopback address */
  dashboardUrl: string
  dashboardUser: string
  dashboardPassword: string
  /** What docker says when WAHA does not answer: the state of the container and the end of its log */
  containerState?: string
  logTail?: string
}

export const getWahaStatus = () => agentApi.get<WahaStatus>('/api/v1/notify/waha').then((r) => r.data)

export const setWahaEnabled = (enabled: boolean) => agentApi.put<WahaStatus>('/api/v1/notify/waha', { enabled }).then((r) => r.data)

export const restartWaha = () => agentApi.post<WahaStatus>('/api/v1/notify/waha/restart').then((r) => r.data)

/** EXPIRED: the wait for a scan ended (five minutes, or three new codes) and the session was stopped */
export type WhatsAppStatus = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED' | 'EXPIRED'

export interface MyWhatsApp {
  /** The owner switched WhatsApp on and it answers */
  available: boolean
  status: WhatsAppStatus
  connected: boolean
  /** Masked */
  phone: string
  sessionName: string
  recipient: NotifyRecipient
  /** The notices go to the number of the session itself, which makes no sound on the phone */
  destinationIsSession?: boolean
}

export const getMyWhatsApp = () => agentApi.get<MyWhatsApp>('/api/v1/me/whatsapp').then((r) => r.data)

export const connectWhatsApp = () => agentApi.post<MyWhatsApp>('/api/v1/me/whatsapp/connect').then((r) => r.data)

/** Starts the session over: a working one keeps its phone, any other gets a new code */
export const restartWhatsApp = () => agentApi.post<MyWhatsApp>('/api/v1/me/whatsapp/restart').then((r) => r.data)

/** The number the notices are sent to; empty goes back to the number of the session */
export const setWhatsAppDestination = (number: string) => agentApi.put<MyWhatsApp>('/api/v1/me/whatsapp/destination', { number }).then((r) => r.data)

export const getWhatsAppQR = () => agentApi.get<Blob>('/api/v1/me/whatsapp/qr', { responseType: 'blob' }).then((r) => r.data)

export const setWhatsAppMuted = (mutedEvents: string[]) =>
  agentApi.put<NotifyRecipient>('/api/v1/me/whatsapp', { mutedEvents }).then((r) => r.data)

export const testWhatsApp = () => agentApi.post<{ id: number }>('/api/v1/me/whatsapp/test').then((r) => r.data)

export const disconnectWhatsApp = () => agentApi.delete<{ ok: boolean }>('/api/v1/me/whatsapp').then((r) => r.data)

export interface CloudInput {
  enabled: boolean
  /** Left out, the saved token stays */
  accessToken?: string
  phoneId: string
  wabaId: string
  /** Left out, the saved app secret stays */
  appSecret?: string
}

export const saveCloudChannel = (body: CloudInput) =>
  agentApi.put<NotifyOverview>('/api/v1/notify/channels/whatsapp-cloud', body).then((r) => r.data)

export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'MISSING' | string

export interface CloudTemplate {
  name: string
  language: string
  event: string
  body: string
  status: TemplateStatus
}

export const getCloudTemplates = () =>
  agentApi.get<{ templates: CloudTemplate[] }>('/api/v1/notify/whatsapp-cloud/templates').then((r) => r.data.templates)

export const createCloudTemplates = () =>
  agentApi.post<{ created: number }>('/api/v1/notify/whatsapp-cloud/templates').then((r) => r.data)

export const setCloudNumber = (number: string) =>
  agentApi.put<NotifyRecipient>('/api/v1/notify/recipients/whatsapp-cloud', { number }).then((r) => r.data)

export const setCloudMuted = (mutedEvents: string[]) =>
  agentApi.put<NotifyRecipient>('/api/v1/notify/recipients/whatsapp-cloud/muted', { mutedEvents }).then((r) => r.data)

export const removeCloudNumber = () => agentApi.delete<{ ok: boolean }>('/api/v1/notify/recipients/whatsapp-cloud').then((r) => r.data)

export const testCloud = () => agentApi.post<{ id: number }>('/api/v1/notify/channels/whatsapp-cloud/test').then((r) => r.data)

/** The address the WAHA dashboard answers on ("" while none is set); only the superadmin may open it */
export const getWahaDashboardHost = () => agentApi.get<{ host: string; panelPort: number }>('/api/v1/notify/waha/dashboard').then((r) => r.data)

export const setWahaDashboardHost = (host: string) => agentApi.put<{ host: string; panelPort: number }>('/api/v1/notify/waha/dashboard', { host }).then((r) => r.data)

/** A link that opens the dashboard once and for a minute and a half */
export const openWahaDashboard = () => agentApi.post<{ url: string }>('/api/v1/notify/waha/dashboard/link').then((r) => r.data)

/** What an account needs to link its own Telegram, in the shape of the settings overview */
export const getMyTelegramOverview = () => agentApi.get<NotifyOverview>('/api/v1/me/telegram').then((r) => r.data)
