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
