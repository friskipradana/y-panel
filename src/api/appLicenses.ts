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

export async function fetchAppLicenses(): Promise<AppLicense[]> {
  const res = await agentApi.get<{ ok: boolean; licenses: AppLicense[] }>('/api/v1/app-licenses')
  return res.data.licenses || []
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
