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

export interface RenewLicensePayload {
  catalogId: string
  months: number
  planName: string
  period: string
  priceAmount: number
  paymentMethod?: string
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
