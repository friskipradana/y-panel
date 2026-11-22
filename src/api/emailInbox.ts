import { agentApi } from './client'
import { isNotFoundError } from './emailFallback'

export interface EmailInboxMessage {
  id: number
  accountId: number
  direction: 'inbound' | 'outbound'
  fromAddr: string
  fromName: string
  toAddr: string
  subject: string
  snippet: string
  bodyText: string
  bodyHtml?: string
  isRead: boolean
  isStarred: boolean
  messageId?: string
  receivedAt: string
  createdAt: string
}

export interface EmailInboxResponse {
  items: EmailInboxMessage[]
  total: number
  unread: number
}

export async function listInboxMessages(params?: {
  direction?: string
  q?: string
  unread?: boolean
  limit?: number
  offset?: number
}): Promise<EmailInboxResponse> {
  try {
    const { data } = await agentApi.get<EmailInboxResponse>('/api/v1/email/inbox', { params })
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      const fallback = (await import('./emailFallback')).getFallbackInboxMessages()
      return fallback
    }
    throw err
  }
}

export async function getInboxMessage(id: number): Promise<EmailInboxMessage> {
  const { data } = await agentApi.get<EmailInboxMessage>(`/api/v1/email/inbox/${id}`)
  return data
}

export async function markInboxMessageRead(id: number, isRead: boolean): Promise<{ ok: boolean }> {
  try {
    const { data } = await agentApi.post<{ ok: boolean }>(`/api/v1/email/inbox/${id}/read`, { isRead })
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      return { ok: true }
    }
    throw err
  }
}

export async function deleteInboxMessage(id: number): Promise<{ ok: boolean }> {
  try {
    const { data } = await agentApi.delete<{ ok: boolean }>(`/api/v1/email/inbox/${id}`)
    return data
  } catch (err) {
    if (isNotFoundError(err)) {
      return { ok: true }
    }
    throw err
  }
}

export async function syncInboxMessages(): Promise<{ ok: boolean; synced: number }> {
  const { data } = await agentApi.post<{ ok: boolean; synced: number }>('/api/v1/email/inbox/sync')
  return data
}

