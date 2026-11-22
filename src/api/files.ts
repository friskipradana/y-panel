import { agentApi } from './client'

export interface FileRootAccessStatus {
  enabled: boolean
  expiresAt?: string
}

export const getFileRootAccessStatus = () =>
  agentApi.get<FileRootAccessStatus>('/api/v1/files/root-access/status').then((r) => r.data)

export const verifyFileRootAccess = (password: string) =>
  agentApi.post<FileRootAccessStatus>('/api/v1/files/root-access/verify', { password }).then((r) => r.data)

export const revokeFileRootAccess = () =>
  agentApi.post<FileRootAccessStatus>('/api/v1/files/root-access/revoke').then((r) => r.data)

export interface FileUploadResult {
  ok: boolean
  uploaded: Array<{ name: string; size: number }>
  /** reason: exists (the name is taken), folder (a folder has the name), name (not a plain file name) */
  skipped: Array<{ name: string; reason: 'exists' | 'folder' | 'name' }>
}

// Files into a folder. The folder and the overwrite choice go first, so the agent knows both when the first file arrives.
export const uploadFiles = (dir: string, files: File[], overwrite: boolean, onProgress: (percent: number) => void, signal: AbortSignal) => {
  const form = new FormData()
  form.append('dir', dir)
  form.append('overwrite', overwrite ? 'true' : 'false')
  for (const file of files) form.append('file', file, file.name)
  return agentApi
    .post<FileUploadResult>('/api/v1/files/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      signal,
      onUploadProgress: (event) => {
        if (event.total) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      },
    })
    .then((r) => r.data)
}
