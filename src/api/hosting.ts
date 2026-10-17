import { agentApi } from './client'

export type PlanPeriod = 'monthly' | 'yearly' | 'once'

export interface HostingPlan {
  id: number
  slug: string
  name: string
  tagline: string
  /** Rupiah, whole numbers */
  priceAmount: number
  period: PlanPeriod
  features: string[]
  maxProjects: number
  maxTunnels: number
  maxDatabases: number
  diskQuotaMb: number
  cpuLimitPct: number
  memoryLimitMb: number
  maxSubdomains: number
  highlighted: boolean
  visible: boolean
  sortOrder: number
  /** Accounts on the plan */
  accounts: number
}

export type PlanInput = Omit<HostingPlan, 'id' | 'accounts'>

export const listHostingPlans = () =>
  agentApi.get<{ plans: HostingPlan[] }>('/api/v1/hosting/plans').then((r) => r.data.plans)

export const createHostingPlan = (plan: PlanInput) =>
  agentApi.post<HostingPlan>('/api/v1/hosting/plans', plan).then((r) => r.data)

export const updateHostingPlan = (id: number, plan: PlanInput) =>
  agentApi.put<HostingPlan>(`/api/v1/hosting/plans/${id}`, plan).then((r) => r.data)

export const deleteHostingPlan = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/hosting/plans/${id}`).then((r) => r.data)

export type PlanState = 'none' | 'active' | 'grace' | 'expired'

export interface UserPlanView {
  plan: HostingPlan | null
  expiresAt: string | null
  state: PlanState
  graceEndsAt: string | null
  graceDays: number
}

export const getUserPlan = (userId: number) =>
  agentApi.get<UserPlanView>(`/api/v1/users/${userId}/plan`).then((r) => r.data)

/** planId null takes the account off its plan; months renews or sets the length */
export const setUserPlan = (userId: number, body: { planId: number | null; months?: number }) =>
  agentApi.put<UserPlanView>(`/api/v1/users/${userId}/plan`, body).then((r) => r.data)

export type PublicPlan = Omit<HostingPlan, 'id' | 'accounts' | 'cpuLimitPct' | 'visible' | 'sortOrder'>

export interface PublicHosting {
  enabled: boolean
  currency?: string
  orderUrl?: string
  plans: PublicPlan[]
}

export const getPublicHosting = () => agentApi.get<PublicHosting>('/api/v1/public/hosting').then((r) => r.data)

export const formatRupiah = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)

// ─── Domains and subdomains ───────────────────────────────────────────────────

export interface HostingDomain {
  zoneId: string
  name: string
  /** Cloudflare's own status for the zone (superadmin list only) */
  status?: string
  enabled: boolean
}

export const listHostingDomains = () =>
  agentApi.get<{ domains: HostingDomain[] }>('/api/v1/hosting/domains').then((r) => r.data.domains)

export const setHostingDomain = (zoneId: string, enabled: boolean) =>
  agentApi.put<HostingDomain>(`/api/v1/hosting/domains/${encodeURIComponent(zoneId)}`, { enabled }).then((r) => r.data)

export type SubdomainStatus = 'pending' | 'active' | 'suspended' | 'error'

export interface Subdomain {
  id: number
  userId: number
  /** Only in the superadmin list */
  username?: string
  label: string
  zoneId: string
  domain: string
  hostname: string
  projectId: number | null
  status: SubdomainStatus
  /** Why a subdomain waits or failed */
  note: string
  createdAt: string
}

export const listAllSubdomains = () =>
  agentApi.get<{ items: Subdomain[] }>('/api/v1/hosting/subdomains').then((r) => r.data.items)

export const setSubdomainStatus = (id: number, status: 'active' | 'suspended') =>
  agentApi.patch<Subdomain>(`/api/v1/hosting/subdomains/${id}`, { status }).then((r) => r.data)

export const deleteSubdomainAsAdmin = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/hosting/subdomains/${id}`).then((r) => r.data)

export interface MySubdomains {
  enabled: boolean
  limit: number
  used: number
  domains: HostingDomain[]
  items: Subdomain[]
}

export const getMySubdomains = () => agentApi.get<MySubdomains>('/api/v1/me/subdomains').then((r) => r.data)

export const checkSubdomain = (label: string, zoneId: string) =>
  agentApi
    .get<{ available: boolean; reason: string }>('/api/v1/me/subdomains/check', { params: { label, zoneId } })
    .then((r) => r.data)

export const createMySubdomain = (body: { label: string; zoneId: string; projectId: number }) =>
  agentApi.post<Subdomain>('/api/v1/me/subdomains', body).then((r) => r.data)

export const retargetMySubdomain = (id: number, projectId: number) =>
  agentApi.patch<Subdomain>(`/api/v1/me/subdomains/${id}`, { projectId }).then((r) => r.data)

export const deleteMySubdomain = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/me/subdomains/${id}`).then((r) => r.data)
