import { agentApi } from './client'

export interface DatabaseEngine {
  id: string
  label: string
  defaultVersion: string
  port: number
  hasDatabase: boolean
  hasUser: boolean
}

export type DatabaseState = 'creating' | 'running' | 'exited' | 'created' | 'paused' | 'restarting' | 'missing' | 'error'

export interface UserDatabase {
  id: number
  userId: number
  ownerName?: string
  name: string
  engine: string
  engineLabel: string
  version: string
  containerName: string
  host: string
  port: number
  database: string
  username: string
  status: 'creating' | 'ready' | 'error'
  lastError?: string
  state: DatabaseState
  createdAt: string
}

export interface DatabaseCredentials {
  host: string
  port: number
  database: string
  username: string
  password: string
  url: string
}

export const listDatabaseEngines = () =>
  agentApi.get<{ engines: DatabaseEngine[] }>('/api/v1/databases/engines').then((r) => r.data.engines)

export const listUserDatabases = () =>
  agentApi.get<{ items: UserDatabase[] }>('/api/v1/databases').then((r) => r.data.items)

export const createUserDatabase = (payload: { name: string; engine: string; version?: string }) =>
  agentApi.post<UserDatabase>('/api/v1/databases', payload).then((r) => r.data)

export const getDatabaseCredentials = (id: number) =>
  agentApi.get<DatabaseCredentials>(`/api/v1/databases/${id}/credentials`).then((r) => r.data)

export const startUserDatabase = (id: number) =>
  agentApi.post<{ ok: boolean }>(`/api/v1/databases/${id}/start`).then((r) => r.data)

export const stopUserDatabase = (id: number) =>
  agentApi.post<{ ok: boolean }>(`/api/v1/databases/${id}/stop`).then((r) => r.data)

export const deleteUserDatabase = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/databases/${id}`).then((r) => r.data)
