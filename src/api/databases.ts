import { agentApi } from './client'

export interface DatabaseEngine {
  id: string
  label: string
  defaultVersion: string
  versions: string[]
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
  /** opaque key for public addresses (full page manager, Adminer) */
  accessKey: string
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

export interface QueryResult {
  columns: string[]
  rows: string[][]
  truncated: boolean
  durationMs: number
  message?: string
}

export interface TableList {
  tables: string[]
  columnTypes: string[]
  sql: boolean
  engine: string
}

export interface NewColumn {
  name: string
  type: string
  length?: number
  nullable: boolean
  primaryKey: boolean
  autoIncrement: boolean
  default?: string
}

export interface DatabaseAccount {
  user: string
  host?: string
  level?: string
}

export const listDatabaseTables = (id: number) =>
  agentApi.get<TableList>(`/api/v1/databases/${id}/tables`).then((r) => r.data)

export const browseDatabaseTable = (id: number, table: string, offset = 0, limit = 100) =>
  agentApi.get<QueryResult>(`/api/v1/databases/${id}/tables/${encodeURIComponent(table)}`, { params: { offset, limit } }).then((r) => r.data)

export const createDatabaseTable = (id: number, payload: { name: string; columns: NewColumn[] }) =>
  agentApi.post<{ ok: boolean; statement: string }>(`/api/v1/databases/${id}/tables`, payload).then((r) => r.data)

export const dropDatabaseTable = (id: number, table: string) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/databases/${id}/tables/${encodeURIComponent(table)}`).then((r) => r.data)

export const runDatabaseQuery = (id: number, statement: string) =>
  agentApi.post<QueryResult>(`/api/v1/databases/${id}/query`, { statement }).then((r) => r.data)

export const listDatabaseAccounts = (id: number) =>
  agentApi.get<{ users: DatabaseAccount[]; owner: string }>(`/api/v1/databases/${id}/users`).then((r) => r.data)

export const createDatabaseAccount = (id: number, payload: { username: string; password?: string; access: 'read' | 'write' | 'all' }) =>
  agentApi.post<{ ok: boolean; username: string; password?: string }>(`/api/v1/databases/${id}/users`, payload).then((r) => r.data)

export const deleteDatabaseAccount = (id: number, name: string) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/databases/${id}/users/${encodeURIComponent(name)}`).then((r) => r.data)

export const setDatabasePassword = (id: number, newPassword?: string) =>
  agentApi.post<{ ok: boolean; password: string }>(`/api/v1/databases/${id}/password`, { newPassword: newPassword ?? '' }).then((r) => r.data)
