import { agentApi } from './client'

export interface AppLicense {
  id: number
  userId: number
  catalogId: string
  appName: string
  licenseKey: string
  status: 'ACTIVE' | 'TRIAL' | 'EXPIRED'
  planName: string
  period: 'monthly' | 'quarterly' | 'annual' | 'trial'
  priceAmount: number
  startedAt: string
  expiresAt: string
  daysLeft: number
  isExpired: boolean
  features: Record<string, boolean | number | string>
  createdAt: string
  updatedAt: string
}

export interface AppLicensePlan {
  id: number
  catalogId: string
  slug: string
  name: string
  tagline: string
  period: string
  months: number
  priceAmount: number
  features: Record<string, boolean | number | string>
  highlighted: boolean
  isActive: boolean
  sortOrder: number
}

export interface PaymentMethodItem {
  id: string
  kind: string
  name: string
  account: string
  holder: string
  enabled: boolean
}

export interface AppLicenseOrder {
  id: number
  publicId: string
  invoiceNumber: string
  userId: number
  catalogId: string
  appName: string
  planSlug: string
  planName: string
  period: string
  months: number
  amountList: number
  uniqueCode: number
  amountTotal: number
  status: 'pending' | 'paid' | 'cancelled'
  paymentMethod: string
  buyerName: string
  buyerEmail: string
  buyerPhone: string
  createdAt: string
  expiresAt: string
  paidAt?: string
}

export interface RenewLicensePayload {
  catalogId: string
  months: number
  planName: string
  period: string
  priceAmount: number
  paymentMethod?: string
}

export interface CreateAppOrderPayload {
  catalogId: string
  planSlug: string
  paymentMethod?: string
  buyerName?: string
  buyerEmail?: string
  buyerPhone?: string
}

export interface AvailableApp {
  catalogId: string
  name: string
  type: 'catalog' | 'project' | 'custom'
}

export interface CreateAppLicensePayload {
  catalogId: string
  appName?: string
  licenseKey?: string
  status?: 'ACTIVE' | 'TRIAL' | 'EXPIRED'
  planName?: string
  period?: string
  priceAmount?: number
  months?: number
  expiresAt?: string
  features?: Record<string, boolean | number | string>
}

export interface CreateAppPlanPayload {
  catalogId: string
  slug?: string
  name: string
  tagline?: string
  period?: string
  months?: number
  priceAmount: number
  features?: Record<string, boolean | number | string>
  highlighted?: boolean
  isActive?: boolean
  sortOrder?: number
}

export async function fetchAppLicenses(catalogId?: string): Promise<AppLicense[]> {
  const res = await agentApi.get<{ ok: boolean; licenses: AppLicense[] }>('/api/v1/app-licenses', {
    params: catalogId ? { catalogId } : undefined,
  })
  return res.data.licenses || []
}

export async function createAppLicense(payload: CreateAppLicensePayload): Promise<AppLicense> {
  const res = await agentApi.post<{ ok: boolean; message: string; license: AppLicense }>(
    '/api/v1/app-licenses',
    payload
  )
  return res.data.license
}

export async function updateAppLicense(id: number, payload: Partial<CreateAppLicensePayload>): Promise<AppLicense> {
  const res = await agentApi.put<{ ok: boolean; message: string; license: AppLicense }>(
    `/api/v1/app-licenses/${id}`,
    payload
  )
  return res.data.license
}

export async function deleteAppLicense(id: number): Promise<void> {
  await agentApi.delete(`/api/v1/app-licenses/${id}`)
}

export async function fetchAvailableApps(): Promise<AvailableApp[]> {
  const res = await agentApi.get<{ ok: boolean; apps: AvailableApp[] }>('/api/v1/app-licenses/available-apps')
  return res.data.apps || []
}

export async function createAppLicensePlan(payload: CreateAppPlanPayload): Promise<AppLicensePlan> {
  const res = await agentApi.post<{ ok: boolean; message: string; plan: AppLicensePlan }>(
    '/api/v1/app-license-plans',
    payload
  )
  return res.data.plan
}

export async function deleteAppLicensePlan(id: number): Promise<void> {
  await agentApi.delete(`/api/v1/app-license-plans/${id}`)
}

export async function renewAppLicense(payload: RenewLicensePayload): Promise<AppLicense> {
  const res = await agentApi.post<{ ok: boolean; message: string; license: AppLicense }>(
    '/api/v1/app-licenses/renew',
    payload
  )
  return res.data.license
}

export async function fetchAppLicensePlans(catalogId = 'reneo-crm'): Promise<AppLicensePlan[]> {
  const res = await agentApi.get<{ ok: boolean; plans: AppLicensePlan[] }>(
    `/api/v1/app-catalog/plans/${catalogId}`
  )
  return res.data.plans || []
}

export async function createAppLicenseOrder(payload: CreateAppOrderPayload): Promise<{
  order: AppLicenseOrder
  paymentMethods: PaymentMethodItem[]
  invoiceUrl: string
}> {
  const res = await agentApi.post<{
    ok: boolean
    order: AppLicenseOrder
    paymentMethods: PaymentMethodItem[]
    invoiceUrl: string
  }>('/api/v1/app-catalog/order', payload)
  return res.data
}

export async function fetchAppLicenseOrders(catalogId?: string): Promise<AppLicenseOrder[]> {
  const res = await agentApi.get<{ ok: boolean; orders: AppLicenseOrder[] }>(
    '/api/v1/app-license-orders',
    { params: catalogId ? { catalogId } : undefined }
  )
  return res.data.orders || []
}

export async function payAppLicenseOrder(publicId: string, paymentMethod = 'saldo'): Promise<AppLicenseOrder> {
  const res = await agentApi.post<{ ok: boolean; order: AppLicenseOrder }>(
    `/api/v1/app-catalog/orders/${publicId}/pay`,
    { paymentMethod }
  )
  return res.data.order
}

export async function cancelAppLicenseOrder(publicId: string): Promise<AppLicenseOrder> {
  const res = await agentApi.post<{ ok: boolean; order: AppLicenseOrder }>(
    `/api/v1/app-catalog/orders/${publicId}/cancel`
  )
  return res.data.order
}
