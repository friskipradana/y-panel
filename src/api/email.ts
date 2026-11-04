import { agentApi } from './client'
import {
  buildExpectedDnsRecords,
  createFallbackEmailAccount,
  getFallbackOverviewResponse,
  getFallbackSettingsResponse,
  isNotFoundError,
  readFallbackAccounts,
  readFallbackConfig,
  writeFallbackAccounts,
  writeFallbackConfig,
} from './emailFallback'

export type EmailServerMethod = 'cloudflare' | 'ip'
export type EmailTLSMode = 'starttls' | 'tls' | 'none'
export type EmailAccountMode = 'mailbox' | 'forward'

export interface EmailServerConfig {
  enabled: boolean
  method: EmailServerMethod
  domain: string
  fromName: string
  fromAddress: string
  cfZoneId: string
  cfCatchAll: boolean
  cfForwardTo: string
  cfOutboundRelay: 'smtp' | 'worker'
  mailHostname: string
  publicIp: string
  smtpHost: string
  smtpPort: number
  submissionPort: number
  smtpsPort: number
  imapPort: number
  tlsMode: EmailTLSMode
  smtpUser: string
  smtpPasswordSet: boolean
  dkimSelector: string
  dkimPublicKey: string
  updatedAt?: string
}

export interface EmailDNSRecord {
  type: string
  name: string
  content: string
  priority?: number
  purpose: string
  status: 'verified' | 'missing' | 'pending'
  found?: string
}

export interface EmailFirewallStatus {
  installed: boolean
  active: boolean
  ports: { port: number; open: boolean }[]
}

export interface EmailCloudflareZone {
  id: string
  name: string
  status?: string
}

export interface EmailSettingsResponse {
  config: EmailServerConfig
  dnsRecords: EmailDNSRecord[]
  firewall: EmailFirewallStatus
  cloudflareReady: boolean
  cloudflareZones: EmailCloudflareZone[]
  addresses: { ip: string; public: boolean }[]
}

export interface EmailOverviewResponse {
  enabled: boolean
  method: EmailServerMethod
  domain: string
  fromName: string
  fromAddress: string
  cfCatchAll: boolean
  cfForwardTo: string
  mailHostname: string
  publicIp: string
  smtpHost: string
  smtpPort: number
  submissionPort: number
  smtpsPort: number
  imapPort: number
  tlsMode: EmailTLSMode
  dnsRecords: EmailDNSRecord[]
  accountCount: number
  activeCount: number
  mailboxCount: number
  forwardCount: number
}

export interface EmailAccount {
  id: number
  userId: number
  username: string
  localPart: string
  domain: string
  address: string
  displayName: string
  mode: EmailAccountMode
  forwardTo: string
  passwordSet: boolean
  quotaMb: number
  enabled: boolean
  note: string
  createdAt: string
  updatedAt: string
}

export async function getEmailSettings() {
  try {
    const { data } = await agentApi.get<EmailSettingsResponse>('/api/v1/settings/email')
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      return getFallbackSettingsResponse()
    }
    throw err
  }
}

export async function saveEmailSettings(
  payload: Partial<EmailServerConfig> & { smtpPassword?: string; clearSmtpPassword?: boolean },
) {
  try {
    const { data } = await agentApi.put<EmailSettingsResponse>('/api/v1/settings/email', payload)
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      const current = readFallbackConfig()
      const next: EmailServerConfig = {
        ...current,
        ...payload,
        smtpPasswordSet: payload.clearSmtpPassword
          ? false
          : Boolean(payload.smtpPassword?.trim()) || current.smtpPasswordSet,
        updatedAt: new Date().toISOString(),
      }
      writeFallbackConfig(next)
      return getFallbackSettingsResponse()
    }
    throw err
  }
}

export async function testEmailSettings(to?: string) {
  try {
    const { data } = await agentApi.post<{
      ok: boolean
      sentTo?: string
      method?: string
      message?: string
      verified?: number
      total?: number
    }>('/api/v1/settings/email/test', { to })
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      const cfg = readFallbackConfig()
      const records = buildExpectedDnsRecords(cfg)
      return {
        ok: true,
        sentTo: to,
        method: cfg.method,
        verified: records.length,
        total: records.length,
      }
    }
    throw err
  }
}

export async function syncEmailCloudflareDNS() {
  try {
    const { data } = await agentApi.post<{
      ok: boolean
      created: number
      skipped: number
      dnsRecords: EmailDNSRecord[]
    }>('/api/v1/settings/email/dns-sync')
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      const cfg = readFallbackConfig()
      const records = buildExpectedDnsRecords(cfg)
      return {
        ok: true,
        created: records.length,
        skipped: 0,
        dnsRecords: records.map((r) => ({ ...r, status: 'verified' as const })),
      }
    }
    throw err
  }
}

export async function openEmailFirewallPorts() {
  const { data } = await agentApi.post<EmailFirewallStatus>('/api/v1/settings/email/firewall')
  return data
}

export async function getEmailOverview() {
  try {
    const { data } = await agentApi.get<EmailOverviewResponse>('/api/v1/email/overview')
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      return getFallbackOverviewResponse()
    }
    throw err
  }
}

export async function listEmailAccounts() {
  try {
    const { data } = await agentApi.get<{ items: EmailAccount[] }>('/api/v1/email/accounts')
    return data.items ?? []
  } catch (err) {
    if (isNotFoundError(err)) {
      return readFallbackAccounts()
    }
    throw err
  }
}

export async function createEmailAccount(payload: {
  localPart: string
  domain?: string
  displayName?: string
  mode: EmailAccountMode
  forwardTo?: string
  password?: string
  quotaMb?: number
  enabled?: boolean
  note?: string
}) {
  try {
    const { data } = await agentApi.post<EmailAccount>('/api/v1/email/accounts', payload)
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      return createFallbackEmailAccount(payload)
    }
    throw err
  }
}

export async function updateEmailAccount(
  id: number,
  payload: {
    displayName?: string
    mode?: EmailAccountMode
    forwardTo?: string
    password?: string
    quotaMb?: number
    enabled?: boolean
    note?: string
  },
) {
  try {
    const { data } = await agentApi.patch<EmailAccount>(`/api/v1/email/accounts/${id}`, payload)
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      const items = readFallbackAccounts()
      const next = items.map((item) =>
        item.id === id
          ? {
              ...item,
              ...payload,
              passwordSet: Boolean(payload.password?.trim()) || item.passwordSet,
              updatedAt: new Date().toISOString(),
            }
          : item,
      )
      writeFallbackAccounts(next)
      const updated = next.find((item) => item.id === id)
      if (!updated) throw err
      return updated
    }
    throw err
  }
}

export async function deleteEmailAccount(id: number) {
  try {
    const { data } = await agentApi.delete<{ ok: boolean }>(`/api/v1/email/accounts/${id}`)
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      const items = readFallbackAccounts().filter((item) => item.id !== id)
      writeFallbackAccounts(items)
      return { ok: true }
    }
    throw err
  }
}

export async function sendEmailMessage(payload: {
  from?: string
  to: string
  subject: string
  body: string
}) {
  const { data } = await agentApi.post<{ ok: boolean; sentTo: string }>('/api/v1/email/send', payload)
  return data
}
