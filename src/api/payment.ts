import { agentApi } from './client'
import type {
  PaymentSettingsResponse,
  UpdatePaymentSettingsPayload,
  PaymentGatewayTestResponse,
  NotificationDeviceListResponse,
  NotificationDevice,
  CapturedNotificationsResponse,
  CapturedNotification,
  RegisterNotificationDevicePayload,
  UpdateNotificationDevicePayload,
  NotificationDeviceMutationResponse,
} from '@/types'

// ── Payment Gateway Settings ─────────────────────────────────────────────

export async function getPaymentSettings(): Promise<PaymentSettingsResponse> {
  const { data } = await agentApi.get('/api/v1/settings/payment')
  return data
}

export async function updatePaymentSettings(payload: UpdatePaymentSettingsPayload): Promise<PaymentSettingsResponse> {
  const { data } = await agentApi.post('/api/v1/settings/payment', payload)
  return data
}

export async function testPaymentGateway(): Promise<PaymentGatewayTestResponse> {
  const { data } = await agentApi.post('/api/v1/settings/payment/test', {})
  return data
}

// ── Notification Devices ─────────────────────────────────────────────────

export async function getNotificationDevices(): Promise<NotificationDeviceListResponse> {
  const { data } = await agentApi.get('/api/v1/notification-devices')
  return { ...data, devices: data.devices ?? [] }
}

export async function registerNotificationDevice(payload: RegisterNotificationDevicePayload): Promise<NotificationDeviceMutationResponse> {
  const { data } = await agentApi.post('/api/v1/notification-devices', payload)
  return data
}

export async function updateNotificationDevice(deviceId: string, payload: UpdateNotificationDevicePayload): Promise<NotificationDeviceMutationResponse> {
  const { data } = await agentApi.put(`/api/v1/notification-devices/${encodeURIComponent(deviceId)}`, payload)
  return data
}

export async function deleteNotificationDevice(deviceId: string): Promise<{ ok: boolean; message?: string }> {
  const { data } = await agentApi.delete(`/api/v1/notification-devices/${encodeURIComponent(deviceId)}`)
  return data
}

// ── Captured Notifications ───────────────────────────────────────────────

export async function getCapturedNotifications(): Promise<CapturedNotificationsResponse> {
  const { data } = await agentApi.get('/api/v1/captured-notifications')
  return data
}

// ── WebSocket types for real-time captured notifications ─────────────────

export interface CapturedNotificationSocketPayload {
  type: 'captured' | 'snapshot'
  notification?: CapturedNotification
  devices?: NotificationDevice[]
  ts?: string
}

// ── WebSocket URL for captured notifications (real-time) ─────────────────

export function resolveCapturedNotificationsSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${protocol}//${host}/api/v1/captured-notifications/ws`
}
