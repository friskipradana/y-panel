import { agentApi } from './client'

export interface FirewallRule {
  number: number
  to: string
  action: string
  from: string
  v6: boolean
  comment?: string
}

export interface FirewallDetail {
  installed: boolean
  active: boolean
  incoming: string
  outgoing: string
  routed: string
  logging: string
  rules: FirewallRule[]
}

// A port the owner needs to get back in: a change that cuts it off asks for a confirmation
export interface ProtectedPort {
  port: number
  reason: 'ssh' | 'panel' | 'web'
}

// local: loopback only; docker: published by Docker (ufw does not filter it); unfiltered: no active firewall; open or blocked by ufw
export type Exposure = 'local' | 'docker' | 'unfiltered' | 'open' | 'blocked'

export interface Listener {
  proto: 'tcp' | 'udp'
  address: string
  port: number
  process?: string
  pid?: number
  loopback: boolean
  exposure: Exposure
}

export interface FirewallDatabase {
  id: number
  name: string
  owner: string
  port: number
  ips: string[]
}

export interface FirewallState {
  ufw: FirewallDetail
  protected: ProtectedPort[]
  listeners: Listener[]
  databases: FirewallDatabase[]
}

export interface RuleSpec {
  action: 'allow' | 'deny' | 'reject' | 'limit'
  direction: 'in' | 'out'
  proto: 'tcp' | 'udp' | 'any'
  port: string
  from: string
  comment: string
}

export type Policy = 'allow' | 'deny' | 'reject'
export type PolicyDirection = 'incoming' | 'outgoing' | 'routed'
export type LoggingLevel = 'off' | 'low' | 'medium' | 'high'

// The agent answers 409 with risk when a change would cut off a protected port; sending it again with confirm goes through
export interface RiskReply {
  risk: true
  ports: ProtectedPort[]
  error: string
}

export const riskOf = (error: unknown): RiskReply | null => {
  const data = (error as { response?: { status?: number; data?: Partial<RiskReply> } })?.response
  return data?.status === 409 && data.data?.risk ? (data.data as RiskReply) : null
}

export const getFirewall = () => agentApi.get<FirewallState>('/api/v1/firewall').then((r) => r.data)

export const enableFirewall = () => agentApi.post<FirewallState>('/api/v1/firewall/enable').then((r) => r.data)

export const disableFirewall = () => agentApi.post<FirewallState>('/api/v1/firewall/disable').then((r) => r.data)

export const reloadFirewall = () => agentApi.post<FirewallState>('/api/v1/firewall/reload').then((r) => r.data)

export const setFirewallDefault = (direction: PolicyDirection, policy: Policy, confirm = false) =>
  agentApi.put<FirewallState>('/api/v1/firewall/default', { direction, policy, confirm }).then((r) => r.data)

export const setFirewallLogging = (level: LoggingLevel) => agentApi.put<FirewallState>('/api/v1/firewall/logging', { level }).then((r) => r.data)

export const addFirewallRule = (spec: RuleSpec, confirm = false) => agentApi.post<FirewallState>('/api/v1/firewall/rules', { ...spec, confirm }).then((r) => r.data)

export const deleteFirewallRule = (rule: FirewallRule, confirm = false) =>
  agentApi.post<FirewallState>('/api/v1/firewall/rules/delete', { number: rule.number, to: rule.to, action: rule.action, from: rule.from, confirm }).then((r) => r.data)
