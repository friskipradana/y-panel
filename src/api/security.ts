import { agentApi } from './client'

export interface SSHKey {
  id: string
  type: string
  fingerprint: string
  comment: string
}

export interface Fail2BanJail {
  name: string
  currentlyFailed: number
  currentlyBanned: number
  totalBanned: number
  bannedIps: string[]
}

export interface Fail2BanStatus {
  installed: boolean
  running: boolean
  jails: Fail2BanJail[]
}

export interface OSUpdatePackage {
  name: string
  version: string
  source: string
}

export interface SecurityHardeningOverview {
  os: string
  sshKeysPath: string
  sshKeys: SSHKey[]
  fail2ban: Fail2BanStatus
  failedLogins: string[]
  packageManager: string
  upgradable: OSUpdatePackage[]
}

export const getSecurityHardening = () =>
  agentApi.get<SecurityHardeningOverview>('/api/v1/security/hardening').then((r) => r.data)

export const addSSHKey = (publicKey: string) =>
  agentApi.post<SSHKey>('/api/v1/security/ssh-keys', { publicKey }).then((r) => r.data)

export const deleteSSHKey = (id: string) =>
  agentApi.delete(`/api/v1/security/ssh-keys/${encodeURIComponent(id)}`).then((r) => r.data)

export const fail2BanBanIP = (jail: string, ip: string) =>
  agentApi.post('/api/v1/security/fail2ban/ban', { jail, ip }).then((r) => r.data)

export const fail2BanUnbanIP = (jail: string, ip: string) =>
  agentApi.post('/api/v1/security/fail2ban/unban', { jail, ip }).then((r) => r.data)

export const applyOSUpdates = () =>
  agentApi.post<{ ok: boolean; output: string }>('/api/v1/security/os-updates/apply').then((r) => r.data)
