export type LicenseTab = 'licenses' | 'plans' | 'invoices'

export type LicenseStatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED'

export function indexLabel(index: number): string {
  return String(index + 1).padStart(2, '0')
}

export function formatFeatureBadge(key: string, value: unknown): string | null {
  if (value === false || value === null || value === undefined) return null
  const k = key.toLowerCase()
  if (k === 'wahasync') return 'Integrasi WAHA'
  if (k === 'birthdaybot' || k === 'botbirthday' || k === 'birthdayautomation') return 'Bot Ulang Tahun'
  if (k === 'livechat' || k === 'livechatcrm') return 'Live Chat CRM'
  if (k === 'multisession') return 'Multi-Sesi WA'
  if (k === 'maxsessions') return `${Number(value).toLocaleString('id-ID')} Sesi WA`
  if (k === 'maxsessionidentityswitches') return `Maks ${Number(value).toLocaleString('id-ID')}x Ganti Nomor/Sesi`
  if (k === 'multiagent') return 'Multi-Agent'
  if (k === 'maxagents') return `${Number(value).toLocaleString('id-ID')} Agen CS`
  if (k === 'customroles') return 'Role Kustom Granular'
  if (k === 'omnichannel') return 'Omnichannel Sosial'
  if (k === 'maxchannels') {
    const n = Number(value)
    return n === 0 ? null : `${n.toLocaleString('id-ID')} Kanal Sosial`
  }
  if (k === 'scheduledposts') return 'Jadwal Post & Story WA'
  if (k === 'autoreply') return 'Auto-Reply & Jam Kerja'
  if (k === 'aiagent') return 'Agent AI Multi-Model'
  if (k === 'mcptools') return 'MCP Tool Servers'
  if (k === 'exportreports') return 'Ekspor CSV'
  if (k === 'unlimitedcontacts') return value === true ? 'Kontak Tanpa Batas' : null
  if (k === 'broadcast' || k === 'unlimitedbroadcast') {
    return value === true ? 'Broadcast WA Tanpa Batas' : 'Broadcast WA Terjadwal'
  }
  if (k === 'maxbroadcastpermonth') {
    const n = Number(value)
    return n > 0 ? `${n.toLocaleString('id-ID')} Broadcast/bln` : null
  }
  if (k === 'maxtemplates') {
    const n = Number(value)
    return n > 0 ? `${n.toLocaleString('id-ID')} Template` : null
  }
  if (k === 'maxusers') {
    const n = Number(value)
    return n > 0 ? `${n.toLocaleString('id-ID')} User/Agent` : null
  }
  if (k === 'apiaccess') return 'Akses API'
  if (k === 'multiuser') return 'Multi-User'
  if (k === 'fullmodules') return 'Semua Modul'
  if (k === 'maxcontacts') {
    const n = Number(value)
    return n === 0 ? 'Kontak Tanpa Batas' : `${n.toLocaleString('id-ID')} Kontak`
  }
  if (k === 'maxstoragemb') {
    const n = Number(value)
    if (n <= 0) return null
    if (n >= 1024 && n % 1024 === 0) return `Storage: ${n / 1024} GB`
    return `Storage: ${n.toLocaleString('id-ID')} MB`
  }
  if (k === 'maxattachmentsizemb') {
    const n = Number(value)
    return n > 0 ? `Maks File: ${n} MB` : null
  }
  if (k === 'allowedmenus') return null
  if (k === 'supportpriority') return `Support: ${String(value).toUpperCase()}`
  if (typeof value === 'boolean') {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim()
  }
  return `${key}: ${String(value)}`
}

export function formatFeatureLabels(
  features?: Record<string, boolean | number | string> | null
): string[] {
  if (!features) return []
  return Object.entries(features)
    .map(([k, v]) => formatFeatureBadge(k, v))
    .filter((x): x is string => Boolean(x))
}
