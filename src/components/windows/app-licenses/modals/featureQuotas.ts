// Shared feature flags, quotas, and pricing helpers for App License & Plan modals

export interface LicenseFeatureFlags {
  unlimitedBroadcast: boolean
  liveChat: boolean
  multiSession: boolean
  customRoles: boolean
  omnichannel: boolean
  scheduledPosts: boolean
  autoReply: boolean
  aiAgent: boolean
  mcpTools: boolean
  exportReports: boolean
  birthdayBot: boolean
  wahaSync: boolean
  apiAccess: boolean
}

export interface LicenseFeatureState extends LicenseFeatureFlags {
  maxContacts: number
  maxBroadcastPerMonth: number
  maxSessions: number
  maxSessionIdentitySwitches: number
  maxTemplates: number
  maxUsers: number
  maxChannels: number
  supportPriority: string
  maxStorageMb: number
  maxAttachmentSizeMb: number
}

export interface FeatureToggleOption {
  key: keyof LicenseFeatureFlags
  label: string
}

export const EDIT_FEATURE_TOGGLES: readonly FeatureToggleOption[] = [
  { key: 'liveChat', label: 'Live Chat CRM (Conversation)' },
  { key: 'multiSession', label: 'Multi-Sesi WhatsApp' },
  { key: 'unlimitedBroadcast', label: 'Broadcast WA Tanpa Batas' },
  { key: 'wahaSync', label: 'Integrasi WAHA' },
  { key: 'birthdayBot', label: 'Bot Ulang Tahun' },
  { key: 'customRoles', label: 'Role CS Kustom Granular' },
  { key: 'omnichannel', label: 'Omnichannel Sosial' },
  { key: 'scheduledPosts', label: 'Jadwal Post & Story WA' },
  { key: 'autoReply', label: 'Auto-Reply & Jam Kerja' },
  { key: 'aiAgent', label: 'Agent AI Multi-Model' },
  { key: 'mcpTools', label: 'MCP Tool Servers' },
  { key: 'exportReports', label: 'Ekspor Laporan CSV' },
  { key: 'apiAccess', label: 'Akses API & Webhook' },
]

export const CREATE_PLAN_FEATURE_TOGGLES: readonly FeatureToggleOption[] = [
  { key: 'unlimitedBroadcast', label: 'Broadcast Tanpa Batas' },
  { key: 'liveChat', label: 'Live Chat & CRM Inbox' },
  { key: 'multiSession', label: 'Multi-Sesi WhatsApp' },
  { key: 'customRoles', label: 'Role CS Kustom' },
  { key: 'omnichannel', label: 'Omnichannel Sosial' },
  { key: 'scheduledPosts', label: 'Jadwal Post & Story WA' },
  { key: 'autoReply', label: 'Auto-Reply & Jam Kerja' },
  { key: 'aiAgent', label: 'Agent AI Multi-Model' },
  { key: 'mcpTools', label: 'MCP Tool Servers' },
  { key: 'exportReports', label: 'Ekspor Laporan CSV' },
  { key: 'wahaSync', label: 'Integrasi WAHA' },
  { key: 'birthdayBot', label: 'Bot Ulang Tahun' },
  { key: 'apiAccess', label: 'Akses API & Webhook' },
]

export const EDIT_LICENSE_DEFAULT_FEATURES: LicenseFeatureState = {
  unlimitedBroadcast: false,
  maxBroadcastPerMonth: 0,
  liveChat: false,
  multiSession: false,
  maxSessions: 1,
  maxSessionIdentitySwitches: 2,
  maxTemplates: 0,
  maxUsers: 1,
  customRoles: false,
  omnichannel: false,
  maxChannels: 0,
  scheduledPosts: false,
  autoReply: true,
  aiAgent: false,
  mcpTools: false,
  exportReports: false,
  birthdayBot: false,
  wahaSync: false,
  apiAccess: false,
  maxContacts: 1000,
  supportPriority: 'standard',
  maxStorageMb: 5120,
  maxAttachmentSizeMb: 25,
}

export const EDIT_PLAN_DEFAULT_FEATURES: LicenseFeatureState = {
  maxContacts: 10000,
  unlimitedBroadcast: true,
  maxBroadcastPerMonth: 0,
  liveChat: true,
  multiSession: false,
  maxSessions: 1,
  maxSessionIdentitySwitches: 2,
  maxTemplates: 0,
  maxUsers: 1,
  customRoles: false,
  omnichannel: false,
  maxChannels: 0,
  scheduledPosts: false,
  autoReply: true,
  aiAgent: false,
  mcpTools: false,
  exportReports: false,
  birthdayBot: true,
  wahaSync: true,
  apiAccess: false,
  supportPriority: 'standard',
  maxStorageMb: 5120,
  maxAttachmentSizeMb: 25,
}

