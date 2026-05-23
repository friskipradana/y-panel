import { agentApi } from './client'

export interface PanelNotification {
  id: number
  userId: number
  title: string
  body: string
  type: 'info' | 'success' | 'warning' | 'error'
  isRead: boolean
  actionUrl: string
  createdAt: string
}

export interface NotificationSocketPayload {
  type: 'snapshot' | 'created' | 'read' | 'read_all'
  unreadCount: number
  notification?: PanelNotification | null
}

export const listNotifications = () =>
  agentApi.get<{ notifications: PanelNotification[] }>('/api/v1/notifications').then((r) => r.data.notifications)

export const markNotificationRead = (id: number) =>
  agentApi.post<{ ok: boolean }>(`/api/v1/notifications/${id}/read`).then((r) => r.data)

export const markAllNotificationsRead = () =>
  agentApi.post<{ ok: boolean }>('/api/v1/notifications/read-all').then((r) => r.data)

export function resolveNotificationsSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  return `${protocol}//${window.location.host}${apiBase}/notifications/ws`
}
