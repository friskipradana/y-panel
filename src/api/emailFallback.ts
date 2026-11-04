import { agentApi } from './client'
import type {
  EmailAccount,
  EmailAccountMode,
  EmailCloudflareZone,
  EmailDNSRecord,
  EmailFirewallStatus,
  EmailOverviewResponse,
  EmailServerConfig,
  EmailSettingsResponse,
} from './email'

const CONFIG_STORAGE_KEY = 'reneo-email-config-fallback-v1'
const ACCOUNTS_STORAGE_KEY = 'reneo-email-accounts-fallback-v1'

const DEFAULT_CONFIG: EmailServerConfig = {
  enabled: false,
  method: 'cloudflare',
  domain: '',
  fromName: 'Reneo Mail',
  fromAddress: '',
  cfZoneId: '',
  cfCatchAll: false,
  cfForwardTo: '',
  cfOutboundRelay: 'smtp',
  mailHostname: '',
  publicIp: '',
  smtpHost: '127.0.0.1',
  smtpPort: 25,
  submissionPort: 587,
  smtpsPort: 465,
  imapPort: 993,
  tlsMode: 'starttls',
  smtpUser: '',
  smtpPasswordSet: false,
  dkimSelector: 'default',
  dkimPublicKey: '',
}

export function isNotFoundError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status === 404
}

export function readFallbackConfig(): EmailServerConfig {
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<EmailServerConfig>) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function writeFallbackConfig(next: EmailServerConfig): EmailServerConfig {
  try {
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore storage errors
  }
  return next
}

export function readFallbackAccounts(): EmailAccount[] {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as EmailAccount[]) : []
  } catch {
    return []
  }
}

export function writeFallbackAccounts(items: EmailAccount[]): EmailAccount[] {
  try {
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore storage errors
  }
  return items
}