export const CREATE_PLAN_DEFAULT_FEATURES: LicenseFeatureState = {
  maxContacts: 5000,
  unlimitedBroadcast: false,
  maxBroadcastPerMonth: 5000,
  liveChat: true,
  multiSession: true,
  maxSessions: 2,
  maxSessionIdentitySwitches: 5,
  maxTemplates: 50,
  maxUsers: 5,
  customRoles: true,
  omnichannel: true,
  maxChannels: 4,
  scheduledPosts: true,
  autoReply: true,
  aiAgent: false,
  mcpTools: false,
  exportReports: true,
  birthdayBot: true,
  wahaSync: true,
  apiAccess: false,
  supportPriority: 'fast',
  maxStorageMb: 5120,
  maxAttachmentSizeMb: 25,
}

export function parseFeaturesFromRecord(
  raw: Record<string, boolean | number | string> | undefined,
  defaultMaxContacts: number
): LicenseFeatureState {
  const feats = raw || {}
  const isUnlim = Boolean(feats.unlimitedBroadcast ?? feats.broadcast)
  const isMulti = Boolean(feats.multiSession ?? feats.multiUser)

  return {
    maxContacts: Number(feats.maxContacts ?? defaultMaxContacts) || 0,
    unlimitedBroadcast: isUnlim,
    maxBroadcastPerMonth: Number(feats.maxBroadcastPerMonth ?? (isUnlim ? 0 : 1500)) || 0,
    liveChat: Boolean(feats.liveChat ?? feats.liveChatCrm),
    multiSession: isMulti,
    maxSessions: Number(feats.maxSessions ?? (isMulti ? 3 : 1)) || 1,
    maxSessionIdentitySwitches: Number(feats.maxSessionIdentitySwitches ?? 2) || 2,
    maxTemplates: Number(feats.maxTemplates ?? 0) || 0,
    maxUsers: Number(feats.maxUsers ?? feats.maxAgents ?? 1) || 1,
    customRoles: Boolean(feats.customRoles),
    omnichannel: Boolean(feats.omnichannel),
    maxChannels: Number(feats.maxChannels ?? 0) || 0,
    scheduledPosts: Boolean(feats.scheduledPosts),
    autoReply: feats.autoReply !== undefined ? Boolean(feats.autoReply) : true,
    aiAgent: Boolean(feats.aiAgent),
    mcpTools: Boolean(feats.mcpTools),
    exportReports: Boolean(feats.exportReports),
    birthdayBot: Boolean(feats.birthdayBot ?? feats.botBirthday),
    wahaSync: Boolean(feats.wahaSync),
    apiAccess: Boolean(feats.apiAccess),
    supportPriority: String(feats.supportPriority || 'standard').toLowerCase(),
    maxStorageMb: Number(feats.maxStorageMb ?? 5120) || 5120,
    maxAttachmentSizeMb: Number(feats.maxAttachmentSizeMb ?? 25) || 25,
  }
}

export function buildFeaturesPayload(
  state: LicenseFeatureState,
  options?: {
    base?: Record<string, boolean | number | string>
    includeIdentitySwitches?: boolean
    includeStorage?: boolean
  }
): Record<string, string | number | boolean> {
  const payload: Record<string, string | number | boolean> = {
    ...(options?.base || {}),
    maxContacts: Math.max(0, state.maxContacts),
    unlimitedContacts: state.maxContacts === 0,
    unlimitedBroadcast: state.unlimitedBroadcast,
    maxBroadcastPerMonth: state.unlimitedBroadcast ? 0 : Math.max(0, state.maxBroadcastPerMonth),
    liveChat: state.liveChat,
    multiSession: state.multiSession || state.maxSessions > 1,
    maxSessions: Math.max(1, state.maxSessions),
    maxTemplates: Math.max(0, state.maxTemplates),
    maxUsers: Math.max(1, state.maxUsers),
    maxAgents: Math.max(1, state.maxUsers),
    multiAgent: state.maxUsers > 1,
    customRoles: state.customRoles,
    omnichannel: state.omnichannel,
    maxChannels: Math.max(0, state.maxChannels),
    scheduledPosts: state.scheduledPosts,
    autoReply: state.autoReply,
    aiAgent: state.aiAgent,
    mcpTools: state.mcpTools,
    exportReports: state.exportReports,
    birthdayBot: state.birthdayBot,
    wahaSync: state.wahaSync,
    apiAccess: state.apiAccess,
    supportPriority: state.supportPriority,
  }

  if (options?.includeIdentitySwitches) {
    payload.maxSessionIdentitySwitches = Math.max(1, state.maxSessionIdentitySwitches)
  }

  if (options?.includeStorage) {
    payload.maxStorageMb = Math.max(100, state.maxStorageMb)
    payload.maxAttachmentSizeMb = Math.max(1, state.maxAttachmentSizeMb)
  }

  return payload
}

export function computeAnnualPrice(monthlyPrice: number, discPct: number): number {
  const cleanDisc = Math.max(0, Math.min(80, discPct))
  if (cleanDisc === 17) return monthlyPrice * 10 // standar hemat 2 bulan (10x bulanan)
  return Math.round((monthlyPrice * 12 * (1 - cleanDisc / 100)) / 1000) * 1000
}

export function computeDiscountPercent(originalPrice: number, salePrice: number): number {
  return originalPrice > salePrice
    ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
    : 0
}

export function extractApiError(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
    (err instanceof Error ? err.message : fallback)
  )
}
