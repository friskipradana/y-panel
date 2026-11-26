import { agentApi } from './client'

export interface DevDocItem {
  title: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  subtotal: number
}

export type DevDocKind = 'quotation' | 'invoice'
export type DevDocStatus = 'draft' | 'sent' | 'accepted' | 'dp_paid' | 'paid' | 'cancelled'
export type DevTodoStatus = 'todo' | 'doing' | 'done'
export type DevTodoPriority = 'low' | 'medium' | 'high'

export interface DevDocument {
  id: number
  ownerUserId: number
  kind: DevDocKind
  docNumber: string
  publicToken: string
  clientName: string
  clientCompany: string
  clientContact: string
  title: string
  summary: string
  currency: string
  items: DevDocItem[]
  discount: number
  dpPercent: number
  totalAmount: number
  paidAmount: number
  status: DevDocStatus
  issueDate: string
  dueDate: string
  validUntil: string
  terms: string[]
  paymentInfo: string
  waMessage: string
  sourceNotes: string
  linkedDocId: number
  shareChecklist: boolean
  createdAt: string
  updatedAt: string
}

export interface DevTodo {
  id: number
  ownerUserId: number
  docId: number
  title: string
  notes: string
  status: DevTodoStatus
  priority: DevTodoPriority
  dueDate: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface DevDeskOverview {
  docs: DevDocument[]
  todos: DevTodo[]
  aiReady: boolean
  aiProvider?: string
  aiModel?: string
  seller: { name: string; brand: string; website: string }
}

export interface DevDocInput {
  kind: DevDocKind
  docNumber?: string
  clientName: string
  clientCompany: string
  clientContact: string
  title: string
  summary: string
  currency?: string
  items: DevDocItem[]
  discount: number
  dpPercent: number
  paidAmount: number
  status: DevDocStatus
  issueDate: string
  dueDate: string
  validUntil: string
  terms: string[]
  paymentInfo: string
  waMessage: string
  sourceNotes: string
  linkedDocId?: number
  shareChecklist: boolean
  initialTodos?: { title: string; notes: string; priority: DevTodoPriority }[]
}

export interface AIGeneratedDevDoc {
  clientName?: string
  clientCompany?: string
  clientContact?: string
  title: string
  summary: string
  discount?: number
  dpPercent: number
  paymentInfo?: string
  items: DevDocItem[]
  terms: string[]
  waMessage: string
  todos: { title: string; notes: string; priority: DevTodoPriority }[]
}

export interface PublicDevDocResponse {
  doc: Omit<DevDocument, 'id' | 'ownerUserId' | 'publicToken' | 'waMessage' | 'sourceNotes' | 'linkedDocId' | 'createdAt'>
  checklist: { id: number; title: string; status: DevTodoStatus; priority: DevTodoPriority; dueDate?: string }[]
  seller: { name: string; brand: string; website: string }
}

export const getDevDeskOverview = (kind?: string) =>
  agentApi.get<DevDeskOverview>('/api/v1/devdesk/overview', { params: kind ? { kind } : undefined }).then((r) => r.data)

export const createDevDoc = (payload: DevDocInput) =>
  agentApi.post<{ doc: DevDocument; todos: DevTodo[] }>('/api/v1/devdesk/docs', payload).then((r) => r.data)

export const updateDevDoc = (id: number, payload: DevDocInput) =>
  agentApi.put<DevDocument>(`/api/v1/devdesk/docs/${id}`, payload).then((r) => r.data)

export const deleteDevDoc = (id: number) =>
  agentApi.delete(`/api/v1/devdesk/docs/${id}`).then((r) => r.data)

export const rotateDevDocToken = (id: number) =>
  agentApi.post<DevDocument>(`/api/v1/devdesk/docs/${id}/rotate-token`).then((r) => r.data)

export const convertDevDocToInvoice = (id: number) =>
  agentApi.post<DevDocument>(`/api/v1/devdesk/docs/${id}/convert-invoice`).then((r) => r.data)

export const generateDevDocWithAI = (payload: {
  kind: DevDocKind
  clientName: string
  clientCompany: string
  budgetHint: string
  notes: string
  language: string
}) => agentApi.post<AIGeneratedDevDoc>('/api/v1/devdesk/ai-generate', payload).then((r) => r.data)

export const createDevTodo = (payload: {
  docId: number
  title: string
  notes?: string
  priority?: DevTodoPriority
  dueDate?: string
}) => agentApi.post<DevTodo>('/api/v1/devdesk/todos', payload).then((r) => r.data)

export const updateDevTodo = (
  id: number,
  payload: Partial<{ docId: number; title: string; notes: string; status: DevTodoStatus; priority: DevTodoPriority; dueDate: string }>,
) => agentApi.patch<DevTodo>(`/api/v1/devdesk/todos/${id}`, payload).then((r) => r.data)

export const deleteDevTodo = (id: number) =>
  agentApi.delete(`/api/v1/devdesk/todos/${id}`).then((r) => r.data)

export const getPublicDevDoc = (token: string) =>
  agentApi.get<PublicDevDocResponse>(`/api/v1/public/devdesk/${encodeURIComponent(token)}`).then((r) => r.data)