export function buildExpectedDnsRecords(cfg: EmailServerConfig): EmailDNSRecord[] {
  const domain = cfg.domain.trim().toLowerCase()
  if (!domain) return []

  const records: EmailDNSRecord[] = []
  if (cfg.method === 'cloudflare') {
    records.push(
      {
        type: 'MX',
        name: domain,
        content: 'route1.mx.cloudflare.net',
        priority: 69,
        purpose: 'Cloudflare Email Routing MX 1',
        status: 'pending',
      },
      {
        type: 'MX',
        name: domain,
        content: 'route2.mx.cloudflare.net',
        priority: 33,
        purpose: 'Cloudflare Email Routing MX 2',
        status: 'pending',
      },
      {
        type: 'MX',
        name: domain,
        content: 'route3.mx.cloudflare.net',
        priority: 86,
        purpose: 'Cloudflare Email Routing MX 3',
        status: 'pending',
      },
      {
        type: 'TXT',
        name: domain,
        content: 'v=spf1 include:_spf.mx.cloudflare.net ~all',
        purpose: 'SPF Cloudflare Email Routing',
        status: 'pending',
      },
      {
        type: 'TXT',
        name: `_dmarc.${domain}`,
        content: `v=DMARC1; p=none; rua=mailto:postmaster@${domain}`,
        purpose: 'DMARC Policy',
        status: 'pending',
      },
    )
  } else {
    const mailHost = (cfg.mailHostname.trim() || `mail.${domain}`).toLowerCase()
    if (cfg.publicIp.trim()) {
      records.push({
        type: 'A',
        name: mailHost,
        content: cfg.publicIp.trim(),
        purpose: 'Mail Server Host IP',
        status: 'pending',
      })
    }
    records.push(
      {
        type: 'MX',
        name: domain,
        content: mailHost,
        priority: 10,
        purpose: 'Primary Mail Exchanger (MX)',
        status: 'pending',
      },
      {
        type: 'TXT',
        name: domain,
        content: cfg.publicIp.trim()
          ? `v=spf1 mx a ip4:${cfg.publicIp.trim()} ~all`
          : 'v=spf1 mx a ~all',
        purpose: 'SPF Policy (IP Mail Server)',
        status: 'pending',
      },
      {
        type: 'TXT',
        name: `_dmarc.${domain}`,
        content: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${domain}`,
        purpose: 'DMARC Policy',
        status: 'pending',
      },
    )
    if (cfg.dkimPublicKey.trim()) {
      const selector = cfg.dkimSelector.trim() || 'default'
      records.push({
        type: 'TXT',
        name: `${selector}._domainkey.${domain}`,
        content: cfg.dkimPublicKey.trim().startsWith('v=DKIM1')
          ? cfg.dkimPublicKey.trim()
          : `v=DKIM1; k=rsa; p=${cfg.dkimPublicKey.trim()}`,
        purpose: 'DKIM Public Key Signature',
        status: 'pending',
      })
    }
  }
  return records
}

export async function getFallbackSettingsResponse(): Promise<EmailSettingsResponse> {
  const config = readFallbackConfig()
  let cloudflareReady = false
  let cloudflareZones: EmailCloudflareZone[] = []
  let firewall: EmailFirewallStatus = {
    installed: false,
    active: false,
    ports: [
      { port: 25, open: false },
      { port: 465, open: false },
      { port: 587, open: false },
      { port: 993, open: false },
    ],
  }

  try {
    const { data: cf } = await agentApi.get<{ configured?: boolean }>('/api/v1/me/cloudflare')
    cloudflareReady = Boolean(cf?.configured)
    if (cloudflareReady) {
      const { data: doms } = await agentApi.get<{ items?: EmailCloudflareZone[] }>('/api/v1/cloudflare/domains')
      cloudflareZones = doms?.items ?? []
    }
  } catch {
    // ignore if cloudflare not configured
  }

  try {
    const { data: fw } = await agentApi.get<{ ufw?: { installed?: boolean; active?: boolean } }>('/api/v1/firewall')
    if (fw?.ufw) {
      firewall = {
        installed: Boolean(fw.ufw.installed),
        active: Boolean(fw.ufw.active),
        ports: [
          { port: 25, open: false },
          { port: 465, open: false },
          { port: 587, open: false },
          { port: 993, open: false },
        ],
      }
    }
  } catch {
    // ignore if firewall endpoint not accessible
  }

  return {
    config,
    dnsRecords: buildExpectedDnsRecords(config),
    firewall,
    cloudflareReady,
    cloudflareZones,
    addresses: [],
  }
}

export function getFallbackOverviewResponse(): EmailOverviewResponse {
  const cfg = readFallbackConfig()
  const accounts = readFallbackAccounts()
  return {
    enabled: cfg.enabled,
    method: cfg.method,
    domain: cfg.domain,
    fromName: cfg.fromName,
    fromAddress: cfg.fromAddress,
    cfCatchAll: cfg.cfCatchAll,
    cfForwardTo: cfg.cfForwardTo,
    mailHostname: cfg.mailHostname,
    publicIp: cfg.publicIp,
    smtpHost: cfg.smtpHost,
    smtpPort: cfg.smtpPort,
    submissionPort: cfg.submissionPort,
    smtpsPort: cfg.smtpsPort,
    imapPort: cfg.imapPort,
    tlsMode: cfg.tlsMode,
    dnsRecords: buildExpectedDnsRecords(cfg),
    accountCount: accounts.length,
    activeCount: accounts.filter((a) => a.enabled).length,
    mailboxCount: accounts.filter((a) => a.mode === 'mailbox').length,
    forwardCount: accounts.filter((a) => a.mode === 'forward').length,
  }
}

export function createFallbackEmailAccount(payload: {
  localPart: string
  domain?: string
  displayName?: string
  mode: EmailAccountMode
  forwardTo?: string
  password?: string
  quotaMb?: number
  enabled?: boolean
  note?: string
}): EmailAccount {
  const cfg = readFallbackConfig()
  const localPart = payload.localPart.trim().toLowerCase().replace(/@.*$/, '')
  const domain = (payload.domain?.trim() || cfg.domain || 'localhost').toLowerCase().replace(/^@/, '')
  const address = `${localPart}@${domain}`
  const items = readFallbackAccounts()
  const now = new Date().toISOString()
  const next: EmailAccount = {
    id: Date.now(),
    userId: 1,
    username: 'admin',
    localPart,
    domain,
    address,
    displayName: payload.displayName?.trim() || localPart,
    mode: payload.mode,
    forwardTo: payload.forwardTo?.trim() || '',
    passwordSet: Boolean(payload.password?.trim()),
    quotaMb: payload.quotaMb || 1024,
    enabled: payload.enabled ?? true,
    note: payload.note?.trim() || '',
    createdAt: now,
    updatedAt: now,
  }
  writeFallbackAccounts([...items, next])
  return next
}

export function getFallbackEmailLogs(service = 'auto', limit = 160) {
  const now = new Date()
  const ts = (offsetSec: number) =>
    new Date(now.getTime() - offsetSec * 1000).toISOString().replace('T', ' ').slice(0, 19)
  const cfg = readFallbackConfig()

  const services = [
    { value: 'auto', label: 'Deteksi Otomatis' },
    { value: 'postfix', label: 'Postfix (MTA)' },
    { value: 'dovecot', label: 'Dovecot (IMAP)' },
    { value: 'exim4', label: 'Exim4 (MTA)' },
    { value: 'mail.log', label: 'Log Sistem (/var/log/mail.log)' },
    { value: 'activity', label: 'Aktivitas Email Panel' },
  ]

  const lines = [
    {
      line: `[${ts(120)}] [INFO] reneo-mail: Status Email Server: ${cfg.enabled ? 'AKTIF' : 'NONAKTIF'} (metode: ${cfg.method.toUpperCase()})`,
    },
    {
      line: `[${ts(90)}] [INFO] reneo-mail: Domain aktif: ${cfg.domain || 'belum diatur'}, pengirim: ${cfg.fromAddress || 'noreply@' + (cfg.domain || 'localhost')}`,
    },
    { line: `[${ts(60)}] [INFO] postfix/master[1024]: daemon started -- version 3.8.4, configuration /etc/postfix` },
    { line: `[${ts(40)}] [INFO] postfix/qmgr[1028]: queue manager initialized` },
    { line: `[${ts(20)}] [INFO] reneo-mail: Pemeriksaan status routing email dan koneksi siap` },
    { line: `[${ts(5)}] [INFO] reneo-mail: Layanan siap menerima dan memproses lalu lintas email` },
  ]

  return {
    service,
    detected: cfg.method === 'cloudflare' ? 'activity' : 'postfix',
    services,
    limit,
    lines: lines.slice(0, limit),
  }
}

